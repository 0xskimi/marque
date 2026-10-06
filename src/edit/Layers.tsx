import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type DragEvent } from 'react'
import type { Layer } from '../types'
import { useImage, importPhoto } from '../lib/images'
import { derive } from '../lib/derive'
import { BgScope, LogoImg } from '../pages/common'
import { toneVars } from '../lib/color'
import { layersOf, uid, useEdit, withLayers } from './context'

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

/**
 * Free layers on one page. Static in view mode; in edit mode they can be
 * selected, dragged, resized, edited and dropped onto, like a Figma frame.
 */
export function Overlay({ page, bg }: { page: string; bg: string }) {
  const edit = useEdit()
  const ref = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [live, setLive] = useState<Layer | null>(null)
  const [guides, setGuides] = useState<Guide[]>([])
  const [typing, setTyping] = useState<string | null>(null)
  const [dropping, setDropping] = useState(false)
  if (!edit) return null
  const { brand, editing, sel, setSel, commit } = edit
  const layers = layersOf(brand, page)
  if (!editing && !layers.length) return null

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
    setDrag({ id: l.id, handle, px: e.clientX, py: e.clientY, orig, W: r.width, H: r.height, others })
  }

  function move(e: RPointerEvent) {
    if (!drag) return
    const { orig: o, W, H, handle } = drag
    const dx = (e.clientX - drag.px) / W
    const dy = (e.clientY - drag.py) / H
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
      // Images and logos keep their proportions from a corner; shift does it for shapes.
      const corner = (left || right) && (top || bottom)
      const lock = corner && ((o.kind === 'image' || o.kind === 'logo') !== e.shiftKey)
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

  function end() {
    if (!drag) return
    if (live) {
      const moved = live.x !== drag.orig.x || live.y !== drag.orig.y || live.w !== drag.orig.w || live.h !== drag.orig.h
      if (moved) patch(drag.id, { x: live.x, y: live.y, w: live.w, h: live.h })
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

  return (
    <BgScope bg={bg}>
      <div
        ref={ref}
        className={`layers ${editing ? 'is-editing' : ''} ${dropping ? 'is-dropping' : ''}`}
        style={toneVars(bg) as CSSProperties}
        onPointerDown={(e) => {
          if (editing && e.target === e.currentTarget) {
            setTyping(null)
            setSel({ page })
          }
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
        {guides.map((g, i) => (
          <div key={i} className={`ly-guide ly-guide-${g.axis}`} style={g.axis === 'x' ? { left: `${g.at * 100}%` } : { top: `${g.at * 100}%` }} />
        ))}
        {editing && dropping && <div className="ly-drop">Drop to add the image</div>}
      </div>
    </BgScope>
  )
}

function TextEditor({ layer, onDone }: { layer: Layer; onDone: (text: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
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
