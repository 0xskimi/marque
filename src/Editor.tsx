import { useMemo, useState, type ReactNode } from 'react'
import type { Brand, BrandColor, BrandFont, ColorRole, LogoSlot, PhotoMockup, SubBrand } from './types'
import { LOGO_SLOTS, VECTOR_MOCKUPS } from './types'
import { hasLiveText, normalizeSvg, svgUrl, analyze } from './lib/svg'
import { normHex } from './lib/color'
import { uid } from './store'
import { importPhoto, packImages, unpackImages, useImage } from './lib/images'
import { saveLibrary, useLibrary } from './lib/library'
import { PAGE_CATALOG } from './pages/Guidelines'
import { newPlacement } from './MockupEditor'
import { download } from './lib/export'
import { preflight } from './lib/vector'

interface Props {
  brand: Brand
  update: (patch: Partial<Brand>) => void
  onEditMockup: (m: PhotoMockup) => void
}

function Thumb({ id }: { id: string }) {
  const url = useImage(id)
  return <div className="img-thumb" style={{ backgroundImage: url ? `url(${url})` : undefined }} />
}

function FilePick({ label, accept, multiple, onFiles }: { label: string; accept: string; multiple?: boolean; onFiles: (f: File[]) => void }) {
  return (
    <label className="btn-sm">
      {label}
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => {
          const fs = Array.from(e.target.files ?? [])
          if (fs.length) onFiles(fs)
          e.target.value = ''
        }}
      />
    </label>
  )
}

function PrintReadiness({ brand }: { brand: Brand }) {
  const logos = LOGO_SLOTS.filter((s) => brand.logos[s.id]).map((s) => ({ label: s.label, svg: brand.logos[s.id]!.svg }))
  const colorKey = brand.colors.map((c) => `${c.hex}|${c.cmyk}|${c.pantone}|${c.name}`).join(',')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const checks = useMemo(() => preflight(brand, logos), [logos.map((l) => l.svg).join(), colorKey])
  if (!logos.length) return <p className="hint">Upload a logo to check its print files.</p>
  return (
    <ul className="preflight">
      {checks.map((c, i) => (
        <li key={i} className={c.ok ? 'ok' : 'todo'}>
          {c.text}
        </li>
      ))}
    </ul>
  )
}

function Section({ title, children, open: initial = false }: { title: string; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(initial)
  return (
    <div className={`ed-section ${open ? 'open' : ''}`}>
      <button className="ed-section-title" onClick={() => setOpen(!open)}>
        <span>{title}</span>
        <span className="chev">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="ed-section-body">{children}</div>}
    </div>
  )
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

function readFile(file: File, as: 'text' | 'base64'): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => {
      if (as === 'text') res(r.result as string)
      else res((r.result as string).split(',')[1])
    }
    r.onerror = () => rej(r.error)
    if (as === 'text') r.readAsText(file)
    else r.readAsDataURL(file)
  })
}

export function Editor({ brand, update, onEditMockup }: Props) {
  const [logoError, setLogoError] = useState<string | null>(null)
  const library = useLibrary()

  function setSub(id: string, patch: Partial<SubBrand>) {
    update({ subBrands: brand.subBrands.map((s) => (s.id === id ? { ...s, ...patch } : s)) })
  }

  async function addPhotoMockup(file: File) {
    const img = await importPhoto(file)
    onEditMockup({ id: uid(), title: file.name.replace(/\.[^.]+$/, ''), imageId: img.id, width: img.width, height: img.height, placements: [newPlacement()] })
  }

  async function exportLibrary() {
    const images = await packImages(library.map((m) => m.imageId))
    download(new Blob([JSON.stringify({ mockups: library, images })], { type: 'application/json' }), 'Marque mockup library.json')
  }

  async function importLibrary(file: File) {
    try {
      const data = JSON.parse(await file.text()) as { mockups: PhotoMockup[]; images: Record<string, string> }
      if (!Array.isArray(data.mockups)) throw new Error('Not a Marque mockup library file.')
      await unpackImages(data.images)
      saveLibrary([...library.filter((m) => !data.mockups.some((x) => x.id === m.id)), ...data.mockups])
    } catch (e) {
      alert((e as Error).message)
    }
  }

  async function uploadLogo(slot: LogoSlot, file: File) {
    setLogoError(null)
    try {
      const text = await readFile(file, 'text')
      const logo = normalizeSvg(text, file.name)
      update({ logos: { ...brand.logos, [slot]: logo } })
    } catch (e) {
      setLogoError((e as Error).message)
    }
  }

  function setColor(id: string, patch: Partial<BrandColor>) {
    update({ colors: brand.colors.map((c) => (c.id === id ? { ...c, ...patch } : c)) })
  }

  function moveColor(id: string, dir: -1 | 1) {
    const i = brand.colors.findIndex((c) => c.id === id)
    const j = i + dir
    if (j < 0 || j >= brand.colors.length) return
    const next = [...brand.colors]
    ;[next[i], next[j]] = [next[j], next[i]]
    update({ colors: next })
  }

  function setFont(i: number, patch: Partial<BrandFont>) {
    update({ fonts: brand.fonts.map((f, k) => (k === i ? { ...f, ...patch } : f)) })
  }

  return (
    <div className="editor">
      <Section title="Brand" open>
        <Field label="Brand name">
          <input value={brand.name} onChange={(e) => update({ name: e.target.value })} />
        </Field>
        <Field label="Tagline">
          <input value={brand.tagline} onChange={(e) => update({ tagline: e.target.value })} />
        </Field>
        <Field label="About the brand">
          <textarea rows={4} value={brand.about} onChange={(e) => update({ about: e.target.value })} />
        </Field>
        <Field label="Values" hint="Comma separated">
          <input value={brand.values} onChange={(e) => update({ values: e.target.value })} />
        </Field>
        <div className="row2">
          <Field label="Guidelines version">
            <input value={brand.version} onChange={(e) => update({ version: e.target.value })} />
          </Field>
          <Field label="Year">
            <input value={brand.year} onChange={(e) => update({ year: e.target.value })} />
          </Field>
        </div>
        <Field label="Website">
          <input value={brand.website} onChange={(e) => update({ website: e.target.value })} />
        </Field>
        <Field label="Vision">
          <textarea rows={2} value={brand.vision} onChange={(e) => update({ vision: e.target.value })} />
        </Field>
        <Field label="Mission">
          <textarea rows={2} value={brand.mission} onChange={(e) => update({ mission: e.target.value })} />
        </Field>
        <Field label="Note on collaboration" hint="Optional opening note to the client. Leave empty to skip the page.">
          <textarea rows={3} value={brand.collaboration} onChange={(e) => update({ collaboration: e.target.value })} />
        </Field>
      </Section>

      <Section title="Story and architecture">
        <span className="field-label">Name meaning</span>
        {brand.nameMeaning.map((n, i) => (
          <div key={i} className="mini-card">
            <div className="row2">
              <input value={n.word} placeholder="Word" onChange={(e) => update({ nameMeaning: brand.nameMeaning.map((x, k) => (k === i ? { ...x, word: e.target.value } : x)) })} />
              <input value={n.pronunciation} placeholder="/prəˌnʌnsiˈeɪʃən/" onChange={(e) => update({ nameMeaning: brand.nameMeaning.map((x, k) => (k === i ? { ...x, pronunciation: e.target.value } : x)) })} />
            </div>
            <textarea rows={2} value={n.meaning} placeholder="Meaning" onChange={(e) => update({ nameMeaning: brand.nameMeaning.map((x, k) => (k === i ? { ...x, meaning: e.target.value } : x)) })} />
            <button className="btn-sm ghost" onClick={() => update({ nameMeaning: brand.nameMeaning.filter((_, k) => k !== i) })}>
              Remove
            </button>
          </div>
        ))}
        <button className="btn-sm" onClick={() => update({ nameMeaning: [...brand.nameMeaning, { word: '', pronunciation: '', meaning: '' }] })}>
          Add word
        </button>
        <Field label="Ethos intro">
          <input value={brand.ethosIntro} onChange={(e) => update({ ethosIntro: e.target.value })} />
        </Field>
        <Field label="Ethos points" hint="One per line, written as “Title: description”. Leave empty to use the values instead.">
          <textarea rows={5} value={brand.ethos} onChange={(e) => update({ ethos: e.target.value })} />
        </Field>
        <Field label="Brand architecture" hint="How the master brand and sub-brands relate.">
          <textarea rows={2} value={brand.architecture} onChange={(e) => update({ architecture: e.target.value })} />
        </Field>
        <span className="field-label">Sub-brands</span>
        {brand.subBrands.map((sb) => (
          <div key={sb.id} className="mini-card">
            <div className="row2">
              <input value={sb.name} placeholder="Name" onChange={(e) => setSub(sb.id, { name: e.target.value })} />
              <input value={sb.color ?? ''} placeholder="Colour #HEX (optional)" onChange={(e) => setSub(sb.id, { color: e.target.value })} />
            </div>
            <textarea rows={2} value={sb.description} placeholder="What it is" onChange={(e) => setSub(sb.id, { description: e.target.value })} />
            <div className="logo-actions">
              <FilePick
                label={sb.logo ? 'Replace logo' : 'Upload logo SVG'}
                accept=".svg,image/svg+xml"
                onFiles={async ([f]) => {
                  try {
                    setSub(sb.id, { logo: normalizeSvg(await readFile(f, 'text'), f.name) })
                  } catch (e) {
                    setLogoError((e as Error).message)
                  }
                }}
              />
              <button className="btn-sm ghost" onClick={() => update({ subBrands: brand.subBrands.filter((x) => x.id !== sb.id) })}>
                Remove
              </button>
            </div>
          </div>
        ))}
        <button className="btn-sm" onClick={() => update({ subBrands: [...brand.subBrands, { id: uid(), name: 'Sub-brand', description: '' }] })}>
          Add sub-brand
        </button>
        <Field label="Design approach" hint="How the logo was derived. Used in the guidelines, presentation and assets deck.">
          <textarea rows={5} value={brand.rationale} onChange={(e) => update({ rationale: e.target.value })} />
        </Field>
      </Section>

      <Section title="Logos" open>
        <p className="ed-note">Upload SVGs exported from Illustrator, Figma or Affinity. Convert type to outlines first.</p>
        {logoError && <div className="ed-error">{logoError}</div>}
        {LOGO_SLOTS.map((s) => {
          const logo = brand.logos[s.id]
          const qa = logo ? analyze(logo.svg).issues : null
          return (
            <div key={s.id} className="logo-slot">
              <div className="logo-thumb">{logo ? <img src={svgUrl(logo.svg)} alt="" /> : <span>+</span>}</div>
              <div className="logo-info">
                <strong>{s.label}</strong>
                <span>{logo ? logo.fileName : s.hint}</span>
                {logo && hasLiveText(logo.svg) && <span className="warn">Contains live text. Outline it so it renders everywhere.</span>}
                {qa && qa.duplicates + qa.kinks > 0 && (
                  <span className="warn">
                    {qa.duplicates ? `${qa.duplicates} duplicate point${qa.duplicates > 1 ? 's' : ''}` : ''}
                    {qa.duplicates && qa.kinks ? ', ' : ''}
                    {qa.kinks ? `${qa.kinks} near-smooth kink${qa.kinks > 1 ? 's' : ''}` : ''} — worth fixing in your design file
                  </span>
                )}
                <div className="logo-actions">
                  <label className="btn-sm">
                    {logo ? 'Replace' : 'Upload SVG'}
                    <input
                      type="file"
                      accept=".svg,image/svg+xml"
                      hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) uploadLogo(s.id, f)
                        e.target.value = ''
                      }}
                    />
                  </label>
                  {logo && (
                    <button
                      className="btn-sm ghost"
                      onClick={() => {
                        const next = { ...brand.logos }
                        delete next[s.id]
                        update({ logos: next })
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </Section>

      <Section title="Colours">
        {brand.colors.map((c, i) => (
          <div key={c.id} className="color-row">
            <input type="color" value={normHex(c.hex).toLowerCase()} onChange={(e) => setColor(c.id, { hex: e.target.value.toUpperCase() })} />
            <div className="color-fields">
              <div className="row2">
                <input value={c.name} placeholder="Name" onChange={(e) => setColor(c.id, { name: e.target.value })} />
                <input value={c.hex} placeholder="#HEX" onChange={(e) => setColor(c.id, { hex: e.target.value })} onBlur={(e) => setColor(c.id, { hex: normHex(e.target.value) })} />
              </div>
              <div className="row3">
                <select value={c.role} onChange={(e) => setColor(c.id, { role: e.target.value as ColorRole })}>
                  <option value="primary">Primary</option>
                  <option value="secondary">Secondary</option>
                  <option value="accent">Accent</option>
                  <option value="neutral">Neutral</option>
                </select>
                <input value={c.cmyk ?? ''} placeholder="CMYK (optional)" onChange={(e) => setColor(c.id, { cmyk: e.target.value })} />
                <input value={c.pantone ?? ''} placeholder="Pantone" onChange={(e) => setColor(c.id, { pantone: e.target.value })} />
              </div>
              <textarea rows={2} value={c.meaning ?? ''} placeholder="What this colour stands for" onChange={(e) => setColor(c.id, { meaning: e.target.value })} />
              <div className="row2">
                <textarea rows={2} value={c.associations ?? ''} placeholder="Associations, one per line" onChange={(e) => setColor(c.id, { associations: e.target.value })} />
                <input type="number" min={0} max={100} value={c.share ?? ''} placeholder="Usage %" onChange={(e) => setColor(c.id, { share: Number(e.target.value) || 0 })} />
              </div>
            </div>
            <div className="color-actions">
              <button title="Move up" disabled={i === 0} onClick={() => moveColor(c.id, -1)}>
                ↑
              </button>
              <button title="Move down" disabled={i === brand.colors.length - 1} onClick={() => moveColor(c.id, 1)}>
                ↓
              </button>
              <button title="Remove" onClick={() => update({ colors: brand.colors.filter((x) => x.id !== c.id) })}>
                ×
              </button>
            </div>
          </div>
        ))}
        <button className="btn-sm" onClick={() => update({ colors: [...brand.colors, { id: uid(), name: 'New colour', hex: '#888888', role: 'secondary' }] })}>
          Add colour
        </button>
        <p className="ed-note">Leave CMYK empty to show an estimate. Enter values from your swatch book for exact print specs.</p>
      </Section>

      <Section title="Typography">
        {brand.fonts.map((f, i) => (
          <div key={i} className="font-row">
            <div className="row2">
              <select value={f.role} onChange={(e) => setFont(i, { role: e.target.value as BrandFont['role'] })}>
                <option value="heading">Primary (headings)</option>
                <option value="body">Secondary (body)</option>
                <option value="accent">Accent or script</option>
              </select>
              <select value={f.source} onChange={(e) => setFont(i, { source: e.target.value as BrandFont['source'] })}>
                <option value="google">Google Fonts</option>
                <option value="upload">Upload file</option>
                <option value="system">Installed on this Mac</option>
              </select>
            </div>
            <Field label="Family name" hint={f.source === 'google' ? 'Exactly as on fonts.google.com' : undefined}>
              <input value={f.family} onChange={(e) => setFont(i, { family: e.target.value })} />
            </Field>
            <Field label="Weights" hint="e.g. 400;500;700">
              <input value={f.weights} onChange={(e) => setFont(i, { weights: e.target.value })} />
            </Field>
            <Field label="Usage">
              <input value={f.usage ?? ''} placeholder="Headlines, titles and display text" onChange={(e) => setFont(i, { usage: e.target.value })} />
            </Field>
            <Field label="Language support">
              <input value={f.language ?? ''} placeholder="Latin, Cyrillic, Greek" onChange={(e) => setFont(i, { language: e.target.value })} />
            </Field>
            {f.source === 'upload' && (
              <label className="btn-sm">
                {f.data ? 'Replace font file' : 'Choose .otf / .ttf / .woff2'}
                <input
                  type="file"
                  accept=".otf,.ttf,.woff,.woff2"
                  hidden
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const data = await readFile(file, 'base64')
                    setFont(i, { data, family: f.family || file.name.replace(/\.[^.]+$/, '') })
                  }}
                />
              </label>
            )}
            <button className="btn-sm ghost" onClick={() => update({ fonts: brand.fonts.filter((_, k) => k !== i) })}>
              Remove typeface
            </button>
          </div>
        ))}
        <button className="btn-sm" onClick={() => update({ fonts: [...brand.fonts, { family: '', role: 'body', source: 'google', weights: '400;700' }] })}>
          Add typeface
        </button>
        <div className="row2" style={{ marginTop: 12 }}>
          <Field label="Base size (px)">
            <input type="number" value={brand.typeBase} onChange={(e) => update({ typeBase: Number(e.target.value) || 16 })} />
          </Field>
          <Field label="Scale ratio">
            <select value={brand.typeScaleRatio} onChange={(e) => update({ typeScaleRatio: Number(e.target.value) })}>
              <option value={1.125}>1.125 Major second</option>
              <option value={1.2}>1.2 Minor third</option>
              <option value={1.25}>1.25 Major third</option>
              <option value={1.333}>1.333 Perfect fourth</option>
              <option value={1.414}>1.414 Augmented fourth</option>
              <option value={1.5}>1.5 Perfect fifth</option>
              <option value={1.618}>1.618 Golden ratio</option>
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Logo rules">
        <Field label={`Clearspace: ${Math.round(brand.clearspace * 100)}% of logo height`}>
          <input type="range" min={0.1} max={1} step={0.05} value={brand.clearspace} onChange={(e) => update({ clearspace: Number(e.target.value) })} />
        </Field>
        <Field label="Describe X in words" hint="Shown in the guidelines, e.g. “the height of the logomark”">
          <input value={brand.clearspaceLabel} onChange={(e) => update({ clearspaceLabel: e.target.value })} />
        </Field>
        <div className="row2">
          <Field label="Min print width (mm)">
            <input type="number" value={brand.minPrintMm} onChange={(e) => update({ minPrintMm: Number(e.target.value) || 20 })} />
          </Field>
          <Field label="Min digital width (px)">
            <input type="number" value={brand.minDigitalPx} onChange={(e) => update({ minDigitalPx: Number(e.target.value) || 80 })} />
          </Field>
        </div>
      </Section>

      <Section title="Print readiness">
        <PrintReadiness brand={brand} />
      </Section>

      <Section title="Brand elements and imagery">
        <Field label="Pattern (built from the logomark)">
          <select value={brand.pattern} onChange={(e) => update({ pattern: e.target.value as Brand['pattern'] })}>
            <option value="crop">Oversized mark</option>
            <option value="grid">Repeat</option>
            <option value="offset">Offset repeat</option>
            <option value="outline">Outline repeat</option>
            <option value="none">No pattern</option>
          </select>
        </Field>
        <Field label={`Pattern strength: ${Math.round(brand.patternOpacity * 100)}%`}>
          <input type="range" min={0.02} max={0.3} step={0.01} value={brand.patternOpacity} onChange={(e) => update({ patternOpacity: Number(e.target.value) })} />
        </Field>
        <span className="field-label">Shapes and graphic elements (SVG)</span>
        <div className="thumbs">
          {brand.elements.map((el) => (
            <div key={el.id} className="thumb-item">
              <div className="logo-thumb">
                <img src={svgUrl(el.svg)} alt="" />
              </div>
              <input value={el.name} onChange={(e) => update({ elements: brand.elements.map((x) => (x.id === el.id ? { ...x, name: e.target.value } : x)) })} />
              <button className="btn-sm ghost" onClick={() => update({ elements: brand.elements.filter((x) => x.id !== el.id) })}>
                Remove
              </button>
            </div>
          ))}
        </div>
        <FilePick
          label="Add SVG elements"
          accept=".svg,image/svg+xml"
          multiple
          onFiles={async (fs) => {
            const els = []
            for (const f of fs) {
              try {
                els.push({ id: uid(), name: f.name.replace(/\.svg$/i, ''), svg: normalizeSvg(await readFile(f, 'text'), f.name).svg })
              } catch (e) {
                setLogoError((e as Error).message)
              }
            }
            update({ elements: [...brand.elements, ...els] })
          }}
        />
        <span className="field-label">Imagery (photos for the imagery page)</span>
        <div className="thumbs">
          {brand.imagery.map((im) => (
            <div key={im.id} className="thumb-item">
              <Thumb id={im.id} />
              <input value={im.caption} placeholder="Caption" onChange={(e) => update({ imagery: brand.imagery.map((x) => (x.id === im.id ? { ...x, caption: e.target.value } : x)) })} />
              <button className="btn-sm ghost" onClick={() => update({ imagery: brand.imagery.filter((x) => x.id !== im.id) })}>
                Remove
              </button>
            </div>
          ))}
        </div>
        <FilePick
          label="Add photos"
          accept="image/*"
          multiple
          onFiles={async (fs) => {
            const added = []
            for (const f of fs) added.push({ id: (await importPhoto(f, 2400)).id, caption: '' })
            update({ imagery: [...brand.imagery, ...added] })
          }}
        />
        <Field label="Imagery direction">
          <textarea rows={3} value={brand.imageryNotes} onChange={(e) => update({ imageryNotes: e.target.value })} />
        </Field>
      </Section>

      <Section title="Contact and stationery">
        <div className="row2">
          <Field label="Brand email">
            <input value={brand.contactEmail} onChange={(e) => update({ contactEmail: e.target.value })} />
          </Field>
          <Field label="Phone">
            <input value={brand.contactPhone} onChange={(e) => update({ contactPhone: e.target.value })} />
          </Field>
        </div>
        <Field label="Address">
          <input value={brand.address} onChange={(e) => update({ address: e.target.value })} />
        </Field>
        <span className="field-label">Person on business card, ID card and email signature</span>
        <div className="row2">
          <input value={brand.person.name} placeholder="Name" onChange={(e) => update({ person: { ...brand.person, name: e.target.value } })} />
          <input value={brand.person.title} placeholder="Job title" onChange={(e) => update({ person: { ...brand.person, title: e.target.value } })} />
          <input value={brand.person.email} placeholder="Email" onChange={(e) => update({ person: { ...brand.person, email: e.target.value } })} />
          <input value={brand.person.phone} placeholder="Phone" onChange={(e) => update({ person: { ...brand.person, phone: e.target.value } })} />
        </div>
        <Field label="Business card size">
          <select value={brand.cardSize} onChange={(e) => update({ cardSize: e.target.value as Brand['cardSize'] })}>
            <option value="85x55">85 × 55 mm (Europe, Nigeria, most of Africa)</option>
            <option value="90x55">90 × 55 mm (Australia)</option>
            <option value="90x50">90 × 50 mm</option>
            <option value="89x51">3.5 × 2 in (US, Canada)</option>
          </select>
        </Field>
      </Section>

      <Section title="Brand assets deck">
        <span className="field-label">Vector mockups</span>
        {VECTOR_MOCKUPS.map((m) => (
          <label key={m.id} className="check">
            <input
              type="checkbox"
              checked={brand.vectorMockups.includes(m.id)}
              onChange={(e) =>
                update({ vectorMockups: e.target.checked ? VECTOR_MOCKUPS.map((x) => x.id).filter((id) => id === m.id || brand.vectorMockups.includes(id)) : brand.vectorMockups.filter((x) => x !== m.id) })
              }
            />
            {m.label}
          </label>
        ))}
        <span className="field-label" style={{ marginTop: 6 }}>
          Photo mockups (your library, shared by all projects)
        </span>
        {library.length === 0 && <p className="ed-note">Upload a blank mockup photo, then drag four corners onto each surface. Set it up once and every project reuses it.</p>}
        {library.map((m) => (
          <div key={m.id} className="lib-row">
            <input
              type="checkbox"
              checked={brand.photoMockups.includes(m.id)}
              onChange={(e) => update({ photoMockups: e.target.checked ? [...brand.photoMockups, m.id] : brand.photoMockups.filter((x) => x !== m.id) })}
            />
            <Thumb id={m.imageId} />
            <span>{m.title}</span>
            <button className="btn-sm ghost" onClick={() => onEditMockup(m)}>
              Edit
            </button>
            <button
              className="btn-sm ghost"
              onClick={() => {
                if (confirm(`Remove “${m.title}” from your mockup library? Other projects using it will lose it too.`)) saveLibrary(library.filter((x) => x.id !== m.id))
              }}
            >
              ×
            </button>
          </div>
        ))}
        <div className="logo-actions">
          <FilePick label="Add photo mockup" accept="image/*" onFiles={([f]) => addPhotoMockup(f)} />
          {library.length > 0 && (
            <button className="btn-sm ghost" onClick={exportLibrary}>
              Export library
            </button>
          )}
          <FilePick label="Import library" accept=".json" onFiles={([f]) => importLibrary(f)} />
        </div>
      </Section>

      <Section title="Layout and pages">
        <Field label="Template">
          <div className="seg seg-wrap">
            {(['swiss', 'bold', 'noir'] as const).map((t) => (
              <button key={t} className={brand.template === t ? 'on' : ''} onClick={() => update({ template: t })}>
                {t === 'swiss' ? 'Swiss' : t === 'bold' ? 'Bold' : 'Noir'}
              </button>
            ))}
          </div>
        </Field>
        <p className="ed-note">Swiss: light pages with dark showcase slides. Bold: colour-blocked. Noir: dark throughout.</p>
        <Field label="Page format">
          <div className="seg">
            <button className={brand.pageFormat !== 'a4' ? 'on' : ''} onClick={() => update({ pageFormat: 'wide' })}>
              16:9 screen
            </button>
            <button className={brand.pageFormat === 'a4' ? 'on' : ''} onClick={() => update({ pageFormat: 'a4' })}>
              A4 landscape
            </button>
          </div>
        </Field>
        <label className="check">
          <input type="checkbox" checked={brand.dividers} onChange={(e) => update({ dividers: e.target.checked })} />
          Section divider pages
        </label>
        <span className="field-label">Pages in the guidelines</span>
        <div className="page-toggles">
          {PAGE_CATALOG.map((pg) => (
            <label key={pg.key} className="check">
              <input
                type="checkbox"
                checked={!brand.hiddenPages.includes(pg.key)}
                onChange={(e) => update({ hiddenPages: e.target.checked ? brand.hiddenPages.filter((k) => k !== pg.key) : [...brand.hiddenPages, pg.key] })}
              />
              {pg.label}
            </label>
          ))}
        </div>
        <p className="ed-note">Pages without content (no sub-brands, no photos, no name meaning) are skipped automatically.</p>
      </Section>

      <Section title="Presentation and studio">
        <Field label="Client">
          <input value={brand.client} onChange={(e) => update({ client: e.target.value })} />
        </Field>
        <div className="row2">
          <Field label="Your studio">
            <input value={brand.studio} onChange={(e) => update({ studio: e.target.value })} />
          </Field>
          <Field label="Website">
            <input value={brand.studioSite} onChange={(e) => update({ studioSite: e.target.value })} />
          </Field>
        </div>
        <Field label="Email">
          <input value={brand.studioEmail} onChange={(e) => update({ studioEmail: e.target.value })} />
        </Field>
        <Field label="The brief">
          <textarea rows={3} value={brand.brief} onChange={(e) => update({ brief: e.target.value })} />
        </Field>
      </Section>
    </div>
  )
}
