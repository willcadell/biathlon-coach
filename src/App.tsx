import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Bout, MetalBout, Settings, Wind, WindDirection, Workout, WorkoutEntry } from './lib/types'
import { scoringContext } from './lib/types'
import { allBouts, allMetalBouts, allWorkouts, putWorkout } from './lib/db'
import { computeMetrics } from './lib/geometry'
import { uuid } from './lib/id'
import { loadSettings, saveSettings } from './lib/settings'
import { onAuthChange, getAthlete } from './lib/auth'
import { getCoach } from './lib/coaching'
import { SignInView } from './components/SignInView'
import { ChooseRoleView } from './components/ChooseRoleView'
import { WorkoutView } from './components/WorkoutView'
import { HistoryView } from './components/HistoryView'
import { AnalysisView } from './components/AnalysisView'
import { ProfileView } from './components/ProfileView'
import { CoachView } from './components/CoachView'
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

type Tab = 'shoot' | 'history' | 'analysis' | 'profile' | 'coach' | 'settings'
type Role = 'athlete' | 'coach'

const MODE_KEY_PREFIX = 'biathlon-coach:mode:'

/** Which identity to act as this session, for someone with both — kept in
 *  sessionStorage, not localStorage: "for a particular session" means it
 *  should NOT survive closing the tab, unlike the rest of this app's
 *  persisted state. */
function loadMode(userId: string): Role | null {
  try {
    const v = sessionStorage.getItem(MODE_KEY_PREFIX + userId)
    return v === 'athlete' || v === 'coach' ? v : null
  } catch {
    return null
  }
}

function saveMode(userId: string, mode: Role | null): void {
  try {
    if (mode) sessionStorage.setItem(MODE_KEY_PREFIX + userId, mode)
    else sessionStorage.removeItem(MODE_KEY_PREFIX + userId)
  } catch {
    // Asking again next reload is not worth crashing over.
  }
}

const TABS: { id: Tab; label: string; icon: JSX.Element; requiresMode?: Role }[] = [
  {
    id: 'shoot',
    label: 'Shoot',
    requiresMode: 'athlete',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="0.6" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: 'history',
    label: 'History',
    requiresMode: 'athlete',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <path d="M4 18V9M9.5 18V5M15 18v-6M20.5 18v-9" />
      </svg>
    ),
  },
  {
    id: 'analysis',
    label: 'Analysis',
    requiresMode: 'athlete',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 13.5 9 18l11-12" />
      </svg>
    ),
  },
  {
    id: 'profile',
    label: 'Profile',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <circle cx="12" cy="8.5" r="3.3" />
        <path d="M5 20c1.2-4 4-6 7-6s5.8 2 7 6" />
      </svg>
    ),
  },
  {
    id: 'coach',
    label: 'Coach',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="8.5" r="2.6" />
        <path d="M3.5 19c0.8-3.3 3-5 5.5-5s4.7 1.7 5.5 5" />
        <path d="M15.5 6.5a2.6 2.6 0 1 1 0 5.2" />
        <path d="M15.6 14c2.2 0.4 3.7 2 4.4 5" />
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
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => onAuthChange(setSession), [])

  if (session === undefined) return null
  if (session === null) return <SignInView />
  return <IdentityGate session={session} />
}

/**
 * Athlete and coach are independent identities (see auth.ts), so signing in
 * doesn't imply either one — the first time neither exists yet, the choice
 * is asked outright rather than defaulting everyone into an athlete row
 * whether they wanted one or not. Someone with both gets a second kind of
 * choice: which one to act as for this session, remembered only for as
 * long as this browser tab stays open.
 */
function IdentityGate({ session }: { session: Session }) {
  const [identities, setIdentities] = useState<{ athlete: boolean; coach: boolean } | undefined>(undefined)
  const [mode, setMode] = useState<Role | null>(null)

  const refreshIdentities = useCallback(() => {
    void Promise.all([getAthlete(session.user.id), getCoach(session.user.id)]).then(([athlete, coach]) => {
      const next = { athlete: athlete !== null, coach: coach !== null }
      setIdentities(next)
      setMode(next.athlete && next.coach ? loadMode(session.user.id) : null)
    })
  }, [session.user.id])
  useEffect(refreshIdentities, [refreshIdentities])

  if (identities === undefined) return null

  if (!identities.athlete && !identities.coach) {
    return (
      <ChooseRoleView
        session={session}
        variant="create"
        onChosen={(role) => { saveMode(session.user.id, role); refreshIdentities() }}
      />
    )
  }

  if (identities.athlete && identities.coach && mode === null) {
    return (
      <ChooseRoleView
        session={session}
        variant="select"
        onChosen={(role) => { saveMode(session.user.id, role); setMode(role) }}
      />
    )
  }

  const activeMode: Role = mode ?? (identities.athlete ? 'athlete' : 'coach')
  return (
    <SignedInApp
      session={session}
      identities={identities}
      mode={activeMode}
      onIdentityChanged={refreshIdentities}
      onSwitchRole={
        identities.athlete && identities.coach
          ? () => { saveMode(session.user.id, null); setMode(null) }
          : undefined
      }
    />
  )
}

function SignedInApp({
  session, identities, mode, onIdentityChanged, onSwitchRole,
}: {
  session: Session
  identities: { athlete: boolean; coach: boolean }
  mode: Role
  onIdentityChanged: () => void
  onSwitchRole?: () => void
}) {
  const [tab, setTab] = useState<Tab>(mode === 'athlete' ? 'shoot' : 'coach')
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
        {tab === 'analysis' && <AnalysisView bouts={bouts} metalBouts={metalBouts} settings={settings} workouts={workouts} />}
        {tab === 'profile' && <ProfileView session={session} hasAthlete={identities.athlete} onIdentityChanged={onIdentityChanged} />}
        {tab === 'coach' && <CoachView session={session} onIdentityChanged={onIdentityChanged} />}
        {tab === 'settings' && (
          <SettingsView
            settings={settings}
            onChange={updateSettings}
            boutCount={bouts.length}
            onDataChanged={refresh}
            mode={mode}
            onSwitchRole={onSwitchRole}
          />
        )}
      </main>

      <nav className="tabs">
        {TABS.filter((t) => !t.requiresMode || t.requiresMode === mode).map((t) => (
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
          545 Coaching
        </div>
      </nav>
    </div>
  )
}
