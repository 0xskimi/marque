import { useEffect, type ReactNode } from 'react'
import type { Layer, LogoSlot } from '../types'
import { LOGO_SLOTS } from '../types'
import { normHex } from '../lib/color'
import { importPhoto } from '../lib/images'
import { layersOf, uid, useEdit, withLayers } from './context'
import { imageLayer, pickImages } from './Layers'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="ins-row">
      <span>{label}</span>
      {children}
    </label>
  )
}

function Num({ value, onChange, step = 1, min, max }: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number }) {
  return <input type="number" value={Math.round(value * 100) / 100} step={step} min={min} max={max} onChange={(e) => e.target.value !== '' && onChange(Number(e.target.value))} />
}

function Colors({ value, onChange, allowNone }: { value?: string; onChange: (v: string | undefined) => void; allowNone?: boolean }) {
  const edit = useEdit()!
  const swatches = [...edit.brand.colors.map((c) => normHex(c.hex)), '#FFFFFF', '#000000']
  return (
    <div className="ins-colors">
      {allowNone && (
        <button className={`ins-sw auto ${!value ? 'on' : ''}`} title="Follow the page" onClick={() => onChange(undefined)}>
          A
        </button>
      )}
      {[...new Set(swatches)].map((c) => (
        <button key={c} className={`ins-sw ${value?.toUpperCase() === c ? 'on' : ''}`} style={{ background: c }} title={c} onClick={() => onChange(c)} />
      ))}
      <input type="color" value={(value ?? '#000000').slice(0, 7).toLowerCase()} onChange={(e) => onChange(e.target.value.toUpperCase())} />
    </div>
  )
}

/** Z-order, duplicate and delete for the selected layer. Also wired to the keyboard. */
export function useLayerActions() {
  const edit = useEdit()
  if (!edit?.sel?.layer) return null
  const { brand, sel, commit, setSel } = edit
  const page = sel.page
  const layers = layersOf(brand, page)
  const i = layers.findIndex((l) => l.id === sel.layer)
  if (i < 0) return null
  const layer = layers[i]
  const save = (next: Layer[]) => commit({ overlays: withLayers(brand, page, next) })
  return {
    layer,
    patch: (p: Partial<Layer>) => save(layers.map((l) => (l.id === layer.id ? { ...l, ...p } : l))),
    remove: () => {
      save(layers.filter((l) => l.id !== layer.id))
      setSel({ page })
    },
    duplicate: () => {
      const copy = { ...layer, id: uid(), x: layer.x + 0.02, y: layer.y + 0.02 }
      save([...layers.slice(0, i + 1), copy, ...layers.slice(i + 1)])
      setSel({ page, layer: copy.id })
    },
    order: (to: 'front' | 'back' | 'up' | 'down') => {
      const rest = layers.filter((l) => l.id !== layer.id)
      const at = to === 'front' ? rest.length : to === 'back' ? 0 : to === 'up' ? Math.min(rest.length, i + 1) : Math.max(0, i - 1)
      save([...rest.slice(0, at), layer, ...rest.slice(at)])
    },
  }
}

export function Inspector() {
  const edit = useEdit()
  const act = useLayerActions()
  if (!edit?.editing) return null
  if (!act) {
    return (
      <aside className="inspector">
        <h4>Editing</h4>
        <p className="ins-hint">
          Use the bar above any page to add text, images, shapes or your logo, or to add your own slide after it. Drag a PNG from Finder onto a page to place it.
        </p>
        <p className="ins-hint">Drag to move, drag the handles to resize. Hold Alt to turn off snapping, Shift to keep straight lines or proportions.</p>
        <p className="ins-hint">
          Keys: Delete removes, arrows nudge (Shift for bigger steps), ⌘D duplicates, ] and [ change the order, ⌘Z undoes, Esc deselects.
        </p>
      </aside>
    )
  }
  const { layer: l, patch } = act
  const pct = (v: number) => v * 100
  return (
    <aside className="inspector">
      <h4>{{ image: 'Image', text: 'Text', rect: 'Shape', logo: 'Logo' }[l.kind]}</h4>
      <div className="ins-grid">
        <Row label="X %">
          <Num value={pct(l.x)} step={0.5} onChange={(v) => patch({ x: v / 100 })} />
        </Row>
        <Row label="Y %">
          <Num value={pct(l.y)} step={0.5} onChange={(v) => patch({ y: v / 100 })} />
        </Row>
        <Row label="W %">
          <Num value={pct(l.w)} step={0.5} min={1} onChange={(v) => patch({ w: v / 100 })} />
        </Row>
        {l.kind !== 'text' && (
          <Row label="H %">
            <Num value={pct(l.h)} step={0.5} min={1} onChange={(v) => patch({ h: v / 100 })} />
          </Row>
        )}
      </div>
      <Row label="Opacity">
        <input type="range" min={0} max={1} step={0.05} value={l.opacity ?? 1} onChange={(e) => patch({ opacity: Number(e.target.value) })} />
      </Row>

      {l.kind === 'text' && (
        <>
          <Row label="Text">
            <textarea rows={3} value={l.text ?? ''} onChange={(e) => patch({ text: e.target.value })} />
          </Row>
          <div className="ins-grid">
            <Row label="Font">
              <select value={l.font ?? 'body'} onChange={(e) => patch({ font: e.target.value as Layer['font'] })}>
                <option value="heading">Heading</option>
                <option value="body">Body</option>
              </select>
            </Row>
            <Row label="Size pt">
              <Num value={l.size ?? 14} step={1} min={4} onChange={(v) => patch({ size: v })} />
            </Row>
            <Row label="Weight">
              <select value={l.weight ?? (l.font === 'heading' ? 700 : 400)} onChange={(e) => patch({ weight: Number(e.target.value) })}>
                {[300, 400, 500, 600, 700, 800].map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Line">
              <Num value={l.lineHeight ?? (l.font === 'heading' ? 1.1 : 1.45)} step={0.05} min={0.7} onChange={(v) => patch({ lineHeight: v })} />
            </Row>
            <Row label="Spacing">
              <Num value={l.tracking ?? 0} step={0.01} onChange={(v) => patch({ tracking: v })} />
            </Row>
            <Row label="Align">
              <select value={l.align ?? 'left'} onChange={(e) => patch({ align: e.target.value as Layer['align'] })}>
                <option value="left">Left</option>
                <option value="center">Centre</option>
                <option value="right">Right</option>
              </select>
            </Row>
          </div>
          <label className="ins-check">
            <input type="checkbox" checked={!!l.uppercase} onChange={(e) => patch({ uppercase: e.target.checked })} /> Capitals
          </label>
          <Row label="Colour">
            <Colors value={l.color} allowNone onChange={(c) => patch({ color: c })} />
          </Row>
        </>
      )}

      {l.kind === 'image' && (
        <>
          <button
            className="btn ghost small"
            onClick={async () => {
              const [f] = await pickImages()
              if (f) patch({ imageId: (await importPhoto(f)).id })
            }}
          >
            Replace image
          </button>
          <div className="ins-grid">
            <Row label="Fit">
              <select value={l.fit ?? 'cover'} onChange={(e) => patch({ fit: e.target.value as Layer['fit'] })}>
                <option value="cover">Fill (crop)</option>
                <option value="contain">Fit whole image</option>
              </select>
            </Row>
            <Row label="Radius mm">
              <Num value={l.radius ?? 0} min={0} onChange={(v) => patch({ radius: v })} />
            </Row>
          </div>
        </>
      )}

      {l.kind === 'rect' && (
        <>
          <Row label="Fill">
            <Colors value={l.fill} onChange={(c) => patch({ fill: c ?? '#000000' })} />
          </Row>
          <Row label="Radius mm">
            <Num value={l.radius ?? 0} min={0} onChange={(v) => patch({ radius: v })} />
          </Row>
        </>
      )}

      {l.kind === 'logo' && (
        <div className="ins-grid">
          <Row label="Logo">
            <select value={l.slot ?? 'primary'} onChange={(e) => patch({ slot: e.target.value as LogoSlot })}>
              {LOGO_SLOTS.filter((s) => edit.brand.logos[s.id]).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Version">
            <select value={l.version ?? 'auto'} onChange={(e) => patch({ version: e.target.value as Layer['version'] })}>
              <option value="auto">Automatic</option>
              <option value="full">Full colour</option>
              <option value="white">White</option>
              <option value="black">Black</option>
            </select>
          </Row>
        </div>
      )}

      <div className="ins-actions">
        <button onClick={() => act.order('front')} title="Bring to front">Front</button>
        <button onClick={() => act.order('back')} title="Send to back">Back</button>
        <button onClick={act.duplicate}>Duplicate</button>
        <button className="danger" onClick={act.remove}>
          Delete
        </button>
      </div>
    </aside>
  )
}

/** Keyboard shortcuts while editing. */
export function EditKeys({ undo }: { undo: () => void }) {
  const edit = useEdit()
  const act = useLayerActions()
  useEffect(() => {
    if (!edit?.editing) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
        return
      }
      if (e.key === 'Escape') return edit.setSel(null)
      if (!act) return
      const step = e.shiftKey ? 0.02 : 0.002
      const l = act.layer
      if (e.key === 'Delete' || e.key === 'Backspace') act.remove()
      else if (mod && e.key.toLowerCase() === 'd') act.duplicate()
      else if (e.key === ']') act.order(mod ? 'front' : 'up')
      else if (e.key === '[') act.order(mod ? 'back' : 'down')
      else if (e.key === 'ArrowLeft') act.patch({ x: l.x - step })
      else if (e.key === 'ArrowRight') act.patch({ x: l.x + step })
      else if (e.key === 'ArrowUp') act.patch({ y: l.y - step })
      else if (e.key === 'ArrowDown') act.patch({ y: l.y + step })
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [edit, act, undo])

  // Paste an image (a screenshot, or a PNG copied from Figma or Photoshop) onto the selected page.
  useEffect(() => {
    if (!edit?.editing) return
    const onPaste = async (e: ClipboardEvent) => {
      const t = e.target as HTMLElement
      if (t.isContentEditable || /^(INPUT|TEXTAREA)$/.test(t.tagName)) return
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'))
      const page = edit.sel?.page
      if (!file || !page) return
      e.preventDefault()
      const box = document.querySelector(`.sheet[data-key="${CSS.escape(page)}"] .layers`)?.getBoundingClientRect()
      const l = await imageLayer(file, box ? box.width / box.height : 16 / 9)
      edit.commit({ overlays: withLayers(edit.brand, page, [...layersOf(edit.brand, page), l]) })
      edit.setSel({ page, layer: l.id })
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [edit])
  return null
}
