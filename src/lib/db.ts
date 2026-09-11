import type { Bout, MetalBout, Workout } from './types'

const DB_NAME = 'biathlon-coach'
const DB_VERSION = 2
const BOUTS = 'bouts'
const IMAGES = 'images'
const WORKOUTS = 'workouts'
const METAL = 'metal'

export interface StoredImage {
  id: string
  /** Full-size-ish capture, downscaled for storage. */
  blob: Blob
  /** Small square preview for list views. */
  thumb: Blob
}

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(BOUTS)) {
        const store = db.createObjectStore(BOUTS, { keyPath: 'id' })
        store.createIndex('shotAt', 'shotAt')
      }
      if (!db.objectStoreNames.contains(IMAGES)) {
        db.createObjectStore(IMAGES, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(WORKOUTS)) {
        const store = db.createObjectStore(WORKOUTS, { keyPath: 'id' })
        store.createIndex('startedAt', 'startedAt')
      }
      if (!db.objectStoreNames.contains(METAL)) {
        const store = db.createObjectStore(METAL, { keyPath: 'id' })
        store.createIndex('shotAt', 'shotAt')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode)
        const req = fn(tx.objectStore(store))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

// --- Workouts ---

export const putWorkout = (workout: Workout) => run(WORKOUTS, 'readwrite', (s) => s.put(workout)).then(() => undefined)

export const getWorkout = (id: string) => run<Workout | undefined>(WORKOUTS, 'readonly', (s) => s.get(id))

export const allWorkouts = () =>
  run<Workout[]>(WORKOUTS, 'readonly', (s) => s.getAll()).then((workouts) =>
    workouts.sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
  )

/** Delete a workout and everything shot under it: its precision bouts, their
 *  photos, and its metal bouts. */
export async function deleteWorkout(id: string): Promise<void> {
  const [bouts, metal] = await Promise.all([allBouts(), allMetalBouts()])
  const ownBouts = bouts.filter((b) => b.workoutId === id)
  const ownMetal = metal.filter((m) => m.workoutId === id)
  const db = await open()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([BOUTS, IMAGES, METAL, WORKOUTS], 'readwrite')
    for (const bout of ownBouts) {
      tx.objectStore(BOUTS).delete(bout.id)
      if (bout.imageId) tx.objectStore(IMAGES).delete(bout.imageId)
    }
    for (const m of ownMetal) tx.objectStore(METAL).delete(m.id)
    tx.objectStore(WORKOUTS).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// --- Precision bouts ---

export const putBout = (bout: Bout) => run(BOUTS, 'readwrite', (s) => s.put(bout)).then(() => undefined)

export const allBouts = () =>
  run<Bout[]>(BOUTS, 'readonly', (s) => s.getAll()).then((bouts) =>
    bouts.sort((a, b) => b.shotAt.localeCompare(a.shotAt)),
  )

export async function deleteBout(id: string): Promise<void> {
  const bout = await run<Bout | undefined>(BOUTS, 'readonly', (s) => s.get(id))
  await run(BOUTS, 'readwrite', (s) => s.delete(id))
  if (bout?.imageId) await run(IMAGES, 'readwrite', (s) => s.delete(bout.imageId))
}

/** Delete several bouts and their photos in one transaction. */
export async function deleteBouts(ids: string[]): Promise<void> {
  const db = await open()
  const wanted = new Set(ids)
  const bouts = (await allBouts()).filter((b) => wanted.has(b.id))
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([BOUTS, IMAGES], 'readwrite')
    for (const bout of bouts) {
      tx.objectStore(BOUTS).delete(bout.id)
      if (bout.imageId) tx.objectStore(IMAGES).delete(bout.imageId)
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/**
 * Drop every stored photo but keep the scored bouts.
 *
 * Photos are almost all of the space this app uses, and once a bout is scored
 * the shot positions are the record — the picture is only evidence.
 */
export async function clearImages(): Promise<void> {
  await run(IMAGES, 'readwrite', (s) => s.clear())
}

export const putImage = (image: StoredImage) =>
  run(IMAGES, 'readwrite', (s) => s.put(image)).then(() => undefined)

export const getImage = (id: string) => run<StoredImage | undefined>(IMAGES, 'readonly', (s) => s.get(id))

// --- Metal bouts ---

export const putMetalBout = (bout: MetalBout) => run(METAL, 'readwrite', (s) => s.put(bout)).then(() => undefined)

export const allMetalBouts = () =>
  run<MetalBout[]>(METAL, 'readonly', (s) => s.getAll()).then((bouts) =>
    bouts.sort((a, b) => b.shotAt.localeCompare(a.shotAt)),
  )

export const deleteMetalBout = (id: string) => run(METAL, 'readwrite', (s) => s.delete(id)).then(() => undefined)

/** Everything, as JSON, so nothing is trapped in this browser. */
export async function exportAll(): Promise<string> {
  const [workouts, bouts, metal] = await Promise.all([allWorkouts(), allBouts(), allMetalBouts()])
  return JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), workouts, bouts, metal }, null, 2)
}

/** Rough storage usage, so the athlete knows when the photos are piling up. */
export async function usage(): Promise<{ usedMb: number; quotaMb: number } | null> {
  if (!navigator.storage?.estimate) return null
  const est = await navigator.storage.estimate()
  return {
    usedMb: Math.round(((est.usage ?? 0) / 1e6) * 10) / 10,
    quotaMb: Math.round((est.quota ?? 0) / 1e6),
  }
}
