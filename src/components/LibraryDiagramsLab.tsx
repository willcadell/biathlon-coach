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
