import type { Brand } from '../types'

/**
 * TrueType files for embedding fonts in vector PDFs.
 *
 * Browsers are only ever sent WOFF2 by Google Fonts, which a PDF can't hold, so the
 * dev server proxies the stylesheet (`/__gfonts`, see vite.config.ts) and asks for
 * the plain TrueType version of each weight. Uploaded .ttf files are used as they are.
 */

export interface FontFile {
  data: Uint8Array
  /** The weight actually found (nearest to the one asked for). */
  weight: number
  italic: boolean
}

interface Face {
  weight: number
  italic: boolean
  url: string
}

const ALL = [100, 200, 300, 400, 500, 600, 700, 800, 900]
const faces = new Map<string, Promise<Face[]>>()
const files = new Map<string, Promise<Uint8Array | null>>()

function isTrueType(b: Uint8Array) {
  const tag = String.fromCharCode(...b.slice(0, 4))
  return (b[0] === 0 && b[1] === 1 && b[2] === 0 && b[3] === 0) || tag === 'true'
}

function googleFaces(family: string): Promise<Face[]> {
  let p = faces.get(family)
  if (!p) {
    const spec = [...ALL.map(String), ...ALL.map((w) => `${w}i`)].join(',')
    p = fetch(`/__gfonts/css?family=${encodeURIComponent(family).replace(/%20/g, '+')}:${spec}`)
      .then((r) => (r.ok ? r.text() : ''))
      .then((css) =>
        Array.from(css.matchAll(/@font-face\s*{([^}]*)}/g)).flatMap((m) => {
          const body = m[1]
          const url = body.match(/url\(([^)]+\.ttf)\)/)?.[1]
          if (!url) return []
          return [{ url, weight: Number(body.match(/font-weight:\s*(\d+)/)?.[1] ?? 400), italic: /font-style:\s*italic/.test(body) }]
        }),
      )
      .catch(() => [])
    faces.set(family, p)
  }
  return p
}

function bytes(url: string): Promise<Uint8Array | null> {
  let p = files.get(url)
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((b) => (b ? new Uint8Array(b) : null))
      .catch(() => null)
    files.set(url, p)
  }
  return p
}

export async function fontFile(brand: Brand, family: string, weight: number, italic: boolean): Promise<FontFile | null> {
  const up = brand.fonts.find((f) => f.family.toLowerCase() === family.toLowerCase() && f.source === 'upload' && f.data)
  if (up?.data) {
    const data = Uint8Array.from(atob(up.data), (c) => c.charCodeAt(0))
    if (isTrueType(data)) return { data, weight, italic }
  }
  const list = await googleFaces(family)
  if (!list.length) return null
  const pool = list.filter((f) => f.italic === italic).length ? list.filter((f) => f.italic === italic) : list
  const best = pool.reduce((a, f) => (Math.abs(f.weight - weight) < Math.abs(a.weight - weight) ? f : a))
  const data = await bytes(best.url)
  return data && isTrueType(data) ? { data, weight: best.weight, italic: best.italic } : null
}

export function toBase64(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return btoa(s)
}

/** The font's PostScript name (name ID 6), which Illustrator uses to find the installed font. */
export function postScriptName(b: Uint8Array): string | null {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const n = v.getUint16(4)
  for (let i = 0; i < n; i++) {
    const rec = 12 + i * 16
    if (String.fromCharCode(...b.slice(rec, rec + 4)) !== 'name') continue
    const off = v.getUint32(rec + 8)
    const count = v.getUint16(off + 2)
    const strings = off + v.getUint16(off + 4)
    for (let j = 0; j < count; j++) {
      const r = off + 6 + j * 12
      const platform = v.getUint16(r)
      if (v.getUint16(r + 6) !== 6) continue
      const len = v.getUint16(r + 8)
      const at = strings + v.getUint16(r + 10)
      const raw = b.slice(at, at + len)
      let name = ''
      if (platform === 3 || platform === 0) for (let k = 0; k + 1 < raw.length; k += 2) name += String.fromCharCode((raw[k] << 8) | raw[k + 1])
      else name = String.fromCharCode(...raw)
      if (name) return name.replace(/[^\x21-\x7e]/g, '')
    }
  }
  return null
}
