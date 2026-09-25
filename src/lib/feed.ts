import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { myMemberships, type Membership } from './coaching'
import type { Bout, Position, Shot } from './types'

/** What a target post carries — a snapshot built by post_to_feed, so it can't
 *  include anything the database didn't choose to put there (no notes, no
 *  original photo). */
export interface TargetPayload {
  position: Position
  targetFaceId: string
  bulletDiameterMm: number
  shots: Shot[]
  metrics: Bout['metrics']
  shotAt: string
  workoutName: string
}

export interface WorkoutPayload {
  name: string
  startedAt: string
  workoutType: 'range' | 'dryfire'
  raceType: string | null
  dryfireMinutes: number
  precisionBouts: number
  metalBouts: number
  best: { ringTotal: number; ringPossible: number } | null
}

interface PostBase {
  id: string
  clubId: string
  clubName: string
  athleteId: string
  authorName: string
  createdAt: string
}

export type FeedPost =
  | (PostBase & { kind: 'target'; payload: TargetPayload })
  | (PostBase & { kind: 'workout'; payload: WorkoutPayload })

export const FEED_PAGE_SIZE = 20

/** Where the next page starts: just after this post, in newest-first order. */
export interface FeedCursor {
  createdAt: string
  id: string
}

/** One page of the most recent posts across every club the caller belongs to
 *  or coaches — row-level security decides which those are, so there's no
 *  club filter here: an athlete gets their club's feed, a coach the combined
 *  feed. Pass the last post's cursor to get the page after it.
 *
 *  The cursor is (created_at, id) rather than an offset, so posts arriving
 *  while someone scrolls don't shift the pages and repeat or skip a post; id
 *  breaks the tie between posts made in the same instant. createdAt is kept
 *  exactly as the database returned it — re-serialising through a JS Date
 *  would drop the microseconds and skip posts sharing a millisecond. */
export async function feedPosts(after?: FeedCursor, limit = FEED_PAGE_SIZE): Promise<FeedPost[]> {
  let query = supabase
    .from('feed_posts')
    .select('id, club_id, athlete_id, author_name, kind, payload, created_at')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit)
  if (after) {
    query = query.or(`created_at.lt."${after.createdAt}",and(created_at.eq."${after.createdAt}",id.lt.${after.id})`)
  }
  const { data, error } = await query
  if (error) throw error
  if (!data || data.length === 0) return []

  const clubIds = [...new Set(data.map((p) => p.club_id as string))]
  const { data: clubs, error: cErr } = await supabase.from('clubs').select('id, name').in('id', clubIds)
  if (cErr) throw cErr
  const nameById = new Map((clubs ?? []).map((c) => [c.id as string, c.name as string]))

  return data.map((p) => ({
    id: p.id,
    clubId: p.club_id,
    clubName: nameById.get(p.club_id) ?? '',
    athleteId: p.athlete_id,
    authorName: p.author_name,
    createdAt: p.created_at,
    kind: p.kind,
    payload: p.payload,
  })) as FeedPost[]
}

/** Idempotent — posting the same thing to the same club twice is a no-op. */
export async function postToFeed(clubId: string, source: { boutId: string } | { workoutId: string }): Promise<void> {
  const { error } = await supabase.rpc('post_to_feed', {
    p_club_id: clubId,
    p_bout_id: 'boutId' in source ? source.boutId : null,
    p_workout_id: 'workoutId' in source ? source.workoutId : null,
  })
  if (error) throw error
}

/** Allowed for the post's author or any coach at its club — the database
 *  enforces it, and a refused delete removes zero rows rather than erroring. */
export async function deleteFeedPost(id: string): Promise<void> {
  const { error } = await supabase.from('feed_posts').delete().eq('id', id)
  if (error) throw error
}

export async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

/** The clubs the signed-in athlete belongs to — null until loaded, so callers
 *  can tell "still checking" from "in no club". */
export function useMemberships(): Membership[] | null {
  const [memberships, setMemberships] = useState<Membership[] | null>(null)
  useEffect(() => {
    let cancelled = false
    void myMemberships()
      .then((m) => { if (!cancelled) setMemberships(m) })
      .catch(() => { if (!cancelled) setMemberships([]) })
    return () => { cancelled = true }
  }, [])
  return memberships
}
