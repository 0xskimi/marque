import type { Brand } from '../types'
import { draw, preparePage, toDataUrl, PX_PER_MM, type Prepared } from './raster'

/**
 * Turns a rendered page into plain drawing instructions (boxes, lines of text,
 * images, SVG artwork) in millimetres, read from the live layout. The vector PDF,
 * the .ai file and the SVG files are all written from this, so what you see on the
 * canvas is what lands in Illustrator: real text in the real font, real colour values,
 * and logos and shapes as vector paths.
 *
 * Effects a PDF can't express simply (rotation, filters, clip paths, gradients,
 * shadows) are drawn as high-resolution pictures of just that item.
 */

export interface Rgba {
  hex: string
  a: number
}

export interface FontKey {
  family: string
  weight: number
  italic: boolean
  generic: 'sans' | 'serif' | 'mono'
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export type SNode =
  | { t: 'rect'; box: Box; r: number; fill?: Rgba; stroke?: Rgba; sw?: number; dash?: boolean }
  | { t: 'text'; x: number; y: number; text: string; font: FontKey; size: number; fill: Rgba; spacing: number; /** Width the browser laid the line out at. */ width?: number }
  | { t: 'image'; box: Box; src: string; iw: number; ih: number; fit: 'fill' | 'cover' | 'contain'; r: number }
  | { t: 'svg'; box: Box; markup: string }
  | { t: 'group'; clip?: Box & { r: number }; opacity?: number; children: SNode[] }

export interface Scene {
  w: number
  h: number
  nodes: SNode[]
}

// ---------------------------------------------------------------------------
// Colours and fonts

export function parseColor(v: string): Rgba | null {
  const m = v.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/)
  if (!m) return null
  let a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])
  if (!(a > 0)) a = 0
  const hex = '#' + [m[1], m[2], m[3]].map((n) => Math.round(Number(n)).toString(16).padStart(2, '0')).join('').toUpperCase()
  return { hex, a }
}

const GENERIC = new Set(['sans-serif', 'serif', 'monospace', 'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', '-apple-system', 'blinkmacsystemfont', 'cursive', 'fantasy'])
const SYSTEM = new Set(['arial', 'helvetica', 'helvetica neue', 'times', 'times new roman', 'georgia', 'courier', 'courier new', 'verdana'])

let loadedFamilies: Set<string> | null = null
function loaded(): Set<string> {
  if (!loadedFamilies) {
    loadedFamilies = new Set()
    document.fonts.forEach((f) => {
      if (f.status === 'loaded') loadedFamilies!.add(f.family.replace(/^["']|["']$/g, '').toLowerCase())
    })
  }
  return loadedFamilies
}

export function fontKey(cs: CSSStyleDeclaration): FontKey {
  const stack = cs.fontFamily.split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''))
  const low = stack.map((s) => s.toLowerCase())
  const generic: FontKey['generic'] = low.includes('monospace') ? 'mono' : low.some((s) => s === 'serif' || s === 'ui-serif') ? 'serif' : 'sans'
  const family =
    stack.find((s) => loaded().has(s.toLowerCase())) ??
    stack.find((s) => SYSTEM.has(s.toLowerCase())) ??
    stack.find((s) => !GENERIC.has(s.toLowerCase())) ??
    (generic === 'serif' ? 'Times' : generic === 'mono' ? 'Courier' : 'Helvetica')
  const weight = Number(cs.fontWeight) || (cs.fontWeight === 'bold' ? 700 : 400)
  return { family, weight, italic: /italic|oblique/.test(cs.fontStyle), generic }
}

const metricCache = new Map<string, { asc: number; desc: number }>()
let measureCtx: CanvasRenderingContext2D | null = null

/** Ascent and descent per px of font size, as the browser lays the font out. */
function metrics(f: FontKey) {
  const key = `${f.family}|${f.weight}|${f.italic}`
  let m = metricCache.get(key)
  if (!m) {
    measureCtx ??= document.createElement('canvas').getContext('2d')!
    measureCtx.font = `${f.italic ? 'italic ' : ''}${f.weight} 100px "${f.family}", ${f.generic === 'serif' ? 'serif' : f.generic === 'mono' ? 'monospace' : 'sans-serif'}`
    const t = measureCtx.measureText('Hg')
    m = { asc: (t.fontBoundingBoxAscent || 80) / 100, desc: (t.fontBoundingBoxDescent || 20) / 100 }
    metricCache.set(key, m)
  }
  return m
}

function transformText(s: string, tt: string) {
  if (tt === 'uppercase') return s.toUpperCase()
  if (tt === 'lowercase') return s.toLowerCase()
  if (tt === 'capitalize') return s.replace(/(^|\s)(\S)/g, (_, a, b) => a + b.toUpperCase())
  return s
}

// ---------------------------------------------------------------------------
// What has to become a picture

function px(v: string) {
  return parseFloat(v) || 0
}

/** The item and everything in it becomes a picture. */
export function needsPicture(cs: CSSStyleDeclaration): boolean {
  if (cs.filter !== 'none' || cs.clipPath !== 'none' || cs.mixBlendMode !== 'normal') return true
  if (cs.maskImage && cs.maskImage !== 'none') return true
  if (cs.rotate && cs.rotate !== 'none') return true
  if (cs.transform !== 'none') {
    const m = new DOMMatrix(cs.transform)
    if (!m.is2D || Math.abs(m.b) > 1e-4 || Math.abs(m.c) > 1e-4) return true
  }
  return false
}

/** Only the item's own background (a gradient, or a drop shadow) becomes a picture; its contents stay vector. */
export function needsBackdrop(cs: CSSStyleDeclaration): boolean {
  if (/gradient\(/.test(cs.backgroundImage)) return true
  return cs.boxShadow !== 'none' && !/^inset/.test(cs.boxShadow) && cs.boxShadow.split(/,(?![^(]*\))/).some((s) => !/inset/.test(s))
}

const CHROME = ['sheet-bar', 'ly-h', 'ly-guide', 'ly-drop', 'ly-empty', 'mq-sel', 'gen-hover', 'trim-guide', 'print-label']

function isChrome(el: Element) {
  return CHROME.some((c) => el.classList.contains(c))
}

// ---------------------------------------------------------------------------
// SVG artwork

const SVG_PROPS = ['fill', 'stroke', 'stroke-width', 'opacity', 'fill-opacity', 'stroke-opacity', 'font-family', 'font-size', 'font-weight', 'stop-color', 'stop-opacity'] as const

let svgSeq = 0

/** A standalone copy of an inline <svg>, with computed paint baked in and photos inlined. */
async function svgMarkup(el: SVGSVGElement): Promise<string> {
  const clone = el.cloneNode(true) as SVGSVGElement
  const src = [el, ...Array.from(el.querySelectorAll('*'))]
  const dst = [clone, ...Array.from(clone.querySelectorAll('*'))]
  const jobs: Promise<void>[] = []
  src.forEach((s, i) => {
    const d = dst[i] as SVGElement
    const cs = getComputedStyle(s)
    if (cs.display === 'none' || cs.visibility === 'hidden') {
      d.setAttribute('display', 'none')
      return
    }
    for (const p of SVG_PROPS) {
      const v = cs.getPropertyValue(p)
      if (!v) continue
      if ((p === 'fill' || p === 'stroke') && /^url\(/.test(v)) d.setAttribute(p, v.replace(/url\(["']?[^#]*(#[^"')]+)["']?\)/, 'url($1)'))
      else if (p === 'font-size' && s instanceof SVGElement && !(s instanceof SVGTextContentElement)) continue
      else if (p.startsWith('font') && !(s instanceof SVGTextContentElement)) continue
      else if (p.startsWith('stop') && s.tagName !== 'stop') continue
      else d.setAttribute(p, v)
    }
    if (d.tagName === 'image') {
      const href = d.getAttribute('href') ?? d.getAttribute('xlink:href')
      if (href && !href.startsWith('data:')) jobs.push(toDataUrl(new URL(href, location.href).href).then((u) => d.setAttribute('href', u)))
    }
  })
  await Promise.all(jobs)
  const cs = getComputedStyle(el)
  if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${px(cs.width)} ${px(cs.height)}`)
  // Placement and size come from the box it is drawn into.
  for (const a of ['style', 'class', 'width', 'height', 'x', 'y']) clone.removeAttribute(a)
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
  let s = new XMLSerializer().serializeToString(clone)
  // Ids must stay unique once several pieces of artwork share one file.
  const pre = `a${(svgSeq++).toString(36)}-`
  s = s.replace(/\bid="([^"]+)"/g, `id="${pre}$1"`).replace(/url\(#([^)]+)\)/g, `url(#${pre}$1)`).replace(/href="#([^"]+)"/g, `href="#${pre}$1"`)
  return s
}

export function svgFromDataUrl(src: string): string | null {
  const m = src.match(/^data:image\/svg\+xml(;base64)?(?:;charset=[^,]*)?,(.*)$/s)
  if (!m) return null
  try {
    return m[1] ? atob(m[2]) : decodeURIComponent(m[2])
  } catch {
    return null
  }
}

/** Sizes a standalone SVG to a box, keeping the fit the page used. */
function fitSvg(svg: string, fit: string): string {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const root = doc.documentElement
  if (root.tagName !== 'svg') return svg
  if (!root.getAttribute('viewBox')) {
    const w = px(root.getAttribute('width') ?? '100')
    const h = px(root.getAttribute('height') ?? '100')
    root.setAttribute('viewBox', `0 0 ${w} ${h}`)
  }
  root.setAttribute('preserveAspectRatio', fit === 'fill' ? 'none' : fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet')
  root.removeAttribute('width')
  root.removeAttribute('height')
  let s = new XMLSerializer().serializeToString(root)
  const pre = `a${(svgSeq++).toString(36)}-`
  s = s.replace(/\bid="([^"]+)"/g, `id="${pre}$1"`).replace(/url\(#([^)]+)\)/g, `url(#${pre}$1)`).replace(/href="#([^"]+)"/g, `href="#${pre}$1"`)
  return s
}

// ---------------------------------------------------------------------------
// The walk

export interface FlattenOptions {
  brand: Brand
  /** Resolution for effects kept as pictures. */
  dpi?: number
}

export function pageOf(sheet: HTMLElement): HTMLElement {
  return sheet.matches('.print-sheet') ? sheet : (sheet.querySelector<HTMLElement>(':scope > section') ?? sheet)
}

/** Flattens one page (a `.sheet` with its layers, or a `.print-sheet`), or just one item of it. */
export async function flatten(sheet: HTMLElement, opts: FlattenOptions, only?: Element): Promise<Scene> {
  loadedFamilies = null
  const page = pageOf(sheet)
  const R = page.getBoundingClientRect()
  const pcs = getComputedStyle(page)
  const cssW = parseFloat(pcs.width) || page.offsetWidth
  const cssH = parseFloat(pcs.height) || page.offsetHeight
  const pageW = Math.round((cssW / PX_PER_MM) * 100) / 100
  const pageH = Math.round((cssH / PX_PER_MM) * 100) / 100
  const k = pageW / R.width // mm per screen px
  const zoom = R.width / cssW // screen px per CSS px
  const box = (r: { left: number; top: number; width: number; height: number }): Box => ({
    x: (r.left - R.left) * k,
    y: (r.top - R.top) * k,
    w: r.width * k,
    h: r.height * k,
  })

  // Find the effects first, so the page is copied once with all of them tagged.
  const pictures = new Map<Element, 'whole' | 'own'>()
  const roots = only ? [only] : [page, ...Array.from(sheet.querySelectorAll(':scope > .layers'))]
  for (const root of roots) {
    const all = [root, ...Array.from(root.querySelectorAll('*'))]
    for (const el of all) {
      if (el === page || el instanceof SVGElement && !(el instanceof SVGSVGElement)) continue
      if (Array.from(pictures.entries()).some(([p, m]) => m === 'whole' && p.contains(el))) continue
      const cs = getComputedStyle(el)
      if (cs.display === 'none') continue
      if (needsPicture(cs)) pictures.set(el, 'whole')
      else if (needsBackdrop(cs)) pictures.set(el, 'own')
    }
  }
  let prepared: Prepared | null = null
  const ids = new Map<Element, string>()
  if (pictures.size) {
    let n = 0
    pictures.forEach((_, el) => ids.set(el, `p${n++}`))
    prepared = await preparePage(sheet, opts.brand, () => {
      ids.forEach((id, el) => el.setAttribute('data-mq', id))
      return () => ids.forEach((_, el) => el.removeAttribute('data-mq'))
    })
  }
  const scale = (opts.dpi ?? 300) / 96

  async function picture(el: Element, mode: 'whole' | 'own'): Promise<SNode | null> {
    if (!prepared) return null
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    const nums = `${cs.boxShadow} ${cs.filter}`.match(/-?[\d.]+px/g)?.map((v) => Math.abs(parseFloat(v))) ?? []
    const margin = Math.min(80, nums.reduce((a, b) => a + b, 0)) + 2
    const x = Math.max(0, (r.left - R.left) / zoom - margin)
    const y = Math.max(0, (r.top - R.top) / zoom - margin)
    const w = Math.min(prepared.w, (r.right - R.left) / zoom + margin) - x
    const h = Math.min(prepared.h, (r.bottom - R.top) / zoom + margin) - y
    if (w <= 0 || h <= 0) return null
    const id = ids.get(el)
    const css =
      `.mq-root .sheet, .mq-root .sheet *, .mq-root .print-sheet, .mq-root .print-sheet * { visibility: hidden !important; }\n` +
      (mode === 'whole'
        ? `.mq-root [data-mq="${id}"], .mq-root [data-mq="${id}"] * { visibility: visible !important; }\n`
        : `.mq-root [data-mq="${id}"] { visibility: visible !important; color: transparent !important; outline: none !important; }\n`) +
      `.mq-root [data-mq-hidden] { visibility: hidden !important; }`
    const canvas = await draw(prepared, scale, css, { x, y, w, h })
    return { t: 'image', box: { x: x / PX_PER_MM, y: y / PX_PER_MM, w: w / PX_PER_MM, h: h / PX_PER_MM }, src: canvas.toDataURL('image/png'), iw: canvas.width, ih: canvas.height, fit: 'fill', r: 0 }
  }

  function radius(cs: CSSStyleDeclaration, b: Box, f: number) {
    const v = cs.borderTopLeftRadius
    if (v.endsWith('%')) return (Math.min(b.w, b.h) * parseFloat(v)) / 100
    return Math.min(px(v) * f * k, Math.min(b.w, b.h) / 2)
  }

  function paintBox(cs: CSSStyleDeclaration, b: Box, f: number, out: SNode[], outline = true) {
    const r = radius(cs, b, f)
    const bg = parseColor(cs.backgroundColor)
    const sides = (['Top', 'Right', 'Bottom', 'Left'] as const).map((s) => ({
      w: cs.getPropertyValue(`border-${s.toLowerCase()}-style`) === 'none' ? 0 : px(cs.getPropertyValue(`border-${s.toLowerCase()}-width`)) * f * k,
      c: parseColor(cs.getPropertyValue(`border-${s.toLowerCase()}-color`)),
      dash: /dashed|dotted/.test(cs.getPropertyValue(`border-${s.toLowerCase()}-style`)),
    }))
    if (bg && bg.a > 0) out.push({ t: 'rect', box: b, r, fill: bg })
    const uniform = sides.every((s) => s.w === sides[0].w && s.c?.hex === sides[0].c?.hex && s.c?.a === sides[0].c?.a)
    if (uniform && sides[0].w > 0 && sides[0].c && sides[0].c.a > 0) {
      const w = sides[0].w
      out.push({ t: 'rect', box: { x: b.x + w / 2, y: b.y + w / 2, w: b.w - w, h: b.h - w }, r: Math.max(0, r - w / 2), stroke: sides[0].c, sw: w, dash: sides[0].dash })
    } else {
      const [t, rt, bt, l] = sides
      const edge = (s: (typeof sides)[number], bx: Box) => s.w > 0 && s.c && s.c.a > 0 && out.push({ t: 'rect', box: bx, r: 0, fill: s.c })
      edge(t, { x: b.x, y: b.y, w: b.w, h: t.w })
      edge(bt, { x: b.x, y: b.y + b.h - bt.w, w: b.w, h: bt.w })
      edge(l, { x: b.x, y: b.y, w: l.w, h: b.h })
      edge(rt, { x: b.x + b.w - rt.w, y: b.y, w: rt.w, h: b.h })
    }
    if (outline && cs.outlineStyle !== 'none' && px(cs.outlineWidth) > 0) {
      const c = parseColor(cs.outlineColor)
      const w = px(cs.outlineWidth) * f * k
      const o = px(cs.outlineOffset) * f * k + w / 2
      if (c && c.a > 0) out.push({ t: 'rect', box: { x: b.x - o, y: b.y - o, w: b.w + 2 * o, h: b.h + 2 * o }, r: r ? r + o : 0, stroke: c, sw: w })
    }
  }

  function pseudo(el: Element, which: '::before' | '::after', f: number, out: SNode[]) {
    const pcs = getComputedStyle(el, which)
    if (!pcs.content || pcs.content === 'none' || pcs.content === 'normal' || pcs.display === 'none') return
    if (pcs.position !== 'absolute') return
    const er = el.getBoundingClientRect()
    const ecs = getComputedStyle(el)
    const w = px(pcs.width) + px(pcs.paddingLeft) + px(pcs.paddingRight) + px(pcs.borderLeftWidth) + px(pcs.borderRightWidth)
    const h = px(pcs.height) + px(pcs.paddingTop) + px(pcs.paddingBottom) + px(pcs.borderTopWidth) + px(pcs.borderBottomWidth)
    const left = pcs.left !== 'auto' ? px(pcs.left) : (el as HTMLElement).offsetWidth - px(ecs.borderLeftWidth) - px(ecs.borderRightWidth) - px(pcs.right) - w
    const top = pcs.top !== 'auto' ? px(pcs.top) : (el as HTMLElement).offsetHeight - px(ecs.borderTopWidth) - px(ecs.borderBottomWidth) - px(pcs.bottom) - h
    const b = box({ left: er.left + (px(ecs.borderLeftWidth) + left) * f, top: er.top + (px(ecs.borderTopWidth) + top) * f, width: w * f, height: h * f })
    if (/gradient\(/.test(pcs.backgroundImage)) return
    paintBox(pcs, b, f, out)
  }

  /** Lines of text from a run of adjacent text nodes (React splits `with {n} points` into three). */
  function text(nodes: Text[], cs: CSSStyleDeclaration, out: SNode[]) {
    const s = nodes.map((n) => n.nodeValue ?? '').join('')
    if (!s.trim() || cs.visibility === 'hidden') return
    const fill = parseColor(cs.color)
    if (!fill || fill.a === 0) return
    const font = fontKey(cs)
    const met = metrics(font)
    const pre = /^pre/.test(cs.whiteSpace) || cs.whiteSpace === 'break-spaces'
    // Map an index in the joined string back to its node.
    const starts: number[] = []
    let acc = 0
    for (const n of nodes) {
      starts.push(acc)
      acc += (n.nodeValue ?? '').length
    }
    const at = (i: number, end: boolean): [Text, number] => {
      let j = nodes.length - 1
      while (j > 0 && (starts[j] > i || (end && starts[j] === i))) j--
      return [nodes[j], i - starts[j]]
    }
    const range = document.createRange()
    const measure = (a: number, b: number) => {
      range.setStart(...at(a, false))
      range.setEnd(...at(b, true))
      return Array.from(range.getClientRects()).filter((r) => r.width > 0)
    }
    type W = { start: number; end: number; r: DOMRect }
    const lines: W[][] = []
    const addWord = (w: W, glued: boolean) => {
      const line = lines[lines.length - 1]
      const last = line?.[line.length - 1]
      if (last && Math.abs(last.r.top - w.r.top) < w.r.height * 0.5 && w.r.left >= last.r.left - 1) {
        if (glued && last.end === w.start) {
          last.end = w.end
          last.r = DOMRect.fromRect({ x: last.r.left, y: last.r.top, width: w.r.right - last.r.left, height: last.r.height })
        } else line.push(w)
      } else lines.push([w])
    }
    for (const m of s.matchAll(/\S+/g)) {
      const a = m.index!
      const b = a + m[0].length
      const rects = measure(a, b)
      if (!rects.length) continue
      // A word broken across lines, or across nodes, is measured per character.
      if (rects.length > 1) {
        for (let i = a; i < b; i++) {
          const r = measure(i, i + 1)[0]
          if (r) addWord({ start: i, end: i + 1, r }, true)
        }
        continue
      }
      addWord({ start: a, end: b, r: rects[0] }, false)
    }
    const spacingPx = cs.letterSpacing === 'normal' ? 0 : px(cs.letterSpacing)
    const fsCss = px(cs.fontSize) || 16
    for (const line of lines) {
      const first = line[0]
      const last = line[line.length - 1]
      const raw = s.slice(first.start, last.end)
      const str = transformText(pre ? raw : raw.replace(/\s+/g, ' '), cs.textTransform)
      const em = first.r.height / (met.asc + met.desc) // font size in screen px
      const b = box(first.r)
      if (b.x > pageW || b.y > pageH || b.x + b.w < 0 || b.y + b.h < 0) continue
      out.push({
        t: 'text',
        x: b.x,
        y: b.y + b.h * (met.asc / (met.asc + met.desc)),
        text: str,
        font,
        size: em * k,
        fill,
        spacing: spacingPx * (em / fsCss) * k,
        width: (last.r.right - first.r.left) * k,
      })
    }
  }

  async function walk(el: Element, out: SNode[], fParent: number) {
    if (isChrome(el)) return
    const cs = getComputedStyle(el)
    if (cs.display === 'none') return
    const r = el.getBoundingClientRect()
    const f = el instanceof HTMLElement && el.offsetWidth > 0 ? r.width / el.offsetWidth : fParent
    const mode = el === page ? undefined : pictures.get(el)
    if (mode === 'whole') {
      const p = await picture(el, 'whole')
      if (p) out.push(p)
      return
    }
    const opacity = px(cs.opacity) || (cs.opacity === '0' ? 0 : 1)
    if (opacity === 0) return
    const b = box(r)
    let target = out
    const clips = el !== page && cs.overflow !== 'visible' && el instanceof HTMLElement
    if (opacity < 1 || clips) {
      const g: SNode = { t: 'group', children: [] }
      if (opacity < 1) g.opacity = opacity
      if (clips) g.clip = { ...b, r: radius(cs, b, f) }
      out.push(g)
      target = g.children
    }
    if (mode === 'own') {
      const p = await picture(el, 'own')
      if (p) target.push(p)
    }
    const visible = cs.visibility !== 'hidden'
    // Selection outlines on layers are editor chrome, not artwork.
    if (visible && el instanceof HTMLElement) paintBox(cs, b, f, target, !el.matches('.ly, .layers'))

    if (el instanceof SVGSVGElement) {
      if (visible) target.push({ t: 'svg', box: b, markup: await svgMarkup(el) })
      return
    }
    if (el instanceof HTMLImageElement) {
      if (!visible || !el.currentSrc) return
      const pl = px(cs.paddingLeft) + px(cs.borderLeftWidth)
      const pt = px(cs.paddingTop) + px(cs.borderTopWidth)
      // Separate x and y scale: the image may be stretched by a transform.
      const fx = el.offsetWidth ? r.width / el.offsetWidth : f
      const fy = el.offsetHeight ? r.height / el.offsetHeight : f
      const inner = box({
        left: r.left + pl * fx,
        top: r.top + pt * fy,
        width: r.width - (pl + px(cs.paddingRight) + px(cs.borderRightWidth)) * fx,
        height: r.height - (pt + px(cs.paddingBottom) + px(cs.borderBottomWidth)) * fy,
      })
      const fit = (cs.objectFit === 'cover' || cs.objectFit === 'contain' ? cs.objectFit : cs.objectFit === 'scale-down' ? 'contain' : 'fill') as 'fill' | 'cover' | 'contain'
      const svg = svgFromDataUrl(el.currentSrc)
      if (svg) target.push({ t: 'svg', box: inner, markup: fitSvg(svg, fit) })
      else {
        const src = await toDataUrl(el.currentSrc)
        if (src) target.push({ t: 'image', box: inner, src, iw: el.naturalWidth, ih: el.naturalHeight, fit, r: radius(cs, b, f) })
      }
      return
    }
    if (el instanceof HTMLCanvasElement) {
      if (visible) target.push({ t: 'image', box: b, src: el.toDataURL('image/png'), iw: el.width, ih: el.height, fit: 'fill', r: 0 })
      return
    }
    if (visible && el instanceof HTMLElement && mode !== 'own') {
      const url = cs.backgroundImage.match(/^url\(["']?(.+?)["']?\)$/)?.[1]
      if (url) {
        const fit = cs.backgroundSize === 'contain' ? 'contain' : cs.backgroundSize === 'cover' ? 'cover' : 'fill'
        const svg = svgFromDataUrl(url)
        if (svg) target.push({ t: 'svg', box: b, markup: fitSvg(svg, fit) })
        else {
          const src = await toDataUrl(url)
          const dim = await new Promise<[number, number]>((res) => {
            const im = new Image()
            im.onload = () => res([im.naturalWidth, im.naturalHeight])
            im.onerror = () => res([1, 1])
            im.src = src
          })
          if (src) target.push({ t: 'image', box: b, src, iw: dim[0], ih: dim[1], fit, r: radius(cs, b, f) })
        }
      }
    }
    if (visible) pseudo(el, '::before', f, target)
    let run: Text[] = []
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        run.push(child as Text)
        continue
      }
      if (run.length) text(run, cs, target)
      run = []
      if (child instanceof Element) await walk(child, target, f)
    }
    if (run.length) text(run, cs, target)
    if (visible) pseudo(el, '::after', f, target)
  }

  const nodes: SNode[] = []
  if (only) await walk(only, nodes, 1)
  else {
    await walk(page, nodes, 1)
    for (const l of Array.from(sheet.querySelectorAll(':scope > .layers'))) await walk(l, nodes, 1)
  }
  return { w: pageW, h: pageH, nodes }
}

/** Every font a scene uses. */
export function sceneFonts(s: Scene): FontKey[] {
  const seen = new Map<string, FontKey>()
  const visit = (n: SNode) => {
    if (n.t === 'text') seen.set(`${n.font.family}|${n.font.weight}|${n.font.italic}`, n.font)
    if (n.t === 'group') n.children.forEach(visit)
  }
  s.nodes.forEach(visit)
  return [...seen.values()]
}
