import { useEffect, useRef, useState } from 'react'
import type { Brand, BrandColor, ConceptItem, Exploration, ExploreMode, IdeaItem, LogoItem, LogoSlot } from '../types'
import { LOGO_SLOTS } from '../types'
import { uid } from '../store'
import { normalizeSvg, svgUrl } from '../lib/svg'
import { download } from '../lib/export'
import { brandText } from './brandText'

const MODES: { id: ExploreMode; label: string; hint: string; placeholder: string }[] = [
  { id: 'ideas', label: 'Ideas', hint: 'Campaigns, activations and touchpoints', placeholder: 'e.g. launch ideas for the new café, low budget, mostly social' },
  { id: 'concepts', label: 'Brand concepts', hint: 'Strategic and visual directions', placeholder: 'e.g. a warmer, more premium direction for the hospitality line' },
  { id: 'logos', label: 'Logos', hint: 'Logo explorations as editable SVG', placeholder: 'e.g. a monogram from the initials, geometric, works at favicon size' },
]

type Status = { ready: boolean; skills: string[] } | null

interface Run {
  mode: ExploreMode
  started: number
  chars: number
  abort: AbortController
}

/** Strip anything in model-written SVG that could run code or load from elsewhere. */
export function cleanSvg(raw: string): string | null {
  const doc = new DOMParser().parseFromString(raw.trim(), 'image/svg+xml')
  const root = doc.documentElement
  if (root.nodeName !== 'svg' || doc.querySelector('parsererror')) return null
  root.querySelectorAll('script, foreignObject, a, iframe, audio, video').forEach((n) => n.remove())
  for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
    for (const a of Array.from(el.attributes)) {
      const v = a.value.trim().toLowerCase()
      if (/^on/i.test(a.name)) el.removeAttribute(a.name)
      else if (/href$/i.test(a.name) && !v.startsWith('#')) el.removeAttribute(a.name)
      else if (v.includes('javascript:') || /url\(\s*['"]?(?!#)/.test(v)) el.removeAttribute(a.name)
    }
  }
  root.querySelectorAll('style').forEach((s) => {
    s.textContent = (s.textContent ?? '').replace(/@import[^;]*;?/gi, '').replace(/url\(\s*['"]?(?!#)[^)]*\)/gi, 'none')
  })
  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  return new XMLSerializer().serializeToString(root)
}

function elapsed(ms: number) {
  const s = Math.floor(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

export function Explore({ brand, update }: { brand: Brand; update: (p: Partial<Brand>) => void }) {
  const [mode, setMode] = useState<ExploreMode>('concepts')
  const [count, setCount] = useState(3)
  const [prompt, setPrompt] = useState('')
  const [run, setRun] = useState<Run | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>(null)
  const [, tick] = useState(0)
  const list = brand.explorations ?? []
  // The latest brand, for results that land after the user kept editing.
  const latest = useRef(brand)
  latest.current = brand

  useEffect(() => {
    fetch('/__claude/status')
      .then((r) => (r.ok ? r.json() : null))
      .then(setStatus)
      .catch(() => setStatus(null))
  }, [])

  useEffect(() => {
    if (!run) return
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [run])

  async function generate(m: ExploreMode, direction: string, seed?: string) {
    if (run) return
    setError(null)
    const abort = new AbortController()
    const r: Run = { mode: m, started: Date.now(), chars: 0, abort }
    setRun(r)
    try {
      const res = await fetch('/__claude/explore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: m, count, prompt: direction, brand: brandText(latest.current), seed }),
        signal: abort.signal,
      })
      if (!res.ok || !res.body) throw new Error(res.status === 404 ? 'Exploration needs the Marque dev server. Start it with npm run dev.' : `Request failed (${res.status}).`)
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
      let buf = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += value
        let nl
        while ((nl = buf.indexOf('\n')) >= 0) {
          const msg = JSON.parse(buf.slice(0, nl))
          buf = buf.slice(nl + 1)
          if (msg.type === 'progress') setRun((cur) => (cur ? { ...cur, chars: msg.chars } : cur))
          else if (msg.type === 'error') throw new Error(msg.message)
          else if (msg.type === 'done') {
            const ex: Exploration = { id: uid(), mode: m, prompt: direction, at: new Date().toISOString(), items: msg.items }
            update({ explorations: [ex, ...(latest.current.explorations ?? [])] })
          }
        }
      }
    } catch (e) {
      if (!abort.signal.aborted) setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRun(null)
    }
  }

  const remove = (id: string) => update({ explorations: list.filter((x) => x.id !== id) })
  const current = MODES.find((x) => x.id === mode)!

  return (
    <div className="explore">
      <div className="ex-composer">
        <div className="ex-head">
          <div>
            <h2>Exploration</h2>
            <p>Ideas, concepts and logos from {brand.name || 'this brand'}’s kit, made by Claude with the brand application skill.</p>
          </div>
        </div>
        <div className="seg seg-wrap">
          {MODES.map((x) => (
            <button key={x.id} className={mode === x.id ? 'on' : ''} onClick={() => setMode(x.id)} title={x.hint}>
              {x.label}
            </button>
          ))}
        </div>
        <textarea
          className="ex-prompt"
          rows={3}
          value={prompt}
          placeholder={`Direction (optional), ${current.placeholder}`}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate(mode, prompt)
          }}
        />
        <div className="ex-actions">
          <label className="ex-count">
            How many
            <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[1, 2, 3, 4, 6].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <span className="spacer" />
          {run ? (
            <>
              <span className="busy">
                Claude is working on {MODES.find((x) => x.id === run.mode)!.label.toLowerCase()} · {elapsed(Date.now() - run.started)}
                {run.chars ? ` · ${run.chars.toLocaleString()} characters written` : ''}
              </span>
              <button className="btn ghost" onClick={() => run.abort.abort()}>
                Stop
              </button>
            </>
          ) : (
            <button className="btn" onClick={() => generate(mode, prompt)}>
              Generate {current.label.toLowerCase()}
            </button>
          )}
        </div>
        {status && !status.ready && (
          <div className="ex-note">
            Add your Anthropic API key to a file called <code>.env.local</code> in the Marque folder (<code>ANTHROPIC_API_KEY=sk-ant-…</code>), then restart <code>npm run dev</code>.
          </div>
        )}
        {error && <div className="ex-note is-error">{error}</div>}
      </div>

      {!list.length && !run && <div className="ex-empty">Nothing here yet. Pick what you want to explore and press Generate.</div>}

      {list.map((ex) => (
        <section key={ex.id} className="ex-batch">
          <div className="ex-batch-head">
            <b>{MODES.find((x) => x.id === ex.mode)?.label}</b>
            {ex.prompt && <span className="ex-batch-prompt">{ex.prompt}</span>}
            <span className="ex-batch-at">{new Date(ex.at).toLocaleString()}</span>
            <span className="spacer" />
            <button className="ex-link" onClick={() => remove(ex.id)}>
              Delete
            </button>
          </div>
          <div className={`ex-grid ex-${ex.mode}`}>
            {ex.items.map((it, i) =>
              ex.mode === 'ideas' ? (
                <IdeaCard key={i} item={it as IdeaItem} />
              ) : ex.mode === 'concepts' ? (
                <ConceptCard key={i} item={it as ConceptItem} brand={brand} update={update} />
              ) : (
                <LogoCard key={i} item={it as LogoItem} brand={brand} update={update} busy={!!run} more={(svg, name) => generate('logos', `Variations on “${name}”`, svg)} />
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      className="ex-link"
      onClick={() => {
        navigator.clipboard.writeText(text)
        setDone(true)
        setTimeout(() => setDone(false), 1200)
      }}
    >
      {done ? 'Copied' : 'Copy'}
    </button>
  )
}

function IdeaCard({ item }: { item: IdeaItem }) {
  const text = `${item.title}\n\n${item.summary}\n\n${item.applications.map((a) => `- ${a}`).join('\n')}\n\nWhy: ${item.why}`
  return (
    <article className="ex-card">
      <h3>{item.title}</h3>
      <p>{item.summary}</p>
      <ul>
        {item.applications.map((a, i) => (
          <li key={i}>{a}</li>
        ))}
      </ul>
      <p className="ex-why">{item.why}</p>
      <div className="ex-card-actions">
        <CopyButton text={text} />
      </div>
    </article>
  )
}

const HEX = /^#[0-9a-f]{6}$/i

function ConceptCard({ item, brand, update }: { item: ConceptItem; brand: Brand; update: (p: Partial<Brand>) => void }) {
  const palette = item.palette.filter((c) => HEX.test(c.hex))
  const have = new Set(brand.colors.map((c) => c.hex.toLowerCase()))
  const fresh = palette.filter((c) => !have.has(c.hex.toLowerCase()))
  const text = [
    item.name,
    item.idea,
    item.rationale,
    `Tagline: ${item.tagline}`,
    `Palette: ${palette.map((c) => `${c.name} ${c.hex} (${c.role})`).join(', ')}`,
    `Type: ${item.headingFont} / ${item.bodyFont}`,
    `Voice: ${item.voice.join(', ')}`,
    `Imagery: ${item.imagery}`,
  ].join('\n\n')
  return (
    <article className="ex-card">
      <div className="ex-swatches">
        {palette.map((c, i) => (
          <button key={i} className="ex-swatch" style={{ background: c.hex }} title={`${c.name} ${c.hex} (${c.role}), click to copy`} onClick={() => navigator.clipboard.writeText(c.hex)} />
        ))}
      </div>
      <h3>{item.name}</h3>
      <p className="ex-lead">{item.idea}</p>
      <p>{item.rationale}</p>
      <dl>
        <dt>Tagline</dt>
        <dd>“{item.tagline}”</dd>
        <dt>Type</dt>
        <dd>
          {item.headingFont} / {item.bodyFont}
        </dd>
        <dt>Voice</dt>
        <dd>{item.voice.join(', ')}</dd>
        <dt>Imagery</dt>
        <dd>{item.imagery}</dd>
      </dl>
      <div className="ex-card-actions">
        <button
          className="ex-link"
          disabled={!fresh.length}
          title={fresh.length ? 'Adds the colours your palette does not have yet' : 'Your palette already has these colours'}
          onClick={() => update({ colors: [...brand.colors, ...fresh.map((c): BrandColor => ({ id: uid(), name: c.name, hex: c.hex.toLowerCase(), role: c.role }))] })}
        >
          {fresh.length ? `Add ${fresh.length} colour${fresh.length > 1 ? 's' : ''} to palette` : 'Colours in palette'}
        </button>
        <button className="ex-link" disabled={brand.tagline === item.tagline} onClick={() => update({ tagline: item.tagline })}>
          {brand.tagline === item.tagline ? 'Tagline in use' : 'Use tagline'}
        </button>
        <CopyButton text={text} />
      </div>
    </article>
  )
}

function LogoCard({
  item,
  brand,
  update,
  busy,
  more,
}: {
  item: LogoItem
  brand: Brand
  update: (p: Partial<Brand>) => void
  busy: boolean
  more: (svg: string, name: string) => void
}) {
  const svg = cleanSvg(item.svg)
  const [msg, setMsg] = useState<string | null>(null)
  const [undo, setUndo] = useState<Brand['logos'] | null>(null)
  // Second preview on the brand colour, or on near-black when the mark already uses it.
  const primary = brand.colors.find((c) => c.role === 'primary')?.hex ?? '#19191b'
  const backdrop = svg && svg.toLowerCase().includes(primary.toLowerCase()) ? '#19191b' : primary
  const file = `${(brand.name || 'logo').trim()} ${item.name}`.replace(/[^\w\- ]+/g, '').trim()

  function use(slot: LogoSlot) {
    if (!svg) return
    try {
      setUndo(brand.logos)
      update({ logos: { ...brand.logos, [slot]: normalizeSvg(svg, `${file}.svg`) } })
      setMsg(`Now your ${LOGO_SLOTS.find((s) => s.id === slot)!.label.toLowerCase()}.`)
    } catch (e) {
      setUndo(null)
      setMsg(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <article className="ex-card">
      {svg ? (
        <div className="ex-logo-views">
          <div className="ex-logo-view">
            <img src={svgUrl(svg)} alt={item.name} />
          </div>
          <div className="ex-logo-view" style={{ background: backdrop }}>
            <img src={svgUrl(svg)} alt="" />
          </div>
        </div>
      ) : (
        <div className="ex-note is-error">This drawing came back broken. Try “More like this” on another one, or generate again.</div>
      )}
      <h3>{item.name}</h3>
      <p>{item.concept}</p>
      {msg && (
        <p className="ex-why">
          {msg}{' '}
          {undo && (
            <button
              className="ex-link"
              onClick={() => {
                update({ logos: undo })
                setUndo(null)
                setMsg('Put the previous logo back.')
              }}
            >
              Undo
            </button>
          )}
        </p>
      )}
      {svg && (
        <div className="ex-card-actions">
          <select
            className="ex-use"
            value=""
            onChange={(e) => {
              if (e.target.value) use(e.target.value as LogoSlot)
            }}
          >
            <option value="">Use as…</option>
            {LOGO_SLOTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
                {brand.logos[s.id] ? ' (replaces current)' : ''}
              </option>
            ))}
          </select>
          <button className="ex-link" onClick={() => download(new Blob([svg], { type: 'image/svg+xml' }), `${file}.svg`)}>
            Download SVG
          </button>
          <button className="ex-link" disabled={busy} onClick={() => more(svg, item.name)}>
            More like this
          </button>
        </div>
      )}
    </article>
  )
}
