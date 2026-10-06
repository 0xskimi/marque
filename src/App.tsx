import { useEffect, useRef, useState } from 'react'
import { useProjects, blankBrand, uid, migrate } from './store'
import type { Brand, PhotoMockup } from './types'
import { Editor } from './Editor'
import { Guidelines } from './pages/Guidelines'
import { Deck } from './pages/Deck'
import { Assets } from './pages/Assets'
import { Print, printPageCss } from './pages/Print'
import { MockupEditor } from './MockupEditor'
import { ensureFont } from './lib/fonts'
import { download, exportPackage, tokensCss } from './lib/export'
import { packImages, unpackImages } from './lib/images'
import { getLibrary, saveLibrary } from './lib/library'
import { EditContext, overlayImageIds, type EditApi, type Selection } from './edit/context'
import { EditKeys, Inspector } from './edit/Inspector'
import { usePanZoom, ZOOM_MAX, ZOOM_MIN } from './lib/panzoom'

type View = 'guidelines' | 'assets' | 'deck' | 'print'

const VIEWS: { id: View; label: string; title: string }[] = [
  { id: 'guidelines', label: 'Guidelines', title: 'Brand Guidelines' },
  { id: 'assets', label: 'Brand Assets', title: 'Brand Assets' },
  { id: 'deck', label: 'Presentation', title: 'Brand Presentation' },
  { id: 'print', label: 'Print files', title: 'Stationery Print Files' },
]

function pageSize(view: View, b: Brand) {
  if (view === 'guidelines' && b.pageFormat === 'a4') return '297mm 210mm'
  return '320mm 180mm'
}

export default function App() {
  const { projects, brand, update, select, add, remove, saveError } = useProjects()
  const [view, setView] = useState<View>('guidelines')
  const [zoom, setZoom] = useState(0.6)
  const [busy, setBusy] = useState<string | null>(null)
  const [marks, setMarks] = useState(true)
  const [editing, setEditing] = useState<PhotoMockup | null>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const [layoutMode, setLayoutMode] = useState(false)
  const [sel, setSel] = useState<Selection | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const pan = usePanZoom(canvasRef, zoom, setZoom)
  const history = useRef<{ snap: Pick<Brand, 'overlays' | 'customSlides' | 'hiddenSlides'>; at: number; keys: string }[]>([])
  const editingLayout = layoutMode && view !== 'print'

  const editApi: EditApi = {
    editing: editingLayout,
    brand,
    sel,
    setSel,
    commit(patch) {
      // Rapid changes to the same thing (typing, nudging) share one undo step.
      const keys = Object.keys(patch).sort().join()
      const last = history.current[history.current.length - 1]
      const now = Date.now()
      if (!last || now - last.at > 700 || last.keys !== keys) {
        history.current.push({ snap: { overlays: brand.overlays, customSlides: brand.customSlides, hiddenSlides: brand.hiddenSlides }, at: now, keys })
        if (history.current.length > 100) history.current.shift()
      } else last.at = now
      update(patch)
    },
  }
  const undo = () => {
    const prev = history.current.pop()
    if (prev) update(prev.snap)
  }

  useEffect(() => {
    brand.fonts.forEach(ensureFont)
  }, [brand.fonts])

  // Print page size follows the active document.
  useEffect(() => {
    let style = document.getElementById('page-size') as HTMLStyleElement | null
    if (!style) {
      style = document.createElement('style')
      style.id = 'page-size'
      document.head.appendChild(style)
    }
    style.textContent = view === 'print' ? `@page { margin: 0; }\n${printPageCss(brand, marks)}` : `@page { size: ${pageSize(view, brand)}; margin: 0; }`
  }, [view, brand, marks])

  async function exportPdf() {
    setBusy('Preparing PDF…')
    await document.fonts.ready
    // Let images decode before the print snapshot.
    await Promise.all(Array.from(document.images).map((img) => img.decode().catch(() => undefined)))
    setBusy(null)
    const prev = document.title
    document.title = `${brand.name} ${VIEWS.find((v) => v.id === view)!.title}`
    window.print()
    document.title = prev
  }

  async function exportZip() {
    try {
      const blob = await exportPackage(brand, (m) => setBusy(`Building package: ${m}`))
      download(blob, `${brand.name} Brand Package.zip`)
    } catch (e) {
      alert(`Export failed: ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  /** Project file carries its photos and the photo mockups it uses, so it opens complete on another Mac. */
  async function exportProject() {
    setBusy('Packing project…')
    const mockups = getLibrary().filter((m) => brand.photoMockups?.includes(m.id))
    const images = await packImages([...brand.imagery.map((i) => i.id), ...mockups.map((m) => m.imageId), ...overlayImageIds(brand)])
    setBusy(null)
    download(new Blob([JSON.stringify({ ...brand, _mockups: mockups, _images: images }, null, 2)], { type: 'application/json' }), `${brand.name}.marque.json`)
  }

  async function importProject(file: File) {
    try {
      const raw = JSON.parse(await file.text()) as Brand & { _mockups?: PhotoMockup[]; _images?: Record<string, string> }
      if (!raw.name || !raw.colors) throw new Error('Not a Marque project file.')
      const { _mockups, _images, ...b } = raw
      await unpackImages(_images)
      if (_mockups?.length) {
        const lib = getLibrary()
        saveLibrary([...lib.filter((m) => !_mockups.some((x) => x.id === m.id)), ..._mockups])
      }
      add(migrate({ ...b, id: uid() }))
    } catch (e) {
      alert((e as Error).message)
    }
  }

  function saveMockup(m: PhotoMockup) {
    const lib = getLibrary()
    const exists = lib.some((x) => x.id === m.id)
    saveLibrary(exists ? lib.map((x) => (x.id === m.id ? m : x)) : [...lib, m])
    if (!brand.photoMockups.includes(m.id)) update({ photoMockups: [...brand.photoMockups, m.id] })
    setEditing(null)
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brandbar">
          <div className="app-name">Marque</div>
          <select value={brand.id} onChange={(e) => select(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="proj-actions">
            <button onClick={() => add(blankBrand())}>New</button>
            <button onClick={() => add({ ...structuredClone(brand), id: uid(), name: `${brand.name} copy` })}>Duplicate</button>
            <button onClick={() => importRef.current?.click()}>Import</button>
            <button onClick={exportProject}>Save file</button>
            <button
              className="danger"
              onClick={() => {
                if (confirm(`Delete “${brand.name}”? Save a file first if you may need it.`)) remove(brand.id)
              }}
            >
              Delete
            </button>
            <input
              ref={importRef}
              type="file"
              accept=".json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) importProject(f)
                e.target.value = ''
              }}
            />
          </div>
          {saveError && <div className="ed-error">{saveError}</div>}
        </div>
        <Editor brand={brand} update={update} onEditMockup={setEditing} />
      </aside>

      <main className="main">
        <div className="toolbar">
          <div className="seg">
            {VIEWS.map((v) => (
              <button key={v.id} className={view === v.id ? 'on' : ''} onClick={() => setView(v.id)}>
                {v.label}
              </button>
            ))}
          </div>
          {view === 'print' && (
            <label className="check">
              <input type="checkbox" checked={marks} onChange={(e) => setMarks(e.target.checked)} />
              Crop marks
            </label>
          )}
          {view !== 'print' && (
            <button
              className={`btn ghost edit-toggle ${layoutMode ? 'on' : ''}`}
              onClick={() => {
                setLayoutMode((m) => !m)
                setSel(null)
              }}
              title="Drag, add and edit layers on any page, and add your own slides"
            >
              {layoutMode ? 'Done editing' : 'Edit layout'}
            </button>
          )}
          <label className="zoom">
            <span>Zoom</span>
            <input type="range" min={ZOOM_MIN} max={ZOOM_MAX} step={0.05} value={zoom} onChange={(e) => pan.zoomTo(Number(e.target.value))} />
            <button className="zoom-pct" onClick={() => pan.zoomTo(1)} title="Zoom to 100% (⌘0). ⌘ + scroll or pinch zooms, Space + drag pans">
              {Math.round(zoom * 100)}%
            </button>
          </label>
          <div className="spacer" />
          {busy && <span className="busy">{busy}</span>}
          <button className="btn ghost" onClick={() => navigator.clipboard.writeText(tokensCss(brand))} title="Copy CSS variables">
            Copy CSS tokens
          </button>
          <button className="btn ghost" disabled={!!busy} onClick={exportZip}>
            Download logo package
          </button>
          <button className="btn" disabled={!!busy} onClick={exportPdf}>
            Export PDF
          </button>
        </div>
        <EditContext.Provider value={editApi}>
          <div
            ref={canvasRef}
            className={`canvas ${editingLayout ? 'is-editing' : ''} ${pan.hand ? 'is-hand' : ''} ${pan.panning ? 'is-panning' : ''}`}
            style={{ ['--z' as string]: zoom }}
            onPointerDown={(e) => editingLayout && e.target === e.currentTarget && setSel(null)}
          >
            {view === 'guidelines' && <Guidelines brand={brand} />}
            {view === 'assets' && <Assets brand={brand} />}
            {view === 'deck' && <Deck brand={brand} />}
            {view === 'print' && <Print brand={brand} marks={marks} />}
          </div>
          <Inspector />
          <EditKeys undo={undo} />
        </EditContext.Provider>
      </main>
      {editing && <MockupEditor brand={brand} mockup={editing} onSave={saveMockup} onClose={() => setEditing(null)} />}
    </div>
  )
}
