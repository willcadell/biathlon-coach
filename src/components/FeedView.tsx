import { useEffect, useRef, useState, type ReactNode } from 'react'
import { FEED_PAGE_SIZE, cowbellCounts, deleteFeedPost, currentUserId, feedPosts, myCowbellTotal, setCowbell, useMemberships, type CowbellCount, type FeedPost, type TargetPayload, type WorkoutPayload } from '../lib/feed'
import { RACE_TYPE_LABEL, faceById, type Bout, type RaceType, type Workout } from '../lib/types'
import { errorMessage } from '../lib/errors'
import { buildTargetShareImage, tierFor } from '../lib/share'
import { ClubLogo } from './ClubLogo'
import { TargetPlot } from './TargetPlot'
import { CoachMark, CowbellIcon, DryfireIcon, RaceFlagIcon, RangeIcon, TrashIcon } from './icons'

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/** Which kind of session a workout post is — a race is a range session shot to
 *  a format, so it's told apart by having one. */
function sessionKind(p: WorkoutPayload): 'race' | 'dryfire' | 'range' {
  if (p.raceType) return 'race'
  return p.workoutType === 'dryfire' ? 'dryfire' : 'range'
}

const SESSION_TILE = {
  range: { label: 'Range session', colour: 'var(--series-1)', Icon: RangeIcon },
  dryfire: { label: 'Dry-fire session', colour: 'var(--series-3)', Icon: DryfireIcon },
  race: { label: 'Race', colour: 'var(--series-2)', Icon: RaceFlagIcon },
} as const

/** The icon tile at the left of a workout post: one look per session kind. */
function SessionTile({ p }: { p: WorkoutPayload }) {
  const { label, colour, Icon } = SESSION_TILE[sessionKind(p)]
  return (
    <div
      role="img" aria-label={label} title={label}
      style={{
        flex: 'none', width: 48, height: 48, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `color-mix(in srgb, ${colour} 14%, transparent)`, color: colour,
      }}
    >
      <Icon />
    </div>
  )
}

/** An entry's last line, with the cowbell opposite its end at the right
 *  instead of on a row of its own. Bottom-aligned, so if the line wraps the
 *  bell stays level with the last row of text. */
function LastLine({ children, trailing }: { children: ReactNode; trailing?: ReactNode }) {
  if (!trailing) return <>{children}</>
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
      <div style={{ minWidth: 0 }}>{children}</div>
      <div style={{ flex: 'none' }}>{trailing}</div>
    </div>
  )
}

function TargetSummary({ p, trailing }: { p: TargetPayload; trailing?: ReactNode }) {
  const pct = p.metrics.ringPossible > 0 ? (p.metrics.ringTotal / p.metrics.ringPossible) * 100 : 0
  const tier = tierFor(pct)
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          {p.metrics.ringTotal}<span className="meta">/{p.metrics.ringPossible}</span>
        </span>
        <span className="pill">{p.position}</span>
        <span className="pill" style={{ color: tier.deep }}>{tier.name}</span>
      </div>
      <LastLine trailing={trailing}>
        <div className="meta">
          {p.workoutName ? `${p.workoutName} · ` : ''}{p.shots.length} shot{p.shots.length === 1 ? '' : 's'} · {p.metrics.meanRadius.toFixed(0)} mm mean radius
        </div>
      </LastLine>
    </>
  )
}

/** How often the feed re-checks its cowbell counts while it's on screen. */
const BELL_REFRESH_MS = 10_000

const THUMB_W = 96
const THUMB_H = 120

/** A small copy of the trading card the Share dialog produces, redrawn from
 *  the post's own snapshot; tap for the full card. Only drawn once it scrolls
 *  near view — the card is a full-size canvas, and a long feed shouldn't draw
 *  dozens up front — then shrunk, so a feed of these stays light. Falls back
 *  to a plain mini target if the card can't be drawn. */
function CardThumb({ p }: { p: TargetPayload }) {
  const box = useRef<HTMLButtonElement>(null)
  const [visible, setVisible] = useState(false)
  const [full, setFull] = useState<Blob | null>(null)
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)
  const [fullUrl, setFullUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const el = box.current
    if (!el || typeof IntersectionObserver === 'undefined') { setVisible(true); return }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect() }
    }, { rootMargin: '300px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    let url: string | null = null
    let cancelled = false
    // The card only reads these fields; the rest of a Bout/Workout isn't
    // part of a post, so it isn't invented here.
    const bout = {
      kind: 'precision', shotAt: p.shotAt, position: p.position, targetFaceId: p.targetFaceId,
      bulletDiameterMm: p.bulletDiameterMm, shots: p.shots, metrics: p.metrics,
    } as unknown as Bout
    const workout = { name: p.workoutName, startedAt: p.shotAt } as unknown as Workout
    void (async () => {
      const blob = await buildTargetShareImage(bout, workout)
      const bitmap = await createImageBitmap(blob)
      // 2x for sharp screens; the full card is kept only as a blob until asked for.
      const canvas = document.createElement('canvas')
      canvas.width = THUMB_W * 2
      canvas.height = THUMB_H * 2
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      bitmap.close()
      const thumb = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85))
      if (cancelled || !thumb) return
      url = URL.createObjectURL(thumb)
      setFull(blob)
      setThumbUrl(url)
    })().catch(() => { if (!cancelled) setFailed(true) })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [visible, p])

  // The full-size URL only exists while the card is open.
  function open() {
    if (full) setFullUrl(URL.createObjectURL(full))
  }
  function close() {
    if (fullUrl) URL.revokeObjectURL(fullUrl)
    setFullUrl(null)
  }

  const alt = `${p.position} target, ${p.metrics.ringTotal} out of ${p.metrics.ringPossible}`
  return (
    <>
      <button
        ref={box} type="button" onClick={open} disabled={!thumbUrl} aria-label={`View the full card: ${alt}`}
        style={{
          flex: 'none', width: THUMB_W, height: THUMB_H, padding: 0, border: '1px solid var(--border)',
          borderRadius: 8, overflow: 'hidden', background: 'var(--grid)', cursor: thumbUrl ? 'zoom-in' : 'default',
        }}
      >
        {thumbUrl && <img src={thumbUrl} alt={alt} style={{ width: '100%', height: '100%', display: 'block' }} />}
        {failed && (
          <TargetPlot
            shots={p.shots} position={p.position} metrics={p.metrics}
            face={faceById(p.targetFaceId)} bulletDiameterMm={p.bulletDiameterMm} size={THUMB_W - 4}
          />
        )}
      </button>
      {fullUrl && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Target card" onClick={close}>
          <div className="modal-card" style={{ padding: 12, maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <img src={fullUrl} alt={alt} style={{ width: '100%', maxHeight: '75vh', objectFit: 'contain', display: 'block', borderRadius: 8 }} />
            <button className="secondary" style={{ marginTop: 10 }} onClick={close}>Close</button>
          </div>
        </div>
      )}
    </>
  )
}

function WorkoutCard({ p, trailing }: { p: WorkoutPayload; trailing?: ReactNode }) {
  const parts: string[] = []
  if (p.workoutType === 'dryfire') {
    parts.push(`${p.dryfireMinutes} min dry-fire`)
  } else {
    if (p.precisionBouts > 0) parts.push(`${p.precisionBouts} precision bout${p.precisionBouts === 1 ? '' : 's'}`)
    if (p.metalBouts > 0) {
      parts.push(
        p.metalHits !== undefined && p.metalShots
          ? `${p.metalHits}/${p.metalShots} metal hits`
          : `${p.metalBouts} metal bout${p.metalBouts === 1 ? '' : 's'}`,
      )
    }
  }
  const hasStages = !!p.stages && p.stages.length > 0
  return (
    <>
      <div style={{ fontSize: 16, fontWeight: 600 }}>
        {p.name || when(p.startedAt)}
        {p.workoutType === 'dryfire' && <span className="pill" style={{ marginLeft: 8 }}>Dry-fire</span>}
        {p.raceType && <span className="pill" style={{ marginLeft: 8 }}>{RACE_TYPE_LABEL[p.raceType as RaceType] ?? 'Race'}</span>}
      </div>
      <LastLine trailing={!hasStages && !p.best ? trailing : undefined}>
        <div className="meta">{when(p.startedAt)}{parts.length > 0 && ` · ${parts.join(' · ')}`}</div>
      </LastLine>
      {hasStages && (
        <LastLine trailing={!p.best ? trailing : undefined}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {p.stages!.map((st, i) => (
              <span key={i} className="pill" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {st.position === 'prone' ? 'Prone' : 'Standing'} {st.hits}/5
              </span>
            ))}
          </div>
        </LastLine>
      )}
      {p.best && (
        <LastLine trailing={trailing}>
          <div style={{ marginTop: 6 }}>
            Best bout <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{p.best.ringTotal}/{p.best.ringPossible}</strong>
          </div>
        </LastLine>
      )}
    </>
  )
}

/** Ring a cowbell for a post. Filled and orange once you've rung it; tap
 *  again to take it back. The count is always shown, including zero. Every
 *  tap gives the bell a small shake — keyed on a counter so a second tap
 *  mid-shake restarts it instead of being ignored. */
function CowbellButton({ count, mine, author, onToggle }: { count: number; mine: boolean; author: string; onToggle: () => void }) {
  const [shakes, setShakes] = useState(0)
  return (
    <button
      className="link cowbell"
      aria-pressed={mine}
      aria-label={`${mine ? 'Take back your cowbell from' : 'Ring the cowbell for'} ${author}’s post — ${count} so far`}
      title={mine ? 'Take back your cowbell' : 'Ring the cowbell'}
      onClick={() => { setShakes((n) => n + 1); onToggle() }}
    >
      <span key={shakes} className={shakes > 0 ? 'cowbell-icon shake' : 'cowbell-icon'}>
        <CowbellIcon filled={mine} />
      </span>
      <span className="count">{count}</span>
    </button>
  )
}

/**
 * What athletes have chosen to share with their club. An athlete sees their
 * own club's posts and removes only their own; a coach sees one feed combined
 * across every club they coach and can remove any post. Which posts come back
 * is decided by the database, not filtered here.
 */
export function FeedView({ role, clubs }: { role: 'athlete' | 'coach'; clubs?: { id: string; logoPath: string | null }[] }) {
  const memberships = useMemberships()
  const [posts, setPosts] = useState<FeedPost[] | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const sentinel = useRef<HTMLDivElement>(null)
  const [bells, setBells] = useState<Record<string, CowbellCount>>({})
  const [bellTotal, setBellTotal] = useState<number | null>(null)
  // Posts whose own tap is still in flight — a refresh landing meanwhile must
  // not overwrite the count the reader just changed with an older one.
  const pending = useRef<Set<string>>(new Set())

  // Counts are best-effort: a failure leaves the posts readable, just without
  // numbers, rather than blanking the feed.
  function loadBells(ids: string[]) {
    void cowbellCounts(ids)
      .then((c) => setBells((prev) => ({ ...prev, ...c })))
      .catch(() => {})
  }

  async function toggleBell(post: FeedPost) {
    const cur = bells[post.id] ?? { rings: 0, mine: false }
    const next = { rings: Math.max(0, cur.rings + (cur.mine ? -1 : 1)), mine: !cur.mine }
    setBells((prev) => ({ ...prev, [post.id]: next }))
    pending.current.add(post.id)
    try {
      await setCowbell(post.id, next.mine)
    } catch {
      setBells((prev) => ({ ...prev, [post.id]: cur }))
      setError('Could not ring the cowbell. Check your connection and try again.')
    } finally {
      pending.current.delete(post.id)
    }
  }

  useEffect(() => {
    let cancelled = false
    void Promise.all([feedPosts(), currentUserId()])
      .then(([p, id]) => {
        if (cancelled) return
        setPosts(p)
        setUserId(id)
        setHasMore(p.length === FEED_PAGE_SIZE)
        loadBells(p.map((x) => x.id))
      })
      .catch((e) => { if (!cancelled) setError(errorMessage(e, 'Could not load the club feed. Check your connection and try again.')) })
    return () => { cancelled = true }
  }, [])

  async function loadMore() {
    if (loadingMore || !hasMore || !posts || posts.length === 0) return
    const last = posts[posts.length - 1]
    setLoadingMore(true)
    try {
      const next = await feedPosts({ createdAt: last.createdAt, id: last.id })
      setPosts((prev) => {
        const seen = new Set((prev ?? []).map((p) => p.id))
        return [...(prev ?? []), ...next.filter((p) => !seen.has(p.id))]
      })
      loadBells(next.map((x) => x.id))
      setHasMore(next.length === FEED_PAGE_SIZE)
    } catch (e) {
      // Stop auto-loading rather than retrying in a loop on a bad connection;
      // the button below picks it back up.
      setError(errorMessage(e, 'Could not load more of the feed. Check your connection and try again.'))
      setHasMore(false)
    } finally {
      setLoadingMore(false)
    }
  }

  // Infinite scroll: when the marker below the last post comes near view,
  // fetch the next page. Re-armed after every page, so a page that doesn't
  // fill the screen keeps loading until it does.
  useEffect(() => {
    const el = sentinel.current
    if (!el || !hasMore || loadingMore || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) void loadMore()
    }, { rootMargin: '400px' })
    io.observe(el)
    return () => io.disconnect()
  }, [posts, hasMore, loadingMore])

  useEffect(() => {
    let cancelled = false
    void myCowbellTotal().then((n) => { if (!cancelled) setBellTotal(n) }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Keep the counts live: refresh every few seconds while the feed is on
  // screen, and straight away when the reader comes back to the app. Posts a
  // refresh doesn't return have no bells left, so they go to zero rather than
  // keeping a stale number; ones being tapped right now are left alone.
  const postIds = (posts ?? []).map((p) => p.id).join(',')
  useEffect(() => {
    if (!postIds) return
    const ids = postIds.split(',')
    let cancelled = false
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      void cowbellCounts(ids)
        .then((fresh) => {
          if (cancelled) return
          setBells((prev) => {
            const next = { ...prev }
            for (const id of ids) {
              if (pending.current.has(id)) continue
              next[id] = fresh[id] ?? { rings: 0, mine: false }
            }
            return next
          })
        })
        .catch(() => {})
      void myCowbellTotal().then((n) => { if (!cancelled) setBellTotal(n) }).catch(() => {})
    }
    const timer = setInterval(refresh, BELL_REFRESH_MS)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [postIds])

  // An athlete in no club has no feed to show, and no reason to see a heading
  // for one.
  if (role === 'athlete' && (memberships === null || memberships.length === 0)) return null

  const multipleClubs = role === 'coach' ? (clubs?.length ?? 0) > 1 : (memberships?.length ?? 0) > 1

  async function remove(post: FeedPost) {
    if (!confirm('Remove this from the club feed?\n\nThe target or workout itself isn’t deleted — it just stops being shared.')) return
    setError('')
    try {
      await deleteFeedPost(post.id)
      setPosts((prev) => (prev ?? []).filter((p) => p.id !== post.id))
    } catch (e) {
      setError(errorMessage(e, 'Could not remove that post. Check your connection and try again.'))
    }
  }

  return (
    <>
      <h1 style={{ margin: '28px 0 8px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        {role === 'athlete'
          ? (memberships ?? []).map((m) => <ClubLogo key={m.clubId} logoPath={m.logoPath} size={28} />)
          : (clubs ?? []).map((c) => <ClubLogo key={c.id} logoPath={c.logoPath} size={28} />)}
        {role === 'athlete' ? 'Feed' : 'Combo Feed'}
      </h1>
      {bellTotal !== null && (bellTotal > 0 || (posts ?? []).some((p) => p.athleteId === userId || p.coachId === userId)) && (
        <p className="meta" style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0 0 10px' }}>
          <span style={{ color: 'var(--series-3)', display: 'inline-flex' }}><CowbellIcon filled size={16} /></span>
          <span>
            <strong>{bellTotal}</strong> bell{bellTotal === 1 ? '' : 's'} earned on your {role === 'coach' ? 'posts and announcements' : 'posts'}
          </span>
        </p>
      )}
      {error && <div className="notice error">{error}</div>}
      {posts === null && !error && <p className="meta">Loading…</p>}
      {posts?.length === 0 && (
        <p className="meta">
          {role === 'athlete'
            ? 'Nothing shared yet. Use Share on a target or workout to post it here for your club.'
            : 'Nothing shared yet. Athletes can post targets and workouts to their club from the Share button.'}
        </p>
      )}
      {posts?.map((post) => {
        const header = (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>{post.authorName || 'An athlete'}</strong>
              <span className="meta"> · {when(post.createdAt)}{multipleClubs && post.clubName ? ` · ${post.clubName}` : ''}</span>
            </div>
            {(role === 'coach' || post.athleteId === userId) && (
              <button className="link danger" style={{ flex: 'none' }} aria-label="Remove from the club feed" onClick={() => void remove(post)}>
                <TrashIcon />
              </button>
            )}
          </div>
        )
        const bell = (
          <CowbellButton
            count={bells[post.id]?.rings ?? 0} mine={bells[post.id]?.mine ?? false}
            author={post.authorName || 'this athlete'} onToggle={() => void toggleBell(post)}
          />
        )
        if (post.kind === 'announcement') {
          return (
            <div
              key={post.id} className="card"
              style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: 'color-mix(in srgb, var(--series-1) 7%, var(--surface-1))' }}
            >
              <div
                aria-hidden="true"
                style={{
                  flex: 'none', width: 48, height: 48, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'color-mix(in srgb, var(--series-1) 14%, transparent)', color: 'var(--series-1)',
                }}
              >
                <CoachMark size={30} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {header}
                <span className="pill" style={{ color: 'var(--series-1)' }}>Announcement</span>
                <LastLine trailing={bell}>
                  <p style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{post.payload.text}</p>
                </LastLine>
              </div>
            </div>
          )
        }
        return post.kind === 'target' ? (
          <div key={post.id} className="card" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <CardThumb p={post.payload} />
            <div style={{ flex: 1, minWidth: 0 }}>
              {header}
              <TargetSummary p={post.payload} trailing={bell} />
            </div>
          </div>
        ) : (
          <div key={post.id} className="card" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <SessionTile p={post.payload} />
            <div style={{ flex: 1, minWidth: 0 }}>
              {header}
              <WorkoutCard p={post.payload} trailing={bell} />
            </div>
          </div>
        )
      })}
      {hasMore && (
        <div ref={sentinel} style={{ textAlign: 'center', padding: '8px 0 16px' }}>
          {loadingMore ? (
            <span className="meta">Loading more…</span>
          ) : (
            <button className="link" onClick={() => void loadMore()}>Show more</button>
          )}
        </div>
      )}
    </>
  )
}
