import type { DiagramId } from '../lib/library'
import type { SeasonPhase } from '../lib/seasonPhase'
import { SEASON_PHASE_LABEL } from '../lib/seasonPhase'

/**
 * Small explanatory diagrams for the shooting library. Each is a schematic drawn
 * for this app to show an idea from an entry (a breath cycle, a trigger curve,
 * two ways of approaching the target). They are not copies of the journal's
 * figures and carry no data from the articles, so each says so.
 *
 * They are drawn at about the width of a phone card, so type is true size, use
 * the theme's tokens so they work in light and dark, and label directly rather
 * than rely on colour alone.
 */

export const INK = 'var(--text-primary)'
export const SOFT = 'var(--text-secondary)'
export const MUTED = 'var(--text-muted)'
export const LINE = 'var(--axis)'
export const BLUE = 'var(--series-1)'
export const HALO = 'var(--surface-1)'

export const text = (size = 11): React.CSSProperties => ({ fontSize: size, fill: SOFT, fontFamily: 'inherit' })
/** Text that stays readable where it crosses a line: a halo in the card colour. */
export const haloed: React.CSSProperties = { stroke: HALO, strokeWidth: 3, paintOrder: 'stroke', strokeLinejoin: 'round' }

export function Figure({
  label, caption, viewBox, children,
}: {
  label: string
  caption: string
  viewBox: string
  children: React.ReactNode
}) {
  return (
    <figure style={{ margin: '10px 0 6px' }}>
      <svg viewBox={viewBox} role="img" aria-label={label} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <title>{label}</title>
        {children}
      </svg>
      <figcaption className="meta" style={{ marginTop: 4 }}>
        {caption} <em>A schematic drawn for this library, not a figure from the source.</em>
      </figcaption>
    </figure>
  )
}

// --- Breath cycle -------------------------------------------------------------

function BreathCycle() {
  const x0 = 78, x1 = 292, top = 14, bottom = 126
  const h = bottom - top
  const volume = (t: number) => 0.5 - 0.5 * Math.cos(2 * Math.PI * t) // 0 empty, 1 full
  const X = (t: number) => x0 + (t / 2) * (x1 - x0)
  const Y = (v: number) => bottom - v * h
  const pts = Array.from({ length: 81 }, (_, i) => {
    const t = (i / 80) * 2
    return `${X(t).toFixed(1)},${Y(volume(t)).toFixed(1)}`
  }).join(' ')
  // The three release zones, by how full the lungs are (from the study's definition).
  const bands = [
    { from: 0.75, to: 1, name: 'Inhaled', fill: 'var(--grid)' },
    { from: 0.25, to: 0.75, name: 'Neutral', fill: 'var(--grid)' },
    { from: 0, to: 0.25, name: 'Exhaled', fill: BLUE },
  ]
  const releaseT = 1.9
  return (
    <Figure
      viewBox="0 0 300 150"
      label="One breath as lung volume over time, split into three bands: inhaled at the top, neutral in the middle, exhaled at the bottom. A release point is marked in the exhaled band."
      caption="One breath, as lung volume over time. The bands show where in the breath a shot is released: the top quarter is inhaled, the middle half neutral, the bottom quarter exhaled."
    >
      {bands.map((b) => (
        <g key={b.name}>
          <rect x={x0} y={Y(b.to)} width={x1 - x0} height={(b.to - b.from) * h} fill={b.fill} opacity={b.name === 'Exhaled' ? 0.16 : 0.5} />
          <text x={x0 - 8} y={Y((b.from + b.to) / 2) + 4} textAnchor="end" style={{ ...text(11), fill: INK }}>{b.name}</text>
        </g>
      ))}
      <polyline points={pts} fill="none" stroke={BLUE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={X(releaseT)} cy={Y(volume(releaseT))} r={5} fill={BLUE} stroke={HALO} strokeWidth={2} />
      <text x={X(releaseT) - 9} y={Y(volume(releaseT)) - 9} textAnchor="end" style={{ ...text(11), fill: INK, ...haloed }}>release</text>
      <text x={x1 - 4} y={Y(0.9) + 4} textAnchor="end" style={{ ...text(10.5), ...haloed, fontStyle: 'italic' }}>avoid, especially standing</text>
      <text x={x0} y={144} style={{ ...text(10.5), fill: MUTED }}>time →</text>
    </Figure>
  )
}

// --- Hold or timing -------------------------------------------------------------

function AimingApproaches() {
  const x0 = 46, x1 = 288, top = 14, bottom = 128
  const tMin = -0.8
  const X = (t: number) => x0 + ((t - tMin) / (0 - tMin)) * (x1 - x0)
  const Y = (d: number) => bottom - (Math.min(120, d) / 120) * (bottom - top)
  const curve = (f: (t: number) => number) =>
    Array.from({ length: 61 }, (_, i) => {
      const t = tMin + (i / 60) * -tMin
      return `${X(t).toFixed(1)},${Y(f(t)).toFixed(1)}`
    }).join(' ')
  const hold = (t: number) => 24 + 96 * Math.exp(-(t - tMin) / 0.1)
  const timing = (t: number) => 22 + 108 * Math.pow(-t / 0.8, 1.6)
  const edge = 60
  return (
    <Figure
      viewBox="0 0 300 150"
      label="Distance of the aim from the centre of the target over the last 0.8 seconds before the trigger. A holding approach drops inside the hit area early and stays low and steady. A timing approach is still moving in when the shot is released."
      caption="The aim’s distance from the centre over the last 0.8 seconds before the shot. A holder settles inside the hit area and triggers just after. A timer is still moving in at the trigger."
    >
      <line x1={x0} y1={Y(edge)} x2={x1} y2={Y(edge)} stroke={LINE} strokeWidth={1} strokeDasharray="4 3" />
      <text x={x1 - 5} y={Y(edge) - 5} textAnchor="end" style={{ ...text(10.5), ...haloed }}>edge of the hit area</text>
      <line x1={x0} y1={bottom} x2={x1} y2={bottom} stroke={LINE} strokeWidth={1} />
      <line x1={x1} y1={top} x2={x1} y2={bottom} stroke={LINE} strokeWidth={1} />
      <polyline points={curve(hold)} fill="none" stroke={BLUE} strokeWidth={2} strokeLinecap="round" />
      <polyline points={curve(timing)} fill="none" stroke={INK} strokeWidth={2} strokeDasharray="6 3" strokeLinecap="round" />
      <text x={X(-0.55)} y={Y(24) - 9} style={{ ...text(11), fill: BLUE, fontWeight: 600 }}>Hold</text>
      <text x={X(-0.62)} y={top + 16} style={{ ...text(11), fill: INK, fontWeight: 600 }}>Timing</text>
      <text x={x0} y={142} style={{ ...text(10.5), fill: MUTED }}>0.8 s before</text>
      <text x={x1} y={142} textAnchor="end" style={{ ...text(10.5), fill: MUTED }}>trigger</text>
      <text x={14} y={(top + bottom) / 2} transform={`rotate(-90 14 ${(top + bottom) / 2})`} textAnchor="middle" style={{ ...text(10.5), fill: MUTED }}>
        distance from centre
      </text>
    </Figure>
  )
}

// --- Trigger curve -------------------------------------------------------------

function TriggerCurve() {
  const x0 = 42, x1 = 290, top = 26, bottom = 126
  const X = (t: number) => x0 + (t / 4.2) * (x1 - x0)
  const Y = (f: number) => bottom - (f / 100) * (bottom - top)
  const path: [number, number][] = [
    [0, 0], [0.12, 30], [0.3, 66], [0.5, 82], [0.8, 84], [2.6, 89], [3.2, 92], [3.6, 100], [3.75, 40], [3.9, 0],
  ]
  const pts = path.map(([t, f]) => `${X(t).toFixed(1)},${Y(f).toFixed(1)}`).join(' ')
  return (
    <Figure
      viewBox="0 0 300 150"
      label="Force on the trigger over time. It rises quickly to a plateau at 80 to 90 percent of the trigger weight, rises slightly until the shot breaks at 100 percent, then falls away fast."
      caption="Force on the trigger, as a share of its weight, over time. Take 80 to 90% quickly, hold the plateau, add a slight steady rise until the shot breaks, then release fast without a jerk."
    >
      <rect x={x0} y={Y(90)} width={x1 - x0} height={Y(80) - Y(90)} fill={BLUE} opacity={0.14} />
      <line x1={x0} y1={bottom} x2={x1} y2={bottom} stroke={LINE} strokeWidth={1} />
      <line x1={x0} y1={top} x2={x0} y2={bottom} stroke={LINE} strokeWidth={1} />
      <line x1={X(3.6)} y1={top - 4} x2={X(3.6)} y2={bottom} stroke={LINE} strokeWidth={1} strokeDasharray="4 3" />
      <text x={X(3.6)} y={14} textAnchor="middle" style={{ ...text(10.5), fill: INK }}>shot breaks</text>
      <polyline points={pts} fill="none" stroke={BLUE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <text x={X(0.3) + 8} y={Y(40)} style={{ ...text(10.5), fill: INK, ...haloed }}>1 quick to the plateau</text>
      <text x={X(0.9)} y={Y(80) + 15} style={{ ...text(10.5), fill: INK, ...haloed }}>2 plateau (80–90%), slight rise</text>
      <text x={X(3.7) - 9} y={Y(30)} textAnchor="end" style={{ ...text(10.5), fill: INK, ...haloed }}>3 release</text>
      <text x={x0 - 4} y={Y(100) + 4} textAnchor="end" style={{ ...text(10.5), fill: MUTED }}>100%</text>
      <text x={x0 - 4} y={Y(0) + 4} textAnchor="end" style={{ ...text(10.5), fill: MUTED }}>0</text>
      <text x={x1} y={142} textAnchor="end" style={{ ...text(10.5), fill: MUTED }}>time →</text>
    </Figure>
  )
}

// --- Range approach -------------------------------------------------------------

function RangeApproach() {
  const x0 = 40, x1 = 290, top = 16, bottom = 124
  // Distance to the mat runs 400 m on the left to 0 on the right.
  const X = (m: number) => x0 + ((400 - m) / 400) * (x1 - x0)
  const Y = (level: number) => bottom - level * (bottom - top) // 0 low, 1 high
  // Pace eases over the last 300 m. Breathing and heart rate start higher, lag the pace, and settle by the mat.
  const pace = (m: number) => (m > 300 ? 0.62 : 0.62 - 0.2 * ((300 - m) / 300))
  const breath = (m: number) => (m > 300 ? 0.92 : m > 80 ? 0.92 - 0.3 * ((300 - m) / 220) : 0.62 - 0.18 * ((80 - m) / 80))
  const line = (f: (m: number) => number) =>
    Array.from({ length: 81 }, (_, i) => {
      const m = 400 - (i / 80) * 400
      return `${X(m).toFixed(1)},${Y(f(m)).toFixed(1)}`
    }).join(' ')
  return (
    <Figure
      viewBox="0 0 300 150"
      label="Skiing pace and breathing effort over the last 400 metres to the range. The pace eases over the last 300 to 200 metres, and breathing and heart rate settle so the athlete arrives with breathing under control."
      caption="The last 400 metres to the mat. Ease the pace over the final 200 to 300 metres so breathing and heart rate settle, and you arrive under control rather than still recovering."
    >
      <rect x={X(300)} y={top} width={X(200) - X(300)} height={bottom - top} fill={BLUE} opacity={0.12} />
      <text x={(X(300) + X(200)) / 2} y={bottom - 8} textAnchor="middle" style={{ ...text(10.5), fill: INK }}>ease off</text>
      <line x1={x0} y1={bottom} x2={x1} y2={bottom} stroke={LINE} strokeWidth={1} />
      <line x1={x0} y1={top} x2={x0} y2={bottom} stroke={LINE} strokeWidth={1} />
      <polyline points={line(breath)} fill="none" stroke={INK} strokeWidth={2} strokeDasharray="6 3" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={line(pace)} fill="none" stroke={BLUE} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <text x={x0 + 6} y={Y(0.92) - 7} style={{ ...text(11), fill: INK, fontWeight: 600 }}>Breathing and heart rate</text>
      <text x={x0 + 6} y={Y(0.62) + 16} style={{ ...text(11), fill: BLUE, fontWeight: 600 }}>Skiing pace</text>
      <text x={x1} y={Y(0.44) + 30} textAnchor="end" style={{ ...text(10.5), fill: INK, ...haloed }}>arrive in control</text>
      <text x={x0 - 6} y={(top + bottom) / 2} transform={`rotate(-90 ${x0 - 6} ${(top + bottom) / 2})`} textAnchor="middle" style={{ ...text(10.5), fill: MUTED }}>effort</text>
      <text x={x0} y={142} style={{ ...text(10.5), fill: MUTED }}>400 m</text>
      <text x={X(300)} y={142} textAnchor="middle" style={{ ...text(10.5), fill: MUTED }}>300</text>
      <text x={X(200)} y={142} textAnchor="middle" style={{ ...text(10.5), fill: MUTED }}>200</text>
      <text x={x1} y={142} textAnchor="end" style={{ ...text(10.5), fill: MUTED }}>mat</text>
    </Figure>
  )
}

export const DIAGRAMS: Record<DiagramId, () => React.JSX.Element> = {
  'breath-cycle': BreathCycle,
  'aiming-approaches': AimingApproaches,
  'trigger-curve': TriggerCurve,
  'range-approach': RangeApproach,
}

export function Diagram({ id }: { id: DiagramId }) {
  const D = DIAGRAMS[id]
  return <D />
}

// --- The year ---------------------------------------------------------------------

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/** Phases in calendar order across the year, with the months each covers (1-based). */
const YEAR: { phase: SeasonPhase; from: number; to: number; label: string }[] = [
  { phase: 'competition', from: 1, to: 3, label: 'Competition' },
  { phase: 'transition', from: 4, to: 5, label: 'Transition' },
  { phase: 'general', from: 6, to: 8, label: 'General prep' },
  { phase: 'specific', from: 9, to: 10, label: 'Specific prep' },
  { phase: 'early', from: 11, to: 12, label: 'Early season' },
]

/**
 * The biathlon year as a ribbon of five phases, with this month marked. Picking
 * a phase filters the library to it.
 */
export function SeasonRibbon({
  month, selected, onSelect,
}: {
  /** 1-12. */
  month: number
  selected: SeasonPhase | 'all'
  onSelect: (p: SeasonPhase) => void
}) {
  const x0 = 6, w = 288
  const cell = w / 12
  const X = (m: number) => x0 + (m - 1) * cell // left edge of month m
  const barY = 28, barH = 20
  return (
    <figure style={{ margin: '12px 0 4px' }}>
      <svg
        viewBox="0 0 300 100" role="group"
        aria-label={`The biathlon year in five phases. This month is ${MONTH_NAMES[month - 1]}. Choose a phase to show its advice.`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
      >
        {MONTHS.map((m, i) => (
          <text key={i} x={X(i + 1) + cell / 2} y={12} textAnchor="middle" style={{ ...text(10.5), fill: i + 1 === month ? INK : MUTED, fontWeight: i + 1 === month ? 700 : 400 }}>{m}</text>
        ))}
        {YEAR.map((y, idx) => {
          const active = selected === y.phase
          const left = X(y.from), width = (y.to - y.from + 1) * cell
          const cx = left + width / 2
          // Labels alternate between two rows so neighbours never collide.
          const lower = idx % 2 === 1
          const ly = barY + barH + (lower ? 34 : 17)
          const anchor = idx === YEAR.length - 1 ? 'end' : 'middle'
          const lx = idx === YEAR.length - 1 ? 296 : cx
          return (
            <g
              key={y.phase} role="button" tabIndex={0} aria-pressed={active}
              aria-label={`${SEASON_PHASE_LABEL[y.phase]}, months ${y.from} to ${y.to}`}
              onClick={() => onSelect(y.phase)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(y.phase) } }}
              style={{ cursor: 'pointer', outline: 'none' }}
            >
              <rect x={left + 1} y={barY} width={width - 2} height={barH} rx={5} fill={BLUE} fillOpacity={active ? 0.95 : 0.22} stroke={BLUE} strokeOpacity={active ? 0 : 0.55} strokeWidth={1} />
              {lower && <line x1={cx} y1={barY + barH + 2} x2={cx} y2={ly - 12} stroke={LINE} strokeWidth={1} />}
              <text x={lx} y={ly} textAnchor={anchor} style={{ ...text(10.5), fill: active ? INK : SOFT, fontWeight: active ? 700 : 400 }}>
                {y.label}
              </text>
            </g>
          )
        })}
        {/* this month */}
        <path d={`M ${X(month) + cell / 2} ${barY - 2} l -4.5 -7 h 9 z`} fill={INK} />
      </svg>
      <figcaption className="meta" style={{ marginTop: 2 }}>
        The marker is this month. Tap a phase to see its advice.
      </figcaption>
    </figure>
  )
}
