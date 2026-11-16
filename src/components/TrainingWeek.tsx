import { useMemo, useState } from 'react'
import { adviceFor } from '../lib/advice'
import type { GoalData } from '../lib/goalProgress'
import type { Recommendation } from '../lib/training'
import type { Settings, ShootingDirection } from '../lib/types'
import {
  formatMinutes, loadBudget, saveBudget, suggestWeek,
  type Activity, type Place, type TrainingBudget,
} from '../lib/weeklyPlan'
import { DryfireIcon, RangeIcon } from './icons'
import { DrillFeedback, useAdviceFeedback } from './AdviceFeedback'
import type { DrillVerdict, FeedbackEvent } from '../lib/feedbackRules'

const OPTIONS = [0, 30, 60, 120, 180]
const optionText = (min: number) => (min === 0 ? 'None' : formatMinutes(min))

/** How many drills to rank for the week: more than Analysis lists, so there are
 *  live drills to fill range time with. */
export const WEEK_PLAN_LIMIT = 12

/**
 * The body of the "Training week" section in Analysis: the athlete says how much time
 * they have a week, at home and at a range, and gets activities that fit it, chosen
 * from what their own shooting shows (`plan`, best first). It suggests, it never
 * schedules: no days, so the athlete fits them in where they can.
 */
export function YourWeek({ plan, events = [], onDrillAnswer }: {
  plan: Recommendation[]
  /** The athlete's answers, to ask "did it help?" on each activity. */
  events?: FeedbackEvent[]
  onDrillAnswer?: (drillId: string) => ((v: DrillVerdict) => Promise<void>) | undefined
}) {
  const [budget, setBudget] = useState<TrainingBudget | null>(loadBudget)
  const week = useMemo(() => (budget ? suggestWeek(plan, budget) : null), [plan, budget])

  const change = (place: Place, minutes: number) => {
    const next: TrainingBudget = {
      homeMinutes: place === 'home' ? minutes : budget?.homeMinutes ?? 0,
      rangeMinutes: place === 'range' ? minutes : budget?.rangeMinutes ?? 0,
    }
    setBudget(next)
    saveBudget(next)
  }

  return (
    <div id="your-week" className="training-week">
      <p className="meta" style={{ marginTop: 0 }}>
        How much shooting practice can you fit in a week? Pick a time for each, and the activities below fit inside it.
      </p>
      <BudgetRow place="home" label="At home (dry-fire)" value={budget?.homeMinutes} onChange={(m) => change('home', m)} />
      <BudgetRow place="range" label="At a range" value={budget?.rangeMinutes} onChange={(m) => change('range', m)} />

      {week && (week.home.length > 0 || week.range.length > 0) ? (
        <>
          {week.foundations && (
            <div className="notice" style={{ marginTop: 14 }}>
              These are the foundations every shooter builds on. Once you have logged a few bouts, they become
              suggestions from your own shooting.
            </div>
          )}
          <ActivityList place="home" activities={week.home} spare={week.spare.homeMinutes} foundations={week.foundations} events={events} onDrillAnswer={onDrillAnswer} />
          <ActivityList place="range" activities={week.range} spare={week.spare.rangeMinutes} foundations={week.foundations} events={events} onDrillAnswer={onDrillAnswer} />
          <p className="meta" style={{ marginTop: 12, marginBottom: 0 }}>
            Do them on whichever days suit you. Keep to one clear focus a session, and close each one with a couple of calm dry-fire clips.
          </p>
        </>
      ) : budget && (budget.homeMinutes > 0 || budget.rangeMinutes > 0) ? (
        <p className="meta" style={{ marginTop: 14, marginBottom: 0 }}>Nothing suggested fits that much time yet. Try a little more.</p>
      ) : null}
    </div>
  )
}

/**
 * One quiet line at the top of the 545 Coach tab: this week's activities in brief,
 * tapping through to the "Training week" section in Analysis, where they are set up and explained.
 */
export function TrainingWeekLine({ data, settings, direction, onOpen }: {
  data: GoalData
  settings: Settings
  direction?: ShootingDirection
  onOpen: () => void
}) {
  const [budget] = useState<TrainingBudget | null>(loadBudget)
  const { events } = useAdviceFeedback({ enabled: budget !== null })
  const week = useMemo(() => {
    if (!budget) return null
    const plan = adviceFor({ ...data, settings, direction, limit: WEEK_PLAN_LIMIT, events }).plan
    return suggestWeek(plan, budget)
  }, [budget, data, settings, direction, events])

  const items = week ? [...week.home, ...week.range] : []
  return (
    <p className="training-week-line">
      {items.length > 0 ? (
        <>
          <strong>This week: </strong>
          {formatMinutes(items.reduce((n, a) => n + a.sessions * a.drill.minutes, 0))} across {items.length} drill{items.length === 1 ? '' : 's'},
          starting with {items[0].drill.name.charAt(0).toLowerCase() + items[0].drill.name.slice(1)}{' · '}
        </>
      ) : (
        <>Tell 545 how much time you have, and get a week of drills to fit it. </>
      )}
      <button className="link" onClick={onOpen}>{items.length > 0 ? 'See your training week' : 'Set up your training week'}</button>
    </p>
  )
}

function BudgetRow({ place, label, value, onChange }: {
  place: Place
  label: string
  value: number | undefined
  onChange: (minutes: number) => void
}) {
  return (
    <div className="training-week__budget">
      <div className="training-week__label">
        {place === 'home' ? <DryfireIcon size={16} /> : <RangeIcon size={16} />} {label}
      </div>
      <div className={`seg training-week__chips ${place}`} role="group" aria-label={`${label}, per week`}>
        {OPTIONS.map((m) => (
          <button key={m} type="button" aria-pressed={value === m} onClick={() => onChange(m)}>{optionText(m)}</button>
        ))}
      </div>
    </div>
  )
}

function ActivityList({ place, activities, spare, foundations, events, onDrillAnswer }: {
  place: Place
  activities: Activity[]
  spare: number
  foundations: boolean
  events: FeedbackEvent[]
  onDrillAnswer?: (drillId: string) => ((v: DrillVerdict) => Promise<void>) | undefined
}) {
  if (activities.length === 0) return null
  return (
    <>
      <h3 className="training-week__place">{place === 'home' ? 'At home' : 'At a range'}</h3>
      {activities.map((a) => (
        <div key={a.drill.id} className={`training-week__activity ${place}`}>
          <div className="training-week__row">
            <strong>{a.drill.name}</strong>
            <span className="training-week__dose">{a.sessions} × {formatMinutes(a.drill.minutes)}</span>
          </div>
          <p className="meta" style={{ margin: '2px 0 0' }}>{a.drill.purpose}</p>
          <p className="meta" style={{ margin: '2px 0 0' }}>{foundations ? `${a.reason[0].toUpperCase()}${a.reason.slice(1)}.` : `Because of: ${a.reason}.`}</p>
          <details>
            <summary>How to do it</summary>
            <ol className="steps">{a.drill.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
          </details>
          {onDrillAnswer && <DrillFeedback drillId={a.drill.id} events={events} onAnswer={onDrillAnswer(a.drill.id)} />}
        </div>
      ))}
      {spare >= 15 && (
        <p className="meta" style={{ margin: '6px 0 0' }}>
          {formatMinutes(spare)} {place === 'home' ? 'at home' : 'at the range'} spare: use it for more of any activity here, or keep it as rest.
        </p>
      )}
    </>
  )
}
