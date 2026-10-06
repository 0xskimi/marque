import { useEffect, useState } from 'react'

// Photos are too big for localStorage, so they live in IndexedDB and projects keep their ids.
const DB = 'marque'
const STORE = 'images'

let dbp: Promise<IDBDatabase> | null = null
function db() {
  dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
  return dbp
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db()
  return new Promise((res, rej) => {
    const req = run(d.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
}

const urls = new Map<string, string>()
const listeners = new Set<() => void>()

export async function putImage(blob: Blob, id = Math.random().toString(36).slice(2, 12)): Promise<string> {
  await tx('readwrite', (s) => s.put(blob, id))
  urls.delete(id)
  listeners.forEach((l) => l())
  return id
}

export async function getImage(id: string): Promise<Blob | undefined> {
  return tx('readonly', (s) => s.get(id) as IDBRequest<Blob | undefined>)
}

export async function imageUrl(id: string): Promise<string | undefined> {
  const hit = urls.get(id)
  if (hit) return hit
  const blob = await getImage(id)
  if (!blob) return undefined
  const url = URL.createObjectURL(blob)
  urls.set(id, url)
  return url
}

/** Object URL for a stored image, or undefined while loading or when missing. */
export function useImage(id: string | undefined) {
  const [url, setUrl] = useState<string | undefined>(id ? urls.get(id) : undefined)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const l = () => setTick((t) => t + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])
  useEffect(() => {
    let live = true
    if (!id) return setUrl(undefined)
    imageUrl(id).then((u) => live && setUrl(u))
    return () => {
      live = false
    }
  }, [id, tick])
  return url
}

/** Downscale big photos so the database and project files stay a sensible size. */
export async function importPhoto(file: File, maxSide = 3200): Promise<{ id: string; width: number; height: number }> {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const width = Math.round(bmp.width * k)
  const height = Math.round(bmp.height * k)
  let blob: Blob = file
  if (k < 1 || file.size > 4_000_000) {
    const c = new OffscreenCanvas(width, height)
    c.getContext('2d')!.drawImage(bmp, 0, 0, width, height)
    blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.9 })
  }
  bmp.close()
  return { id: await putImage(blob), width, height }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.onerror = () => rej(r.error)
    r.readAsDataURL(blob)
  })
}

export async function dataUrlToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob()
}

/** Pack stored images into a plain object for project or library files. */
export async function packImages(ids: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const id of new Set(ids)) {
    const blob = await getImage(id)
    if (blob) out[id] = await blobToDataUrl(blob)
  }
  return out
}

export async function unpackImages(images: Record<string, string> | undefined) {
  for (const [id, url] of Object.entries(images ?? {})) await putImage(await dataUrlToBlob(url), id)
}
