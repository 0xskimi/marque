import type { Brand, PhotoMockup } from '../types'
import { migrate } from '../store'
import { unpackImages } from './images'
import { getLibrary, saveLibrary } from './library'

// Fly Eagle ships as the default project: loaded once from public/brands, with its photos and mockups.
// Bump the version when the kit changes so browsers that already have it pick up the new one.
const FLAG = 'marque.seed.flyeagle.v3'
const ID = 'flyeagle'
let running: Promise<void> | null = null

export function seedDefault(add: (b: Brand) => void) {
  running ??= (async () => {
    try {
      if (localStorage.getItem(FLAG)) return
      const res = await fetch('/brands/flyeagle.marque.json')
      if (!res.ok) return
      const { _mockups, _images, ...b } = (await res.json()) as Brand & { _mockups?: PhotoMockup[]; _images?: Record<string, string> }
      await unpackImages(_images)
      if (_mockups?.length) saveLibrary([...getLibrary().filter((m) => !_mockups.some((x) => x.id === m.id)), ..._mockups])
      add(migrate({ ...b, id: ID }))
      localStorage.setItem(FLAG, '1')
    } catch {
      /* the app still works with whatever projects it has */
    }
  })()
  return running
}
