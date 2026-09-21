import type { Bout, Settings, Workout } from '../lib/types'
import { faceById, HIT_ZONE_MM, scoringContext } from '../lib/types'
import { MEASUREMENT_TOLERANCE_MM } from '../lib/scoring'
import { analyseSingleBout } from '../lib/diagnostics'
import { TargetPlot } from './TargetPlot'

const mm = (v: number) => `${v.toFixed(0)}`

/** The bout, scored and explained. Shown after saving and again from history.
 *  `workout` is optional so this still renders for a bout viewed without its
 *  workout loaded; passing it in lets the sight-correction caveat use the
 *  wind actually logged for this bout instead of a generic hedge.
 *  `imageUrl` is the original photo, when the caller has one to show — a
 *  fresh capture already has it in memory, while History fetches it from
 *  storage. Omitted (or null once the photos have been deleted) shows just
 *  the diagram. */
export function ResultsView({
  bout,
  settings,
  workout,
  imageUrl,
}: {
  bout: Bout
  settings: Settings
  workout?: Workout
  imageUrl?: string | null
}) {
  const m = bout.metrics
  const ctx = scoringContext(bout, settings)
  const face = faceById(ctx.faceId)
  const hitRadius = HIT_ZONE_MM[bout.position] / 2
  const c = m.correction
  const zeroCost = m.ringTotalIfZeroed - m.ringTotal
  const shapeReads = analyseSingleBout(bout, settings)
  // null = wind unknown (no workout loaded), rather than "not windy".
  const windy = workout ? workout.wind === 'moderate' || workout.wind === 'strong' : null
  const zeroConfirmedByShape = shapeReads.some((f) => f.id === 'zero_offset')
  const horizontalExplainedByShape = shapeReads.some((f) => f.id === 'horizontal_stringing')

  return (
    <>
      <div className="card">
        <TargetPlot
          shots={bout.shots}
          position={bout.position}
          metrics={m}
          face={face}
          bulletDiameterMm={ctx.bulletDiameterMm}
        />
        <div className="legend" style={{ justifyContent: 'center' }}>
          <span><i className="swatch" style={{ background: 'var(--series-1)' }} /> shot, numbered in firing order, at true hole size</span>
          <span><i className="swatch" style={{ background: 'var(--series-2)' }} /> group centre and spread</span>
          {m.borderlineShots > 0 && (
            <span><i className="swatch" style={{ background: 'var(--warning)' }} /> too close to call</span>
          )}
        </div>
      </div>

      {imageUrl && (
        <div className="card">
          <details>
            <summary>Original target</summary>
            <img
              src={imageUrl} alt="Target, as photographed"
              style={{ width: '100%', borderRadius: 8, display: 'block', marginTop: 10 }}
            />
          </details>
        </div>
      )}

      <div className="card">
        <div className="hero">
          {m.ringTotal}<small> / {m.ringPossible}</small>
        </div>
        <p style={{ marginTop: 6, marginBottom: 0 }}>
          {bout.position === 'prone' ? 'Prone' : 'Standing'} on the {face.name} face
          {m.innerTens > 0 && `, ${m.innerTens} inner ten${m.innerTens === 1 ? '' : 's'}`}.
          {' '}
          {m.hits} of {bout.shots.length} would have hit the {HIT_ZONE_MM[bout.position]} mm metal.
          {m.splitterShots > 0 && (
            <details className="help">
              <summary>?</summary>
              <p>
                {m.splitterShots} shot{m.splitterShots === 1 ? '' : 's'} in this bout landed right on
                the edge of that circle — within a bullet&rsquo;s width of the true boundary, marked
                as a splitter below. On a real steel target, contact that close to the edge is a coin
                flip on whether the disc actually falls, so don&rsquo;t read {m.splitterShots === 1 ? 'it' : 'them'} as
                a clean hit or a clean miss.
              </p>
            </details>
          )}
        </p>
      </div>

      <div className="stats three">
        <div className="stat">
          <div className="k">Mean radius</div>
          <div className="v">{mm(m.meanRadius)}<small>mm</small></div>
          <div className="n">{Math.round((m.meanRadius / hitRadius) * 100)}% of the metal</div>
        </div>
        <div className="stat">
          <div className="k">Spread</div>
          <div className="v">{mm(m.extremeSpread)}<small>mm</small></div>
          <div className="n">widest pair</div>
        </div>
        <div className="stat">
          <div className="k">Off centre</div>
          <div className="v">{mm(m.mpiOffset)}<small>mm</small></div>
          <div className="n">group centre</div>
        </div>
      </div>

      <h2>What this one group shows</h2>
      <p className="meta" style={{ marginTop: -6 }}>
        Read from this bout alone — a hint to watch for, not a verdict. It gets more confident the
        more bouts like it you log, in Training.
      </p>

      {zeroCost > 0 && zeroConfirmedByShape ? null : zeroCost > 0 ? (
        <div className="card">
          <h3>Your zero is costing {zeroCost} point{zeroCost === 1 ? '' : 's'}</h3>
          <p style={{ marginBottom: 0 }}>
            The same group centred on the ten would have scored {m.ringTotalIfZeroed}.
            {(c.vertical > 0 || c.horizontal > 0) && (
              <>
                {' '}Move the sight{' '}
                {c.vertical > 0 && <strong>{c.vertical} click{c.vertical === 1 ? '' : 's'} {c.verticalDir}</strong>}
                {c.vertical > 0 && c.horizontal > 0 && ' and '}
                {c.horizontal > 0 && <strong>{c.horizontal} click{c.horizontal === 1 ? '' : 's'} {c.horizontalDir}</strong>}
                . Calibrate your click value in Settings if these never land right.
              </>
            )}
          </p>
          {c.horizontal > 0 && (
            <p className="meta" style={{ marginTop: 8, marginBottom: 0 }}>
              {zeroConfirmedByShape ? (
                <>This group is tight enough on its own that the sideways number reads as a real
                zero error too, not wind — the correction above should hold.</>
              ) : windy === true ? (
                <>This bout was shot in {workout!.wind} wind, from {workout!.windDirection}{' '}
                o&rsquo;clock — enough on its own to push a whole group sideways. Trust this
                horizontal number only once it repeats on a calm bout too.</>
              ) : horizontalExplainedByShape ? (
                <>This group&rsquo;s own shape points at something other than the sight for the
                sideways part — see what it shows below, before dialling in clicks for it.</>
              ) : windy === false ? (
                <>This one was shot calm, so wind is not a live suspect here — a repeatable sideways
                miss like this points at the sight.</>
              ) : (
                <>A sideways miss can just as easily be wind, so trust this number only once it
                repeats across bouts shot in different conditions.</>
              )}
            </p>
          )}
        </div>
      ) : (
        <div className="card">
          <h3>Zero looks good</h3>
          <p style={{ marginBottom: 0 }}>
            This group already centres close enough to the ten that moving the sight wouldn&rsquo;t
            have gained anything this bout — nothing to correct from this one.
          </p>
        </div>
      )}

      {shapeReads.map((f, i) => (
        <div key={`${f.id}-${i}`} className={`finding ${f.severity}`}>
          <h3>{f.title}</h3>
          <p style={{ marginBottom: 0 }}>{f.cause}</p>
        </div>
      ))}

      <h2>
        Shot by shot
        <details className="help">
          <summary>?</summary>
          <p>
            Rings use the inward-gauge rule: a hole that touches or breaks a ring line takes that
            ring&rsquo;s value. Hole edge is the distance from the centre of the target to the nearest
            edge of the hole, which is the number the rule actually turns on.
          </p>
        </details>
      </h2>
      <div className="card tight">
        <table className="data">
          <thead>
            <tr>
              <th>Shot</th><th>Ring</th><th>Right</th><th>Up</th><th>Hole edge</th>
            </tr>
          </thead>
          <tbody>
            {bout.shots.map((s, i) => {
              const r = m.rings[i]
              return (
                <tr key={i} style={m.flierIndex === i ? { color: 'var(--critical)' } : undefined}>
                  <td>
                    {s.order}
                    {m.flierIndex === i && ' · flier'}
                    {m.splitters[i] && <span style={{ color: 'var(--warning)' }}> · splitter</span>}
                  </td>
                  <td>
                    <strong>{r?.value ?? '—'}</strong>
                    {r?.innerTen && <span className="meta"> ×</span>}
                    {r?.borderline && <span style={{ color: 'var(--warning)' }} title="Too close to the line to be sure"> ?</span>}
                  </td>
                  <td>{s.mm.x >= 0 ? '+' : '−'}{mm(Math.abs(s.mm.x))}</td>
                  <td>{s.mm.y >= 0 ? '+' : '−'}{mm(Math.abs(s.mm.y))}</td>
                  <td>{mm(Math.max(0, r?.edgeDistance ?? 0))}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {m.borderlineShots > 0 && (
        <div className="notice">
          {m.borderlineShots} shot{m.borderlineShots === 1 ? ' sits' : 's sit'} within{' '}
          {MEASUREMENT_TOLERANCE_MM} mm of a ring line, which is about what this method can resolve
          from a photograph. Gauge {m.borderlineShots === 1 ? 'it' : 'them'} on the paper if the
          score matters.
        </div>
      )}

      {(bout.context?.notes || bout.context?.skiedIn) && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3>Conditions</h3>
          <p className="meta" style={{ marginBottom: 0 }}>
            {bout.context.skiedIn ? 'Skied in' : 'Cold, off the mat'}
            {bout.context.notes && ` · ${bout.context.notes}`}
          </p>
        </div>
      )}
    </>
  )
}
