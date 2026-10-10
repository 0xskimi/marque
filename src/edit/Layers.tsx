import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type DragEvent } from 'react'
import type { Layer, Tweak } from '../types'
import { useImage, importPhoto } from '../lib/images'
import { derive } from '../lib/derive'
import { BgScope, LogoImg } from '../pages/common'
import { toneVars } from '../lib/color'
import { layersOf, uid, useEdit, withLayers } from './context'
import { applyTweaks, elAt, isTextItem, itemText, itemAt, layerFrom, pathOf, tweaksOf, withTweak } from './tweaks'

type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const SNAP_PX = 6

export function pickImages(multiple = false): Promise<File[]> {
  return new Promise((res) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.multiple = multiple
    input.onchange = () => res(Array.from(input.files ?? []))
    // Resolves empty if the dialog is cancelled (focus returns without a change event).
    window.addEventListener('focus', () => setTimeout(() => res(Array.from(input.files ?? [])), 400), { once: true })
    input.click()
  })
}

/** An image layer sized to its natural aspect, `w` wide, centred on (cx, cy). */
export async function imageLayer(file: File, pageAspect: number, cx = 0.5, cy = 0.5, w = 0.42): Promise<Layer> {
  const img = await importPhoto(file)
  let h = (w * (img.height / img.width)) * pageAspect
  if (h > 0.84) {
    w = (w * 0.84) / h
    h = 0.84
  }
  return { id: uid(), kind: 'image', imageId: img.id, fit: 'cover', x: cx - w / 2, y: cy - h / 2, w, h }
}

function Img({ layer }: { layer: Layer }) {
  const url = useImage(layer.imageId)
  if (!layer.imageId) return <div className="ly-empty">Double-click or drop an image</div>
  if (!url) return null
  return <img src={url} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: layer.fit ?? 'cover', borderRadius: `${layer.radius ?? 0}mm`, display: 'block' }} />
}

function textStyle(l: Layer): CSSProperties {
  return {
    fontFamily: l.font === 'heading' ? 'var(--head)' : 'var(--body)',
    fontSize: `${l.size ?? 14}pt`,
    fontWeight: l.weight ?? (l.font === 'heading' ? 700 : 400),
    color: l.color || 'var(--fg)',
    textAlign: l.align ?? 'left',
    textTransform: l.uppercase ? 'uppercase' : undefined,
    letterSpacing: l.tracking ? `${l.tracking}em` : undefined,
    lineHeight: l.lineHeight ?? (l.font === 'heading' ? 1.1 : 1.45),
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
  }
}

function Content({ layer }: { layer: Layer }) {
  const edit = useEdit()
  const b = edit?.brand
  if (layer.kind === 'image') return <Img layer={layer} />
  if (layer.kind === 'rect') return <div style={{ width: '100%', height: '100%', background: layer.fill ?? '#000', borderRadius: `${layer.radius ?? 0}mm` }} />
  if (layer.kind === 'logo' && b) {
    const logo = b.logos[layer.slot ?? 'primary'] ?? derive(b).mainLogo
    return <LogoImg logo={logo} version={layer.version ?? 'auto'} />
  }
  if (layer.kind === 'text') return <div style={textStyle(layer)}>{layer.text}</div>
  if (layer.kind === 'svg' && layer.svg) return <div className="ly-art" dangerouslySetInnerHTML={{ __html: layer.svg }} />
  return null
}

function box(l: Layer): CSSProperties {
  return {
    left: `${l.x * 100}%`,
    top: `${l.y * 100}%`,
    width: `${l.w * 100}%`,
    height: l.kind === 'text' ? 'auto' : `${l.h * 100}%`,
    opacity: l.opacity ?? 1,
  }
}

interface Drag {
  id: string
  handle: Handle
  px: number
  py: number
  orig: Layer
  W: number
  H: number
  others: Layer[]
}

/** Dragging an item of the generated page: move, or scale from a corner around its centre. */
interface GenDrag {
  path: string
  el: HTMLElement
  mode: 'move' | 'scale'
  px: number
  py: number
  orig: Tweak
  /** Screen px per mm on this page. */
  pxmm: number
  cx: number
  cy: number
  d0: number
  inline: [string, string]
}

interface Guide {
  axis: 'x' | 'y'
  at: number
}

/** Snap the given edges (fractions) to the nearest target within tolerance. */
function snap1(edges: number[], targets: number[], tol: number): { d: number; at: number } | null {
  let best: { d: number; at: number } | null = null
  for (const e of edges)
    for (const t of targets) {
      const d = t - e
      if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, at: t }
    }
  return best
}

/** The overlay of another page under the pointer, if any. */
function overlayAt(x: number, y: number, self: HTMLElement | null): HTMLElement | null {
  return (document.elementsFromPoint(x, y).find((n) => n.classList.contains('layers') && n !== self) as HTMLElement | undefined) ?? null
}

type Frac = { x: number; y: number; w: number; h: number }

/** What a drag needs from a pointer event, so auto-scroll can replay the last one. */
type Ptr = { clientX: number; clientY: number; altKey: boolean; shiftKey: boolean }

const EDGE = 48

function fracIn(r: DOMRect | Frac & { left?: number }, box: DOMRect): Frac {
  const rr = r as DOMRect
  return { x: (rr.left - box.left) / box.width, y: (rr.top - box.top) / box.height, w: rr.width / box.width, h: rr.height / box.height }
}

/**
 * Free layers on one page, and the handles for editing the page's own items.
 * Static in view mode; in edit mode they can be selected, dragged, resized,
 * edited, dropped onto and moved to other pages, like a Figma frame.
 */
export function Overlay({ page, bg, pageW }: { page: string; bg: string; pageW: number }) {
  const edit = useEdit()
  const ref = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [live, setLive] = useState<Layer | null>(null)
  const [gen, setGen] = useState<GenDrag | null>(null)
  const [genBox, setGenBox] = useState<Frac | null>(null)
  const [guides, setGuides] = useState<Guide[]>([])
  const [typing, setTyping] = useState<string | null>(null)
  const [genTyping, setGenTyping] = useState<string | null>(null)
  const [dropping, setDropping] = useState(false)
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const brand = edit?.brand
  const tweaks = brand ? tweaksOf(brand, page) : {}
  const selEl = edit?.editing && edit.sel?.page === page ? edit.sel.el : undefined

  const root = () => ref.current?.parentElement?.querySelector<HTMLElement>(':scope > section') ?? null
  // Auto-scroll: dragging near the top or bottom of the canvas scrolls it, so items can reach far pages.
  const scroll = useRef<{ x0: number; y0: number; last: Ptr | null; raf: number }>({ x0: 0, y0: 0, last: null, raf: 0 })
  const canvas = () => ref.current?.closest<HTMLElement>('.canvas') ?? null
  const scrolled = () => {
    const c = canvas()
    return c ? { x: c.scrollLeft - scroll.current.x0, y: c.scrollTop - scroll.current.y0 } : { x: 0, y: 0 }
  }
  function beginScroll() {
    const c = canvas()
    scroll.current.x0 = c?.scrollLeft ?? 0
    scroll.current.y0 = c?.scrollTop ?? 0
  }
  function stopScroll() {
    cancelAnimationFrame(scroll.current.raf)
    scroll.current.raf = 0
    scroll.current.last = null
  }
  const moveRef = useRef<(e: Ptr) => void>(() => {})
  function autoScroll(e: Ptr) {
    scroll.current.last = e
    if (scroll.current.raf) return
    const tick = () => {
      const c = canvas()
      const last = scroll.current.last
      if (!c || !last) return stopScroll()
      const r = c.getBoundingClientRect()
      const v = last.clientY < r.top + EDGE ? -(r.top + EDGE - last.clientY) : last.clientY > r.bottom - EDGE ? last.clientY - (r.bottom - EDGE) : 0
      if (!v) {
        scroll.current.raf = 0
        return
      }
      c.scrollTop += Math.max(-30, Math.min(30, v / 2))
      moveRef.current(last)
      scroll.current.raf = requestAnimationFrame(tick)
    }
    scroll.current.raf = requestAnimationFrame(tick)
  }

  // Lay the page edits over the freshly rendered page, then place the selection box.
  useLayoutEffect(() => {
    const r = root()
    if (r) applyTweaks(r, tweaks)
    let next: Frac | null = null
    const el = r && selEl ? elAt(r, selEl) : null
    if (el && ref.current) next = fracIn(el.getBoundingClientRect(), ref.current.getBoundingClientRect())
    setGenBox((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
  })

  if (!edit || !brand) return null
  const { editing, sel, setSel, commit } = edit
  const layers = layersOf(brand, page)
  if (!editing && !layers.length) return <div ref={ref} className="layers" data-page={page} hidden />

  const save = (next: Layer[]) => commit({ overlays: withLayers(brand, page, next) })
  const patch = (id: string, p: Partial<Layer>) => save(layers.map((l) => (l.id === id ? { ...l, ...p } : l)))
  const selected = sel?.page === page ? sel.layer : undefined

  function measuredH(id: string, fallback: number) {
    const el = ref.current?.querySelector<HTMLElement>(`[data-layer="${id}"]`)
    const H = ref.current?.getBoundingClientRect().height
    return el && H ? el.getBoundingClientRect().height / H : fallback
  }

  function start(e: RPointerEvent, l: Layer, handle: Handle) {
    if (!editing || typing === l.id || e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const r = ref.current!.getBoundingClientRect()
    setSel({ page, layer: l.id })
    const orig = l.kind === 'text' ? { ...l, h: measuredH(l.id, l.h) } : l
    const others = layers.filter((o) => o.id !== l.id).map((o) => (o.kind === 'text' ? { ...o, h: measuredH(o.id, o.h) } : o))
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    beginScroll()
    setDrag({ id: l.id, handle, px: e.clientX, py: e.clientY, orig, W: r.width, H: r.height, others })
  }

  function startGen(e: RPointerEvent, path: string, mode: GenDrag['mode']) {
    const r = root()
    const el = r && (elAt(r, path) as HTMLElement | null)
    if (!el || e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    setSel({ page, el: path })
    const box = el.getBoundingClientRect()
    const cx = box.left + box.width / 2
    const cy = box.top + box.height / 2
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    beginScroll()
    setGen({
      path,
      el,
      mode,
      px: e.clientX,
      py: e.clientY,
      orig: tweaks[path] ?? {},
      pxmm: ref.current!.getBoundingClientRect().width / pageW,
      cx,
      cy,
      d0: Math.max(4, Math.hypot(e.clientX - cx, e.clientY - cy)),
      inline: [el.style.getPropertyValue('translate'), el.style.getPropertyValue('scale')],
    })
  }

  function move(e: Ptr) {
    if (gen || drag) autoScroll(e)
    const sc = scrolled()
    if (gen) {
      const t = gen.orig
      if (gen.mode === 'move') {
        let dx = (e.clientX - gen.px + sc.x) / gen.pxmm
        let dy = (e.clientY - gen.py + sc.y) / gen.pxmm
        if (e.shiftKey) Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0)
        gen.el.style.setProperty('translate', `${(t.dx ?? 0) + dx}mm ${(t.dy ?? 0) + dy}mm`, 'important')
      } else {
        const s = Math.max(0.05, (t.s ?? 1) * (Math.hypot(e.clientX - gen.cx, e.clientY - gen.cy) / gen.d0))
        gen.el.style.setProperty('scale', String(Math.round(s * 1000) / 1000), 'important')
      }
      const box = ref.current!.getBoundingClientRect()
      setGenBox(fracIn(gen.el.getBoundingClientRect(), box))
      setTarget(gen.mode === 'move' ? overlayAt(e.clientX, e.clientY, ref.current) : null)
      return
    }
    if (!drag) return
    const { orig: o, W, H, handle } = drag
    const dx = (e.clientX - drag.px + sc.x) / W
    const dy = (e.clientY - drag.py + sc.y) / H
    const tx = [0, 0.5, 1, ...drag.others.flatMap((l) => [l.x, l.x + l.w / 2, l.x + l.w])]
    const ty = [0, 0.5, 1, ...drag.others.flatMap((l) => [l.y, l.y + l.h / 2, l.y + l.h])]
    const tolX = SNAP_PX / W
    const tolY = SNAP_PX / H
    const g: Guide[] = []
    let { x, y, w, h } = o
    if (handle === 'move') {
      x += dx
      y += dy
      if (!e.altKey) {
        const sx = snap1([x, x + w / 2, x + w], tx, tolX)
        const sy = snap1([y, y + h / 2, y + h], ty, tolY)
        if (sx) (x += sx.d), g.push({ axis: 'x', at: sx.at })
        if (sy) (y += sy.d), g.push({ axis: 'y', at: sy.at })
      }
      if (e.shiftKey) Math.abs(dx * W) > Math.abs(dy * H) ? (y = o.y) : (x = o.x)
      setTarget(overlayAt(e.clientX, e.clientY, ref.current))
    } else {
      const left = handle.includes('w')
      const right = handle.includes('e')
      const top = handle.includes('n')
      const bottom = handle.includes('s')
      if (right) w = Math.max(0.01, o.w + dx)
      if (left) (w = Math.max(0.01, o.w - dx)), (x = o.x + o.w - w)
      if (bottom) h = Math.max(0.01, o.h + dy)
      if (top) (h = Math.max(0.01, o.h - dy)), (y = o.y + o.h - h)
      if (!e.altKey) {
        if (right || left) {
          const s = snap1([right ? x + w : x], tx, tolX)
          if (s) {
            if (right) w += s.d
            else (x += s.d), (w -= s.d)
            g.push({ axis: 'x', at: s.at })
          }
        }
        if (o.kind !== 'text' && (top || bottom)) {
          const s = snap1([bottom ? y + h : y], ty, tolY)
          if (s) {
            if (bottom) h += s.d
            else (y += s.d), (h -= s.d)
            g.push({ axis: 'y', at: s.at })
          }
        }
      }
      // Images, logos and artwork keep their proportions from a corner; shift does it for shapes.
      const corner = (left || right) && (top || bottom)
      const lock = corner && ((o.kind === 'image' || o.kind === 'logo' || o.kind === 'svg') !== e.shiftKey)
      if (lock) {
        const ratio = o.w / o.h
        if (Math.abs(w - o.w) * W > Math.abs(h - o.h) * H) h = w / ratio
        else w = h * ratio
        if (left) x = o.x + o.w - w
        if (top) y = o.y + o.h - h
      }
      if (o.kind === 'text') (h = o.h), (y = o.y)
    }
    setGuides(g)
    setLive({ ...o, x, y, w, h })
  }

  moveRef.current = move

  async function end(e: RPointerEvent) {
    const sc = scrolled()
    stopScroll()
    setTarget(null)
    if (gen) {
      const g = gen
      setGen(null)
      const [tr, sc0] = g.inline
      const moved = g.el.style.getPropertyValue('translate')
      const scaled = g.el.style.getPropertyValue('scale')
      tr ? g.el.style.setProperty('translate', tr, 'important') : g.el.style.removeProperty('translate')
      sc0 ? g.el.style.setProperty('scale', sc0, 'important') : g.el.style.removeProperty('scale')
      if (g.mode === 'scale') {
        if (scaled !== sc0) commit({ tweaks: withTweak(brand!, page, g.path, { ...g.orig, s: Number(scaled) }) })
        return
      }
      const dx = (e.clientX - g.px + sc.x) / g.pxmm
      const dy = (e.clientY - g.py + sc.y) / g.pxmm
      if (moved === tr || (Math.abs(dx) < 0.2 && Math.abs(dy) < 0.2)) return
      const other = overlayAt(e.clientX, e.clientY, ref.current)
      if (other?.dataset.page) {
        // Dropped on another page: it becomes a free layer there, and leaves this page.
        const sheet = ref.current!.parentElement as HTMLElement
        const box = g.el.getBoundingClientRect()
        const dest = fracIn(DOMRect.fromRect({ x: box.left + (e.clientX - g.px) + sc.x, y: box.top + (e.clientY - g.py) + sc.y, width: box.width, height: box.height }), other.getBoundingClientRect())
        const layer = await layerFrom(g.el, brand!, sheet, dest)
        const to = other.dataset.page
        commit({
          overlays: { ...(brand!.overlays ?? {}), [to]: [...layersOf(brand!, to), layer] },
          tweaks: withTweak(brand!, page, g.path, { ...g.orig, hide: true }),
        })
        setSel({ page: to, layer: layer.id })
        return
      }
      commit({ tweaks: withTweak(brand!, page, g.path, { ...g.orig, dx: round((g.orig.dx ?? 0) + (e.shiftKey && Math.abs(dy) > Math.abs(dx) ? 0 : dx)), dy: round((g.orig.dy ?? 0) + (e.shiftKey && Math.abs(dx) >= Math.abs(dy) ? 0 : dy)) }) })
      return
    }
    if (!drag) return
    if (live) {
      const other = drag.handle === 'move' ? overlayAt(e.clientX, e.clientY, ref.current) : null
      if (other?.dataset.page) {
        // Dropped on another page: move the layer there, keeping its size on screen.
        const src = ref.current!.getBoundingClientRect()
        const dst = other.getBoundingClientRect()
        const r = DOMRect.fromRect({ x: src.left + live.x * src.width, y: src.top + live.y * src.height, width: live.w * src.width, height: live.h * src.height })
        const f = fracIn(r, dst)
        const to = other.dataset.page
        const movedLayer = { ...layers.find((l) => l.id === drag.id)!, ...f, h: live.kind === 'text' ? live.h : f.h }
        const rest = withLayers(brand!, page, layers.filter((l) => l.id !== drag.id))
        commit({ overlays: { ...rest, [to]: [...(rest[to] ?? []), movedLayer] } })
        setSel({ page: to, layer: movedLayer.id })
      } else {
        const moved = live.x !== drag.orig.x || live.y !== drag.orig.y || live.w !== drag.orig.w || live.h !== drag.orig.h
        if (moved) patch(drag.id, { x: live.x, y: live.y, w: live.w, h: live.h })
      }
    }
    setDrag(null)
    setLive(null)
    setGuides([])
  }

  async function replaceImage(l: Layer) {
    const [file] = await pickImages()
    if (!file) return
    const img = await importPhoto(file)
    patch(l.id, { imageId: img.id })
  }

  function dragOver(e: DragEvent) {
    if (!editing || !Array.from(e.dataTransfer.types).includes('Files')) return
    e.preventDefault()
    setDropping(true)
  }

  async function drop(e: DragEvent) {
    if (!editing) return
    e.preventDefault()
    setDropping(false)
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
    if (!files.length) return
    const r = ref.current!.getBoundingClientRect()
    const cx = (e.clientX - r.left) / r.width
    const cy = (e.clientY - r.top) / r.height
    // Dropping onto an image layer swaps its picture.
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-layer]')?.dataset.layer
    const hit = layers.find((l) => l.id === target && l.kind === 'image')
    if (hit && files.length === 1) {
      const img = await importPhoto(files[0])
      patch(hit.id, { imageId: img.id })
      return
    }
    const added: Layer[] = []
    for (const [i, f] of files.entries()) added.push(await imageLayer(f, r.width / r.height, cx + i * 0.03, cy + i * 0.03))
    save([...layers, ...added])
    setSel({ page, layer: added[added.length - 1].id })
  }

  const genEl = selEl ? (root() && elAt(root()!, selEl)) : null
  const genText = !!genEl && isTextItem(genEl)

  return (
    <BgScope bg={bg}>
      <div
        ref={ref}
        data-page={page}
        className={`layers ${editing ? 'is-editing' : ''} ${dropping ? 'is-dropping' : ''}`}
        style={toneVars(bg) as CSSProperties}
        onPointerDown={(e) => {
          if (!editing || e.target !== e.currentTarget || e.button !== 0) return
          setTyping(null)
          const r = root()
          const item = r && itemAt(r, e.clientX, e.clientY)
          const path = item && pathOf(item, r!)
          if (path) startGen(e, path, 'move')
          else setSel({ page })
        }}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onDragOver={dragOver}
        onDragLeave={() => setDropping(false)}
        onDrop={drop}
      >
        {layers.map((stored) => {
          const l = live?.id === stored.id ? live : stored
          const isSel = editing && selected === l.id
          return (
            <div
              key={l.id}
              data-layer={l.id}
              className={`ly ly-${l.kind} ${isSel ? 'is-selected' : ''}`}
              style={box(l)}
              onPointerDown={(e) => start(e, stored, 'move')}
              onDoubleClick={() => {
                if (!editing) return
                if (l.kind === 'text') setTyping(l.id)
                if (l.kind === 'image') replaceImage(stored)
              }}
            >
              {typing === l.id ? (
                <TextEditor
                  layer={l}
                  onDone={(text) => {
                    setTyping(null)
                    if (text !== l.text) patch(l.id, { text, h: measuredH(l.id, l.h) })
                  }}
                />
              ) : (
                <Content layer={l} />
              )}
              {isSel && typing !== l.id &&
                (l.kind === 'text' ? (['e', 'w'] as Handle[]) : HANDLES).map((hd) => (
                  <span key={hd} className={`ly-h ly-h-${hd}`} onPointerDown={(e) => start(e, stored, hd)} />
                ))}
            </div>
          )
        })}
        {editing && selEl && genBox && genTyping !== selEl && (
          <div
            className="mq-sel gen-sel"
            style={{ left: `${genBox.x * 100}%`, top: `${genBox.y * 100}%`, width: `${genBox.w * 100}%`, height: `${genBox.h * 100}%` }}
            onPointerDown={(e) => startGen(e, selEl, 'move')}
            onDoubleClick={() => genText && setGenTyping(selEl)}
            title={genText ? 'Drag to move, corners to scale, double-click to edit the text' : 'Drag to move, corners to scale'}
          >
            {(['nw', 'ne', 'se', 'sw'] as Handle[]).map((hd) => (
              <span key={hd} className={`ly-h ly-h-${hd}`} onPointerDown={(e) => startGen(e, selEl, 'scale')} />
            ))}
          </div>
        )}
        {editing && genTyping && genBox && genEl && (
          <GenTextEditor
            el={genEl as HTMLElement}
            box={genBox}
            onDone={(text) => {
              setGenTyping(null)
              const orig = itemText(genEl)
              if (text !== orig) commit({ tweaks: withTweak(brand, page, genTyping, { ...tweaks[genTyping], text }) })
            }}
          />
        )}
        {guides.map((g, i) => (
          <div key={i} className={`ly-guide ly-guide-${g.axis}`} style={g.axis === 'x' ? { left: `${g.at * 100}%` } : { top: `${g.at * 100}%` }} />
        ))}
        {editing && dropping && <div className="ly-drop">Drop to add the image</div>}
        {target && <TargetHint el={target} />}
      </div>
    </BgScope>
  )
}


/** Clicking anywhere else finishes typing, even where the click itself is captured for dragging. */
function useBlurOnOutside(ref: { current: HTMLElement | null }) {
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) ref.current.blur()
    }
    window.addEventListener('pointerdown', onDown, true)
    return () => window.removeEventListener('pointerdown', onDown, true)
  }, [ref])
}

const round = (v: number) => Math.round(v * 100) / 100

/** Highlights the page an item will land on. */
function TargetHint({ el }: { el: HTMLElement }) {
  useLayoutEffect(() => {
    el.classList.add('is-target')
    return () => el.classList.remove('is-target')
  }, [el])
  return null
}

/** Types over a page item in place, in its own font, then hands the text back. */
function GenTextEditor({ el, box, onDone }: { el: HTMLElement; box: Frac; onDone: (text: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useBlurOnOutside(ref)
  useLayoutEffect(() => {
    const cs = getComputedStyle(el)
    // The overlay is zoomed like the page, so CSS sizes carry over; only an item's own scale is added.
    const scale = parseFloat(el.style.getPropertyValue('scale')) || 1
    const ed = ref.current!
    Object.assign(ed.style, {
      fontFamily: cs.fontFamily,
      fontSize: `${parseFloat(cs.fontSize) * scale}px`,
      fontWeight: cs.fontWeight,
      fontStyle: cs.fontStyle,
      letterSpacing: cs.letterSpacing,
      lineHeight: cs.lineHeight,
      color: cs.color,
      textTransform: cs.textTransform,
      textAlign: cs.textAlign,
    })
    ed.innerText = itemText(el)
    const prev = el.style.getPropertyValue('visibility')
    el.style.setProperty('visibility', 'hidden')
    ed.focus()
    const range = document.createRange()
    range.selectNodeContents(ed)
    const s = window.getSelection()
    s?.removeAllRanges()
    s?.addRange(range)
    return () => {
      if (prev) el.style.setProperty('visibility', prev)
      else el.style.removeProperty('visibility')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div
      ref={ref}
      className="ly-typing gen-typing"
      contentEditable
      suppressContentEditableWarning
      style={{ position: 'absolute', left: `${box.x * 100}%`, top: `${box.y * 100}%`, minWidth: `${box.w * 100}%`, whiteSpace: 'pre-wrap' }}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape') ref.current?.blur()
      }}
      onBlur={() => onDone(ref.current?.innerText.replace(/\n$/, '') ?? '')}
    />
  )
}

function TextEditor({ layer, onDone }: { layer: Layer; onDone: (text: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useBlurOnOutside(ref)
  useEffect(() => {
    const el = ref.current!
    el.innerText = layer.text ?? ''
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    const s = window.getSelection()
    s?.removeAllRanges()
    s?.addRange(range)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div
      ref={ref}
      className="ly-typing"
      contentEditable
      suppressContentEditableWarning
      style={textStyle(layer)}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape') ref.current?.blur()
      }}
      onBlur={() => onDone(ref.current?.innerText.replace(/\n$/, '') ?? '')}
    />
  )
}
