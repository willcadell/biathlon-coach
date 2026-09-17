// Throwaway visual check, not part of the test suite: runs the deterministic
// black-locator against every real photo in test-images/ and draws the
// detected ellipse onto a copy, so the result can be checked by eye instead
// of trusting numbers alone. Run with `npm run cv-check`.
import { readdir, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { Jimp } from 'jimp'
import { locateBlack } from '../src/lib/blackLocator'
import { locateHoles } from '../src/lib/holeLocator'
import { outerRingCrop } from '../src/lib/geometry'
import { faceById } from '../src/lib/types'
import { ringRadii } from '../src/lib/scoring'

// Bundled output doesn't live next to this source file, so resolve against
// the working directory — this is always run via `npm run cv-check` from
// the project root, same as the `test` script.
const SRC_DIR = join(process.cwd(), 'test-images')
const OUT_DIR = join(process.cwd(), 'test-images-out')
const WORK_EDGE = 640
// Holes are much smaller features than the bull, so they need more real
// pixels behind them than the bull-locating pass does.
const HOLE_WORK_EDGE = 1400
// Matches the ISSF 50 m face and .22 LR bullet every test photo was shot
// with — see DEFAULT_SETTINGS in src/lib/types.ts.
const FACE = faceById('issf-50m')
const RING_RADII_FRAC = ringRadii(FACE).map((r) => r / (FACE.blackMm / 2))
const AIMING_MARK_MM = 112.4
const BULLET_DIAMETER_MM = 5.6

function markPixel(img: InstanceType<typeof Jimp>, x: number, y: number, color: number) {
  if (x < 0 || y < 0 || x >= img.bitmap.width || y >= img.bitmap.height) return
  img.setPixelColor(color, Math.round(x), Math.round(y))
}

function drawEllipse(img: InstanceType<typeof Jimp>, cx: number, cy: number, a: number, b: number, rotDeg: number, color: number) {
  const rot = (rotDeg * Math.PI) / 180
  const cos = Math.cos(rot)
  const sin = Math.sin(rot)
  const steps = 720
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2
    const ex = a * Math.cos(t)
    const ey = b * Math.sin(t)
    const x = cx + ex * cos - ey * sin
    const y = cy + ex * sin + ey * cos
    // A few pixels thick so it's visible on a large photo.
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      markPixel(img, x + dx, y + dy, color)
    }
  }
  // Crosshair at the centre.
  for (let d = -12; d <= 12; d++) {
    markPixel(img, cx + d, cy, color)
    markPixel(img, cx, cy + d, color)
  }
}

function drawCircle(img: InstanceType<typeof Jimp>, cx: number, cy: number, r: number, color: number) {
  const steps = 90
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2
    const x = cx + r * Math.cos(t)
    const y = cy + r * Math.sin(t)
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) markPixel(img, x + dx, y + dy, color)
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const files = (await readdir(SRC_DIR)).filter((f) => /\.jpe?g$/i.test(f))
  const only = process.argv[2]

  for (const file of only ? files.filter((f) => f.includes(only)) : files) {
    if (only) (globalThis as { HOLE_DEBUG?: boolean }).HOLE_DEBUG = true
    const original = await Jimp.read(join(SRC_DIR, file))
    const scale = Math.min(1, WORK_EDGE / Math.max(original.bitmap.width, original.bitmap.height))
    const work = original.clone().resize({ w: Math.round(original.bitmap.width * scale), h: Math.round(original.bitmap.height * scale) })

    const result = locateBlack({
      width: work.bitmap.width,
      height: work.bitmap.height,
      data: work.bitmap.data,
    })

    if (!result) {
      console.log(`${file}: NOT FOUND`)
      continue
    }

    console.log(
      `${file}: cx=${(result.cx / work.bitmap.width).toFixed(3)} cy=${(result.cy / work.bitmap.width).toFixed(3)} ` +
      `semiMajor=${(result.semiMajor / work.bitmap.width).toFixed(3)} semiMinor=${(result.semiMinor / work.bitmap.width).toFixed(3)} ` +
      `rot=${result.rotationDeg.toFixed(1)} area=${(result.areaFrac * 100).toFixed(1)}% fill=${result.fillRatio.toFixed(2)}`,
    )

    // Draw on the full-resolution original for a clearer look, scaling the
    // working-resolution result back up.
    const backScale = 1 / scale
    const RED = 0xff0000ff
    drawEllipse(
      original,
      result.cx * backScale,
      result.cy * backScale,
      result.semiMajor * backScale,
      result.semiMinor * backScale,
      result.rotationDeg,
      RED,
    )

    // Match the real pipeline: crop tight to the outermost scoring ring
    // before ever looking for holes, rather than searching the whole photo
    // (letterhead, score tables, and handwriting live well outside this).
    const aspect = original.bitmap.width / original.bitmap.height
    const bullFrac = {
      id: 'bull-1', holes: [],
      centre: { x: (result.cx * backScale) / original.bitmap.width, y: (result.cy * backScale) / original.bitmap.width },
      semiMajor: (result.semiMajor * backScale) / original.bitmap.width,
      semiMinor: (result.semiMinor * backScale) / original.bitmap.width,
      rotationDeg: result.rotationDeg,
    }
    const rect = outerRingCrop(bullFrac, FACE, aspect)
    const x0 = Math.round(rect.x0 * original.bitmap.width)
    const y0 = Math.round(rect.y0 * original.bitmap.width)
    const cropW = Math.max(1, Math.round((rect.x1 - rect.x0) * original.bitmap.width))
    const cropH = Math.max(1, Math.round((rect.y1 - rect.y0) * original.bitmap.width))
    console.log(`  crop: x0=${x0} y0=${y0} w=${cropW} h=${cropH} (orig ${original.bitmap.width}x${original.bitmap.height})`)

    const holeScale = Math.min(1, HOLE_WORK_EDGE / Math.max(cropW, cropH))
    const holeWork = original.clone().crop({ x: x0, y: y0, w: cropW, h: cropH }).resize({
      w: Math.round(cropW * holeScale),
      h: Math.round(cropH * holeScale),
    })
    const bullInHoleSpace = {
      cx: (result.cx * backScale - x0) * holeScale,
      cy: (result.cy * backScale - y0) * holeScale,
      semiMajor: result.semiMajor * backScale * holeScale,
      semiMinor: result.semiMinor * backScale * holeScale,
      rotationDeg: result.rotationDeg,
    }
    const expectedHoleRadiusPx = (BULLET_DIAMETER_MM / 2) * (bullInHoleSpace.semiMajor / (AIMING_MARK_MM / 2))
    const holes = locateHoles(
      { width: holeWork.bitmap.width, height: holeWork.bitmap.height, data: holeWork.bitmap.data },
      bullInHoleSpace,
      expectedHoleRadiusPx,
      RING_RADII_FRAC,
    )
    console.log(
      `  holes: ${holes.length} (${holes.filter((h) => h.ambiguous).length} ambiguous), ` +
      `expectedRadius=${expectedHoleRadiusPx.toFixed(1)}px`,
    )
    const YELLOW = 0xffd700ff
    const ORANGE = 0xff8c00ff
    for (const h of holes) {
      drawCircle(original, x0 + h.cx / holeScale, y0 + h.cy / holeScale, expectedHoleRadiusPx / holeScale, h.ambiguous ? ORANGE : YELLOW)
    }

    await original.write(join(OUT_DIR, file) as `${string}.${string}`)
  }
}

void main()
