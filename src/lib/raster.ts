import type { Brand } from '../types'

/**
 * Renders pages of the canvas to bitmaps, the way they look on screen.
 * A page is copied with its styles into an SVG <foreignObject>, with fonts
 * and photos inlined, and drawn onto a canvas. Used for PNG export and for
 * the few effects (shadows, rotation, gradients) that a vector file keeps as pictures.
 */

const PX_PER_MM = 96 / 25.4

const dataUrls = new Map<string, Promise<string>>()

export function toDataUrl(src: string): Promise<string> {
  if (src.startsWith('data:')) return Promise.resolve(src)
  let p = dataUrls.get(src)
  if (!p) {
    p = fetch(src)
      .then((r) => r.blob())
      .then(
        (b) =>
          new Promise<string>((res, rej) => {
            const fr = new FileReader()
            fr.onload = () => res(fr.result as string)
            fr.onerror = rej
            fr.readAsDataURL(b)
          }),
      )
      .catch(() => '')
    dataUrls.set(src, p)
  }
  return p
}

let fontCss: Promise<string> | null = null
let fontKey = ''

/** @font-face rules with the font files inlined, so text keeps its typeface inside the picture. */
function embeddedFonts(brand: Brand): Promise<string> {
  const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href*="fonts.googleapis.com"]')).map((l) => l.href)
  const key = links.join('|') + brand.fonts.map((f) => `${f.family}:${f.data?.length ?? 0}`).join('|')
  if (fontCss && key === fontKey) return fontCss
  fontKey = key
  fontCss = (async () => {
    const out: string[] = []
    for (const href of links) {
      try {
        const css = await (await fetch(href)).text()
        // Keep the Latin subsets; that covers the documents and keeps the picture light.
        const blocks = css.split(/(?=\/\*\s*[\w-]+\s*\*\/)/).filter((b) => /\/\*\s*latin(-ext)?\s*\*\//.test(b) || !/\/\*/.test(b))
        for (const block of blocks) {
          let b = block
          for (const m of block.matchAll(/url\((https:[^)]+)\)/g)) b = b.replace(m[1], await toDataUrl(m[1]))
          out.push(b)
        }
      } catch {
        /* offline: the picture falls back to system fonts */
      }
    }
    for (const f of brand.fonts)
      if (f.source === 'upload' && f.data) out.push(`@font-face { font-family: "${f.family}"; src: url(data:font/ttf;base64,${f.data}); }`)
    return out.join('\n')
  })()
  return fontCss
}

function pageCss(): string {
  const parts: string[] = []
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      parts.push(Array.from(sheet.cssRules, (r) => r.cssText).join('\n'))
    } catch {
      /* cross-origin sheet (Google Fonts): handled by embeddedFonts */
    }
  }
  return parts.join('\n')
}

const CHROME_CSS = `
.mq-root .app, .mq-root .main { display: block !important; width: auto !important; height: auto !important; overflow: visible !important; padding: 0 !important; margin: 0 !important; position: static !important; }
.mq-root .canvas { padding: 0 !important; margin: 0 !important; display: block !important; overflow: visible !important; height: auto !important; width: auto !important; position: static !important; }
.mq-root .doc { display: block !important; gap: 0 !important; padding: 0 !important; margin: 0 !important; }
.mq-root .sheet { margin: 0 !important; }
.mq-root .page, .mq-root .slide, .mq-root .print-sheet, .mq-root .layers { zoom: 1 !important; box-shadow: none !important; }
.mq-root .sheet-bar, .mq-root .ly-h, .mq-root .ly-guide, .mq-root .ly-drop, .mq-root .ly-empty, .mq-root .mq-sel, .mq-root .gen-hover, .mq-root .trim-guide, .mq-root .print-label { display: none !important; }
.mq-root .ly { outline: none !important; }
.mq-root .sheet.is-hidden > section { opacity: 1 !important; filter: none !important; }
.mq-root .sheet.is-hidden::after { display: none !important; }
`

export interface Prepared {
  /** Serialised page, ready to drop into a foreignObject. */
  html: string
  css: string
  w: number
  h: number
}

/**
 * Copies a page (a `.sheet` or `.print-sheet`) with everything it needs.
 * `mark` runs on the live page first, so ids set there end up in the copy.
 */
export async function preparePage(sheet: HTMLElement, brand: Brand, mark?: () => () => void): Promise<Prepared> {
  const page = (sheet.matches('.print-sheet') ? sheet : sheet.querySelector<HTMLElement>(':scope > section')) ?? sheet
  // Things hidden on screen stay hidden even where a picture switches visibility back on.
  const hidden: Element[] = []
  for (const el of Array.from(sheet.querySelectorAll('*')))
    if (getComputedStyle(el).visibility === 'hidden') {
      el.setAttribute('data-mq-hidden', '')
      hidden.push(el)
    }
  const unmark = mark?.()
  const clone = sheet.cloneNode(true) as HTMLElement
  unmark?.()
  hidden.forEach((el) => el.removeAttribute('data-mq-hidden'))

  // Photos and other non-data images are inlined.
  const jobs: Promise<void>[] = []
  clone.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src')
    if (src && !src.startsWith('data:')) jobs.push(toDataUrl(img.src).then((d) => img.setAttribute('src', d)))
  })
  clone.querySelectorAll('image').forEach((im) => {
    const href = im.getAttribute('href') ?? im.getAttribute('xlink:href')
    if (href && !href.startsWith('data:')) jobs.push(toDataUrl(new URL(href, location.href).href).then((d) => im.setAttribute('href', d)))
  })
  clone.querySelectorAll<HTMLElement>('[style*="url("]').forEach((el) => {
    const m = el.getAttribute('style')!.match(/url\(["']?((?:blob|https?):[^"')]+)["']?\)/)
    if (m) jobs.push(toDataUrl(m[1]).then((d) => el.setAttribute('style', el.getAttribute('style')!.replace(m[1], d))))
  })
  await Promise.all(jobs)

  // Rebuild the ancestors (document template, CSS variables) around the copy.
  let node: HTMLElement = clone
  for (let a = sheet.parentElement; a && a !== document.body; a = a.parentElement) {
    const wrap = a.cloneNode(false) as HTMLElement
    wrap.removeAttribute('id')
    wrap.appendChild(node)
    node = wrap
  }
  const fonts = await embeddedFonts(brand)
  return {
    html: new XMLSerializer().serializeToString(node),
    css: `${fonts}\n${pageCss()}\n${CHROME_CSS}\n.mq-root [data-mq-hidden] { visibility: hidden !important; }`,
    w: page.offsetWidth,
    h: page.offsetHeight,
  }
}

/** Draws a prepared page. `extraCss` can hide parts of it; `crop` is in CSS px of the page. */
export async function draw(p: Prepared, scale: number, extraCss = '', crop?: { x: number; y: number; w: number; h: number }): Promise<HTMLCanvasElement> {
  const c = crop ?? { x: 0, y: 0, w: p.w, h: p.h }
  const W = Math.max(1, Math.round(c.w * scale))
  const H = Math.max(1, Math.round(c.h * scale))
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${c.x} ${c.y} ${c.w} ${c.h}">` +
    `<foreignObject x="0" y="0" width="${p.w}" height="${p.h}">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" class="mq-root" style="width:${p.w}px;height:${p.h}px;overflow:hidden;position:relative">` +
    `<style>${escapeXml(p.css + '\n' + extraCss)}</style>` +
    p.html +
    `</div></foreignObject></svg>`
  const img = new Image()
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  canvas.getContext('2d')!.drawImage(img, 0, 0, W, H)
  return canvas
}

function escapeXml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function canvasBlob(c: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode the image'))), type, quality))
}

/** A whole page as a PNG at `dpi` (pages are laid out in mm). */
export async function pagePng(sheet: HTMLElement, brand: Brand, dpi = 300): Promise<Blob> {
  const p = await preparePage(sheet, brand)
  const canvas = await draw(p, dpi / 96)
  return canvasBlob(canvas)
}

export { PX_PER_MM }
