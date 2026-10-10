import { createContext, useContext } from 'react'
import type { Brand, CustomSlide, Layer } from '../types'

export interface Selection {
  page: string
  layer?: string
  /** An item of the generated page, by its path from the page element. */
  el?: string
}

export type EditPatch = Pick<Partial<Brand>, 'overlays' | 'customSlides' | 'hiddenSlides' | 'tweaks'>

export interface EditApi {
  editing: boolean
  brand: Brand
  sel: Selection | null
  setSel: (s: Selection | null) => void
  /** Change the editable parts of the brand, with undo. */
  commit: (patch: EditPatch) => void
}

export const EditContext = createContext<EditApi | null>(null)

export function useEdit() {
  return useContext(EditContext)
}

export const uid = () => Math.random().toString(36).slice(2, 10)

export function layersOf(b: Brand, page: string): Layer[] {
  return b.overlays?.[page] ?? []
}

export function withLayers(b: Brand, page: string, layers: Layer[]): Record<string, Layer[]> {
  const next = { ...(b.overlays ?? {}) }
  if (layers.length) next[page] = layers
  else delete next[page]
  return next
}

export function slidesOf(b: Brand): CustomSlide[] {
  return b.customSlides ?? []
}

/** Every image a project's layers point at, for project files. */
export function overlayImageIds(b: Brand): string[] {
  return Object.values(b.overlays ?? {})
    .flat()
    .map((l) => l.imageId)
    .filter((v): v is string => !!v)
}
