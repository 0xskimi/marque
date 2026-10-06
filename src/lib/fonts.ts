import type { BrandFont } from '../types'

const loaded = new Set<string>()

/** Make a brand font available to the page: Google Fonts link or an uploaded file. */
export function ensureFont(f: BrandFont) {
  if (!f.family) return
  const key = `${f.source}:${f.family}:${f.weights}:${f.data?.length ?? 0}`
  if (loaded.has(key)) return
  loaded.add(key)
  if (f.source === 'google') {
    const weights = f.weights
      .split(/[;,\s]+/)
      .map((w) => w.trim())
      .filter((w) => /^\d{3}$/.test(w))
      .sort()
    const spec = weights.length ? `:wght@${weights.join(';')}` : ''
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f.family).replace(/%20/g, '+')}${spec}&display=swap`
    document.head.appendChild(link)
  } else if (f.source === 'upload' && f.data) {
    const bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0))
    const face = new FontFace(f.family, bytes)
    face.load().then((ff) => document.fonts.add(ff)).catch(() => loaded.delete(key))
  }
}

export function fontStack(f: BrandFont | undefined, fallback = 'Inter, system-ui, sans-serif') {
  return f?.family ? `"${f.family}", ${fallback}` : fallback
}

export function weightsOf(f: BrandFont | undefined): number[] {
  const w = (f?.weights || '400')
    .split(/[;,\s]+/)
    .map(Number)
    .filter((n) => n >= 100 && n <= 900)
  return w.length ? w : [400]
}

export const WEIGHT_NAMES: Record<number, string> = {
  100: 'Thin', 200: 'Extra Light', 300: 'Light', 400: 'Regular', 500: 'Medium',
  600: 'Semibold', 700: 'Bold', 800: 'Extra Bold', 900: 'Black',
}
