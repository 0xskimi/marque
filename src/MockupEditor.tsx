import { useRef, useState, type PointerEvent as RPE } from 'react'
import type { Artwork, Brand, PhotoMockup, Placement } from './types'
import { makeCtx } from './pages/Guidelines'
import { PhotoScene } from './pages/PhotoScene'
import { uid } from './store'

const ARTWORK: { id: Artwork; label: string }[] = [
  { id: 'primary', label: 'Primary logo' },
  { id: 'logomark', label: 'Logomark' },
  { id: 'wordmark', label: 'Wordmark' },
  { id: 'secondary', label: 'Secondary lockup' },
  { id: 'card-front', label: 'Business card front' },
  { id: 'card-back', label: 'Business card back' },
  { id: 'letterhead', label: 'Letterhead' },
  { id: 'envelope', label: 'DL envelope' },
  { id: 'social', label: 'Social post' },
  { id: 'pattern', label: 'Brand pattern' },
  { id: 'tagline', label: 'Tagline' },
]

export function newPlacement(artwork: Artwork = 'primary'): Placement {
  return {
    id: uid(),
    corners: [
      [0.35, 0.35],
      [0.65, 0.35],
      [0.65, 0.65],
      [0.35, 0.65],
    ],
    artwork,
    tone: 'auto',
    blend: 'multiply',
    opacity: 0.92,
    scale: 0.7,
    fill: 'none',
  }
}

const W = 900
const H = 600

export function MockupEditor({ brand, mockup, onSave, onClose }: { brand: Brand; mockup: PhotoMockup; onSave: (m: PhotoMockup) => void; onClose: () => void }) {
  const [m, setM] = useState(mockup)
  const [sel, setSel] = useState<string | undefined>(mockup.placements[0]?.id)
  const stage = useRef<HTMLDivElement>(null)
  const drag = useRef<{ pid: string; corner: number; start: [number, number]; orig: [number, number][] } | null>(null)
  const ctx = makeCtx(brand)

  const k = Math.min(W / m.width, H / m.height)
  const dw = m.width * k
  const dh = m.height * k
  const ox = (W - dw) / 2
  const oy = (H - dh) / 2
  const toUV = (e: RPE): [number, number] => {
    const r = stage.current!.getBoundingClientRect()
    return [(e.clientX - r.left - ox) / dw, (e.clientY - r.top - oy) / dh]
  }
  const current = m.placements.find((p) => p.id === sel)

  function setPlacement(id: string, patch: Partial<Placement>) {
    setM((x) => ({ ...x, placements: x.placements.map((p) => (p.id === id ? { ...p, ...patch } : p)) }))
  }

  function down(e: RPE, pid: string, corner: number) {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    setSel(pid)
    const p = m.placements.find((x) => x.id === pid)!
    drag.current = { pid, corner, start: toUV(e), orig: p.corners.map((c) => [...c] as [number, number]) }
  }

  function move(e: RPE) {
    const g = drag.current
    if (!g) return
    const [u, v] = toUV(e)
    const du = u - g.start[0]
    const dv = v - g.start[1]
    const corners = g.orig.map((c, i) => (g.corner === -1 || g.corner === i ? ([c[0] + du, c[1] + dv] as [number, number]) : c))
    setPlacement(g.pid, { corners })
  }

  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="me-stage" ref={stage} style={{ width: W, height: H }} onPointerMove={move} onPointerUp={() => (drag.current = null)}>
          <PhotoScene ctx={ctx} mockup={m} width={W} height={H} fit="contain" />
          <svg className="me-handles" width={W} height={H}>
            {m.placements.map((p) => {
              const pts = p.corners.map(([u, v]) => [ox + u * dw, oy + v * dh])
              const on = p.id === sel
              return (
                <g key={p.id}>
                  <polygon
                    points={pts.map((q) => q.join(',')).join(' ')}
                    fill={on ? '#2b45f514' : 'transparent'}
                    stroke={on ? '#2b45f5' : '#ffffffaa'}
                    strokeWidth={on ? 1.5 : 1}
                    strokeDasharray={on ? undefined : '4 3'}
                    style={{ cursor: 'move' }}
                    onPointerDown={(e) => down(e, p.id, -1)}
                  />
                  {on &&
                    pts.map(([x, y], i) => (
                      <circle key={i} cx={x} cy={y} r={7} fill="#fff" stroke="#2b45f5" strokeWidth={2} style={{ cursor: 'grab' }} onPointerDown={(e) => down(e, p.id, i)} />
                    ))}
                </g>
              )
            })}
          </svg>
        </div>
        <div className="me-side">
          <label className="field">
            <span className="field-label">Mockup name</span>
            <input value={m.title} onChange={(e) => setM({ ...m, title: e.target.value })} />
          </label>
          <p className="ed-note">Drag the corner handles onto the surface in the photo, starting top left and going clockwise. Drag inside the shape to move it.</p>
          <div className="me-list">
            {m.placements.map((p, i) => (
              <button key={p.id} className={p.id === sel ? 'on' : ''} onClick={() => setSel(p.id)}>
                {i + 1}. {ARTWORK.find((a) => a.id === p.artwork)?.label}
              </button>
            ))}
            <button
              className="add"
              onClick={() => {
                const p = newPlacement()
                setM({ ...m, placements: [...m.placements, p] })
                setSel(p.id)
              }}
            >
              + Add surface
            </button>
          </div>
          {current && (
            <>
              <label className="field">
                <span className="field-label">Artwork</span>
                <select value={current.artwork} onChange={(e) => setPlacement(current.id, { artwork: e.target.value as Artwork })}>
                  {ARTWORK.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="row2">
                <label className="field">
                  <span className="field-label">Logo colour</span>
                  <select value={current.tone} onChange={(e) => setPlacement(current.id, { tone: e.target.value as Placement['tone'] })}>
                    <option value="auto">Automatic</option>
                    <option value="full">Full colour</option>
                    <option value="white">White</option>
                    <option value="black">Black</option>
                    <option value="primary">Brand colour</option>
                    <option value="dark">Dark colour</option>
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">Surface fill</span>
                  <select value={current.fill} onChange={(e) => setPlacement(current.id, { fill: e.target.value as Placement['fill'] })}>
                    <option value="none">None (photo shows)</option>
                    <option value="primary">Brand colour</option>
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                    <option value="accent">Accent</option>
                  </select>
                </label>
              </div>
              <label className="field">
                <span className="field-label">Blend</span>
                <select value={current.blend} onChange={(e) => setPlacement(current.id, { blend: e.target.value as Placement['blend'] })}>
                  <option value="multiply">Multiply (printed on light surfaces)</option>
                  <option value="screen">Screen (light ink on dark surfaces)</option>
                  <option value="overlay">Overlay (embossed look)</option>
                  <option value="normal">Normal (sticker or screen)</option>
                </select>
              </label>
              <label className="field">
                <span className="field-label">Logo size: {Math.round(current.scale * 100)}%</span>
                <input type="range" min={0.1} max={1} step={0.02} value={current.scale} onChange={(e) => setPlacement(current.id, { scale: Number(e.target.value) })} />
              </label>
              <label className="field">
                <span className="field-label">Opacity: {Math.round(current.opacity * 100)}%</span>
                <input type="range" min={0.2} max={1} step={0.02} value={current.opacity} onChange={(e) => setPlacement(current.id, { opacity: Number(e.target.value) })} />
              </label>
              <button
                className="btn-sm ghost"
                onClick={() => {
                  setM({ ...m, placements: m.placements.filter((p) => p.id !== current.id) })
                  setSel(m.placements.find((p) => p.id !== current.id)?.id)
                }}
              >
                Remove this surface
              </button>
            </>
          )}
          <div className="me-actions">
            <button className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn" onClick={() => onSave(m)}>
              Save mockup
            </button>
          </div>
          <p className="ed-note">Saved mockups live in your library and work for every project.</p>
        </div>
      </div>
    </div>
  )
}
