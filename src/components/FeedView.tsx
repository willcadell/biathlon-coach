import { useEffect, useRef, useState } from 'react'
import { deleteFeedPost, currentUserId, feedPosts, useMemberships, type FeedPost, type TargetPayload, type WorkoutPayload } from '../lib/feed'
import { RACE_TYPE_LABEL, faceById, type Bout, type RaceType, type Workout } from '../lib/types'
import { errorMessage } from '../lib/errors'
import { buildTargetShareImage, tierFor } from '../lib/share'
import { ClubLogo } from './ClubLogo'
import { TargetPlot } from './TargetPlot'
import { TrashIcon } from './icons'

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

function TargetCard({ p }: { p: TargetPayload }) {
  const pct = p.metrics.ringPossible > 0 ? (p.metrics.ringTotal / p.metrics.ringPossible) * 100 : 0
  const tier = tierFor(pct)
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0 8px' }}>
        <TargetPlot
          shots={p.shots} position={p.position} metrics={p.metrics}
          face={faceById(p.targetFaceId)} bulletDiameterMm={p.bulletDiameterMm} size={220}
        />
      </div>
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

/** The same trading-card image the Share dialog produces, redrawn from the
 *  post's own snapshot. Only drawn once it scrolls into view — each one is a
 *  full-size canvas, and a long feed shouldn't render dozens up front. Falls
 *  back to the plain card if the image can't be drawn. */
function TargetImage({ p }: { p: TargetPayload }) {
  const box = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
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
    let objectUrl: string | null = null
    let cancelled = false
    // The card only reads these fields; the rest of a Bout/Workout isn't
    // part of a post, so it isn't invented here.
    const bout = {
      kind: 'precision', shotAt: p.shotAt, position: p.position, targetFaceId: p.targetFaceId,
      bulletDiameterMm: p.bulletDiameterMm, shots: p.shots, metrics: p.metrics,
    } as unknown as Bout
    const workout = { name: p.workoutName, startedAt: p.shotAt } as unknown as Workout
    void buildTargetShareImage(bout, workout)
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [visible, p])

  if (failed) return <TargetCard p={p} />
  return (
    <div ref={box} style={{ aspectRatio: '1080 / 1350', borderRadius: 10, overflow: 'hidden', background: 'var(--grid)' }}>
      {url && (
        <img
          src={url} style={{ width: '100%', display: 'block' }}
          alt={`${p.position} target, ${p.metrics.ringTotal} out of ${p.metrics.ringPossible}`}
        />
      )}
    </div>
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
export function FeedView({ role, clubCount }: { role: 'athlete' | 'coach'; clubCount?: number }) {
  const memberships = useMemberships()
  const [posts, setPosts] = useState<FeedPost[] | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    void Promise.all([feedPosts(), currentUserId()])
      .then(([p, id]) => { if (!cancelled) { setPosts(p); setUserId(id) } })
      .catch((e) => { if (!cancelled) setError(errorMessage(e, 'Could not load the club feed. Check your connection and try again.')) })
    return () => { cancelled = true }
  }, [])

  // An athlete in no club has no feed to show, and no reason to see a heading
  // for one.
  if (role === 'athlete' && (memberships === null || memberships.length === 0)) return null

  const multipleClubs = role === 'coach' ? (clubCount ?? 0) > 1 : (memberships?.length ?? 0) > 1

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
        <h2>Club feed</h2>
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
      {posts?.map((post) => (
        <div key={post.id} className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
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
          {post.kind === 'target' ? <TargetImage p={post.payload} /> : <WorkoutCard p={post.payload} />}
        </div>
      ))}
    </>
  )
}
