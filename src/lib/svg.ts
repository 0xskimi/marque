import type { Logo } from '../types'
import { parsePath, type Seg } from './pathdata'

const SVG_NS = 'http://www.w3.org/2000/svg'

function parse(svg: string): SVGSVGElement {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const root = doc.documentElement as unknown as SVGSVGElement
  if (root.nodeName !== 'svg' || doc.querySelector('parsererror')) {
    throw new Error('That file is not a valid SVG.')
  }
  return root
}

function serialize(el: Element): string {
  return new XMLSerializer().serializeToString(el)
}

/** Mount SVG markup off-screen so geometry APIs (getBBox, getScreenCTM) work. */
function mount<T>(svg: string, fn: (root: SVGSVGElement) => T): T {
  const host = document.createElement('div')
  host.style.cssText = 'position:absolute;left:-10000px;top:0;width:1000px;height:1000px;visibility:hidden'
  host.innerHTML = svg
  document.body.appendChild(host)
  try {
    const root = host.querySelector('svg') as SVGSVGElement
    root.setAttribute('width', '1000')
    root.setAttribute('height', '1000')
    return fn(root)
  } finally {
    host.remove()
  }
}

/** Strip scripts and handlers, then crop the viewBox tight to the artwork. */
export function normalizeSvg(raw: string, fileName: string): Logo {
  const root = parse(raw)
  root.querySelectorAll('script, foreignObject').forEach((n) => n.remove())
  root.querySelectorAll('*').forEach((el) => {
    for (const a of Array.from(el.attributes)) if (/^on/i.test(a.name)) el.removeAttribute(a.name)
  })
  root.setAttribute('xmlns', SVG_NS)
  if (!root.getAttribute('viewBox')) {
    const w = parseFloat(root.getAttribute('width') || '0')
    const h = parseFloat(root.getAttribute('height') || '0')
    if (w && h) root.setAttribute('viewBox', `0 0 ${w} ${h}`)
  }
  root.removeAttribute('width')
  root.removeAttribute('height')
  const cleaned = serialize(root)

  const box = mount(cleaned, (svg) => {
    const b = svg.getBBox()
    let maxStroke = 0
    svg.querySelectorAll('*').forEach((el) => {
      const sw = parseFloat(getComputedStyle(el).strokeWidth || '0')
      const st = getComputedStyle(el).stroke
      if (st && st !== 'none' && sw > maxStroke) maxStroke = sw
    })
    const pad = maxStroke / 2
    return { x: b.x - pad, y: b.y - pad, width: b.width + pad * 2, height: b.height + pad * 2 }
  })
  if (!box.width || !box.height) throw new Error('The SVG has no visible artwork.')
  const r = (n: number) => Math.round(n * 1000) / 1000
  root.setAttribute('viewBox', `${r(box.x)} ${r(box.y)} ${r(box.width)} ${r(box.height)}`)
  return { svg: serialize(root), width: box.width, height: box.height, fileName }
}

export function hasLiveText(svg: string) {
  return /<text[\s>]/i.test(svg)
}

const COLOR_PROP = /(fill|stroke|stop-color)\s*:\s*([^;}"]+)/gi

/** Every visible fill and stroke becomes one colour (black, white, one-colour versions). */
export function recolor(svg: string, color: string): string {
  const root = parse(svg)
  const swap = (v: string | null) => (v && v.trim() !== 'none' ? color : v)
  root.querySelectorAll('style').forEach((s) => {
    s.textContent = (s.textContent || '').replace(COLOR_PROP, (m, prop, val) =>
      String(val).trim() === 'none' ? m : `${prop}:${color}`,
    )
  })
  root.querySelectorAll('*').forEach((el) => {
    for (const attr of ['fill', 'stroke', 'stop-color']) {
      const v = el.getAttribute(attr)
      if (v !== null) el.setAttribute(attr, swap(v) as string)
    }
    const style = el.getAttribute('style')
    if (style) {
      el.setAttribute(
        'style',
        style.replace(COLOR_PROP, (m, prop, val) => (String(val).trim() === 'none' ? m : `${prop}:${color}`)),
      )
    }
  })
  root.setAttribute('fill', color)
  return serialize(root)
}

/** Hairline outline of the artwork, used for the "don't outline" example. */
export function outlined(svg: string, color: string, width: number): string {
  const root = parse(svg)
  const style = document.createElementNS(SVG_NS, 'style')
  style.textContent = `*{fill:none!important;stroke:${color}!important;stroke-width:${width}px!important;vector-effect:non-scaling-stroke}`
  root.appendChild(style)
  return serialize(root)
}

const urlCache = new Map<string, string>()

export function svgUrl(svg: string): string {
  let url = urlCache.get(svg)
  if (!url) {
    url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
    urlCache.set(svg, url)
  }
  return url
}

export function viewBox(svg: string): [number, number, number, number] {
  const m = svg.match(/viewBox="([^"]+)"/)
  const v = (m ? m[1] : '0 0 100 100').split(/[\s,]+/).map(Number)
  return [v[0], v[1], v[2], v[3]]
}

/** Render to PNG at a given pixel width, optional background and padding. */
export async function rasterize(
  svg: string,
  width: number,
  opts: { height?: number; background?: string; padding?: number; type?: 'image/png' | 'image/jpeg' } = {},
): Promise<Blob> {
  const [, , vw, vh] = viewBox(svg)
  const pad = opts.padding ?? 0
  const W = width
  const H = opts.height ?? Math.round((width * vh) / vw)
  const img = new Image()
  // Give the SVG explicit pixel dimensions so browsers rasterise it sharply.
  const sized = svg.replace('<svg', `<svg width="${vw}" height="${vh}"`)
  img.src = svgUrl(sized)
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  if (opts.background) {
    ctx.fillStyle = opts.background
    ctx.fillRect(0, 0, W, H)
  }
  const availW = W - pad * 2
  const availH = H - pad * 2
  const scale = Math.min(availW / vw, availH / vh)
  const dw = vw * scale
  const dh = vh * scale
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh)
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Image export failed'))), opts.type ?? 'image/png', 0.92))
}

// ---------------------------------------------------------------------------
// Construction analysis: anchors, handles, construction circles, QA flags.
// ---------------------------------------------------------------------------

export interface Anchor {
  x: number
  y: number
  issue?: 'duplicate' | 'kink'
}
export interface Handle {
  x1: number
  y1: number
  x2: number
  y2: number
}
export interface Circle {
  cx: number
  cy: number
  r: number
}
export interface Construction {
  viewBox: [number, number, number, number]
  outlines: string[]
  anchors: Anchor[]
  handles: Handle[]
  circles: Circle[]
  issues: { duplicates: number; kinks: number }
}

const constructionCache = new Map<string, Construction>()

export function analyze(svg: string): Construction {
  const hit = constructionCache.get(svg)
  if (hit) return hit
  const vb = viewBox(svg)
  const size = Math.max(vb[2], vb[3])
  const eps = size * 0.0005
  const result: Construction = { viewBox: vb, outlines: [], anchors: [], handles: [], circles: [], issues: { duplicates: 0, kinks: 0 } }

  mount(svg, (root) => {
    const rootCtm = root.getScreenCTM()
    if (!rootCtm) return
    const inv = rootCtm.inverse()
    const shapes = root.querySelectorAll('path, rect, circle, ellipse, polygon, polyline, line')
    shapes.forEach((el) => {
      if (el.closest('defs, clipPath, mask')) return
      const ctm = (el as SVGGraphicsElement).getScreenCTM()
      if (!ctm) return
      const m = inv.multiply(ctm)
      const tx = (x: number, y: number) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f })
      const segs = shapeToSegs(el)
      collect(segs, tx, Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)))
    })
  })

  function collect(segs: Seg[], tx: (x: number, y: number) => { x: number; y: number }, scale: number) {
    let d = ''
    let prevOut: { x: number; y: number } | null = null // incoming handle direction at current point
    let cur = { x: 0, y: 0 }
    let start = { x: 0, y: 0 }
    for (const s of segs) {
      if (s.type === 'M') {
        cur = tx(s.x, s.y)
        start = cur
        prevOut = null
        d += `M${cur.x} ${cur.y}`
        result.anchors.push({ ...cur })
      } else if (s.type === 'L') {
        const p = tx(s.x, s.y)
        const dup = Math.hypot(p.x - cur.x, p.y - cur.y) < eps
        d += `L${p.x} ${p.y}`
        result.anchors.push(dup ? { ...p, issue: 'duplicate' } : { ...p })
        if (dup) result.issues.duplicates++
        prevOut = null
        cur = p
      } else if (s.type === 'C') {
        const c1 = tx(s.x1, s.y1)
        const c2 = tx(s.x2, s.y2)
        const p = tx(s.x, s.y)
        // Near-smooth join: handles almost but not quite collinear is usually a mistake.
        if (prevOut) {
          const a = { x: cur.x - prevOut.x, y: cur.y - prevOut.y }
          const b = { x: c1.x - cur.x, y: c1.y - cur.y }
          const la = Math.hypot(a.x, a.y)
          const lb = Math.hypot(b.x, b.y)
          if (la > eps && lb > eps) {
            const ang = (Math.acos(Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y) / (la * lb)))) * 180) / Math.PI
            if (ang > 0.4 && ang < 6) {
              const last = result.anchors[result.anchors.length - 1]
              if (last && !last.issue) {
                last.issue = 'kink'
                result.issues.kinks++
              }
            }
          }
        }
        const dup = Math.hypot(p.x - cur.x, p.y - cur.y) < eps && Math.hypot(c1.x - cur.x, c1.y - cur.y) < eps
        if (Math.hypot(c1.x - cur.x, c1.y - cur.y) > eps) result.handles.push({ x1: cur.x, y1: cur.y, x2: c1.x, y2: c1.y })
        if (Math.hypot(c2.x - p.x, c2.y - p.y) > eps) result.handles.push({ x1: p.x, y1: p.y, x2: c2.x, y2: c2.y })
        d += `C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p.x} ${p.y}`
        result.anchors.push(dup ? { ...p, issue: 'duplicate' } : { ...p })
        if (dup) result.issues.duplicates++
        if (s.arc) {
          const c = tx(s.arc.cx, s.arc.cy)
          result.circles.push({ cx: c.x, cy: c.y, r: s.arc.r * scale })
        } else {
          const fit = fitCircle(cur, c1, c2, p)
          if (fit && fit.r < size * 3) result.circles.push(fit)
        }
        prevOut = c2
        cur = p
      } else if (s.type === 'Z') {
        d += 'Z'
        // A closing point sitting on the start point is a duplicate anchor.
        const last = result.anchors[result.anchors.length - 1]
        if (last && Math.hypot(last.x - start.x, last.y - start.y) < eps && result.anchors.length > 1) {
          result.anchors.pop()
        }
        cur = start
        prevOut = null
      }
    }
    if (d) result.outlines.push(d)
  }

  result.circles = dedupeCircles(result.circles, size)
  constructionCache.set(svg, result)
  return result
}

function bez(p0: number, p1: number, p2: number, p3: number, t: number) {
  const u = 1 - t
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3
}

type P = { x: number; y: number }

function circleThrough(a: P, b: P, c: P): Circle | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y))
  if (Math.abs(d) < 1e-9) return null
  const a2 = a.x * a.x + a.y * a.y
  const b2 = b.x * b.x + b.y * b.y
  const c2 = c.x * c.x + c.y * c.y
  const cx = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d
  const cy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d
  return { cx, cy, r: Math.hypot(a.x - cx, a.y - cy) }
}

/** If a cubic segment is (close to) a circular arc, return that circle. */
function fitCircle(p0: P, c1: P, c2: P, p3: P): Circle | null {
  const at = (t: number) => ({ x: bez(p0.x, c1.x, c2.x, p3.x, t), y: bez(p0.y, c1.y, c2.y, p3.y, t) })
  const circle = circleThrough(p0, at(0.5), p3)
  if (!circle) return null
  for (const t of [0.2, 0.35, 0.65, 0.8]) {
    const q = at(t)
    if (Math.abs(Math.hypot(q.x - circle.cx, q.y - circle.cy) - circle.r) > circle.r * 0.004) return null
  }
  // Ignore tiny fillets; they clutter the drawing.
  if (Math.hypot(p3.x - p0.x, p3.y - p0.y) < circle.r * 0.25) return null
  return circle
}

function dedupeCircles(circles: Circle[], size: number): Circle[] {
  const tol = size * 0.01
  const out: Circle[] = []
  for (const c of circles.sort((a, b) => b.r - a.r)) {
    if (!out.some((o) => Math.abs(o.cx - c.cx) < tol && Math.abs(o.cy - c.cy) < tol && Math.abs(o.r - c.r) < tol)) out.push(c)
  }
  return out.slice(0, 30)
}

function num(el: Element, a: string) {
  return parseFloat(el.getAttribute(a) || '0')
}

function shapeToSegs(el: Element): Seg[] {
  switch (el.nodeName) {
    case 'path':
      return parsePath(el.getAttribute('d') || '')
    case 'rect': {
      const x = num(el, 'x'), y = num(el, 'y'), w = num(el, 'width'), h = num(el, 'height')
      const rx = num(el, 'rx') || num(el, 'ry')
      if (rx > 0) {
        const r = Math.min(rx, w / 2, h / 2)
        return parsePath(
          `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`,
        )
      }
      return parsePath(`M${x} ${y}H${x + w}V${y + h}H${x}Z`)
    }
    case 'circle':
    case 'ellipse': {
      const cx = num(el, 'cx'), cy = num(el, 'cy')
      const rx = el.nodeName === 'circle' ? num(el, 'r') : num(el, 'rx')
      const ry = el.nodeName === 'circle' ? num(el, 'r') : num(el, 'ry')
      return parsePath(`M${cx} ${cy - ry}A${rx} ${ry} 0 0 1 ${cx + rx} ${cy}A${rx} ${ry} 0 0 1 ${cx} ${cy + ry}A${rx} ${ry} 0 0 1 ${cx - rx} ${cy}A${rx} ${ry} 0 0 1 ${cx} ${cy - ry}Z`)
    }
    case 'line':
      return parsePath(`M${num(el, 'x1')} ${num(el, 'y1')}L${num(el, 'x2')} ${num(el, 'y2')}`)
    case 'polygon':
    case 'polyline': {
      const pts = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number)
      let d = ''
      for (let i = 0; i + 1 < pts.length; i += 2) d += (i ? 'L' : 'M') + pts[i] + ' ' + pts[i + 1]
      return parsePath(el.nodeName === 'polygon' ? d + 'Z' : d)
    }
  }
  return []
}
