import { BLUE, Figure, HALO, INK, LINE, MUTED, SOFT, haloed, text } from './LibraryDiagrams'

/**
 * Experiments: four ways to show stability. Not wired into the library yet.
 */

/** A smooth, repeatable wander: sums of sines, so every render of a diagram is identical. */
function wander(amp: number, seed: number, drift = 0, n = 120): { x: number; y: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1)
    const x = amp * (0.62 * Math.sin(2 * Math.PI * 1.3 * t + seed) + 0.38 * Math.sin(2 * Math.PI * 3.1 * t + 2 * seed))
    const y = amp * (0.62 * Math.sin(2 * Math.PI * 1.7 * t + 1.7 * seed) + 0.38 * Math.sin(2 * Math.PI * 2.6 * t + 0.5 * seed))
    return { x: x + drift * t, y: y - drift * 0.4 * t }
  })
}

// 1. Aim paths: where the aim goes in the last second, against the hit area.
export function AimPaths() {
  const R = 40
  const cases = [
    { name: 'Steady', note: 'stays inside', cx: 50, pts: wander(11, 0.6) },
    { name: 'Drifting', note: 'creeps out', cx: 150, pts: wander(13, 1.9, 34) },
    { name: 'Unsteady', note: 'leaves and returns', cx: 250, pts: wander(38, 2.7) },
  ]
  const cy = 66
  return (
    <Figure
      viewBox="0 0 300 140"
      label="Three traces of where the aim moves in the last second before a shot, each drawn against the hit area. A steady aim stays inside it, a drifting aim creeps out, and an unsteady aim wanders well outside and back."
      caption="Where the aim goes in the last second before the shot, against the hit area (dashed). A steady position stays inside it; a drifting or unsteady one does not."
    >
      {cases.map((c) => {
        const d = c.pts.map((p, i) => `${i ? 'L' : 'M'}${(c.cx + p.x).toFixed(1)},${(cy + p.y).toFixed(1)}`).join(' ')
        const last = c.pts[c.pts.length - 1]
        return (
          <g key={c.name}>
            <circle cx={c.cx} cy={cy} r={R} fill="none" stroke={LINE} strokeWidth={1} strokeDasharray="4 3" />
            <path d={`M${c.cx - 4},${cy} h8 M${c.cx},${cy - 4} v8`} stroke={LINE} strokeWidth={1} />
            <path d={d} fill="none" stroke={BLUE} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
            <circle cx={c.cx + last.x} cy={cy + last.y} r={3.6} fill={BLUE} stroke={HALO} strokeWidth={1.5} />
            <text x={c.cx} y={122} textAnchor="middle" style={{ ...text(11), fill: INK, fontWeight: 600 }}>{c.name}</text>
            <text x={c.cx} y={135} textAnchor="middle" style={{ ...text(10.5), fill: MUTED }}>{c.note}</text>
          </g>
        )
      })}
      <text x={50} y={12} textAnchor="middle" style={{ ...text(10.5), fill: MUTED }}>hit area (dashed)</text>
    </Figure>
  )
}

// 2. Sway along and across the line of fire, seen from above.
export function SwayAxes() {
  return (
    <Figure
      viewBox="0 0 300 150"
      label="A view from above of a shooter, the line of fire to the target, and two kinds of body sway: along the line of fire, and across it. Sway across the line of fire has the larger effect on the shot."
      caption="Sway seen from above. Movement across the line of fire moves the shot sideways and is the one that matters more; along the line of fire matters less."
    >
      {/* line of fire */}
      <line x1={44} y1={75} x2={262} y2={75} stroke={LINE} strokeWidth={1} strokeDasharray="5 4" />
      <path d="M262,75 l-8,-4 v8 z" fill={LINE} />
      <text x={150} y={68} textAnchor="middle" style={{ ...text(10.5), fill: MUTED }}>line of fire</text>
      {/* target */}
      <rect x={268} y={55} width={6} height={40} rx={2} fill={INK} />
      <text x={271} y={110} textAnchor="middle" style={{ ...text(10.5), fill: MUTED }}>target</text>
      {/* shooter from above: shoulders across the line, head, rifle along it */}
      <line x1={34} y1={62} x2={34} y2={88} stroke={INK} strokeWidth={5} strokeLinecap="round" />
      <circle cx={38} cy={75} r={7} fill={INK} />
      <line x1={38} y1={75} x2={96} y2={75} stroke={INK} strokeWidth={3} strokeLinecap="round" />
      {/* across: the one that matters more */}
      <path d="M34,52 v-34 M34,18 l-4,8 h8 z M34,52 l-4,-8 h8 z" stroke={BLUE} strokeWidth={2} fill={BLUE} />
      <text x={46} y={30} style={{ ...text(11), fill: BLUE, fontWeight: 600 }}>across the line</text>
      <text x={46} y={43} style={{ ...text(10.5), fill: SOFT }}>moves the shot most</text>
      {/* along */}
      <path d="M34,98 h0 M20,120 h40 M20,120 l8,-4 v8 z M60,120 l-8,-4 v8 z" stroke={INK} strokeWidth={2} fill={INK} />
      <text x={70} y={124} style={{ ...text(11), fill: INK, fontWeight: 600 }}>along the line</text>
      <text x={70} y={137} style={{ ...text(10.5), fill: SOFT }}>matters less</text>
    </Figure>
  )
}

// 3. A ladder of balance exercises: harder only once the step below is steady.
export function StabilityLadder() {
  const steps = [
    { label: 'Flat, normal stance', short: 'Flat' },
    { label: 'Staggered stance', short: 'Staggered' },
    { label: 'Heels on a beam', short: 'Heels raised' },
    { label: 'Unstable sole', short: 'Unstable' },
  ]
  const x0 = 12, w = 66, gap = 4, base = 118, rise = 20
  return (
    <Figure
      viewBox="0 0 300 150"
      label="A four-step ladder of standing balance exercises: flat normal stance, staggered stance, heels on a beam, unstable sole. Move up a step only once the current one holds steady for 30 to 45 seconds; step back down if it never settles."
      caption="Balance work in steps. Move up only when the current step holds steady for 30 to 45 seconds. If it never settles, you have gone one step too far: step back."
    >
      {steps.map((s, i) => {
        const x = x0 + i * (w + gap)
        const h = 26 + i * rise
        return (
          <g key={s.short}>
            <rect x={x} y={base - h} width={w} height={h} rx={4} fill={BLUE} fillOpacity={0.14 + i * 0.16} stroke={BLUE} strokeOpacity={0.6} />
            <text x={x + w / 2} y={base - h + 15} textAnchor="middle" style={{ ...text(10.5), fill: INK, fontWeight: 600 }}>{i + 1}</text>
            <text x={x + w / 2} y={base + 14} textAnchor="middle" style={{ ...text(10.5), fill: SOFT }}>{s.short}</text>
          </g>
        )
      })}
      <text x={x0 + 2} y={16} style={{ ...text(10.5), fill: INK }}>Up a step only when the one before holds for 30–45 s</text>
      <line x1={x0 + 40} y1={142} x2={x0 + 4 * (w + gap) - gap - 44} y2={142} stroke={MUTED} strokeWidth={1.2} />
      <path d={`M${x0 + 4 * (w + gap) - gap - 44},142 l-6,-3.5 v7 z`} fill={MUTED} />
      <text x={x0 + 2} y={146} style={{ ...text(10.5), fill: MUTED }}>easier</text>
      <text x={x0 + 4 * (w + gap) - gap} y={146} textAnchor="end" style={{ ...text(10.5), fill: MUTED }}>harder</text>
    </Figure>
  )
}

// 4. How much the aim wanders over a 30 second hold: steady against tiring.
export function HoldOverTime() {
  const x0 = 40, x1 = 290, top = 16, bottom = 120
  const X = (t: number) => x0 + (t / 30) * (x1 - x0)
  const Y = (a: number) => bottom - a * (bottom - top)
  const steady = Array.from({ length: 61 }, (_, i) => {
    const t = (i / 60) * 30
    return `${X(t).toFixed(1)},${Y(0.16 + 0.05 * Math.sin(t * 1.7) + 0.03 * Math.sin(t * 4.1)).toFixed(1)}`
  }).join(' ')
  const tiring = Array.from({ length: 61 }, (_, i) => {
    const t = (i / 60) * 30
    return `${X(t).toFixed(1)},${Y(0.18 + 0.6 * Math.pow(t / 30, 1.7) + 0.06 * Math.sin(t * 1.7) + 0.04 * Math.sin(t * 4.1)).toFixed(1)}`
  }).join(' ')
  return (
    <Figure
      viewBox="0 0 300 150"
      label="How much the aim wanders during a 30 second hold. A steady position stays low and level. A tiring one wanders more and more as the hold goes on. A drill is steady enough when it looks like the first."
      caption="How far the aim wanders during a 30-second hold. Steady stays low and level; tiring climbs. A position is ready to be made harder when it looks like the first."
    >
      <line x1={x0} y1={bottom} x2={x1} y2={bottom} stroke={LINE} strokeWidth={1} />
      <line x1={x0} y1={top} x2={x0} y2={bottom} stroke={LINE} strokeWidth={1} />
      <polyline points={tiring} fill="none" stroke={INK} strokeWidth={1.8} strokeDasharray="6 3" strokeLinejoin="round" />
      <polyline points={steady} fill="none" stroke={BLUE} strokeWidth={2} strokeLinejoin="round" />
      <text x={X(18)} y={Y(0.1) + 4} style={{ ...text(11), fill: BLUE, fontWeight: 600, ...haloed }}>Steady</text>
      <text x={X(14)} y={Y(0.42)} style={{ ...text(11), fill: INK, fontWeight: 600, ...haloed }}>Tiring</text>
      <text x={x0 - 6} y={top + 8} textAnchor="end" style={{ ...text(10.5), fill: MUTED }}>more</text>
      <text x={x0 - 6} y={bottom} textAnchor="end" style={{ ...text(10.5), fill: MUTED }}>less</text>
      <text x={x0} y={140} style={{ ...text(10.5), fill: MUTED }}>0 s</text>
      <text x={x1} y={140} textAnchor="end" style={{ ...text(10.5), fill: MUTED }}>30 s</text>
      <text x={12} y={(top + bottom) / 2} transform={`rotate(-90 12 ${(top + bottom) / 2})`} textAnchor="middle" style={{ ...text(10.5), fill: MUTED }}>aim wander</text>
    </Figure>
  )
}

// --- People: stylised figures for the positions -------------------------------------
//
// Simple figures (a head, a thick torso, rounded limbs) seen from the side, drawn
// for this library. They show the shape of each position, not a coaching standard:
// whoever coaches should check the detail before they go into the library.

const BODY = 'var(--text-secondary)'
const BODY_FAR = 'var(--text-muted)'

const limb = (pts: [number, number][], width = 7, colour = BODY): React.ReactNode => (
  <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={colour} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
)

const hand = (x: number, y: number, colour = BODY): React.ReactNode => <circle cx={x} cy={y} r={4.6} fill={colour} />
/** A boot seen from the side: toe to the right. */
const boot = (x: number, y: number, colour = BODY): React.ReactNode => (
  <rect x={x - 8} y={y - 8} width={30} height={9} rx={4} fill={colour} />
)

// 5. The standing position, from the side, shooting to the right.
export function StandingFigure() {
  return (
    <Figure
      viewBox="24 34 262 152"
      label="A shooter in the standing position seen from the side, facing the target on the right. Feet about shoulder-width apart, body upright, the rifle at the shoulder with the support arm's elbow resting on the hip."
      caption="The standing position from the side. The rifle sits at the shoulder and the support arm’s elbow rests on the hip, so the arm is held up by the body. Feet are about shoulder-width apart."
    >
      <line x1={26} y1={181} x2={284} y2={181} stroke={LINE} strokeWidth={1} />
      {/* far leg and boot */}
      {limb([[120, 120], [118, 152], [120, 172]], 8, BODY_FAR)}
      {boot(112, 181, BODY_FAR)}
      {/* near leg and boot */}
      {limb([[130, 120], [132, 152], [130, 172]], 9)}
      {boot(124, 181)}
      {/* torso, leaning back a little */}
      {limb([[127, 122], [121, 76]], 17)}
      {/* head, cheek down on the stock */}
      <circle cx={130} cy={55} r={11.5} fill={BODY} />
      {/* trigger arm: elbow out and back, hand at the grip */}
      {limb([[122, 80], [110, 98], [139, 86]], 6, BODY_FAR)}
      {hand(139, 86, BODY_FAR)}
      {/* rifle */}
      <line x1={110} y1={79} x2={264} y2={72} stroke={INK} strokeWidth={5} strokeLinecap="round" />
      <path d="M150,77 l-3,10 h6 z" fill={INK} />
      {/* support arm: elbow on the hip, forearm up to the rifle */}
      {limb([[122, 82], [142, 111], [188, 79]], 7)}
      {hand(188, 78)}
      <circle cx={142} cy={112} r={9.5} fill="none" stroke={BLUE} strokeWidth={2} />
      {/* line of fire */}
      <line x1={196} y1={52} x2={272} y2={52} stroke={LINE} strokeWidth={1} strokeDasharray="5 4" />
      <path d="M272,52 l-8,-4 v8 z" fill={LINE} />
      <text x={234} y={44} textAnchor="middle" style={{ ...text(10.5), fill: MUTED }}>line of fire</text>
      {/* labels */}
      <text x={160} y={134} style={{ ...text(10.5), fill: BLUE, fontWeight: 600, ...haloed }}>elbow on the hip</text>
      <text x={100} y={150} textAnchor="end" style={{ ...text(10.5), fill: INK }}>feet about</text>
      <text x={100} y={163} textAnchor="end" style={{ ...text(10.5), fill: INK }}>shoulder-width</text>
      <path d="M103,162 L112,172" stroke={LINE} strokeWidth={1} fill="none" />
    </Figure>
  )
}

// 6. The prone position, from the side, shooting to the right.
export function ProneFigure() {
  return (
    <Figure
      viewBox="8 70 284 86"
      label="A shooter in the prone position seen from the side, lying on a mat facing the target on the right, head up behind the rifle, with both elbows on the mat under the rifle."
      caption="The prone position from the side. The body is on the mat with the elbows underneath the rifle, so the rifle is held up by bone and the mat, not by muscle."
    >
      {/* mat */}
      <rect x={12} y={126} width={276} height={8} rx={3} fill={BLUE} fillOpacity={0.16} />
      {/* legs back to the left, boots */}
      {limb([[88, 118], [34, 121]], 9, BODY_FAR)}
      {limb([[88, 121], [34, 124]], 9)}
      <rect x={18} y={115} width={14} height={12} rx={4} fill={BODY} />
      {/* torso rising to the shoulders */}
      {limb([[90, 119], [144, 108]], 16)}
      {/* head up behind the sight */}
      <circle cx={160} cy={86} r={11} fill={BODY} />
      {/* rifle, butt at the shoulder, muzzle to the right */}
      <line x1={146} y1={100} x2={276} y2={104} stroke={INK} strokeWidth={5} strokeLinecap="round" />
      {/* trigger arm: elbow on the mat, hand at the grip */}
      {limb([[146, 110], [136, 125], [163, 106]], 6, BODY_FAR)}
      {hand(163, 106, BODY_FAR)}
      {/* support arm: elbow on the mat under the rifle, hand under the fore-end */}
      {limb([[148, 112], [192, 125], [214, 107]], 7)}
      {hand(214, 106)}
      <circle cx={192} cy={125} r={8.5} fill="none" stroke={BLUE} strokeWidth={2} />
      <text x={200} y={150} textAnchor="middle" style={{ ...text(10.5), fill: BLUE, fontWeight: 600, ...haloed }}>elbow on the mat</text>
      <text x={56} y={104} textAnchor="middle" style={{ ...text(10.5), fill: INK }}>legs relaxed</text>
      <line x1={222} y1={86} x2={278} y2={88} stroke={LINE} strokeWidth={1} strokeDasharray="5 4" />
      <path d="M278,88 l-8,-4 v8 z" fill={LINE} />
      <text x={250} y={80} textAnchor="middle" style={{ ...text(10.5), fill: MUTED }}>line of fire</text>
    </Figure>
  )
}

// 7. The four stances of the balance ladder, as feet seen from the side, two by two.
export function StanceVignettes() {
  const cellW = 144, cellH = 92
  const origin = (i: number) => ({ ox: 6 + (i % 2) * (cellW + 4), oy: 4 + Math.floor(i / 2) * (cellH + 6) })
  const g = 58 // ground, inside a cell
  const leg = (x: number, y: number, colour: string, tilt = 0): React.ReactNode => (
    <g transform={`rotate(${tilt} ${x} ${y})`}>
      {limb([[x - 4, y - 40], [x - 3, y - 9]], 9, colour)}
      <rect x={x - 9} y={y - 9} width={32} height={10} rx={4.5} fill={colour} />
    </g>
  )
  const names = ['Flat, normal stance', 'Staggered stance', 'Heels on a beam', 'Unstable sole']
  return (
    <Figure
      viewBox="0 0 300 200"
      label="Four stances for standing balance work, shown as feet seen from the side: flat and normal; staggered with the front heel level with the back toes; heels on a low beam; and standing on an unstable sole such as a pool noodle."
      caption="Four stances, as feet and lower legs from the side. Move to the next only when the one before holds steady. Dry only."
    >
      {names.map((n, i) => {
        const { ox, oy } = origin(i)
        const c = cellW / 2 // inside the cell's own group, which is already translated
        return (
          <g key={n} transform={`translate(${ox} ${oy})`}>
            <text x={6} y={14} style={{ ...text(11), fill: INK, fontWeight: 700 }}>{i + 1}</text>
            <text x={cellW / 2} y={cellH + 2} textAnchor="middle" style={{ ...text(10.5), fill: SOFT }}>{n}</text>
            {/* ground */}
            {i < 2 && <line x1={10} y1={g + 1} x2={cellW - 10} y2={g + 1} stroke={LINE} strokeWidth={1} />}
            {i === 0 && <>{leg(c - 22, g, BODY_FAR)}{leg(c - 6, g, BODY)}</>}
            {i === 1 && (
              <>
                {leg(c - 40, g, BODY_FAR)}
                {leg(c - 6, g, BODY)}
                <line x1={c - 7} y1={g - 54} x2={c - 7} y2={g + 5} stroke={BLUE} strokeWidth={1.2} strokeDasharray="3 2" />
                <text x={c + 22} y={g - 38} style={{ ...text(10), fill: BLUE, fontWeight: 600 }}>heel level</text>
                <text x={c + 22} y={g - 27} style={{ ...text(10), fill: BLUE, fontWeight: 600 }}>with toes</text>
              </>
            )}
            {i === 2 && (
              <>
                <line x1={10} y1={g + 1} x2={cellW - 10} y2={g + 1} stroke={LINE} strokeWidth={1} />
                <circle cx={c - 28} cy={g - 5} r={6} fill={BLUE} fillOpacity={0.3} stroke={BLUE} />
                <circle cx={c - 12} cy={g - 5} r={6} fill={BLUE} fillOpacity={0.3} stroke={BLUE} />
                {leg(c - 28, g - 10, BODY_FAR, -5)}
                {leg(c - 12, g - 10, BODY, -5)}
              </>
            )}
            {i === 3 && (
              <>
                <line x1={10} y1={g + 1} x2={cellW - 10} y2={g + 1} stroke={LINE} strokeWidth={1} />
                <circle cx={c - 6} cy={g - 8} r={9} fill={BLUE} fillOpacity={0.28} stroke={BLUE} />
                {leg(c - 18, g - 16, BODY_FAR, 3)}
                {leg(c - 2, g - 16, BODY, 3)}
                <path d={`M${c - 46},${g - 44} q-7,10 0,20 M${c + 36},${g - 44} q7,10 0,20`} fill="none" stroke={MUTED} strokeWidth={1.3} strokeLinecap="round" />
              </>
            )}
          </g>
        )
      })}
    </Figure>
  )
}
