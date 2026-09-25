import { amDev, devModeOn, setDevMode } from './lib/dev'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Bout, MetalBout, Settings, Workout, WorkoutEntry } from './lib/types'
import { scoringContext } from './lib/types'
import { allBouts, allMetalBouts, allWorkouts, deleteWorkout, putWorkout } from './lib/db'
import { computeMetrics } from './lib/geometry'
import { uuid } from './lib/id'
import { loadSettings, saveSettings } from './lib/settings'
import { onAuthChange, getAthlete, ensureAthleteRow, consumeRoleIntent, displayNameFromSession } from './lib/auth'
import { getCoach, becomeCoach } from './lib/coaching'
import { SignInView } from './components/SignInView'
import { ChooseRoleView } from './components/ChooseRoleView'
import { WorkoutView } from './components/WorkoutView'
import { AnalysisView } from './components/AnalysisView'
import { ProfileView } from './components/ProfileView'
import { CoachView, ClubSettingsView } from './components/CoachView'
import { SettingsView } from './components/SettingsView'
import { PrivacyPolicyView } from './components/PrivacyPolicyView'
import { TermsView } from './components/TermsView'
import { FeaturesView } from './components/FeaturesView'
import { NotFoundView } from './components/NotFoundView'
import { ErrorBoundary } from './components/ErrorBoundary'

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

type Tab = 'shoot' | 'analysis' | 'profile' | 'coach' | 'club' | 'settings'
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
    id: 'shoot',
    label: '545 Coach',
    requiresMode: 'athlete',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="0.6" fill="currentColor" />
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
    id: 'coach',
    label: '545 Coach',
    requiresMode: 'coach',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="0.6" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: 'club',
    label: 'Club',
    requiresMode: 'coach',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="8.5" r="2.6" />
        <path d="M3.5 19c0.8-3.3 3-5 5.5-5s4.7 1.7 5.5 5" />
        <path d="M15.5 6.5a2.6 2.6 0 1 1 0 5.2" />
        <path d="M15.6 14c2.2 0.4 3.7 2 4.4 5" />
      </svg>
    ),
  },
]

/** Privacy, Terms and Features need to be reachable without signing in — a coach
 *  linking a minor's parent to them, or an app-store reviewer, shouldn't
 *  need a Google account first. Checked ahead of the auth gate below, and
 *  anything else unrecognized falls through to the 404 page rather than a
 *  blank screen or Netlify's own default. */
export default function App() {
  const path = window.location.pathname
  if (path === '/privacy') return <PrivacyPolicyView />
  if (path === '/terms') return <TermsView />
  if (path === '/features') return <FeaturesView />
  if (path !== '/') return <NotFoundView />

  return <AuthenticatedApp />
}

function AuthenticatedApp() {
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
  const [isDev, setIsDev] = useState(false)
  useEffect(() => {
    void amDev().then(setIsDev).catch(() => setIsDev(false))
  }, [session.user.id])

  const refreshIdentities = useCallback(() => {
    void Promise.all([getAthlete(session.user.id), getCoach(session.user.id)]).then(async ([athlete, coach]) => {
      let next = { athlete: athlete !== null, coach: coach !== null }

      // Set on the sign-in screen's "sign in as a coach/athlete" buttons —
      // acted on once, right after a fresh Google redirect, so it replaces
      // the "how are you using this" question instead of asking it again.
      const intent = consumeRoleIntent()
      if (intent && !next[intent]) {
        if (intent === 'athlete') await ensureAthleteRow(session)
        else await becomeCoach(displayNameFromSession(session))
        next = { ...next, [intent]: true }
      }

      setIdentities(next)
      if (intent) {
        saveMode(session.user.id, intent)
        setMode(intent)
      } else {
        setMode(next.athlete && next.coach ? loadMode(session.user.id) : null)
      }
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
      isDev={isDev}
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
  session, identities, mode, isDev, onIdentityChanged, onSwitchRole,
}: {
  session: Session
  identities: { athlete: boolean; coach: boolean }
  mode: Role
  /** Granted in Supabase; unlocks the dev mode switch in Profile. */
  isDev: boolean
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
    // Logged rather than silently dropped — a rejection here used to vanish
    // entirely, leaving stale state with no clue why (e.g. a table a new
    // build queries before its migration has actually been pushed).
    void allWorkouts().then(setWorkouts).catch((e) => console.error('Could not load workouts', e))
    void allBouts().then(setStored).catch((e) => console.error('Could not load bouts', e))
    void allMetalBouts().then(setMetalBouts).catch((e) => console.error('Could not load metal bouts', e))
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

  async function startWorkout(kind: 'range' | 'dryfire' | 'race') {
    const workout: Workout = {
      id: uuid(),
      startedAt: new Date().toISOString(),
      name: '',
      workoutType: kind === 'dryfire' ? 'dryfire' : 'range',
      wind: 'none',
      windDirection: '12',
      clickLog: [],
      notes: '',
      coachNotes: [],
      raceType: kind === 'race' ? 'sprint' : null,
      dryfireMinutes: 0,
    }
    await putWorkout(workout)
    setActiveWorkout(workout.id)
    refresh()
  }

  async function cancelWorkout() {
    if (!activeWorkout) return
    await deleteWorkout(activeWorkout.id)
    setActiveWorkout(null)
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

  // Only offered to (and honoured for) accounts granted dev in Supabase.
  const devMode = isDev && devModeOn()

  return (
    <div className="app">
      {devMode && (
        <div className="dev-banner" role="status">
          <span><strong>Dev mode</strong> — everything you do here is test data, hidden from the club.</span>
          <button className="link" onClick={() => setDevMode(false)}>Leave</button>
        </div>
      )}
      <main className="main">
        <ErrorBoundary key={tab}>
          {tab === 'shoot' && (
            <WorkoutView
              settings={settings}
              workout={activeWorkout}
              entries={activeEntries}
              onStart={startWorkout}
              onFinish={() => setActiveWorkout(null)}
              onCancel={() => void cancelWorkout()}
              onWorkoutChanged={updateWorkout}
              onDataChanged={refresh}
            />
          )}
          {tab === 'analysis' && (
            <AnalysisView bouts={bouts} metalBouts={metalBouts} settings={settings} workouts={workouts} onChanged={refresh} />
          )}
          {tab === 'profile' && (
            <ProfileView
              session={session}
              hasAthlete={identities.athlete}
              hasCoach={identities.coach}
              onIdentityChanged={onIdentityChanged}
              mode={mode}
              onSwitchRole={onSwitchRole}
              isDev={isDev}
              devMode={devMode}
              onOpenSettings={mode === 'athlete' ? () => setTab('settings') : undefined}
            />
          )}
          {tab === 'coach' && <CoachView session={session} onIdentityChanged={onIdentityChanged} />}
          {tab === 'club' && <ClubSettingsView session={session} />}
          {tab === 'settings' && (
            <SettingsView
              settings={settings}
              onChange={updateSettings}
              boutCount={bouts.length}
              onDataChanged={refresh}
              onBack={() => setTab('profile')}
            />
          )}
        </ErrorBoundary>
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
      </nav>
    </div>
  )
}
