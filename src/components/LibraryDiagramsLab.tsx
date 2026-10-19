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

const hand = (x: number, y: number, colour = BODY): React.ReactNode => <circle cx={x} cy={y} r={5} fill={colour} />

/** A head seen from the side, facing right, with a nose and a hat so the direction reads at a glance. */
const head = (cx: number, cy: number, r = 13, colour = BODY): React.ReactNode => (
  <g>
    <circle cx={cx} cy={cy} r={r} fill={colour} />
    <path d={`M${cx + r - 1},${cy - 2} l${r * 0.45},${r * 0.3} l-${r * 0.45},${r * 0.3} z`} fill={colour} />
    <path d={`M${cx - r},${cy - 1} a${r},${r} 0 0 1 ${2 * r - 1},-${r * 0.55} v${r * 0.45} h-${2 * r} z`} fill={INK} opacity={0.85} />
  </g>
)

/** A ski boot from the side, toe to the right: sole, shaft and toe cap. */
const boot = (x: number, y: number, colour = BODY): React.ReactNode => (
  <g>
    <rect x={x - 11} y={y - 13} width={36} height={13} rx={5} fill={colour} />
    <rect x={x - 11} y={y - 3} width={36} height={3.5} rx={1.5} fill={INK} opacity={0.55} />
  </g>
)

// 5. The standing position, from the side, shooting to the right.
export function StandingFigure() {
  return (
    <Figure
      viewBox="20 8 262 216"
      label="A shooter in the standing position seen from the right side, facing the target on the right. Feet about shoulder-width apart, body upright, the rifle at the right shoulder with the left arm's elbow resting on the hip and the forearm raised to hold the fore-end."
      caption="The standing position from the right side. The rifle sits at the shoulder, and the elbow of the arm under the rifle (on the far side) rests on the hip, so that arm is held up by the body. Feet are about shoulder-width apart."
    >
      <line x1={24} y1={214} x2={282} y2={214} stroke={LINE} strokeWidth={1} />
      {/* far leg, lighter, a little behind */}
      {limb([[112, 118], [110, 160], [112, 200]], 15, BODY_FAR)}
      {boot(104, 214, BODY_FAR)}
      {/* far (support) arm: shoulder, elbow on the hip, forearm up to the fore-end */}
      {limb([[122, 66], [146, 108], [192, 70]], 9, BODY_FAR)}
      {hand(192, 69, BODY_FAR)}
      {/* torso and neck */}
      {limb([[118, 62], [126, 112]], 27)}
      {limb([[123, 52], [120, 62]], 9)}
      {/* near leg */}
      {limb([[128, 118], [130, 160], [128, 200]], 17)}
      {boot(120, 214)}
      {/* head with the cheek on the stock */}
      {head(128, 36)}
      {/* rifle: stock at the shoulder, barrel out to the target */}
      <path d="M100,60 L152,60 L152,69 L100,74 Z" fill={INK} />
      <line x1={150} y1={63} x2={276} y2={63} stroke={INK} strokeWidth={5} strokeLinecap="round" />
      <rect x={140} y={52} width={14} height={7} rx={2} fill={INK} />
      {/* near (trigger) arm: elbow out and back, hand at the grip */}
      {limb([[118, 66], [101, 88], [140, 74]], 9)}
      {hand(140, 73)}
      {/* the support elbow on the hip */}
      <circle cx={146} cy={108} r={11} fill="none" stroke={BLUE} strokeWidth={2.2} />
      {/* line of fire */}
      <line x1={200} y1={36} x2={274} y2={36} stroke={LINE} strokeWidth={1} strokeDasharray="5 4" />
      <path d="M274,36 l-8,-4 v8 z" fill={LINE} />
      <text x={237} y={28} textAnchor="middle" style={{ ...text(11), fill: MUTED }}>line of fire</text>
      {/* labels */}
      <text x={166} y={128} style={{ ...text(11), fill: BLUE, fontWeight: 700, ...haloed }}>elbow on the hip</text>
      <text x={24} y={170} style={{ ...text(11), fill: INK }}>feet about</text>
      <text x={24} y={184} style={{ ...text(11), fill: INK }}>shoulder-width</text>
      <path d="M92,182 L104,196" stroke={LINE} strokeWidth={1} fill="none" />
      <text x={24} y={92} style={{ ...text(11), fill: INK }}>rifle at</text>
      <text x={24} y={105} style={{ ...text(11), fill: INK }}>the shoulder</text>
      <path d="M86,88 L100,72" stroke={LINE} strokeWidth={1} fill="none" />
    </Figure>
  )
}

// 6. The prone position, from the side, shooting to the right.
export function ProneFigure() {
  return (
    <Figure
      viewBox="8 40 284 100"
      label="A shooter in the prone position seen from the right side, lying on a mat facing the target on the right, head up behind the rifle, with both elbows on the mat under the rifle."
      caption="The prone position from the right side. The body is down on the mat with both elbows on it under the rifle, so the rifle rests on bone and the mat, not on muscle."
    >
      {/* mat */}
      <rect x={12} y={116} width={276} height={9} rx={3} fill={BLUE} fillOpacity={0.18} />
      {/* far leg, lighter */}
      {limb([[98, 104], [44, 108]], 14, BODY_FAR)}
      {/* far (support) arm: elbow on the mat under the rifle, hand under the fore-end */}
      {limb([[156, 92], [190, 112], [216, 90]], 9, BODY_FAR)}
      {hand(216, 89, BODY_FAR)}
      {/* near leg and boot */}
      {limb([[98, 106], [44, 111]], 15)}
      {boot(26, 114)}
      {/* torso, raised on the elbows */}
      {limb([[98, 102], [152, 88]], 27)}
      {/* head up behind the sight */}
      {head(172, 70)}
      {/* rifle: stock at the shoulder, barrel to the target, resting forward on the support hand */}
      <path d="M146,80 L186,80 L186,88 L146,92 Z" fill={INK} />
      <line x1={184} y1={84} x2={282} y2={84} stroke={INK} strokeWidth={5} strokeLinecap="round" />
      <rect x={174} y={73} width={14} height={7} rx={2} fill={INK} />
      {/* near (trigger) arm: elbow on the mat, hand at the grip */}
      {limb([[150, 92], [138, 112], [176, 90]], 9)}
      {hand(176, 89)}
      {/* both elbows on the mat */}
      <circle cx={190} cy={112} r={10} fill="none" stroke={BLUE} strokeWidth={2.2} />
      <circle cx={138} cy={112} r={10} fill="none" stroke={BLUE} strokeWidth={2.2} />
      <text x={164} y={140} textAnchor="middle" style={{ ...text(11), fill: BLUE, fontWeight: 700, ...haloed }}>both elbows on the mat</text>
      <text x={60} y={86} textAnchor="middle" style={{ ...text(11), fill: INK }}>legs relaxed</text>
      <line x1={222} y1={62} x2={280} y2={62} stroke={LINE} strokeWidth={1} strokeDasharray="5 4" />
      <path d="M280,62 l-8,-4 v8 z" fill={LINE} />
      <text x={250} y={54} textAnchor="middle" style={{ ...text(11), fill: MUTED }}>line of fire</text>
    </Figure>
  )
}

// 7. The four stances of the balance ladder, seen from above (forward is up), two by two.
export function StanceVignettes() {
  const cellW = 144, cellH = 140
  const origin = (i: number) => ({ ox: 6 + (i % 2) * (cellW + 4), oy: 2 + Math.floor(i / 2) * (cellH + 26) })
  /** One foot from above: toe at the top. */
  const foot = (x: number, y: number, colour: string): React.ReactNode => (
    <g>
      <rect x={x - 8} y={y} width={16} height={42} rx={7} fill={colour} />
      <rect x={x - 6} y={y + 30} width={12} height={12} rx={5} fill={INK} opacity={0.35} />
    </g>
  )
  const names = ['Flat, normal stance', 'Staggered stance', 'Heels on a beam', 'Unstable sole']
  return (
    <Figure
      viewBox="0 0 300 332"
      label="Four stances for standing balance work, drawn as footprints seen from above with forward at the top: feet side by side; one foot ahead so its heel is level with the back foot's toes; heels resting on a low beam; and the middle of the feet on an unstable roll such as a pool noodle."
      caption="Four stances seen from above, forward at the top. Move to the next only when the one before holds steady. Dry only."
    >
      {names.map((n, i) => {
        const { ox, oy } = origin(i)
        const c = cellW / 2 // inside the cell's own group, which is already translated
        return (
          <g key={n} transform={`translate(${ox} ${oy})`}>
            <rect x={0} y={0} width={cellW} height={cellH} rx={8} fill="var(--grid)" fillOpacity={0.45} />
            <text x={8} y={17} style={{ ...text(12), fill: INK, fontWeight: 700 }}>{i + 1}</text>
            <text x={cellW / 2} y={cellH + 15} textAnchor="middle" style={{ ...text(11), fill: SOFT }}>{n}</text>
            <path d={`M${cellW - 14},30 v-14 m0,0 l-3.5,5 m3.5,-5 l3.5,5`} stroke={MUTED} strokeWidth={1.3} fill="none" strokeLinecap="round" />
            <text x={cellW - 14} y={42} textAnchor="middle" style={{ ...text(9.5), fill: MUTED }}>front</text>
            {i === 0 && <>{foot(c - 18, 40, BODY)}{foot(c + 18, 40, BODY)}</>}
            {i === 1 && (
              <>
                {foot(c - 18, 62, BODY_FAR)}
                {foot(c + 18, 20, BODY)}
                <line x1={c - 40} y1={62} x2={c + 40} y2={62} stroke={BLUE} strokeWidth={1.4} strokeDasharray="3 2" />
                <text x={c} y={123} textAnchor="middle" style={{ ...text(10), fill: BLUE, fontWeight: 700 }}>front heel level</text>
                <text x={c} y={134} textAnchor="middle" style={{ ...text(10), fill: BLUE, fontWeight: 700 }}>with back toes</text>
              </>
            )}
            {i === 2 && (
              <>
                {foot(c - 18, 28, BODY)}
                {foot(c + 18, 28, BODY)}
                <rect x={c - 42} y={62} width={84} height={9} rx={4.5} fill={BLUE} fillOpacity={0.4} stroke={BLUE} />
                <text x={c} y={128} textAnchor="middle" style={{ ...text(10), fill: BLUE, fontWeight: 700 }}>beam under the heels</text>
              </>
            )}
            {i === 3 && (
              <>
                {foot(c - 18, 28, BODY)}
                {foot(c + 18, 28, BODY)}
                <rect x={c - 42} y={44} width={84} height={14} rx={7} fill={BLUE} fillOpacity={0.3} stroke={BLUE} />
                <path d={`M${c - 54},50 q-6,6 0,12 M${c + 54},50 q6,6 0,12`} fill="none" stroke={MUTED} strokeWidth={1.4} strokeLinecap="round" />
                <text x={c} y={128} textAnchor="middle" style={{ ...text(10), fill: BLUE, fontWeight: 700 }}>roll under the feet</text>
              </>
            )}
          </g>
        )
      })}
    </Figure>
  )
}
