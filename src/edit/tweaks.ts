import type { Brand, Layer, Tweak } from '../types'
import { flatten, fontKey, parseColor } from '../lib/flatten'
import { sceneToSvg } from '../lib/editable'
import { uid } from './context'

/**
 * Edits to the items of generated pages. Each item is found by its path of child
 * indexes from the page element, and the edit is laid over the rendered page
 * (inline styles and text), so the page keeps updating from the sidebar underneath.
 */

export function pathOf(el: Element, root: Element): string | null {
  const parts: number[] = []
  for (let e: Element | null = el; e && e !== root; e = e.parentElement) {
    const p = e.parentElement
    if (!p) return null
    parts.unshift(Array.prototype.indexOf.call(p.children, e))
  }
  return parts.join('.')
}

export function elAt(root: Element, path: string): Element | null {
  let e: Element | null = root
  for (const i of path.split('.')) {
    e = e?.children[Number(i)] ?? null
    if (!e) return null
  }
  return e
}

export function tweaksOf(b: Brand, page: string): Record<string, Tweak> {
  return b.tweaks?.[page] ?? {}
}

export function withTweak(b: Brand, page: string, path: string, t: Tweak | null): Record<string, Record<string, Tweak>> {
  const all = { ...(b.tweaks ?? {}) }
  const pageT = { ...(all[page] ?? {}) }
  const clean = t && Object.fromEntries(Object.entries(t).filter(([, v]) => v !== undefined && !(typeof v === 'object' && !Object.keys(v).length)))
  if (clean && Object.keys(clean).length) pageT[path] = clean as Tweak
  else delete pageT[path]
  if (Object.keys(pageT).length) all[page] = pageT
  else delete all[page]
  return all
}

/** Plain text item: only text inside, no child elements. */
export function isTextItem(el: Element): boolean {
  return el instanceof HTMLElement && Array.from(el.children).every((c) => c.tagName === 'BR') && !!el.textContent?.trim()
}

/** The text as shown, with line breaks. */
export function itemText(el: Element): string {
  return Array.from(el.childNodes)
    .map((n) => (n.nodeType === Node.TEXT_NODE ? n.nodeValue : (n as Element).tagName === 'BR' ? '\n' : ''))
    .join('')
}

// ---------------------------------------------------------------------------
// Applying edits. Everything set here is recorded, so it can be undone exactly
// (only if the page hasn't since changed the value itself).

interface Applied {
  styles: [Element, string, string, string][] // el, prop, original, ours
  texts: [Text, string, string][] // node, original, ours
}

const applied = new WeakMap<Element, Applied>()

function setStyle(rec: Applied, el: Element, prop: string, value: string) {
  const st = (el as HTMLElement).style
  rec.styles.push([el, prop, st.getPropertyValue(prop), value])
  st.setProperty(prop, value, 'important')
}

const COLOR_PROPS = ['color', 'background-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'fill', 'stroke', 'outline-color'] as const

function hasOwnText(el: Element) {
  return Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && n.nodeValue?.trim())
}

/** Colours an item actually shows: text, fills, borders, SVG paint. Most used first. */
export function colorsIn(el: Element): string[] {
  const count = new Map<string, number>()
  const add = (v: string) => {
    const c = parseColor(v)
    if (c && c.a > 0) count.set(c.hex, (count.get(c.hex) ?? 0) + 1)
  }
  for (const e of [el, ...Array.from(el.querySelectorAll('*'))]) {
    const cs = getComputedStyle(e)
    if (cs.display === 'none') continue
    const svg = e instanceof SVGElement
    if (hasOwnText(e)) add(cs.color)
    if (!svg) add(cs.backgroundColor)
    if (!svg) for (const s of ['top', 'right', 'bottom', 'left']) if (parseFloat(cs.getPropertyValue(`border-${s}-width`)) > 0) add(cs.getPropertyValue(`border-${s}-color`))
    if (svg && cs.fill !== 'none' && !cs.fill.startsWith('url')) add(cs.fill)
    if (svg && cs.stroke !== 'none' && !cs.stroke.startsWith('url') && parseFloat(cs.strokeWidth) > 0) add(cs.stroke)
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h)
}

function revert(root: Element) {
  const rec = applied.get(root)
  if (!rec) return
  for (const [el, prop, orig, ours] of rec.styles.reverse()) {
    const st = (el as HTMLElement).style
    if (st.getPropertyValue(prop) === ours) {
      if (orig) st.setProperty(prop, orig)
      else st.removeProperty(prop)
    }
  }
  for (const [node, orig, ours] of rec.texts.reverse()) if (node.nodeValue === ours) node.nodeValue = orig
  applied.delete(root)
}

export function applyTweaks(root: Element, tweaks: Record<string, Tweak>) {
  revert(root)
  const rec: Applied = { styles: [], texts: [] }
  applied.set(root, rec)
  for (const [path, t] of Object.entries(tweaks)) {
    const el = elAt(root, path)
    if (!el) continue
    if (t.dx || t.dy) setStyle(rec, el, 'translate', `${t.dx ?? 0}mm ${t.dy ?? 0}mm`)
    if (t.s && t.s !== 1) setStyle(rec, el, 'scale', String(t.s))
    if (t.hide) setStyle(rec, el, 'visibility', 'hidden')
    if (t.text !== undefined && isTextItem(el)) {
      const nodes = Array.from(el.childNodes).filter((n): n is Text => n.nodeType === Node.TEXT_NODE)
      nodes.forEach((n, i) => {
        const ours = i === 0 ? t.text! : ''
        rec.texts.push([n, n.nodeValue ?? '', ours])
        n.nodeValue = ours
      })
      el.querySelectorAll('br').forEach((br) => setStyle(rec, br, 'display', 'none'))
      if (t.text.includes('\n')) setStyle(rec, el, 'white-space', 'pre-line')
    }
    if (t.colors && Object.keys(t.colors).length) {
      // Top-down, so children that only inherit a colour follow their parent's swap.
      for (const e of [el, ...Array.from(el.querySelectorAll('*'))]) {
        const cs = getComputedStyle(e)
        for (const p of COLOR_PROPS) {
          if ((p === 'fill' || p === 'stroke') && !(e instanceof SVGElement)) continue
          const c = parseColor(cs.getPropertyValue(p))
          const to = c && t.colors[c.hex]
          if (!to) continue
          const a = c.a < 1 ? Math.round(c.a * 255).toString(16).padStart(2, '0') : ''
          setStyle(rec, e, p, to + a)
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Picking an item under the pointer

const SKIP = new Set(['page-body', 'slide-body', 'cover', 'hero', 'surface'])

/** The item to select for a click at a point: the deepest thing that draws something. */
export function itemAt(root: HTMLElement, x: number, y: number): Element | null {
  for (const hit of document.elementsFromPoint(x, y)) {
    if (!root.contains(hit) || hit === root) continue
    // Inside artwork, take the whole drawing.
    let el: Element = hit
    const svg = el.closest('svg')
    if (svg && root.contains(svg)) {
      let top: Element = svg
      for (let s = svg.parentElement?.closest('svg'); s && root.contains(s); s = s.parentElement?.closest('svg')) top = s
      el = top
    }
    // Big layout wrappers aren't items.
    while (el !== root && el.parentElement && el instanceof HTMLElement && [...el.classList].some((c) => SKIP.has(c)) && el.parentElement !== root) el = el.parentElement
    if (el === root || [...el.classList].some((c) => SKIP.has(c))) return null
    return el
  }
  return null
}

// ---------------------------------------------------------------------------
// Copying an item onto another page

const PT_PER_PX = 0.75

/** A free layer that looks like the item: real text stays editable text, anything else becomes artwork. */
export async function layerFrom(el: Element, brand: Brand, sheet: HTMLElement, at: { x: number; y: number; w: number; h: number }): Promise<Layer> {
  if (isTextItem(el)) {
    const cs = getComputedStyle(el)
    const f = fontKey(cs)
    const r = el.getBoundingClientRect()
    const scale = (el as HTMLElement).offsetHeight ? r.height / (el as HTMLElement).offsetHeight : 1
    const zoom = parseFloat(getComputedStyle(sheet).getPropertyValue('--z')) || 1
    const fs = parseFloat(cs.fontSize) * (scale / zoom)
    const head = brand.fonts.find((x) => x.role === 'heading')?.family
    const ls = cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing) / parseFloat(cs.fontSize)
    const lh = cs.lineHeight === 'normal' ? undefined : parseFloat(cs.lineHeight) / parseFloat(cs.fontSize)
    return {
      id: uid(),
      kind: 'text',
      ...at,
      text: itemText(el),
      font: head && f.family === head ? 'heading' : 'body',
      size: Math.round(fs * PT_PER_PX * 10) / 10,
      weight: f.weight,
      color: parseColor(cs.color)?.hex,
      align: (['left', 'center', 'right'] as const).find((a) => cs.textAlign === a) ?? 'left',
      uppercase: cs.textTransform === 'uppercase' || undefined,
      tracking: ls || undefined,
      lineHeight: lh,
    }
  }
  const scene = await flatten(sheet, { brand, dpi: 200 }, el)
  const r = el.getBoundingClientRect()
  const page = sheet.querySelector(':scope > section')!.getBoundingClientRect()
  const k = scene.w / page.width
  const box = { x: (r.left - page.left) * k, y: (r.top - page.top) * k, w: r.width * k, h: r.height * k }
  const svg = sceneToSvg(scene, { box }).replace(/ width="[\d.]+mm" height="[\d.]+mm"/, ' width="100%" height="100%" preserveAspectRatio="none"')
  return { id: uid(), kind: 'svg', ...at, svg }
}
