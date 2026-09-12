import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Bout, MetalBout, Settings, Wind, WindDirection, Workout, WorkoutEntry } from './lib/types'
import { scoringContext } from './lib/types'
import { allBouts, allMetalBouts, allWorkouts, putWorkout } from './lib/db'
import { computeMetrics } from './lib/geometry'
import { uuid } from './lib/id'
import { loadSettings, saveSettings } from './lib/settings'
import { WorkoutView } from './components/WorkoutView'
import { HistoryView } from './components/HistoryView'
import { TrainingView } from './components/TrainingView'
import { SettingsView } from './components/SettingsView'

const ACTIVE_WORKOUT_KEY = 'biathlon-coach:active-workout'

function loadActiveWorkoutId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_WORKOUT_KEY)
  } catch {
    return null
  }
}

function saveActiveWorkoutId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_WORKOUT_KEY, id)
    else localStorage.removeItem(ACTIVE_WORKOUT_KEY)
  } catch {
    // Losing the active workout on reload is not worth crashing over.
  }
}

type Tab = 'shoot' | 'history' | 'training' | 'settings'

const TABS: { id: Tab; label: string; icon: JSX.Element }[] = [
  {
    id: 'shoot',
    label: 'Shoot',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="0.6" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: 'history',
    label: 'History',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <path d="M4 18V9M9.5 18V5M15 18v-6M20.5 18v-9" />
      </svg>
    ),
  },
  {
    id: 'training',
    label: 'Training',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 13.5 9 18l11-12" />
      </svg>
    ),
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10 1.4 1.4m0-12.8-1.4 1.4m-10 10-1.4 1.4" strokeLinecap="round" />
      </svg>
    ),
  },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('shoot')
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [stored, setStored] = useState<Bout[]>([])
  const [metalBouts, setMetalBouts] = useState<MetalBout[]>([])
  const [activeWorkoutId, setActiveWorkoutId] = useState<string | null>(loadActiveWorkoutId)
  const [settings, setSettings] = useState<Settings>(loadSettings)

  const refresh = useCallback(() => {
    void allWorkouts().then(setWorkouts)
    void allBouts().then(setStored)
    void allMetalBouts().then(setMetalBouts)
  }, [])
  useEffect(refresh, [refresh])

  // Metrics are derived, not trusted from disk. Shot positions are the only
  // real measurement; everything else follows from them and from settings. So
  // calibrating your click value corrects every past bout's advice at once,
  // and a change to how a flier is detected applies to your whole history
  // rather than only to bouts scored after the change.
  const bouts = useMemo(
    () => stored.map((b) => ({ ...b, metrics: computeMetrics(b.shots, b.position, scoringContext(b, settings)) })),
    [stored, settings],
  )

  const updateSettings = (next: Settings) => {
    setSettings(next)
    saveSettings(next)
  }

  const setActiveWorkout = (id: string | null) => {
    setActiveWorkoutId(id)
    saveActiveWorkoutId(id)
  }

  const activeWorkout = workouts.find((w) => w.id === activeWorkoutId) ?? null
  const activeEntries = useMemo<WorkoutEntry[]>(() => {
    if (!activeWorkout) return []
    const mine = [...bouts, ...metalBouts].filter((e) => e.workoutId === activeWorkout.id)
    return mine.sort((a, b) => a.shotAt.localeCompare(b.shotAt))
  }, [activeWorkout, bouts, metalBouts])

  async function startWorkout(wind: Wind, windDirection: WindDirection) {
    const workout: Workout = { id: uuid(), startedAt: new Date().toISOString(), name: '', wind, windDirection, clickLog: [], notes: '' }
    await putWorkout(workout)
    setActiveWorkout(workout.id)
    refresh()
  }

  /**
   * Update local state immediately, before the write even lands, and persist
   * in the background. Awaiting the write first (then re-fetching) left a gap
   * where a second rapid edit — a different field, changed a keystroke later —
   * would build on the pre-write snapshot and silently clobber the first
   * edit once both writes landed. Applying the change to state synchronously
   * means the very next edit already sees it.
   */
  function updateWorkout(next: Workout) {
    setWorkouts((prev) => prev.map((w) => (w.id === next.id ? next : w)))
    void putWorkout(next)
  }

  return (
    <div className="app">
      <main className="main">
        {tab === 'shoot' && (
          <WorkoutView
            settings={settings}
            workout={activeWorkout}
            entries={activeEntries}
            onStart={(wind, windDirection) => void startWorkout(wind, windDirection)}
            onFinish={() => setActiveWorkout(null)}
            onWorkoutChanged={updateWorkout}
            onDataChanged={refresh}
          />
        )}
        {tab === 'history' && <HistoryView workouts={workouts} bouts={bouts} metalBouts={metalBouts} settings={settings} onChanged={refresh} />}
        {tab === 'training' && <TrainingView bouts={bouts} metalBouts={metalBouts} settings={settings} />}
        {tab === 'settings' && (
          <SettingsView
            settings={settings}
            onChange={updateSettings}
            boutCount={bouts.length}
            onDataChanged={refresh}
          />
        )}
      </main>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
        <div className="brand" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" fill="none" stroke="#3987e5" strokeWidth="1.4" />
            <circle cx="12" cy="12" r="5" fill="none" stroke="#3987e5" strokeWidth="1.1" opacity="0.6" />
            <circle cx="9.8" cy="10.4" r="1.3" fill="#d95926" />
            <circle cx="13.4" cy="12.6" r="1.3" fill="#d95926" />
            <circle cx="11" cy="14.3" r="1.3" fill="#d95926" />
          </svg>
          Biathlon Coach
        </div>
      </nav>
    </div>
  )
}
