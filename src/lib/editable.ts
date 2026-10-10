import JSZip from 'jszip'
import { jsPDF } from 'jspdf'
import 'svg2pdf.js'
import type { Brand } from '../types'
import { flatten, fontKey, sceneFonts, type FontKey, type Rgba, type Scene, type SNode } from './flatten'
import { fontFile, postScriptName, toBase64 } from './fontfiles'
import { canvasBlob, draw, pagePng, preparePage } from './raster'

/**
 * Exports for editing in Illustrator. Pages are flattened into boxes, text lines,
 * images and SVG artwork (see flatten.ts) and written as:
 *  - a vector PDF with live text in embedded fonts and RGB colour values,
 *  - the same file as .ai (Illustrator opens PDF-based .ai files for editing),
 *  - one SVG per page, whose text Illustrator maps to your installed fonts.
 */

export interface ExportResult {
  blob: Blob
  /** Fonts that couldn't be embedded and were replaced with a standard font. */
  missingFonts: string[]
}

type Progress = (msg: string) => void

const fkey = (f: FontKey) => `${f.family}|${f.weight}|${f.italic}`

/** The pages showing on the canvas, in order: generated pages, your slides, print sheets. */
export function canvasPages(root: ParentNode = document): HTMLElement[] {
  const sheets = Array.from(root.querySelectorAll<HTMLElement>('.canvas .sheet:not(.is-hidden)'))
  if (sheets.length) return sheets
  return Array.from(root.querySelectorAll<HTMLElement>('.canvas .print-sheet'))
}

export async function scenes(pages: HTMLElement[], brand: Brand, progress: Progress): Promise<Scene[]> {
  const out: Scene[] = []
  for (const [i, p] of pages.entries()) {
    progress(`Reading page ${i + 1} of ${pages.length}`)
    out.push(await flatten(p, { brand }))
  }
  return out
}

// ---------------------------------------------------------------------------
// PDF

const WEIGHT_PS: Record<number, string> = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' }

/** Google Fonts' naming for installed static fonts, e.g. SpaceGrotesk-Bold or Inter-SemiBoldItalic. */
function googlePsName(family: string, weight: number, italic: boolean) {
  const w = WEIGHT_PS[Math.round(weight / 100) * 100] ?? 'Regular'
  return `${family.replace(/[^A-Za-z0-9]/g, '')}-${italic ? (w === 'Regular' ? 'Italic' : `${w}Italic`) : w}`
}

function rgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}

function imageFormat(src: string) {
  if (src.startsWith('data:image/jpeg') || src.startsWith('data:image/jpg')) return 'JPEG'
  if (src.startsWith('data:image/png')) return 'PNG'
  return null
}

async function asPng(src: string): Promise<string> {
  const im = new Image()
  im.src = src
  await im.decode()
  const c = document.createElement('canvas')
  c.width = im.naturalWidth
  c.height = im.naturalHeight
  c.getContext('2d')!.drawImage(im, 0, 0)
  return c.toDataURL('image/png')
}

export async function vectorPdf(pages: Scene[], brand: Brand, title: string, progress: Progress): Promise<ExportResult> {
  const first = pages[0]
  const orient = (s: Scene) => (s.w >= s.h ? 'landscape' : 'portrait')
  const doc = new jsPDF({ unit: 'mm', format: [first.w, first.h], orientation: orient(first), compress: true })
  doc.setProperties({ title, creator: 'Marque' })
  type Gs = new (o: Record<string, number>) => unknown
  const GState = (doc as unknown as { GState: Gs }).GState
  const setAlpha = (a: number) => doc.setGState(new GState({ opacity: a, 'stroke-opacity': a }) as never)

  // Fonts: embed the real files so text stays text, in the right typeface.
  progress('Embedding fonts')
  const all = new Map<string, FontKey>()
  pages.forEach((p) => sceneFonts(p).forEach((f) => all.set(fkey(f), f)))
  // Text inside SVG artwork (e.g. the clear space markers) needs its fonts too.
  const svgFonts = (n: SNode): void => {
    if (n.t === 'group') return n.children.forEach(svgFonts)
    if (n.t !== 'svg') return
    for (const m of n.markup.matchAll(/<text\b[^>]*>/g)) {
      const fam = m[0].match(/font-family="([^"]+)"/)?.[1]
      if (!fam) continue
      const f = fontKey({ fontFamily: fam.replace(/&quot;/g, '"'), fontWeight: m[0].match(/font-weight="(\d+)"/)?.[1] ?? '400', fontStyle: 'normal' } as CSSStyleDeclaration)
      all.set(fkey(f), f)
    }
  }
  pages.forEach((p) => p.nodes.forEach(svgFonts))
  const use = new Map<string, [string, string, number?]>()
  // The same files loaded into the browser, to measure text exactly as the PDF will set it.
  const measureAs = new Map<string, string>()
  const loadedAliases = new Set<string>()
  const missing = new Set<string>()
  const added = new Set<string>()
  for (const [key, f] of all) {
    const file = await fontFile(brand, f.family, f.weight, f.italic)
    if (file) {
      const name = `${f.family.replace(/\s+/g, '')}-${file.weight}${file.italic ? 'i' : ''}.ttf`
      const style = file.italic ? 'italic' : 'normal'
      if (!added.has(name)) {
        doc.addFileToVFS(name, toBase64(file.data))
        doc.addFont(name, f.family, style, file.weight, 'Identity-H')
        added.add(name)
        // Name the font by its PostScript name (Inter-Bold, not Inter) so Illustrator picks the right weight.
        const ps = brand.fonts.some((b) => b.family === f.family && b.source === 'upload') ? postScriptName(file.data) : googlePsName(f.family, file.weight, file.italic)
        doc.setFont(f.family, style, file.weight)
        if (ps) (doc.getFont() as { fontName: string }).fontName = ps
      }
      use.set(key, [f.family, style, file.weight])
      const alias = `mq-${name.replace(/\W/g, '')}`
      if (!loadedAliases.has(alias)) {
        loadedAliases.add(alias)
        try {
          const face = new FontFace(alias, file.data.slice().buffer)
          document.fonts.add(await face.load())
        } catch {
          /* measuring falls back to no correction */
        }
      }
      measureAs.set(key, alias)
    } else {
      const std = f.generic === 'serif' ? 'times' : f.generic === 'mono' ? 'courier' : 'helvetica'
      const bold = f.weight >= 600
      use.set(key, [std, bold && f.italic ? 'bolditalic' : bold ? 'bold' : f.italic ? 'italic' : 'normal'])
      if (!/^(helvetica|arial|times|times new roman|courier|courier new)$/i.test(f.family)) missing.add(f.family)
    }
  }

  const mctx = document.createElement('canvas').getContext('2d')!
  mctx.fontKerning = 'none'
  const host = document.createElement('div')
  host.style.cssText = 'position:absolute;left:-20000px;top:0;width:10px;height:10px;overflow:hidden'
  document.body.appendChild(host)

  async function node(n: SNode, alpha: number) {
    if (n.t === 'group') {
      const a = alpha * (n.opacity ?? 1)
      if (n.clip) {
        doc.saveGraphicsState()
        const c = n.clip
        if (c.r > 0) doc.roundedRect(c.x, c.y, c.w, c.h, c.r, c.r, null)
        else doc.rect(c.x, c.y, c.w, c.h, null)
        doc.clip()
        doc.discardPath()
      }
      for (const ch of n.children) await node(ch, a)
      if (n.clip) doc.restoreGraphicsState()
      return
    }
    if (n.t === 'rect') {
      const paint = (c: Rgba | undefined) => c && c.a * alpha > 0
      if (paint(n.fill)) {
        setAlpha(n.fill!.a * alpha)
        doc.setFillColor(...rgb(n.fill!.hex))
        if (n.r > 0) doc.roundedRect(n.box.x, n.box.y, n.box.w, n.box.h, n.r, n.r, 'F')
        else doc.rect(n.box.x, n.box.y, n.box.w, n.box.h, 'F')
      }
      if (paint(n.stroke) && n.sw) {
        setAlpha(n.stroke!.a * alpha)
        doc.setDrawColor(...rgb(n.stroke!.hex))
        doc.setLineWidth(n.sw)
        if (n.dash) doc.setLineDashPattern([n.sw * 3, n.sw * 2], 0)
        if (n.r > 0) doc.roundedRect(n.box.x, n.box.y, n.box.w, n.box.h, n.r, n.r, 'S')
        else doc.rect(n.box.x, n.box.y, n.box.w, n.box.h, 'S')
        if (n.dash) doc.setLineDashPattern([], 0)
      }
      setAlpha(1)
      return
    }
    if (n.t === 'text') {
      const [fam, style, weight] = use.get(fkey(n.font))!
      doc.setFont(fam, style, weight)
      doc.setFontSize((n.size * 72) / 25.4)
      doc.setTextColor(...rgb(n.fill.hex))
      if (n.fill.a * alpha < 1) setAlpha(n.fill.a * alpha)
      // The embedded font can run a little wider or narrower than the browser's copy (optical sizes),
      // so letter spacing is nudged to keep each line exactly as long as on the canvas.
      let cs = n.spacing
      const chars = [...n.text].length
      const alias = measureAs.get(fkey(n.font))
      if (n.width && alias && chars > 1) {
        mctx.font = `100px "${alias}"`
        const natural = (mctx.measureText(n.text).width / 100) * n.size + cs * chars
        const fix = (n.width - natural) / chars
        if (Math.abs(n.width - natural) > n.width * 0.003 && Math.abs(fix) < n.size * 0.05) cs += fix
      }
      doc.text(n.text, n.x, n.y, { baseline: 'alphabetic', charSpace: cs || undefined })
      if (n.fill.a * alpha < 1) setAlpha(1)
      return
    }
    if (n.t === 'image') {
      let src = n.src
      let fmt = imageFormat(src)
      if (!fmt) {
        src = await asPng(src)
        fmt = 'PNG'
      }
      const b = n.box
      let d = b
      if (n.fit !== 'fill' && n.iw > 0 && n.ih > 0) {
        const s = n.fit === 'cover' ? Math.max(b.w / n.iw, b.h / n.ih) : Math.min(b.w / n.iw, b.h / n.ih)
        const w = n.iw * s
        const h = n.ih * s
        d = { x: b.x + (b.w - w) / 2, y: b.y + (b.h - h) / 2, w, h }
      }
      const clip = n.fit === 'cover' || n.r > 0
      if (clip) {
        doc.saveGraphicsState()
        if (n.r > 0) doc.roundedRect(b.x, b.y, b.w, b.h, n.r, n.r, null)
        else doc.rect(b.x, b.y, b.w, b.h, null)
        doc.clip()
        doc.discardPath()
      }
      if (alpha < 1) setAlpha(alpha)
      doc.addImage(src, fmt, d.x, d.y, d.w, d.h, undefined, 'FAST')
      if (alpha < 1) setAlpha(1)
      if (clip) doc.restoreGraphicsState()
      return
    }
    if (n.t === 'svg') {
      host.innerHTML = n.markup
      const el = host.querySelector('svg')
      if (!el) return
      el.setAttribute('width', String(n.box.w))
      el.setAttribute('height', String(n.box.h))
      // A stretched logo: svg2pdf keeps proportions, so do the stretch with a transform instead.
      const vb = el.getAttribute('viewBox')?.split(/[\s,]+/).map(Number)
      if (el.getAttribute('preserveAspectRatio') === 'none' && vb?.length === 4 && vb[2] > 0 && vb[3] > 0) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
        g.setAttribute('transform', `scale(${n.box.w / vb[2]} ${n.box.h / vb[3]}) translate(${-vb[0]} ${-vb[1]})`)
        for (const c of Array.from(el.childNodes)) if (!(c instanceof SVGDefsElement || (c as Element).tagName === 'style')) g.appendChild(c)
        el.appendChild(g)
        el.setAttribute('viewBox', `0 0 ${n.box.w} ${n.box.h}`)
        el.removeAttribute('preserveAspectRatio')
      }
      if (alpha < 1) el.setAttribute('opacity', String(alpha))
      try {
        await doc.svg(el, { x: n.box.x, y: n.box.y, width: n.box.w, height: n.box.h })
      } catch (e) {
        console.warn('Skipped artwork that could not be converted', e)
      }
      host.innerHTML = ''
    }
  }

  try {
    for (const [i, p] of pages.entries()) {
      progress(`Writing page ${i + 1} of ${pages.length}`)
      if (i > 0) doc.addPage([p.w, p.h], orient(p))
      for (const n of p.nodes) await node(n, 1)
    }
  } finally {
    host.remove()
  }
  return { blob: doc.output('blob'), missingFonts: [...missing] }
}

// ---------------------------------------------------------------------------
// SVG

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const num = (v: number) => String(Math.round(v * 1000) / 1000)

function fill(c: Rgba | undefined, alpha: number, attr = 'fill') {
  if (!c) return `${attr}="none"`
  const a = c.a * alpha
  return `${attr}="${c.hex}"${a < 1 ? ` ${attr}-opacity="${num(a)}"` : ''}`
}

export function sceneToSvg(s: Scene, opts: { box?: { x: number; y: number; w: number; h: number } } = {}): string {
  let clipN = 0
  const box = opts.box ?? { x: 0, y: 0, w: s.w, h: s.h }
  const out = (n: SNode, alpha: number): string => {
    if (n.t === 'group') {
      const a = alpha * (n.opacity ?? 1)
      let clip = ''
      let attr = ''
      if (n.clip) {
        const id = `clip${clipN++}`
        const c = n.clip
        clip = `<clipPath id="${id}"><rect x="${num(c.x)}" y="${num(c.y)}" width="${num(c.w)}" height="${num(c.h)}"${c.r ? ` rx="${num(c.r)}"` : ''}/></clipPath>`
        attr = ` clip-path="url(#${id})"`
      }
      return `${clip}<g${attr}>${n.children.map((c) => out(c, a)).join('')}</g>`
    }
    if (n.t === 'rect') {
      const b = n.box
      const geo = `x="${num(b.x)}" y="${num(b.y)}" width="${num(b.w)}" height="${num(b.h)}"${n.r ? ` rx="${num(n.r)}"` : ''}`
      if (n.stroke) return `<rect ${geo} fill="none" ${fill(n.stroke, alpha, 'stroke')} stroke-width="${num(n.sw ?? 0)}"${n.dash ? ` stroke-dasharray="${num((n.sw ?? 0) * 3)} ${num((n.sw ?? 0) * 2)}"` : ''}/>`
      return `<rect ${geo} ${fill(n.fill, alpha)}/>`
    }
    if (n.t === 'text') {
      const f = n.font
      const generic = f.generic === 'serif' ? 'serif' : f.generic === 'mono' ? 'monospace' : 'sans-serif'
      return `<text x="${num(n.x)}" y="${num(n.y)}" font-family="'${esc(f.family)}', ${generic}" font-weight="${f.weight}"${f.italic ? ' font-style="italic"' : ''} font-size="${num(n.size)}"${n.spacing ? ` letter-spacing="${num(n.spacing)}"` : ''} ${fill(n.fill, alpha)} xml:space="preserve">${esc(n.text)}</text>`
    }
    if (n.t === 'image') {
      const b = n.box
      const par = n.fit === 'cover' ? 'xMidYMid slice' : n.fit === 'contain' ? 'xMidYMid meet' : 'none'
      let clip = ''
      let attr = ''
      if (n.r > 0) {
        const id = `clip${clipN++}`
        clip = `<clipPath id="${id}"><rect x="${num(b.x)}" y="${num(b.y)}" width="${num(b.w)}" height="${num(b.h)}" rx="${num(n.r)}"/></clipPath>`
        attr = ` clip-path="url(#${id})"`
      }
      return `${clip}<image href="${n.src}" x="${num(b.x)}" y="${num(b.y)}" width="${num(b.w)}" height="${num(b.h)}" preserveAspectRatio="${par}"${attr}${alpha < 1 ? ` opacity="${num(alpha)}"` : ''}/>`
    }
    // Nested artwork keeps its own viewBox and is placed in the box.
    const b = n.box
    return n.markup.replace(/^<svg\b/, `<svg x="${num(b.x)}" y="${num(b.y)}" width="${num(b.w)}" height="${num(b.h)}"${alpha < 1 ? ` opacity="${num(alpha)}"` : ''}`)
  }
  const body = s.nodes.map((n) => out(n, 1)).join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${num(box.w)}mm" height="${num(box.h)}mm" viewBox="${num(box.x)} ${num(box.y)} ${num(box.w)} ${num(box.h)}">` +
    body +
    `</svg>`
  )
}

// ---------------------------------------------------------------------------
// Bundles

export async function svgZip(pages: Scene[], name: string, progress: Progress): Promise<Blob> {
  const zip = new JSZip()
  pages.forEach((p, i) => {
    progress(`Writing SVG ${i + 1} of ${pages.length}`)
    zip.file(`${name} ${String(i + 1).padStart(2, '0')}.svg`, sceneToSvg(p))
  })
  return zip.generateAsync({ type: 'blob' })
}

export async function pngZip(pages: HTMLElement[], brand: Brand, name: string, progress: Progress, dpi = 300): Promise<Blob> {
  const zip = new JSZip()
  for (const [i, p] of pages.entries()) {
    progress(`Rendering PNG ${i + 1} of ${pages.length}`)
    zip.file(`${name} ${String(i + 1).padStart(2, '0')}.png`, await pagePng(p, brand, dpi))
  }
  return zip.generateAsync({ type: 'blob' })
}

export { pagePng, draw, preparePage, canvasBlob }
