import { useEffect, useRef, useState } from 'react'
import { FEED_PAGE_SIZE, deleteFeedPost, currentUserId, feedPosts, useMemberships, type FeedPost, type TargetPayload, type WorkoutPayload } from '../lib/feed'
import { RACE_TYPE_LABEL, faceById, type Bout, type RaceType, type Workout } from '../lib/types'
import { errorMessage } from '../lib/errors'
import { buildTargetShareImage, tierFor } from '../lib/share'
import { ClubLogo } from './ClubLogo'
import { TargetPlot } from './TargetPlot'
import { TrashIcon } from './icons'

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

function TargetSummary({ p }: { p: TargetPayload }) {
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
      <div className="meta">
        {p.workoutName ? `${p.workoutName} · ` : ''}{p.shots.length} shot{p.shots.length === 1 ? '' : 's'} · {p.metrics.meanRadius.toFixed(0)} mm mean radius
      </div>
    </>
  )
}

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

function WorkoutCard({ p }: { p: WorkoutPayload }) {
  const parts: string[] = []
  if (p.workoutType === 'dryfire') {
    parts.push(`${p.dryfireMinutes} min dry-fire`)
  } else {
    if (p.precisionBouts > 0) parts.push(`${p.precisionBouts} precision bout${p.precisionBouts === 1 ? '' : 's'}`)
    if (p.metalBouts > 0) parts.push(`${p.metalBouts} metal bout${p.metalBouts === 1 ? '' : 's'}`)
  }
  return (
    <>
      <div style={{ fontSize: 16, fontWeight: 600 }}>
        {p.name || when(p.startedAt)}
        {p.workoutType === 'dryfire' && <span className="pill" style={{ marginLeft: 8 }}>Dry-fire</span>}
        {p.raceType && <span className="pill" style={{ marginLeft: 8 }}>{RACE_TYPE_LABEL[p.raceType as RaceType] ?? 'Race'}</span>}
      </div>
      <div className="meta">{when(p.startedAt)}{parts.length > 0 && ` · ${parts.join(' · ')}`}</div>
      {p.best && (
        <div style={{ marginTop: 6 }}>
          Best bout <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{p.best.ringTotal}/{p.best.ringPossible}</strong>
        </div>
      )}
    </>
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

  useEffect(() => {
    let cancelled = false
    void Promise.all([feedPosts(), currentUserId()])
      .then(([p, id]) => {
        if (cancelled) return
        setPosts(p)
        setUserId(id)
        setHasMore(p.length === FEED_PAGE_SIZE)
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
      {role === 'athlete' ? (
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {(memberships ?? []).map((m) => <ClubLogo key={m.clubId} logoPath={m.logoPath} size={28} />)}
          Feed
        </h2>
      ) : (
        <h1 style={{ margin: '28px 0 8px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          {(clubs ?? []).map((c) => <ClubLogo key={c.id} logoPath={c.logoPath} size={28} />)}
          Combo Feed
        </h1>
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
        return post.kind === 'target' ? (
          <div key={post.id} className="card" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <CardThumb p={post.payload} />
            <div style={{ flex: 1, minWidth: 0 }}>
              {header}
              <TargetSummary p={post.payload} />
            </div>
          </div>
        ) : (
          <div key={post.id} className="card">
            {header}
            <WorkoutCard p={post.payload} />
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
