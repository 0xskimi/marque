import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

export const ZOOM_MIN = 0.25
export const ZOOM_MAX = 2

const clamp = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100))

/**
 * Figma-style navigation for the scrolling canvas:
 * hold Space (or use the middle mouse button) and drag to pan,
 * ⌘/Ctrl + scroll or a trackpad pinch to zoom around the pointer,
 * ⌘/Ctrl + 0 / + / − for 100%, zoom in and zoom out.
 */
export function usePanZoom(ref: RefObject<HTMLElement | null>, zoom: number, setZoom: (z: number) => void) {
  const [space, setSpace] = useState(false)
  const [panning, setPanning] = useState(false)
  // Where to keep still while zooming: a point in the canvas viewport and the zoom it was measured at.
  const anchor = useRef<{ x: number; y: number; left: number; top: number; from: number; page?: Element; fx: number; fy: number } | null>(null)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom

  function zoomTo(next: number, at?: { x: number; y: number }) {
    const el = ref.current
    const z = clamp(next)
    if (!el || z === zoomRef.current) return
    const x = at?.x ?? el.clientWidth / 2
    const y = at?.y ?? el.clientHeight / 2
    // Pin the zoom to the page under the point, since the gaps between pages don't scale.
    const box = el.getBoundingClientRect()
    const page = document.elementFromPoint(box.left + x, box.top + y)?.closest('.page, .slide, .print-sheet') ?? undefined
    const r = page?.getBoundingClientRect()
    const fx = r ? (box.left + x - r.left) / r.width : 0
    const fy = r ? (box.top + y - r.top) / r.height : 0
    anchor.current = { x, y, left: el.scrollLeft, top: el.scrollTop, from: zoomRef.current, page, fx, fy }
    setZoom(z)
  }
  const zoomToRef = useRef(zoomTo)
  zoomToRef.current = zoomTo

  // After a zoom renders, scroll so the content under the anchor point stays put.
  useLayoutEffect(() => {
    const el = ref.current
    const a = anchor.current
    if (!el || !a) return
    anchor.current = null
    const r = zoom / a.from
    el.scrollLeft = (a.left + a.x) * r - a.x
    el.scrollTop = (a.top + a.y) * r - a.y
    if (a.page?.isConnected) {
      const box = el.getBoundingClientRect()
      const p = a.page.getBoundingClientRect()
      el.scrollLeft += p.left + a.fx * p.width - (box.left + a.x)
      el.scrollTop += p.top + a.fy * p.height - (box.top + a.y)
    }
  }, [zoom, ref])

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const typing = (t: EventTarget | null) => {
      const e = t as HTMLElement | null
      return !!e && (e.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName))
    }

    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return // plain scrolling pans the canvas natively
      e.preventDefault()
      const box = el.getBoundingClientRect()
      // Pinch gestures arrive as small ctrl+wheel deltas; mouse wheels as big ones.
      const step = Math.exp(-e.deltaY * (Math.abs(e.deltaY) < 40 ? 0.01 : 0.0015))
      zoomToRef.current(zoomRef.current * step, { x: e.clientX - box.left, y: e.clientY - box.top })
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (typing(e.target)) return
      if (e.code === 'Space') {
        e.preventDefault() // stops the browser paging down
        setSpace(true)
        return
      }
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === '0') zoomToRef.current(1)
      else if (e.key === '=' || e.key === '+') zoomToRef.current(zoomRef.current * 1.25)
      else if (e.key === '-') zoomToRef.current(zoomRef.current / 1.25)
      else return
      e.preventDefault()
    }
    const onKeyUp = (e: KeyboardEvent) => e.code === 'Space' && setSpace(false)
    const onBlur = () => setSpace(false)

    el.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      el.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [ref])

  // Drag to pan. Runs in the capture phase so layers underneath don't start moving.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onDown = (e: PointerEvent) => {
      if (!(e.button === 1 || (e.button === 0 && space))) return
      e.preventDefault()
      e.stopPropagation()
      const start = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop }
      setPanning(true)
      const move = (m: PointerEvent) => {
        el.scrollLeft = start.left - (m.clientX - start.x)
        el.scrollTop = start.top - (m.clientY - start.y)
      }
      const up = () => {
        setPanning(false)
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    }
    // Middle-click autoscroll would fight the pan.
    const noAuto = (e: MouseEvent) => e.button === 1 && e.preventDefault()
    el.addEventListener('pointerdown', onDown, true)
    el.addEventListener('mousedown', noAuto)
    return () => {
      el.removeEventListener('pointerdown', onDown, true)
      el.removeEventListener('mousedown', noAuto)
    }
  }, [ref, space])

  return { zoomTo, hand: space || panning, panning }
}
