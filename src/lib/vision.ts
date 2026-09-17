import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import * as z from 'zod/v4'
import type { Bull, Detection, Position, Settings } from './types'
import { faceById } from './types'
import { forVision, cropForVision, locateBlackInBlob, locateHolesInBlob } from './imaging'
import { outerRingCrop, fromCropFraction, fromCropWidthFraction, type CropRect } from './geometry'
import { ringRadii } from './scoring'

const HoleSchema = z.object({
  x: z.number().describe('Horizontal centre of the hole, 0 at the left image edge, 1 at the right.'),
  y: z.number().describe('Vertical centre of the hole, 0 at the top image edge, 1 at the bottom.'),
})

const GeometrySchema = {
  centreX: z.number().describe('Horizontal centre of this aiming mark, 0..1.'),
  centreY: z.number().describe('Vertical centre of this aiming mark, 0..1.'),
  semiMajor: z
    .number()
    .describe('Half the LONGEST width of the black as it appears in the image, as a fraction of the image WIDTH (never the height).'),
  semiMinor: z
    .number()
    .describe('Half the SHORTEST width of the black as it appears, also as a fraction of the image WIDTH. Equal to semiMajor for a head-on photo.'),
  rotationDeg: z
    .number()
    .describe('Angle of the longest axis, degrees clockwise from horizontal, between -90 and 90.'),
}

const WHAT_IS_A_HOLE = `What counts as a bullet hole:

- A clean round puncture, usually with a slightly torn grey rim, and always the same size as the other holes on the sheet.
- Not staple holes, not pin holes at the sheet corners, not pencil or gauge marks, not dirt, not shadow.
- Not patched holes. A patch is a paper sticker over a previous shot and is a different colour and texture from the target.
- Two shots can touch and form a figure-of-eight or an oversized ragged hole. Report each shot separately when you can see two centres.

Count from the outside of the group inward. Holes near the edge of the group are usually distinct and easy to place exactly, so find and place those first. A cluster near the CENTRE of the group is exactly where two or more shots are most likely to have merged into one ragged or figure-of-eight hole, because a tight group closes in on its own centre, not its edges. If your count of clearly separate holes falls short of how many shots this bout should have, look for that merged shape near the centre of the group and place the remaining shots there, close together, rather than inventing a hole further out where the paper is otherwise clean.

Report only what you can see. Missing a hole is better than inventing one, and the athlete corrects you by hand before anything is scored. Put anything that limits your confidence in notes.`

// --- Pass 1: locate. Finding where the aiming mark sits, so the photo can
// be cropped tightly around it, used to be a rough Claude call of its own —
// but an easy, high-contrast photo could still come back wildly wrong, with
// no way to make it try again the same way twice. Classical image
// processing (blackLocator.ts) replaces it: threshold, find the largest
// solid dark region, fit an ellipse. Same answer every time, no API call.

// --- Pass 2: read each crop. Every crop is a zoomed, high-resolution view of
// exactly one aiming mark and the scoring rings around it, so the model sees
// far more pixels per hole than it ever could in a whole-sheet photo, and it
// never has to decide which of several bulls a hole belongs to.

const CropResultSchema = z.object({
  ...GeometrySchema,
  holes: z.array(HoleSchema).describe('Every bullet hole visible in this image, including any that landed outside the black on the white rings.'),
})

const BatchDetectionSchema = z.object({
  crops: z.array(CropResultSchema).describe('Exactly one entry per image supplied, in the same order the images were given.'),
  notes: z.string().describe('Anything that limits confidence: glare, blur, torn paper, holes that may overlap.'),
  confidence: z.number().describe('0 to 1: how sure you are that every hole was found and nothing spurious was counted, across all images.'),
})

const cropSystem = (count: number) => `You read ${count} photograph${count === 1 ? '' : 's'}. Each is a cropped, zoomed-in view of one shooting-target aiming mark and the scoring rings around it, cut from one larger photograph so you can see it in detail. Return exactly one entry per image, in the same order the images were given.

Return coordinates as fractions of THAT image: x from 0 at the left edge to 1 at the right, y from 0 at the top to 1 at the bottom. Be precise to three decimal places — a 1% error is roughly a 1 mm error on a 50 m face, which is enough to move a shot from a ten to a nine.

For each image:

- Report the black's true ellipse, the same way as before: its outer edge, photographed square-on or squashed by angle.
- Report every bullet hole you can see in the image, including any that landed outside the black, out on the white rings — the crop was deliberately cut wide enough to include them, so do not restrict yourself to the black itself.

${WHAT_IS_A_HOLE}`

// --- Fallback: read the whole frame in one pass. Used only when the locate
// pass finds nothing to crop around, so the app never goes blank.

const DetectionSchema = z.object({
  bulls: z.array(z.object({ ...GeometrySchema, holes: z.array(HoleSchema) })),
  notes: z.string(),
  confidence: z.number(),
})

const wholeImageSystem = (expectedShots: number) => `You read a photograph of a precision shooting target and report exactly where the bullet holes are.

Return coordinates as fractions of the image: x from 0 at the left edge to 1 at the right, y from 0 at the top to 1 at the bottom. Be precise to three decimal places — a 1% error is roughly a 1 mm error on a 50 m face, which is enough to move a shot from a ten to a nine.

What to report for each target face:

- The BLACK is the solid filled area in the middle. Its outer edge is what you measure. Ignore the scoring ring lines printed outside the black on white paper, and ignore the ring lines printed inside the black in white — neither is the boundary you are reporting.
- Describe the black as an ellipse. Photographed square-on, semiMajor and semiMinor are equal. Photographed at an angle it appears squashed, so report the true long and short half-widths as they appear. That is what lets the perspective be corrected.
- A sheet often carries several faces, each shot once or twice. Report every face that has been shot at, and put each hole with the face it belongs to. If a hole sits outside every face, assign it to the nearest one.
- This bout should have about ${expectedShots} shots in total, across every face together.

${WHAT_IS_A_HOLE}`

/** Rough per-photo cost, so the athlete is never surprised by the bill.
 *  A photo with several aiming marks costs more, because each one is sent
 *  again as its own zoomed-in crop. */
export const COST_PER_IMAGE: Record<Settings['model'], string> = {
  'claude-opus-5': 'about 2-8 cents, more with several aiming marks',
  'claude-sonnet-5': 'under 2 cents, more with several aiming marks',
}

export class VisionError extends Error {}

export interface KeyCheck {
  ok: boolean
  /** What happened, in plain words. */
  message: string
  /** What to do about it, when there is something to do. */
  fix?: string
}

/**
 * Check a key without scoring a target.
 *
 * Three stages, cheapest first: the shape of the key itself, then a free
 * request that only proves authentication, then a one-token message that
 * proves the account can actually run the chosen model. Each stage names its
 * own failure, so "rejected" is never the whole answer.
 */
export async function testApiKey(settings: Settings): Promise<KeyCheck> {
  const key = settings.apiKey.trim()
  if (!key) return { ok: false, message: 'No key set.', fix: 'Paste one in the field above.' }

  // A truncated paste is the most common cause and costs nothing to catch.
  if (/\s/.test(key)) {
    return {
      ok: false,
      message: 'The key has a space or line break inside it.',
      fix: 'Copy it again in one piece — a wrapped paste is the usual cause.',
    }
  }
  if (!key.startsWith('sk-ant-')) {
    return {
      ok: false,
      message: 'That does not look like an Anthropic API key. They begin with sk-ant-.',
      fix: 'Check you copied the key itself and not a key name or an ID.',
    }
  }
  if (key.startsWith('sk-ant-admin')) {
    return {
      ok: false,
      message: 'That is an Admin key. Admin keys manage the organisation and cannot read images.',
      fix: 'Create a normal API key in the console instead.',
    }
  }
  if (key.length < 40) {
    return {
      ok: false,
      message: `The key is only ${key.length} characters, which is too short to be complete.`,
      fix: 'It was probably cut off when copied. Paste it again.',
    }
  }

  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true })

  try {
    // Free: proves the key authenticates at all.
    await client.models.list({ limit: 1 })
  } catch (error) {
    return explain(error, 'authenticate')
  }

  try {
    // One token: proves this account can run this model and has credit.
    await client.messages.create({
      model: settings.model,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }],
    })
  } catch (error) {
    return explain(error, 'run')
  }

  return { ok: true, message: `Key works, and ${settings.model} is available on this account.` }
}

/** The API's own sentence, without the status line and raw JSON around it. */
function detail(error: InstanceType<typeof Anthropic.APIError>): string {
  const body = error.error as { error?: { message?: string } } | undefined
  return body?.error?.message ?? error.message
}

function explain(error: unknown, stage: 'authenticate' | 'run'): KeyCheck {
  if (error instanceof Anthropic.AuthenticationError) {
    return {
      ok: false,
      message: `The key was rejected — ${detail(error)}`,
      fix: 'Most often the key was revoked, or it belongs to a different console account than you think. Create a fresh one and paste that.',
    }
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return {
      ok: false,
      message: `The key is valid but not allowed to do this — ${detail(error)}`,
      fix: 'Check the workspace the key belongs to, and that it is a standard API key.',
    }
  }
  if (error instanceof Anthropic.NotFoundError) {
    return {
      ok: false,
      message: `That model is not available to this account — ${detail(error)}`,
      fix: 'Switch model below and test again.',
    }
  }
  if (error instanceof Anthropic.RateLimitError) {
    return { ok: false, message: 'Rate limited.', fix: 'Wait a moment and test again.' }
  }
  if (error instanceof Anthropic.APIError) {
    const text = detail(error)
    const credit = /credit|balance|billing|quota/i.test(text)
    return {
      ok: false,
      message: `API error ${error.status} — ${text}`,
      fix: credit
        ? 'The key is fine — the account has no credit. Add some in the console under Billing. API credit is separate from any Claude subscription.'
        : undefined,
    }
  }
  return {
    ok: false,
    message: `Could not reach the API to ${stage}.`,
    fix: 'Check your connection. If you are online, an ad blocker or a corporate proxy may be blocking api.anthropic.com.',
  }
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** The model reports y as a fraction of image height, a different physical
 *  unit from x on any photo that is not square. Convert once so nothing
 *  downstream has to remember the difference. */
const toWidthUnits = (x: number, y: number, aspect: number) => ({
  x: clamp01(x),
  y: clamp01(y) / aspect,
})

function explainCallFailure(error: unknown): VisionError {
  if (error instanceof VisionError) return error
  if (error instanceof Anthropic.AuthenticationError) {
    return new VisionError(`API key rejected — ${detail(error)}. Test it in Settings.`)
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new VisionError('Rate limited by the API. Wait a moment and try again.')
  }
  if (error instanceof Anthropic.APIError) {
    return new VisionError(`API error ${error.status} — ${detail(error)}`)
  }
  return new VisionError('Could not reach the API. Check your connection — you can still mark the holes by hand.')
}

/**
 * Ask Claude where the holes are.
 *
 * The aiming mark is found first, deterministically (see blackLocator.ts —
 * no API call). The photo is then cropped tightly around it — out to its
 * outermost scoring ring, not just the black, so a shot on the white paper
 * is not cropped away — and Claude reads holes from that close-up view.
 * The crop ends up with far more real pixels behind each hole than a
 * whole-sheet photo could ever give it at the same API image-size limit.
 *
 * This runs straight from the browser with the athlete's own key, which keeps
 * the app a set of static files with no server behind it. The tradeoff is
 * that the key lives in this browser's local storage — fine for a personal
 * training log on your own phone, not fine for a key you share with anyone.
 */
export async function detectShots(
  file: Blob,
  position: Position,
  settings: Settings,
  /** Image width divided by height, for converting the model's y values. */
  aspect: number,
  /** How many shots this bout is expected to have — 5 normally, 10 for a precision test. */
  expectedShots: number,
): Promise<Detection> {
  if (settings.localHoleDetection) return detectShotsLocally(file, settings, aspect)

  if (!settings.apiKey) throw new VisionError('No API key set. Add one in Settings.')

  const client = new Anthropic({ apiKey: settings.apiKey, dangerouslyAllowBrowser: true })
  const face = faceById(settings.targetFaceId)

  const located = await locateBlackInBlob(file)
  const crop = located ? outerRingCrop(located, face, aspect) : null

  if (!crop || crop.x1 - crop.x0 <= 1e-4 || crop.y1 - crop.y0 <= 1e-4) {
    // Nothing found to crop around — read the whole frame in one pass rather
    // than leaving the athlete with an empty screen.
    try {
      return await detectWholeImage(client, file, settings, aspect, face.name, position, expectedShots)
    } catch (error) {
      throw explainCallFailure(error)
    }
  }

  try {
    return await detectFromCrops(client, file, settings, [crop], face.name, position, expectedShots)
  } catch (error) {
    throw explainCallFailure(error)
  }
}

/**
 * The fully local path: no API call at all, for the "localHoleDetection"
 * experiment. Deliberately conservative — see holeLocator.ts — so this
 * reports what it's unsure about rather than presenting a guess as settled.
 */
async function detectShotsLocally(file: Blob, settings: Settings, aspect: number): Promise<Detection> {
  const face = faceById(settings.targetFaceId)
  const located = await locateBlackInBlob(file)
  if (!located) {
    return { bulls: [], notes: 'No aiming mark found automatically. Place the ring and tap in your shots.', confidence: 0 }
  }

  const crop = outerRingCrop(located, face, aspect)
  const ringRadiiFrac = ringRadii(face).map((r) => r / (face.blackMm / 2))
  const { holes, ambiguous } = await locateHolesInBlob(
    file, crop, located, settings.aimingMarkMm, settings.bulletDiameterMm, ringRadiiFrac,
  )
  const ambiguousCount = ambiguous.filter(Boolean).length

  return {
    bulls: [{ ...located, holes }],
    notes:
      'Experimental local detection — no Claude call was made. Check every marker; a merged group is flagged, ' +
      'not split, and a real hole can still be missed.' +
      (ambiguousCount > 0 ? ` ${ambiguousCount} marker${ambiguousCount === 1 ? '' : 's'} may cover more than one shot.` : ''),
    confidence: ambiguousCount > 0 ? 0.4 : 0.6,
  }
}

async function detectFromCrops(
  client: Anthropic,
  file: Blob,
  settings: Settings,
  crops: CropRect[],
  faceName: string,
  position: Position,
  expectedShots: number,
): Promise<Detection> {
  const images = await Promise.all(crops.map((rect) => cropForVision(file, rect)))

  const response = await client.messages.parse({
    model: settings.model,
    max_tokens: 8000,
    system: cropSystem(images.length),
    output_config: { format: zodOutputFormat(BatchDetectionSchema), effort: 'high' },
    messages: [
      {
        role: 'user',
        content: [
          ...images.map((data): Anthropic.ImageBlockParam => ({
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data },
          })),
          {
            type: 'text',
            text: `These crops are all from one ${faceName} bout, shot ${position}, normally about ${expectedShots} shots in total across all of them combined. Report exactly what you see in each.`,
          },
        ],
      },
    ],
  })

  if (response.stop_reason === 'refusal') {
    throw new VisionError('The model declined to read this image. Mark the holes by hand instead.')
  }
  const parsed = response.parsed_output
  if (!parsed) throw new VisionError('The model did not return a readable result. Try again, or mark by hand.')

  const bulls: Bull[] = parsed.crops.map((c, i) => {
    const rect = crops[i]
    const semiMajor = Math.max(fromCropWidthFraction(rect, c.semiMajor), 1e-4)
    const semiMinor = Math.max(Math.min(fromCropWidthFraction(rect, c.semiMinor), semiMajor), 1e-4)
    return {
      id: `bull-${i + 1}`,
      centre: fromCropFraction(rect, clamp01(c.centreX), clamp01(c.centreY)),
      semiMajor,
      semiMinor,
      rotationDeg: c.rotationDeg,
      holes: c.holes.map((h) => fromCropFraction(rect, clamp01(h.x), clamp01(h.y))),
    }
  })

  return { bulls, notes: parsed.notes, confidence: clamp01(parsed.confidence) }
}

async function detectWholeImage(
  client: Anthropic,
  file: Blob,
  settings: Settings,
  aspect: number,
  faceName: string,
  position: Position,
  expectedShots: number,
): Promise<Detection> {
  const data = await forVision(file)
  const response = await client.messages.parse({
    model: settings.model,
    max_tokens: 8000,
    system: wholeImageSystem(expectedShots),
    output_config: { format: zodOutputFormat(DetectionSchema), effort: 'high' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } },
          {
            type: 'text',
            text: `This is a ${faceName} target, shot ${position}. Find every black aiming area and every bullet hole in this photograph.`,
          },
        ],
      },
    ],
  })

  if (response.stop_reason === 'refusal') {
    throw new VisionError('The model declined to read this image. Mark the holes by hand instead.')
  }
  const parsed = response.parsed_output
  if (!parsed) throw new VisionError('The model did not return a readable result. Try again, or mark by hand.')

  return {
    bulls: parsed.bulls.map(
      (b, i): Bull => ({
        id: `bull-${i + 1}`,
        centre: toWidthUnits(b.centreX, b.centreY, aspect),
        semiMajor: Math.max(b.semiMajor, 1e-4),
        semiMinor: Math.max(Math.min(b.semiMinor, b.semiMajor), 1e-4),
        rotationDeg: b.rotationDeg,
        holes: b.holes.map((h) => toWidthUnits(h.x, h.y, aspect)),
      }),
    ),
    notes: parsed.notes,
    confidence: clamp01(parsed.confidence),
  }
}
