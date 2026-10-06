import type { Brand } from '../types'
import { estimateCmyk, hexToRgb, normHex } from './color'
import { parsePath, type Seg } from './pathdata'
import { viewBox } from './svg'

/**
 * Print-ready vector output. The logo is flattened in the browser into plain
 * filled and stroked paths, then written straight to PDF and EPS so colours
 * can be CMYK process or Pantone spot, which an SVG-to-PDF converter can't do.
 */

export interface Shape {
  segs: Seg[]
  color: string
  opacity: number
  paint: { kind: 'fill'; evenodd: boolean } | { kind: 'stroke'; width: number; cap: number; join: number; miter: number }
}

export interface Flat {
  shapes: Shape[]
  width: number
  height: number
  /** Features the writers can't reproduce faithfully. Empty means print files are exact. */
  issues: string[]
}

export type InkMode = 'rgb' | 'cmyk' | 'spot'

export interface Ink {
  kind: 'rgb' | 'cmyk' | 'spot'
  rgb: [number, number, number]
  cmyk: [number, number, number, number]
  name?: string
}

const GEOMETRY = 'path, rect, circle, ellipse, line, polyline, polygon'
const SKIP_INSIDE = 'defs, clipPath, mask, symbol, pattern, marker'

function parseColor(v: string): string | null {
  const m = v.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/)
  if (!m) return null
  return '#' + [m[1], m[2], m[3]].map((n) => Math.round(+n).toString(16).padStart(2, '0')).join('').toUpperCase()
}

function shapeSegs(el: Element): Seg[] {
  const n = (a: string) => parseFloat(el.getAttribute(a) || '0') || 0
  const K = 0.5522847498
  const ellipse = (cx: number, cy: number, rx: number, ry: number): Seg[] => [
    { type: 'M', x: cx + rx, y: cy },
    { type: 'C', x1: cx + rx, y1: cy + ry * K, x2: cx + rx * K, y2: cy + ry, x: cx, y: cy + ry },
    { type: 'C', x1: cx - rx * K, y1: cy + ry, x2: cx - rx, y2: cy + ry * K, x: cx - rx, y: cy },
    { type: 'C', x1: cx - rx, y1: cy - ry * K, x2: cx - rx * K, y2: cy - ry, x: cx, y: cy - ry },
    { type: 'C', x1: cx + rx * K, y1: cy - ry, x2: cx + rx, y2: cy - ry * K, x: cx + rx, y: cy },
    { type: 'Z' },
  ]
  const points = () => (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number)
  switch (el.tagName.toLowerCase()) {
    case 'path':
      return parsePath(el.getAttribute('d') || '')
    case 'circle':
      return ellipse(n('cx'), n('cy'), n('r'), n('r'))
    case 'ellipse':
      return ellipse(n('cx'), n('cy'), n('rx'), n('ry'))
    case 'line':
      return [{ type: 'M', x: n('x1'), y: n('y1') }, { type: 'L', x: n('x2'), y: n('y2') }]
    case 'polyline':
    case 'polygon': {
      const p = points()
      const segs: Seg[] = []
      for (let i = 0; i + 1 < p.length; i += 2) segs.push({ type: i ? 'L' : 'M', x: p[i], y: p[i + 1] })
      if (el.tagName.toLowerCase() === 'polygon') segs.push({ type: 'Z' })
      return segs
    }
    case 'rect': {
      const x = n('x'), y = n('y'), w = n('width'), h = n('height')
      let rx = el.hasAttribute('rx') ? n('rx') : n('ry')
      let ry = el.hasAttribute('ry') ? n('ry') : rx
      rx = Math.min(rx, w / 2)
      ry = Math.min(ry, h / 2)
      if (!rx || !ry) {
        return [{ type: 'M', x, y }, { type: 'L', x: x + w, y }, { type: 'L', x: x + w, y: y + h }, { type: 'L', x, y: y + h }, { type: 'Z' }]
      }
      const kx = rx * K, ky = ry * K
      return [
        { type: 'M', x: x + rx, y },
        { type: 'L', x: x + w - rx, y },
        { type: 'C', x1: x + w - rx + kx, y1: y, x2: x + w, y2: y + ry - ky, x: x + w, y: y + ry },
        { type: 'L', x: x + w, y: y + h - ry },
        { type: 'C', x1: x + w, y1: y + h - ry + ky, x2: x + w - rx + kx, y2: y + h, x: x + w - rx, y: y + h },
        { type: 'L', x: x + rx, y: y + h },
        { type: 'C', x1: x + rx - kx, y1: y + h, x2: x, y2: y + h - ry + ky, x, y: y + h - ry },
        { type: 'L', x, y: y + ry },
        { type: 'C', x1: x, y1: y + ry - ky, x2: x + rx - kx, y2: y, x: x + rx, y },
        { type: 'Z' },
      ]
    }
  }
  return []
}

function transform(segs: Seg[], m: DOMMatrix): Seg[] {
  const p = (x: number, y: number) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]
  return segs.map((s) => {
    if (s.type === 'Z') return s
    if (s.type === 'C') {
      const [x1, y1] = p(s.x1, s.y1)
      const [x2, y2] = p(s.x2, s.y2)
      const [x, y] = p(s.x, s.y)
      return { type: 'C', x1, y1, x2, y2, x, y }
    }
    const [x, y] = p(s.x, s.y)
    return { type: s.type, x, y }
  })
}

/** Mount the SVG at 1 unit = 1 CSS px and read every painted path with its final transform and colour. */
export function flatten(svg: string): Flat {
  const [, , w, h] = viewBox(svg)
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:0;top:0;opacity:0;pointer-events:none;z-index:-1'
  host.innerHTML = svg
  document.body.appendChild(host)
  const issues = new Set<string>()
  const shapes: Shape[] = []
  try {
    const root = host.querySelector('svg') as SVGSVGElement
    root.setAttribute('width', String(w))
    root.setAttribute('height', String(h))
    root.style.cssText = 'display:block;overflow:visible'
    const origin = root.getBoundingClientRect()
    if (root.querySelector('text')) issues.add('live text (outline it in Illustrator first)')
    if (root.querySelector('image')) issues.add('embedded bitmap images')
    if (root.querySelector('use')) issues.add('<use> references (expand them first)')
    root.querySelectorAll('[clip-path], [mask]').forEach(() => issues.add('clipping paths or masks'))
    if (root.querySelector('filter')) issues.add('filters or effects')

    root.querySelectorAll(GEOMETRY).forEach((el) => {
      if (el.parentElement?.closest(SKIP_INSIDE)) return
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden') return
      let opacity = 1
      for (let n: Element | null = el; n && n !== root.parentElement; n = n.parentElement) opacity *= parseFloat(getComputedStyle(n).opacity || '1')
      if (opacity <= 0) return
      const ctm = (el as SVGGraphicsElement).getScreenCTM()
      if (!ctm) return
      const m = new DOMMatrix([ctm.a, ctm.b, ctm.c, ctm.d, ctm.e - origin.left, ctm.f - origin.top])
      const segs = transform(shapeSegs(el), m)
      if (!segs.length) return

      const fill = cs.fill
      if (fill && fill !== 'none' && el.tagName.toLowerCase() !== 'line' && el.tagName.toLowerCase() !== 'polyline') {
        const color = parseColor(fill)
        if (!color) issues.add('gradient or pattern fills')
        else {
          const fo = opacity * parseFloat(cs.fillOpacity || '1')
          shapes.push({ segs, color, opacity: fo, paint: { kind: 'fill', evenodd: cs.fillRule === 'evenodd' } })
        }
      } else if (fill && fill !== 'none' && el.tagName.toLowerCase() === 'polyline') {
        const color = parseColor(fill)
        if (color) shapes.push({ segs: [...segs, { type: 'Z' }], color, opacity, paint: { kind: 'fill', evenodd: cs.fillRule === 'evenodd' } })
      }
      const stroke = cs.stroke
      const sw = parseFloat(cs.strokeWidth || '0')
      if (stroke && stroke !== 'none' && sw > 0) {
        const color = parseColor(stroke)
        if (!color) issues.add('gradient strokes')
        else {
          if (cs.strokeDasharray && cs.strokeDasharray !== 'none') issues.add('dashed strokes')
          if (cs.vectorEffect === 'non-scaling-stroke') issues.add('non-scaling strokes')
          const scale = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c))
          shapes.push({
            segs,
            color,
            opacity: opacity * parseFloat(cs.strokeOpacity || '1'),
            paint: {
              kind: 'stroke',
              width: sw * scale,
              cap: ({ butt: 0, round: 1, square: 2 } as Record<string, number>)[cs.strokeLinecap] ?? 0,
              join: ({ miter: 0, round: 1, bevel: 2 } as Record<string, number>)[cs.strokeLinejoin] ?? 0,
              miter: parseFloat(cs.strokeMiterlimit || '4'),
            },
          })
        }
      }
    })
  } finally {
    host.remove()
  }
  if (!shapes.length) issues.add('no paths found')
  return { shapes, width: w, height: h, issues: [...issues] }
}

// ---------------------------------------------------------------------------
// Ink mapping: brand colours carry your swatch-book CMYK and Pantone values.

/** "C100 M72 Y0 K18", "100/72/0/18" or "100, 72, 0, 18" → fractions. */
export function parseCmyk(s?: string): [number, number, number, number] | null {
  const nums = (s || '').match(/\d+(?:\.\d+)?/g)
  if (!nums || nums.length !== 4) return null
  const v = nums.map(Number)
  if (v.some((n) => n > 100)) return null
  return v as [number, number, number, number]
}

export function inkFor(hex: string, b: Brand, mode: InkMode): Ink {
  const h = normHex(hex)
  const rgb = hexToRgb(h)
  const match = b.colors.find((c) => normHex(c.hex) === h)
  const cmyk100 = (match && parseCmyk(match.cmyk)) || (h === '#000000' ? [0, 0, 0, 100] : estimateCmyk(h))
  const cmyk = cmyk100.map((v) => v / 100) as Ink['cmyk']
  if (mode === 'rgb') return { kind: 'rgb', rgb, cmyk }
  if (mode === 'spot' && match?.pantone && h !== '#FFFFFF') {
    const p = ascii(match.pantone).trim()
    const name = /pantone/i.test(p) ? p : `PANTONE ${p}`
    return { kind: 'spot', rgb, cmyk, name }
  }
  return { kind: 'cmyk', rgb, cmyk }
}

/** True when the given artwork would print at least one Pantone ink. */
export function hasSpot(flat: Flat, b: Brand) {
  return flat.shapes.some((s) => inkFor(s.color, b, 'spot').kind === 'spot')
}

/** Every colour used in the artwork that falls back to an estimated CMYK mix. */
export function estimatedInks(svgs: string[], b: Brand): string[] {
  const out = new Set<string>()
  for (const svg of svgs) {
    for (const s of flatten(svg).shapes) {
      const h = normHex(s.color)
      if (h === '#000000' || h === '#FFFFFF') continue
      const match = b.colors.find((c) => normHex(c.hex) === h)
      if (!match || !parseCmyk(match.cmyk)) out.add(match ? `${match.name} (${h})` : h)
    }
  }
  return [...out]
}

// ---------------------------------------------------------------------------
// Writers. Output is scaled so the longest side is `size` points.

/** PDF and EPS bodies are written as Latin-1 bytes, so names stay ASCII. */
const ascii = (s = '') => s.normalize('NFKD').replace(/[^\x20-\x7e]/g, '')

const f = (n: number) => (Math.round(n * 1000) / 1000).toString()

function pathOps(segs: Seg[], ops: { m: string; l: string; c: string; z: string }): string {
  return segs
    .map((s) => {
      if (s.type === 'M') return `${f(s.x)} ${f(s.y)} ${ops.m}`
      if (s.type === 'L') return `${f(s.x)} ${f(s.y)} ${ops.l}`
      if (s.type === 'C') return `${f(s.x1)} ${f(s.y1)} ${f(s.x2)} ${f(s.y2)} ${f(s.x)} ${f(s.y)} ${ops.c}`
      return ops.z
    })
    .join('\n')
}

function pdfName(s: string) {
  return '/' + s.replace(/[^A-Za-z0-9_.-]/g, (ch) => '#' + ch.charCodeAt(0).toString(16).padStart(2, '0'))
}

function psString(s: string) {
  return '(' + s.replace(/[\\()]/g, (c) => '\\' + c) + ')'
}

export function toPdf(flat: Flat, b: Brand, mode: InkMode, size = 500, title = b.name): Uint8Array {
  const s = size / Math.max(flat.width, flat.height)
  const W = flat.width * s
  const H = flat.height * s
  const spots = new Map<string, { id: string; cmyk: number[] }>()
  const alphas = new Map<number, string>()
  const body: string[] = [`q ${f(s)} 0 0 ${f(-s)} 0 ${f(H)} cm`]

  for (const sh of flat.shapes) {
    const ink = inkFor(sh.color, b, mode)
    const stroke = sh.paint.kind === 'stroke'
    if (sh.opacity < 1) {
      const a = Math.round(sh.opacity * 1000) / 1000
      if (!alphas.has(a)) alphas.set(a, `GS${alphas.size + 1}`)
      body.push('q', `/${alphas.get(a)} gs`)
    }
    if (ink.kind === 'rgb') body.push(`${ink.rgb.map((v) => f(v / 255)).join(' ')} ${stroke ? 'RG' : 'rg'}`)
    else if (ink.kind === 'cmyk') body.push(`${ink.cmyk.map(f).join(' ')} ${stroke ? 'K' : 'k'}`)
    else {
      if (!spots.has(ink.name!)) spots.set(ink.name!, { id: `CS${spots.size + 1}`, cmyk: ink.cmyk })
      body.push(`/${spots.get(ink.name!)!.id} ${stroke ? 'CS 1 SCN' : 'cs 1 scn'}`)
    }
    if (sh.paint.kind === 'stroke') body.push(`${f(sh.paint.width)} w ${sh.paint.cap} J ${sh.paint.join} j ${f(sh.paint.miter)} M`)
    body.push(pathOps(sh.segs, { m: 'm', l: 'l', c: 'c', z: 'h' }))
    body.push(sh.paint.kind === 'stroke' ? 'S' : sh.paint.evenodd ? 'f*' : 'f')
    if (sh.opacity < 1) body.push('Q')
  }
  body.push('Q')
  const content = body.join('\n')

  const objs: string[] = []
  const add = (o: string) => objs.push(o) && objs.length
  const catalog = add('')
  const pages = add('')
  const page = add('')
  const contents = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
  const cs = [...spots.entries()].map(([name, v]) => `/${v.id} [/Separation ${pdfName(name)} /DeviceCMYK << /FunctionType 2 /Domain [0 1] /C0 [0 0 0 0] /C1 [${v.cmyk.map(f).join(' ')}] /N 1 >>]`)
  const gs = [...alphas.entries()].map(([a, id]) => `/${id} << /Type /ExtGState /ca ${a} /CA ${a} >>`)
  const info = add(`<< /Title (${ascii(title).replace(/[\\()]/g, '')}) /Producer (Marque) /Creator (Marque) >>`)
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pages} 0 R >>`
  objs[pages - 1] = `<< /Type /Pages /Kids [${page} 0 R] /Count 1 >>`
  objs[page - 1] =
    `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 ${f(W)} ${f(H)}] /TrimBox [0 0 ${f(W)} ${f(H)}] /Contents ${contents} 0 R ` +
    `/Resources << ${cs.length ? `/ColorSpace << ${cs.join(' ')} >> ` : ''}${gs.length ? `/ExtGState << ${gs.join(' ')} >>` : ''} >> >>`

  // Header with a binary comment (raw bytes), then plain ASCII objects.
  const head = new Uint8Array([...'%PDF-1.4\n%'].map((c) => c.charCodeAt(0)).concat([0xe2, 0xe3, 0xcf, 0xd3, 0x0a]))
  let out = ''
  const offsets: number[] = []
  objs.forEach((o, i) => {
    offsets.push(head.length + out.length)
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = head.length + out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  const bytes = new Uint8Array(head.length + out.length)
  bytes.set(head, 0)
  for (let i = 0; i < out.length; i++) bytes[head.length + i] = out.charCodeAt(i) & 0xff
  return bytes
}

export function toEps(flat: Flat, b: Brand, mode: InkMode, size = 500, title = b.name): string {
  const s = size / Math.max(flat.width, flat.height)
  const W = flat.width * s
  const H = flat.height * s
  const spots = new Map<string, number[]>()
  const body: string[] = []
  for (const sh of flat.shapes) {
    const ink = inkFor(sh.color, b, mode)
    if (ink.kind === 'rgb') body.push(`${ink.rgb.map((v) => f(v / 255)).join(' ')} setrgbcolor`)
    else if (ink.kind === 'cmyk') body.push(`${ink.cmyk.map(f).join(' ')} setcmykcolor`)
    else {
      spots.set(ink.name!, ink.cmyk)
      body.push(`${ink.cmyk.map(f).join(' ')} ${psString(ink.name!)} findcmykcustomcolor 1 setcustomcolor`)
    }
    body.push('newpath', pathOps(sh.segs, { m: 'moveto', l: 'lineto', c: 'curveto', z: 'closepath' }))
    if (sh.paint.kind === 'stroke') body.push(`${f(sh.paint.width)} setlinewidth ${sh.paint.cap} setlinecap ${sh.paint.join} setlinejoin ${f(sh.paint.miter)} setmiterlimit stroke`)
    else body.push(sh.paint.evenodd ? 'eofill' : 'fill')
  }
  const process = mode === 'rgb' ? '' : '%%DocumentProcessColors: Cyan Magenta Yellow Black\n'
  const custom = spots.size
    ? `%%DocumentCustomColors: ${[...spots.keys()].map(psString).join(' ')}\n` +
      [...spots.entries()].map(([n, c]) => `%%CMYKCustomColor: ${c.map(f).join(' ')} ${psString(n)}`).join('\n') + '\n'
    : ''
  return `%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: 0 0 ${Math.ceil(W)} ${Math.ceil(H)}
%%HiResBoundingBox: 0 0 ${f(W)} ${f(H)}
%%Title: ${ascii(title)}
%%Creator: Marque
%%LanguageLevel: 2
${process}${custom}%%Pages: 1
%%EndComments
%%BeginProlog
/findcmykcustomcolor where { pop } { /findcmykcustomcolor { 5 array astore } bind def } ifelse
/setcustomcolor where { pop } { /setcustomcolor { exch aload pop pop 4 { 4 index mul 4 1 roll } repeat 5 -1 roll pop setcmykcolor } bind def } ifelse
%%EndProlog
%%Page: 1 1
gsave
0 ${f(H)} translate ${f(s)} ${f(-s)} scale
${body.join('\n')}
grestore
showpage
%%EOF
`
}

// ---------------------------------------------------------------------------
// Preflight: what the print files will and won't get right, before you export.

export interface Check {
  ok: boolean
  text: string
}

export function preflight(b: Brand, logos: { label: string; svg: string }[]): Check[] {
  const out: Check[] = []
  const used = new Set<string>()
  for (const l of logos) {
    const flat = flatten(l.svg)
    flat.shapes.forEach((s) => used.add(normHex(s.color)))
    out.push(
      flat.issues.length
        ? { ok: false, text: `${l.label} has ${flat.issues.join(', ')}. It gets an RGB PDF instead of CMYK and Pantone files.` }
        : flat.shapes.some((s) => s.opacity < 1)
          ? { ok: false, text: `${l.label} uses transparency, so it gets print PDFs but no EPS.` }
          : { ok: true, text: `${l.label} converts cleanly to CMYK and Pantone.` },
    )
  }
  const inLogo = b.colors.filter((c) => used.has(normHex(c.hex)))
  const noCmyk = inLogo.filter((c) => !parseCmyk(c.cmyk))
  if (noCmyk.length) out.push({ ok: false, text: `Estimated CMYK for ${noCmyk.map((c) => c.name).join(', ')}. Enter values from your swatch book under Colours.` })
  else if (inLogo.length) out.push({ ok: true, text: 'Every logo colour has swatch-book CMYK values.' })
  const noPms = inLogo.filter((c) => !c.pantone && normHex(c.hex) !== '#000000' && normHex(c.hex) !== '#FFFFFF')
  if (noPms.length) out.push({ ok: false, text: `No Pantone for ${noPms.map((c) => c.name).join(', ')}, so ${noPms.length === inLogo.length ? 'no Pantone files are made' : 'those colours print as CMYK in the Pantone files'}.` })
  else if (inLogo.length) out.push({ ok: true, text: 'Every logo colour has a Pantone reference.' })
  const stray = [...used].filter((h) => h !== '#000000' && h !== '#FFFFFF' && !b.colors.some((c) => normHex(c.hex) === h))
  if (stray.length) out.push({ ok: false, text: `The artwork uses ${stray.join(', ')}, which ${stray.length > 1 ? "aren't" : "isn't"} in the palette, so ${stray.length > 1 ? 'they print' : 'it prints'} as an estimated CMYK mix.` })
  return out
}
