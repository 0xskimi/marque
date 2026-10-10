import { Fragment, useState, type ReactNode } from 'react'
import type { CustomSlide, DocId, Layer } from '../types'
import { derive } from '../lib/derive'
import { inkOn } from '../lib/color'
import { BgScope } from '../pages/common'
import { Overlay, imageLayer, pickImages } from './Layers'
import { layersOf, slidesOf, uid, useEdit, withLayers } from './context'
import { tweaksOf } from './tweaks'
import { download } from '../lib/export'
import { pagePng, scenes, vectorPdf } from '../lib/editable'

export interface SheetItem {
  key: string
  node: ReactNode
  /** Page background, so logo layers pick the right version. */
  bg?: string
}

const SHELL: Record<DocId, string> = {
  guidelines: 'page bleed custom-slide',
  assets: 'slide asset-slide bleed custom-slide',
  deck: 'slide custom-slide',
}

export type Template = 'blank' | 'mockup' | 'full' | 'two'

export const TEMPLATES: { id: Template; label: string }[] = [
  { id: 'mockup', label: 'Mockup with details' },
  { id: 'full', label: 'Full-bleed image with caption' },
  { id: 'two', label: 'Two images' },
  { id: 'blank', label: 'Blank artboard' },
]

function text(p: Partial<Layer> & Pick<Layer, 'x' | 'y' | 'w' | 'text'>): Layer {
  return { id: uid(), kind: 'text', h: 0.06, font: 'body', size: 12, ...p }
}

/** Starting layers for a new slide. Images come from the files you pick, or stay as drop targets. */
async function templateLayers(t: Template, aspect: number, ink: string): Promise<Layer[]> {
  if (t === 'blank') return []
  const files = await pickImages(t === 'two')
  const slot = async (i: number, x: number, y: number, w: number, h: number, fit: Layer['fit'] = 'cover'): Promise<Layer> => {
    const base: Layer = { id: uid(), kind: 'image', x, y, w, h, fit }
    if (!files[i]) return base
    const l = await imageLayer(files[i], aspect)
    return { ...base, imageId: l.imageId }
  }
  const muted = ink === '#FFFFFF' ? '#FFFFFFB3' : '#00000099'
  if (t === 'mockup')
    return [
      await slot(0, 0, 0, 0.6, 1),
      text({ x: 0.66, y: 0.12, w: 0.28, text: 'Mockup', size: 8, weight: 600, uppercase: true, tracking: 0.14, color: muted }),
      text({ x: 0.66, y: 0.18, w: 0.3, text: 'Business cards', font: 'heading', size: 30 }),
      text({
        x: 0.66,
        y: 0.36,
        w: 0.28,
        size: 11,
        text: 'Describe what the client is looking at and why it works.\n\nSize: 85 × 55 mm\nStock: 400 gsm uncoated\nFinish: spot UV on the logo',
      }),
      { id: uid(), kind: 'logo', x: 0.66, y: 0.84, w: 0.12, h: 0.07, slot: 'primary', version: 'auto' },
    ]
  if (t === 'full')
    return [
      await slot(0, 0, 0, 1, 1),
      text({ x: 0.05, y: 0.82, w: 0.5, text: 'Signage', font: 'heading', size: 26, color: '#FFFFFF' }),
      text({ x: 0.05, y: 0.9, w: 0.5, text: 'Brushed aluminium, 600 × 200 mm', size: 10, color: '#FFFFFFCC' }),
    ]
  return [
    await slot(0, 0.05, 0.12, 0.43, 0.66),
    await slot(1, 0.52, 0.12, 0.43, 0.66),
    text({ x: 0.05, y: 0.81, w: 0.43, text: 'Front', font: 'heading', size: 14 }),
    text({ x: 0.05, y: 0.86, w: 0.43, text: 'Details about this side.', size: 10, color: muted }),
    text({ x: 0.52, y: 0.81, w: 0.43, text: 'Back', font: 'heading', size: 14 }),
    text({ x: 0.52, y: 0.86, w: 0.43, text: 'Details about this side.', size: 10, color: muted }),
  ]
}

/**
 * Lays out a document's pages with your custom slides spliced in, free layers
 * over every page, and in edit mode a toolbar per page.
 */
export function Arrange({ doc, items, defaultBg = '#FFFFFF' }: { doc: DocId; items: SheetItem[]; defaultBg?: string }) {
  const edit = useEdit()
  if (!edit) return <>{items.map((i) => <Fragment key={i.key}>{i.node}</Fragment>)}</>
  const { brand, editing } = edit
  const hidden = new Set(brand.hiddenSlides ?? [])
  const mine = slidesOf(brand).filter((s) => s.doc === doc)
  const keys = new Set(items.map((i) => `${doc}:${i.key}`))

  type Row = { key: string; node: ReactNode; bg: string; custom?: CustomSlide }
  const rows: Row[] = []
  const pushCustom = (after: string) => {
    for (const s of mine.filter((m) => m.after === after)) {
      const k = `c:${s.id}`
      rows.push({
        key: k,
        bg: s.bg,
        custom: s,
        node: (
          <BgScope bg={s.bg}>
            <section className={SHELL[doc]} style={{ background: s.bg, color: inkOn(s.bg), ['--fg' as string]: inkOn(s.bg) }} />
          </BgScope>
        ),
      })
      pushCustom(k)
    }
  }
  pushCustom('^')
  for (const it of items) {
    const k = `${doc}:${it.key}`
    rows.push({ key: k, node: it.node, bg: it.bg ?? defaultBg })
    pushCustom(k)
  }
  // Slides whose anchor page has gone (switched off or removed) land at the end.
  for (const s of mine.filter((m) => m.after !== '^' && !keys.has(m.after) && !m.after.startsWith('c:'))) {
    rows.push({ key: `c:${s.id}`, bg: s.bg, custom: s, node: <section className={SHELL[doc]} style={{ background: s.bg, color: inkOn(s.bg) }} /> })
    pushCustom(`c:${s.id}`)
  }

  return (
    <>
      {rows.map((r, i) => {
        const isHidden = !r.custom && hidden.has(r.key)
        if (isHidden && !editing) return null
        return (
          <div key={r.key} data-key={r.key} className={`sheet sheet-${doc} ${isHidden ? 'is-hidden' : ''} ${editing ? 'is-editing' : ''}`}>
            {editing && <SheetBar doc={doc} row={r} prev={rows[i - 1]?.key ?? '^'} hidden={isHidden} />}
            {/* Layers come first so a page break after the page can't push them onto the next sheet. */}
            <Overlay page={r.key} bg={r.bg} pageW={doc === 'guidelines' && brand.pageFormat === 'a4' ? 297 : 320} />
            {r.node}
          </div>
        )
      })}
    </>
  )
}

function SheetBar({ doc, row, prev, hidden }: { doc: DocId; row: { key: string; bg: string; custom?: CustomSlide }; prev: string; hidden: boolean }) {
  const edit = useEdit()!
  const { brand, commit, setSel, sel } = edit
  const [menu, setMenu] = useState(false)
  const d = derive(brand)
  const page = row.key
  const layers = layersOf(brand, page)
  const aspect = doc === 'guidelines' && brand.pageFormat === 'a4' ? 297 / 210 : 320 / 180

  const add = (l: Layer) => {
    commit({ overlays: withLayers(brand, page, [...layers, l]) })
    setSel({ page, layer: l.id })
  }

  async function addImage() {
    const files = await pickImages(true)
    const added: Layer[] = []
    for (const [i, f] of files.entries()) added.push(await imageLayer(f, aspect, 0.5 + i * 0.03, 0.5 + i * 0.03))
    if (!added.length) return
    commit({ overlays: withLayers(brand, page, [...layers, ...added]) })
    setSel({ page, layer: added[added.length - 1].id })
  }

  async function addSlide(t: Template) {
    setMenu(false)
    const bg = doc === 'assets' ? row.custom?.bg ?? (brand.template === 'bold' ? d.dark : '#121212') : '#FFFFFF'
    const s: CustomSlide = { id: uid(), doc, after: page, bg }
    const layers = await templateLayers(t, aspect, inkOn(bg))
    // Anything that followed this page now follows the new slide.
    const slides = (brand.customSlides ?? []).map((c) => (c.after === page ? { ...c, after: `c:${s.id}` } : c))
    commit({ customSlides: [...slides, s], overlays: withLayers(brand, `c:${s.id}`, layers) })
    setSel({ page: `c:${s.id}` })
  }

  function removeSlide() {
    const s = row.custom!
    const slides = (brand.customSlides ?? []).filter((c) => c.id !== s.id).map((c) => (c.after === page ? { ...c, after: s.after } : c))
    commit({ customSlides: slides, overlays: withLayers(brand, page, []) })
    setSel(null)
  }

  function moveSlide(dir: -1 | 1) {
    // Re-anchor: up = follow the page before the previous one; down = follow the next page.
    const s = row.custom!
    const all = Array.from(document.querySelectorAll<HTMLElement>(`.sheet-${doc}[data-key]`)).map((e) => e.dataset.key!)
    const i = all.indexOf(page)
    const others = (brand.customSlides ?? []).filter((c) => c.id !== s.id).map((c) => (c.after === page ? { ...c, after: s.after } : c))
    let after: string
    if (dir === -1) {
      if (i <= 0) return
      after = i - 2 >= 0 ? all[i - 2] : '^'
    } else {
      if (i >= all.length - 1) return
      after = all[i + 1]
    }
    const shifted = others.map((c) => (c.after === after ? { ...c, after: page } : c))
    commit({ customSlides: [...shifted, { ...s, after }] })
  }

  const isSel = sel?.page === page
  const pageTweaks = tweaksOf(brand, page)
  const hiddenItems = Object.entries(pageTweaks).filter(([, t]) => t.hide)
  const [busy, setBusy] = useState(false)

  /** This artboard on its own: a PNG for slides, or an .ai file. */
  async function exportOne(kind: 'png' | 'ai') {
    const sheet = document.querySelector<HTMLElement>(`.sheet[data-key="${CSS.escape(page)}"]`)
    if (!sheet || busy) return
    setSel(null)
    setBusy(true)
    try {
      await new Promise((r) => requestAnimationFrame(() => r(null)))
      const n = Array.from(document.querySelectorAll(`.sheet-${doc}[data-key]`)).indexOf(sheet) + 1
      const name = `${brand.name} ${String(n).padStart(2, '0')}`
      if (kind === 'png') download(await pagePng(sheet, brand, 300), `${name}.png`)
      else download((await vectorPdf(await scenes([sheet], brand, () => {}), brand, name, () => {})).blob, `${name}.ai`)
    } catch (e) {
      alert(`Export failed: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`sheet-bar ${isSel ? 'is-active' : ''}`} data-prev={prev}>
      <button onClick={() => add({ id: uid(), kind: 'text', x: 0.3, y: 0.44, w: 0.4, h: 0.08, text: 'Double-click to edit', font: 'heading', size: 24, align: 'center' })}>Text</button>
      <button onClick={addImage}>Image</button>
      <button onClick={() => add({ id: uid(), kind: 'rect', x: 0.35, y: 0.3, w: 0.3, h: 0.4, fill: d.primary })}>Shape</button>
      <button onClick={() => add({ id: uid(), kind: 'logo', x: 0.4, y: 0.4, w: 0.2, h: 0.2, slot: 'primary', version: 'auto' })}>Logo</button>
      <span className="sheet-bar-sep" />
      <div className="sheet-bar-menu">
        <button onClick={() => setMenu((m) => !m)}>Add slide after ▾</button>
        {menu && (
          <div className="sheet-bar-pop" onMouseLeave={() => setMenu(false)}>
            {TEMPLATES.map((t) => (
              <button key={t.id} onClick={() => addSlide(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <span className="sheet-bar-sep" />
      {row.custom ? (
        <>
          <label className="sheet-bar-color" title="Background">
            <span style={{ background: row.custom.bg }} />
            <input
              type="color"
              value={row.custom.bg.slice(0, 7).toLowerCase()}
              onChange={(e) => commit({ customSlides: (brand.customSlides ?? []).map((c) => (c.id === row.custom!.id ? { ...c, bg: e.target.value.toUpperCase() } : c)) })}
            />
          </label>
          {[d.dark, d.primary, d.light, '#FFFFFF', '#121212'].map((c) => (
            <button key={c} className="sheet-bar-swatch" style={{ background: c }} title={c} onClick={() => commit({ customSlides: (brand.customSlides ?? []).map((x) => (x.id === row.custom!.id ? { ...x, bg: c } : x)) })} />
          ))}
          <span className="sheet-bar-sep" />
          <button onClick={() => moveSlide(-1)} title="Move up">↑</button>
          <button onClick={() => moveSlide(1)} title="Move down">↓</button>
          <button className="danger" onClick={removeSlide}>Delete slide</button>
        </>
      ) : (
        <button
          onClick={() => {
            const set = new Set(brand.hiddenSlides ?? [])
            if (set.has(page)) set.delete(page)
            else set.add(page)
            commit({ hiddenSlides: [...set] })
          }}
        >
          {hidden ? 'Show slide' : 'Hide slide'}
        </button>
      )}
      {hiddenItems.length > 0 && (
        <button
          title="Bring back items you hid on this page"
          onClick={() => {
            const next = Object.fromEntries(Object.entries(pageTweaks).map(([k, t]) => [k, { ...t, hide: undefined }]))
            const all = { ...(brand.tweaks ?? {}) }
            const cleaned = Object.fromEntries(Object.entries(next).filter(([, t]) => Object.values(t).some((v) => v !== undefined)))
            if (Object.keys(cleaned).length) all[page] = cleaned
            else delete all[page]
            commit({ tweaks: all })
          }}
        >
          Show hidden items ({hiddenItems.length})
        </button>
      )}
      <span className="sheet-bar-sep" />
      <button disabled={busy} onClick={() => exportOne('png')} title="Download this page as a 300 dpi PNG">
        PNG
      </button>
      <button disabled={busy} onClick={() => exportOne('ai')} title="Download this page as an editable Illustrator file">
        .ai
      </button>
    </div>
  )
}
