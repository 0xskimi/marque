import { Arrange } from '../edit/Arrange'
import { useEdit } from '../edit/context'
import type { CSSProperties, ReactNode } from 'react'
import type { Brand, BrandColor, BrandFont, Logo } from '../types'
import { LOGO_SLOTS } from '../types'
import { derive, versionFor, worstBackground, type Derived } from '../lib/derive'
import { contrast, estimateCmyk, hexToRgb, inkOn, luminance, mix, normHex, offBrand, ramp, toneVars, wcagLevel } from '../lib/color'
import { analyze, svgUrl } from '../lib/svg'
import { fontStack, weightsOf, WEIGHT_NAMES } from '../lib/fonts'
import { useImage } from '../lib/images'
import { ClearspaceView, ConstructionView, LogoImg, Page, Surface } from './common'
import { AppIcon, BusinessCards, Poster, SocialPost, WebsiteHero } from './Mockups'
import { Pattern } from './Pattern'

export interface Ctx {
  b: Brand
  d: Derived
  t: Tones
}

interface PageDef {
  key: string
  section: string
  title?: string
  bg: string
  bleed?: boolean
  render: (num: number) => ReactNode
}

const SECTIONS = ['Brand', 'Logo', 'Colour', 'Typography', 'Brand elements', 'Applications'] as const

/** Pages that can be switched off in the editor. Cover and closing are always on. */
export const PAGE_CATALOG: { key: string; label: string; section: string }[] = [
  { key: 'hero', label: 'Logo hero', section: 'Front' },
  { key: 'contents', label: 'Contents', section: 'Front' },
  { key: 'collaboration', label: 'Note on collaboration', section: 'Front' },
  { key: 'about', label: 'About, mission and vision', section: 'Brand' },
  { key: 'name', label: 'Name meaning', section: 'Brand' },
  { key: 'ethos', label: 'Brand ethos', section: 'Brand' },
  { key: 'architecture', label: 'Brand architecture', section: 'Brand' },
  { key: 'rationale', label: 'Design approach', section: 'Logo' },
  { key: 'overview', label: 'Logo variants overview', section: 'Logo' },
  { key: 'variants', label: 'A page per logo variant', section: 'Logo' },
  { key: 'construction', label: 'Construction', section: 'Logo' },
  { key: 'clearspace', label: 'Clear space', section: 'Logo' },
  { key: 'sizing', label: 'Logo sizing', section: 'Logo' },
  { key: 'lightdark', label: 'Logo on light and dark', section: 'Logo' },
  { key: 'badges', label: 'Solid badges and icons', section: 'Logo' },
  { key: 'colourways', label: 'Colourways', section: 'Logo' },
  { key: 'dosdonts', label: 'Do’s and don’ts', section: 'Logo' },
  { key: 'misuse', label: 'Incorrect use', section: 'Logo' },
  { key: 'placement', label: 'Logo placement', section: 'Logo' },
  { key: 'subbrands', label: 'Sub-brand logos', section: 'Logo' },
  { key: 'palette', label: 'Colour palette', section: 'Colour' },
  { key: 'colours', label: 'A page per colour', section: 'Colour' },
  { key: 'tints', label: 'Tints and shades', section: 'Colour' },
  { key: 'contrast', label: 'Accessible pairings', section: 'Colour' },
  { key: 'fonts', label: 'Typeface specimens', section: 'Typography' },
  { key: 'typeusage', label: 'Typography usage', section: 'Typography' },
  { key: 'hierarchy', label: 'Type hierarchy', section: 'Typography' },
  { key: 'pattern', label: 'Patterns', section: 'Brand elements' },
  { key: 'shapes', label: 'Shapes and graphic elements', section: 'Brand elements' },
  { key: 'imagery', label: 'Imagery', section: 'Brand elements' },
  { key: 'social', label: 'Social media', section: 'Applications' },
  { key: 'applications', label: 'Applications', section: 'Applications' },
  { key: 'contact', label: 'Contact and support', section: 'Back' },
]

export interface Tones {
  content: string
  feature: string
  cover: string
  closing: string
  divider: (i: number) => string
}

export const NOIR = '#121212'

export function tones(b: Brand, d: Derived): Tones {
  const t = b.template
  return {
    content: t === 'noir' ? NOIR : '#FFFFFF',
    feature: t === 'bold' ? d.primary : t === 'noir' ? NOIR : luminance(d.dark) < 0.03 ? d.dark : NOIR,
    cover: t === 'bold' ? d.primary : t === 'noir' ? NOIR : luminance(d.dark) < 0.03 ? d.dark : NOIR,
    closing: d.primary,
    divider: (i) => (t === 'bold' ? (i % 2 ? d.dark : d.primary) : t === 'noir' ? NOIR : d.light),
  }
}

export function makeCtx(brand: Brand): Ctx {
  const d = derive(brand)
  return { b: brand, d, t: tones(brand, d) }
}

export function Guidelines({ brand }: { brand: Brand }) {
  const ctx = makeCtx(brand)
  const edit = useEdit()
  const hiddenNow = new Set(edit?.editing ? [] : (brand.hiddenSlides ?? []))
  const defs = buildPages(ctx).filter((p) => !hiddenNow.has(`guidelines:${p.key}`))
  const starts: Record<string, number> = {}
  defs.forEach((p, i) => {
    if (!(p.section in starts)) starts[p.section] = i + 1
  })
  return (
    <div className={`doc doc-guidelines tpl-${brand.template} fmt-${brand.pageFormat ?? 'wide'}`} style={docVars(ctx)}>
      <Arrange
        doc="guidelines"
        defaultBg={ctx.t.content}
        items={defs.map((p, i) => {
          const num = i + 1
          if (p.key === 'contents') return { key: p.key, bg: p.bg, node: <Contents ctx={ctx} starts={starts} num={num} /> }
          return {
            key: p.key,
            bg: p.bg,
            node: (
              <Page num={p.bleed ? undefined : num} label={headLabel(p)} brandName={brand.name} bleed={p.bleed} bg={p.bg}>
                {p.render(num)}
              </Page>
            ),
          }
        })}
      />
    </div>
  )
}

function headLabel(p: PageDef) {
  const i = SECTIONS.indexOf(p.section as (typeof SECTIONS)[number])
  if (i >= 0) return `${pad2(i + 1)}  ${p.section}`
  return p.title ?? ''
}

export function docVars({ d }: { d: Derived }) {
  return {
    '--brand': d.primary,
    '--brand-ink': inkOn(d.primary),
    '--dark': d.dark,
    '--light': d.light,
    '--accent': d.accent,
    '--head': fontStack(d.heading),
    '--body': fontStack(d.body),
  } as CSSProperties
}

function buildPages(ctx: Ctx): PageDef[] {
  const { b, d, t } = ctx
  const hidden = new Set(b.hiddenPages ?? [])
  const pages: PageDef[] = []
  const add = (p: PageDef) => {
    if (!hidden.has(p.key)) pages.push(p)
  }
  const divider = (i: number) => {
    if (b.dividers) pages.push({ key: `divider-${i}`, section: SECTIONS[i], bleed: true, bg: t.divider(i), render: () => <Divider ctx={ctx} index={i} /> })
  }
  const C = t.content

  pages.push({ key: 'cover', section: '__front', bleed: true, bg: t.cover, render: () => <Cover ctx={ctx} /> })
  if (d.mainLogo) add({ key: 'hero', section: '__front', bleed: true, bg: C, render: () => <Hero ctx={ctx} /> })
  add({ key: 'contents', section: '__front', bg: C, render: () => null })
  if (b.collaboration?.trim()) add({ key: 'collaboration', section: '__front', title: 'A note on collaboration', bg: C, render: () => <Collaboration ctx={ctx} /> })

  divider(0)
  add({ key: 'about', section: 'Brand', title: `About ${b.name}`, bg: C, render: () => <About ctx={ctx} /> })
  if (b.nameMeaning?.some((n) => n.word.trim())) add({ key: 'name', section: 'Brand', title: 'The name', bg: C, render: () => <NameMeaning ctx={ctx} /> })
  if (b.ethos?.trim() || b.values.trim()) add({ key: 'ethos', section: 'Brand', title: 'Brand ethos', bg: C, render: () => <Ethos ctx={ctx} /> })
  if (b.subBrands?.length) add({ key: 'architecture', section: 'Brand', title: 'Brand architecture', bg: C, render: () => <Architecture ctx={ctx} /> })

  divider(1)
  if (d.mainLogo) {
    if (b.rationale.trim()) add({ key: 'rationale', section: 'Logo', title: 'Design approach', bg: C, render: () => <Rationale ctx={ctx} /> })
    const slots = LOGO_SLOTS.filter((s) => b.logos[s.id])
    if (slots.length > 1) add({ key: 'overview', section: 'Logo', title: 'Logo variants', bg: C, render: () => <Overview ctx={ctx} /> })
    if (!hidden.has('variants'))
      slots.forEach((s) => pages.push({ key: `variant-${s.id}`, section: 'Logo', title: s.label, bg: t.feature, render: () => <Variant logo={b.logos[s.id]!} /> }))
    add({ key: 'construction', section: 'Logo', title: 'Logo architecture', bg: C, render: () => <Construction ctx={ctx} /> })
    add({ key: 'clearspace', section: 'Logo', title: 'Clear space', bg: C, render: () => <Clearspace ctx={ctx} /> })
    add({ key: 'sizing', section: 'Logo', title: 'Logo sizing', bg: C, render: () => <Sizing ctx={ctx} /> })
    add({ key: 'lightdark', section: 'Logo', title: 'Logo on light and dark', bleed: true, bg: C, render: () => <LightDark ctx={ctx} /> })
    add({ key: 'badges', section: 'Logo', title: 'Solid badges and icons', bg: C, render: () => <Badges ctx={ctx} /> })
    add({ key: 'colourways', section: 'Logo', title: 'Colourways', bg: C, render: () => <Colourways ctx={ctx} /> })
    add({ key: 'dosdonts', section: 'Logo', title: 'Logo do’s and don’ts', bg: C, render: () => <DosDonts ctx={ctx} /> })
    add({ key: 'misuse', section: 'Logo', title: 'Incorrect use', bg: C, render: () => <Misuse ctx={ctx} /> })
    add({ key: 'placement', section: 'Logo', title: 'Logo placement', bg: C, render: () => <Placement ctx={ctx} /> })
    if (!hidden.has('subbrands'))
      b.subBrands?.forEach((s) => pages.push({ key: `sub-${s.id}`, section: 'Logo', title: `Sub-brand: ${s.name}`, bg: C, render: () => <SubBrandPage ctx={ctx} id={s.id} /> }))
  } else {
    pages.push({ key: 'logo-empty', section: 'Logo', title: 'Logo', bg: C, render: () => <Empty text="Upload your logo SVGs to generate the logo section." /> })
  }

  divider(2)
  add({ key: 'palette', section: 'Colour', title: 'Colour palette', bg: C, render: () => <Palette ctx={ctx} /> })
  if (!hidden.has('colours'))
    b.colors.forEach((c, i) => pages.push({ key: `colour-${c.id}`, section: 'Colour', title: c.name, bleed: true, bg: normHex(c.hex), render: () => <ColourPage ctx={ctx} c={c} i={i} /> }))
  add({ key: 'tints', section: 'Colour', title: 'Tints and shades', bg: C, render: () => <Tints ctx={ctx} /> })
  add({ key: 'contrast', section: 'Colour', title: 'Accessible pairings', bg: C, render: () => <Accessibility ctx={ctx} /> })

  divider(3)
  if (!hidden.has('fonts'))
    b.fonts.filter((f) => f.family).forEach((f) => pages.push({ key: `font-${f.family}`, section: 'Typography', title: 'Typeface', bg: C, render: () => <Specimen ctx={ctx} font={f} /> }))
  if (b.fonts.some((f) => f.family)) add({ key: 'typeusage', section: 'Typography', title: 'Typography usage', bg: C, render: () => <TypeUsage ctx={ctx} /> })
  add({ key: 'hierarchy', section: 'Typography', title: 'Type hierarchy', bg: C, render: () => <Hierarchy ctx={ctx} /> })

  if (d.mark || b.elements?.length || b.imagery?.length) {
    divider(4)
    if (d.mark && b.pattern !== 'none') add({ key: 'pattern', section: 'Brand elements', title: 'Patterns', bg: C, render: () => <Patterns ctx={ctx} /> })
    if (b.elements?.length) add({ key: 'shapes', section: 'Brand elements', title: 'Shapes and graphic elements', bg: C, render: () => <Shapes ctx={ctx} /> })
    if (b.imagery?.length) add({ key: 'imagery', section: 'Brand elements', title: 'Imagery', bg: C, render: () => <Imagery ctx={ctx} /> })
  }

  divider(5)
  add({ key: 'social', section: 'Applications', title: 'Social media', bg: C, render: () => <Social ctx={ctx} /> })
  if (!hidden.has('applications')) {
    pages.push({ key: 'apps-1', section: 'Applications', title: 'Applications', bg: C, render: () => <Applications ctx={ctx} /> })
    pages.push({ key: 'apps-2', section: 'Applications', title: 'Applications', bg: C, render: () => <Applications2 ctx={ctx} /> })
  }

  add({ key: 'contact', section: '__back', title: 'Contact and support', bg: C, render: () => <Contact ctx={ctx} /> })
  pages.push({ key: 'closing', section: '__back', bleed: true, bg: t.closing, render: () => <Closing ctx={ctx} /> })
  return pages
}

/* ---------------- helpers ---------------- */

function Empty({ text }: { text: string }) {
  return <div className="empty-note">{text}</div>
}

function H({ kicker, title, children }: { kicker?: string; title: string; children?: ReactNode }) {
  return (
    <div className="g-heading">
      {kicker && <div className="g-kicker">{kicker}</div>}
      <h2>{title}</h2>
      {children && <div className="g-lede">{children}</div>}
    </div>
  )
}

function paras(text: string) {
  return text
    .split(/\n\s*\n|\n/)
    .map((p) => p.trim())
    .filter(Boolean)
}

function lines(text?: string) {
  return (text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

const pad2 = (n: number) => String(n).padStart(2, '0')

function nameOf(colors: BrandColor[], hex: string) {
  if (hex === '#FFFFFF') return 'White'
  if (hex === '#000000') return 'Black'
  return colors.find((c) => normHex(c.hex) === hex)?.name ?? hex
}

function siteOf(b: Brand) {
  return b.website || `${b.name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'brand'}.com`
}

/* ---------------- front ---------------- */

function Cover({ ctx, kind = 'Brand Guidelines' }: { ctx: Ctx; kind?: string }) {
  const { b, d, t } = ctx
  const bg = t.cover
  const [a, z] = kind.split(' ')
  return (
    <div className="cover">
      <Pattern mark={d.mark} bg={bg} style={b.pattern === 'none' ? 'none' : 'crop'} opacity={b.patternOpacity} />
      <div className="cover-top">
        <div className="cover-logo">
          <LogoImg logo={d.mainLogo} style={{ objectPosition: 'left center' }} />
        </div>
        {b.year && (
          <span className="pill" style={{ background: d.primary === bg ? inkOn(bg) : d.primary, color: d.primary === bg ? bg : inkOn(d.primary) }}>
            {b.year}
          </span>
        )}
      </div>
      <div className="cover-title">
        {a}
        <br />
        {z}
      </div>
      <div className="cover-foot">
        <span>{siteOf(b)}</span>
        <span>Version {b.version}</span>
      </div>
    </div>
  )
}

function Hero({ ctx }: { ctx: Ctx }) {
  return (
    <div className="hero">
      <div className="hero-logo">
        <LogoImg logo={ctx.d.mainLogo} />
      </div>
    </div>
  )
}

function Contents({ ctx, starts, num }: { ctx: Ctx; starts: Record<string, number>; num: number }) {
  const list = [...SECTIONS.filter((s) => s in starts), ...('__back' in starts && !ctx.b.hiddenPages?.includes('contact') ? ['Contact and support'] : [])]
  return (
    <Page num={num} label="Contents" brandName={ctx.b.name} bg={ctx.t.content}>
      <div className="contents">
        <h2>Contents</h2>
        <ol>
          {list.map((s, i) => (
            <li key={s}>
              <span className="c-num">{pad2(i + 1)}</span>
              <span className="c-name">{s}</span>
              <span className="c-page">{pad2(s === 'Contact and support' ? starts.__back : starts[s])}</span>
            </li>
          ))}
        </ol>
      </div>
    </Page>
  )
}

function Collaboration({ ctx }: { ctx: Ctx }) {
  const { b } = ctx
  return (
    <div className="collab">
      <div className="g-kicker">A note on collaboration</div>
      {paras(b.collaboration).map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      {b.studio && <div className="collab-sign">{b.studio}</div>}
    </div>
  )
}

function Divider({ ctx, index }: { ctx: Ctx; index: number }) {
  const { b, d, t } = ctx
  const bg = t.divider(index)
  return (
    <div className="divider-page">
      {b.template !== 'swiss' && <Pattern mark={d.mark} bg={bg} style={b.pattern === 'none' ? 'none' : 'crop'} opacity={b.patternOpacity * 0.8} />}
      <div className="divider-num">{pad2(index + 1)}</div>
      <div className="divider-title">{SECTIONS[index]}</div>
      {b.template === 'swiss' && <div className="divider-rule" />}
    </div>
  )
}

/* ---------------- brand ---------------- */

function About({ ctx }: { ctx: Ctx }) {
  const { b } = ctx
  const values = b.values.split(',').map((v) => v.trim()).filter(Boolean)
  return (
    <div className="about">
      <div className="about-main">
        {b.tagline && <div className="about-tagline">{b.tagline}</div>}
        {paras(b.about || 'Add a short description of the brand in the editor.').map((p, i) => (
          <p key={i} className="about-text">
            {p}
          </p>
        ))}
      </div>
      <div className="about-side">
        {b.vision && (
          <div className="about-block">
            <h3>Our vision</h3>
            <p>{b.vision}</p>
          </div>
        )}
        {b.mission && (
          <div className="about-block">
            <h3>Our mission</h3>
            <p>{b.mission}</p>
          </div>
        )}
        {!b.ethos?.trim() && values.length > 0 && (
          <div className="about-block">
            <h3>Values</h3>
            <p>{values.join(' · ')}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function NameMeaning({ ctx }: { ctx: Ctx }) {
  const { b } = ctx
  const words = b.nameMeaning.filter((n) => n.word.trim())
  return (
    <div className="namem">
      <div className="g-kicker">The name</div>
      <div className="namem-name">{b.name}</div>
      <div className="namem-pron">{words.map((w) => w.pronunciation).filter(Boolean).join(' · ')}</div>
      <div className="namem-words" style={{ gridTemplateColumns: `repeat(${Math.min(words.length, 4)}, 1fr)` }}>
        {words.map((w, i) => (
          <div key={i} className="namem-word">
            <strong>{w.word}</strong>
            {w.pronunciation && <span>{w.pronunciation}</span>}
            <p>{w.meaning}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function Ethos({ ctx }: { ctx: Ctx }) {
  const { b } = ctx
  const points = b.ethos?.trim()
    ? lines(b.ethos).map((l) => {
        const k = l.indexOf(':')
        return k > 0 ? { title: l.slice(0, k).trim(), text: l.slice(k + 1).trim() } : { title: l, text: '' }
      })
    : b.values.split(',').map((v) => ({ title: v.trim(), text: '' })).filter((v) => v.title)
  return (
    <div className="stack">
      <H kicker="Brand ethos" title="What we stand for">
        {b.ethosIntro}
      </H>
      <div className="ethos" style={{ gridTemplateColumns: `repeat(${points.length > 4 ? 3 : Math.max(points.length, 1)}, 1fr)` }}>
        {points.slice(0, 6).map((p, i) => (
          <div key={i} className="ethos-item">
            <span>{pad2(i + 1)}</span>
            <strong>{p.title}</strong>
            {p.text && <p>{p.text}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

function Architecture({ ctx }: { ctx: Ctx }) {
  const { b, d } = ctx
  return (
    <div className="arch">
      <div className="arch-head">
        <H kicker="Brand architecture" title="How the brands fit together">
          {b.architecture}
        </H>
      </div>
      <div className="arch-tree">
        <div className="arch-master">
          <div className="arch-logo">
            <LogoImg logo={d.mainLogo} />
          </div>
          <span>Master brand</span>
        </div>
        <div className="arch-lines" style={{ ['--n' as string]: b.subBrands.length }} />
        <div className="arch-subs" style={{ gridTemplateColumns: `repeat(${b.subBrands.length}, 1fr)` }}>
          {b.subBrands.map((s) => (
            <div key={s.id} className="arch-sub">
              <Surface bg={s.color ? normHex(s.color) : toneVars(ctx.t.content)['--panel']} className="arch-sub-tile">
                {s.logo ? (
                  <div className="arch-sub-logo">
                    <LogoImg logo={s.logo} version={s.color ? 'auto' : 'full'} />
                  </div>
                ) : (
                  <strong>{s.name}</strong>
                )}
              </Surface>
              <strong>{s.name}</strong>
              <p>{s.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ---------------- logo ---------------- */

function Rationale({ ctx }: { ctx: Ctx }) {
  const { b, d } = ctx
  const word = d.logo('wordmark')
  return (
    <div className="split">
      <div className="g-heading">
        <div className="g-kicker">Design approach</div>
        <h2>The idea behind the mark</h2>
        <div className="g-lede">
          {paras(b.rationale).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </div>
      <div className="stage stage-gridlines">
        <div className="rationale-art">
          <div className="rationale-mark">
            <LogoImg logo={d.mark} />
          </div>
          {word && word !== d.mark && (
            <div className="rationale-word">
              <LogoImg logo={word} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Overview({ ctx }: { ctx: Ctx }) {
  const { b } = ctx
  const items = LOGO_SLOTS.filter((s) => b.logos[s.id])
  return (
    <div className="split overview">
      <H kicker="Company logo" title="Logo variants">
        <ul className="bullets">
          {items.map((s) => (
            <li key={s.id}>
              <strong>{s.label}.</strong> {s.hint}.
            </li>
          ))}
        </ul>
        Each version is designed for a different amount of space. Choose the one that fits; never rebuild one from another.
      </H>
      <div className="ov-grid" style={{ gridTemplateColumns: `repeat(${items.length > 2 ? 2 : items.length}, 1fr)` }}>
        {items.map((s) => (
          <div key={s.id} className={`ov-tile ${items.length === 3 && s.id === items[0].id ? 'span2' : ''}`}>
            <span>{s.label}</span>
            <div className="ov-logo">
              <LogoImg logo={b.logos[s.id]} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Variant({ logo }: { logo: Logo }) {
  const wide = logo.width / logo.height > 2.2
  return (
    <div className="variant">
      <div className={`variant-logo ${wide ? 'wide' : ''}`}>
        <LogoImg logo={logo} />
      </div>
    </div>
  )
}

function Construction({ ctx }: { ctx: Ctx }) {
  const { d } = ctx
  const logo = d.mark!
  const c = analyze(logo.svg)
  const issues = c.issues.duplicates + c.issues.kinks
  return (
    <div className="split">
      <H kicker="Logo" title="Construction">
        The mark is drawn with {c.anchors.length} anchor points
        {c.circles.length ? ` and built on ${c.circles.length} construction circle${c.circles.length === 1 ? '' : 's'}` : ''}. Its geometry is fixed: never redraw,
        trace or approximate it.
        {issues > 0 && <span className="qa-note"> QA: {issues} point{issues === 1 ? '' : 's'} flagged in red for review.</span>}
      </H>
      <div className="stage stage-grid stage-gridlines">
        <ConstructionView logo={logo} ink={luminance(ctx.t.content) < 0.2 ? '#FFFFFF' : d.primary} />
      </div>
    </div>
  )
}

function Clearspace({ ctx }: { ctx: Ctx }) {
  const { b, d } = ctx
  const mark = d.mark !== d.mainLogo ? d.mark : undefined
  return (
    <div className="split">
      <H kicker="Logo" title="Clear space">
        Keep a clear zone around the logo, free of text, images and edges. The minimum clear space X is{' '}
        {b.clearspaceLabel || `${Math.round(b.clearspace * 100)}% of the logo height`}. This is a minimum; use more space where you can.
      </H>
      <div className={`cs-row ${mark ? 'two' : ''}`}>
        <div className="stage">
          <div className="stage-logo wide">
            <ClearspaceView logo={d.mainLogo!} ratio={b.clearspace} ink={d.primary} />
          </div>
        </div>
        {mark && (
          <div className="stage">
            <div className="stage-logo wide">
              <ClearspaceView logo={mark} ratio={b.clearspace} ink={d.primary} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const PX_MM = 25.4 / 96

function Sizing({ ctx }: { ctx: Ctx }) {
  const { b, d } = ctx
  const min = b.minDigitalPx || 96
  const main = d.mainLogo!
  const mark = d.mark !== main ? d.mark : undefined
  const markMin = Math.max(16, Math.round(min / 3))
  const rows: { px: number; logo: Logo; note: string }[] = [
    { px: min * 4, logo: main, note: 'Large: covers, signage, hero areas' },
    { px: min * 2, logo: main, note: 'Medium: headers, documents' },
    { px: min, logo: main, note: `Minimum: ${b.minPrintMm} mm in print` },
  ]
  if (mark) rows.push({ px: markMin, logo: mark, note: 'Logomark minimum: favicons, avatars' })
  return (
    <div className="split">
      <H kicker="Logo" title="Logo sizing">
        Recommended widths in pixels, shown at actual screen size. Below the minimum the details fill in; switch to the logomark when space is tighter.
      </H>
      <div className="sizing">
        {rows.map((r, i) => (
          <div key={i} className="sizing-row">
            <div className="sizing-px">
              <strong>{r.px} px</strong>
              <span>{r.note}</span>
            </div>
            <div className="sizing-logo">
              <div style={{ width: `${Math.min(150, r.px * PX_MM)}mm`, height: `${(Math.min(150, r.px * PX_MM) * r.logo.height) / r.logo.width}mm` }}>
                <LogoImg logo={r.logo} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function LightDark({ ctx }: { ctx: Ctx }) {
  const { d, t } = ctx
  const dark = luminance(t.feature) < 0.2 ? t.feature : d.dark
  return (
    <div className="ld">
      <Surface bg="#FFFFFF" className="ld-half">
        <span className="ld-label">Logo on light</span>
        <div className="ld-logo">
          <LogoImg logo={d.mainLogo} />
        </div>
      </Surface>
      <Surface bg={dark} className="ld-half">
        <span className="ld-label">Logo on dark</span>
        <div className="ld-logo">
          <LogoImg logo={d.mainLogo} />
        </div>
      </Surface>
    </div>
  )
}

function Badges({ ctx }: { ctx: Ctx }) {
  const { d } = ctx
  const mark = d.mark!
  const tiles: { bg: string; shape: string; label: string; logo?: Logo }[] = [
    { bg: d.primary, shape: 'square', label: 'Square, brand colour' },
    { bg: d.dark, shape: 'square', label: 'Square, dark' },
    { bg: '#FFFFFF', shape: 'square line', label: 'Square, white' },
    { bg: d.primary, shape: 'rounded', label: 'App icon' },
    { bg: d.dark, shape: 'circle', label: 'Profile picture' },
  ]
  return (
    <div className="stack">
      <H kicker="Logo" title="Solid badges and icons">
        When the logo has to sit on photography or a busy surface, place the logomark inside a solid badge. These are the only approved shapes.
      </H>
      <div className="badges">
        {tiles.map((x, i) => (
          <figure key={i}>
            <Surface bg={x.bg} className={`badge ${x.shape}`}>
              <div className="badge-logo">
                <LogoImg logo={x.logo ?? mark} />
              </div>
            </Surface>
            <figcaption>{x.label}</figcaption>
          </figure>
        ))}
      </div>
      <div className="badge-wide-row">
        <Surface bg={d.primary} className="badge-wide">
          <div className="badge-wide-logo">
            <LogoImg logo={d.mainLogo} />
          </div>
        </Surface>
        <Surface bg={d.dark} className="badge-wide">
          <div className="badge-wide-logo">
            <LogoImg logo={d.mainLogo} />
          </div>
        </Surface>
        <span className="badge-note">Horizontal badges for lanyards, labels, banners and web headers.</span>
      </div>
    </div>
  )
}

function Colourways({ ctx }: { ctx: Ctx }) {
  const { b, d } = ctx
  const logo = d.mainLogo!
  const bgs = [...new Set(['#FFFFFF', ...b.colors.map((c) => normHex(c.hex)), '#000000'])].slice(0, 8)
  return (
    <div className="stack">
      <H kicker="Logo" title="Colourways">
        Approved logo versions on each brand colour, chosen by measured contrast. Full colour is used only where every colour in the logo stays legible.
      </H>
      <div className="ways">
        {bgs.map((bg) => {
          const v = versionFor(logo.svg, bg)
          return (
            <figure key={bg}>
              <Surface bg={bg} className="way">
                <div className="way-logo">
                  <LogoImg logo={logo} />
                </div>
              </Surface>
              <figcaption>
                {nameOf(b.colors, bg)} · {v.version === 'full' ? 'Full colour' : v.version === 'white' ? 'White' : 'Black'} · {v.ratio.toFixed(1)}:1
              </figcaption>
            </figure>
          )
        })}
      </div>
    </div>
  )
}

function misuseItems(ctx: Ctx) {
  const { b, d } = ctx
  const logo = d.mainLogo!
  const lowBg = worstBackground(logo.svg, b.colors) ?? '#DDDDDD'
  const wrong = offBrand(d.primary)
  return {
    stretch: { label: 'Do not stretch, squash or distort the logo', node: <LogoImg logo={logo} version="full" style={{ objectFit: 'fill', transform: 'scaleX(1.35) scaleY(0.8)' }} /> },
    rotate: { label: 'Do not rotate the logo', node: <LogoImg logo={logo} version="full" style={{ transform: 'rotate(-14deg)' }} /> },
    recolour: { label: 'Do not use colours outside the palette', node: <LogoImg logo={logo} version={wrong} /> },
    effects: { label: 'Do not add drop shadows or other effects', node: <LogoImg logo={logo} version="full" style={{ filter: 'drop-shadow(1.2mm 1.2mm 0.8mm rgba(0,0,0,.45))' }} /> },
    contrast: { label: `Do not place on ${nameOf(b.colors, lowBg)}, where contrast is too low`, node: <LogoImg logo={logo} version="full" />, bg: lowBg },
    outline: { label: 'Do not outline the logo or the icon', node: <LogoImg logo={logo} outline={d.dark} /> },
    skew: { label: 'Do not skew or slant the logo', node: <LogoImg logo={logo} version="full" style={{ transform: 'skewX(-18deg)' }} /> },
    crop: { label: 'Do not crop the logo', node: <LogoImg logo={logo} version="full" style={{ width: '170%', height: '170%', objectPosition: '0 30%' }} /> },
    opacity: { label: 'Do not reduce the logo’s opacity', node: <LogoImg logo={logo} version="full" style={{ opacity: 0.35 }} /> },
    busy: {
      label: 'Do not place on busy backgrounds without a badge',
      node: <LogoImg logo={logo} version="full" />,
      bg: `repeating-linear-gradient(135deg, ${d.accent} 0 3mm, ${d.light} 3mm 6mm, ${d.primary} 6mm 9mm)`,
    },
  } as Record<string, { label: string; node: ReactNode; bg?: string }>
}

function DosDonts({ ctx }: { ctx: Ctx }) {
  const { b, d } = ctx
  const logo = d.mainLogo!
  const m = misuseItems(ctx)
  const busyBg = d.dark
  const dos: { bg: string; logo?: Logo; text: string }[] = [
    { bg: '#FFFFFF', logo, text: 'Use the full-colour logo on light backgrounds.' },
    { bg: busyBg, logo, text: 'Use the white logo on dark or colour-conflicting backgrounds.' },
    { bg: '#FFFFFF', logo: d.mark, text: 'Use the logomark on its own in small spaces.' },
    { bg: d.primary, logo, text: `Use the ${versionFor(logo.svg, d.primary).version === 'white' ? 'white' : 'approved'} logo on ${nameOf(b.colors, d.primary)}.` },
  ]
  const donts = [m.outline, m.effects, m.stretch, m.recolour]
  return (
    <div className="dd">
      <div className="dd-col">
        <div className="dd-head ok">
          <span>✓</span> Do’s
        </div>
        {dos.map((x, i) => (
          <div key={i} className="dd-row">
            <Surface bg={x.bg} className="dd-tile">
              <div className="dd-logo">
                <LogoImg logo={x.logo} />
              </div>
            </Surface>
            <p>{x.text}</p>
          </div>
        ))}
      </div>
      <div className="dd-col">
        <div className="dd-head no">
          <span>×</span> Don’ts
        </div>
        {donts.map((x, i) => (
          <div key={i} className="dd-row">
            <Surface bg={x.bg ?? '#FFFFFF'} className="dd-tile">
              <div className="dd-logo">{x.node}</div>
            </Surface>
            <p>{x.label}.</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function Misuse({ ctx }: { ctx: Ctx }) {
  const { b } = ctx
  const m = misuseItems(ctx)
  const items = [m.stretch, m.rotate, m.recolour, m.effects, m.contrast, m.outline, m.skew, m.crop, m.busy]
  return (
    <div className="split misuse-split">
      <H kicker="Logo" title="Incorrect use">
        To protect the identity, never alter the logo. Every example here is generated from the {b.name} logo itself.
      </H>
      <div className="misuse">
        {items.map((it, i) => (
          <figure key={i}>
            <div className="misuse-tile" style={{ background: it.bg ?? '#fff' }}>
              <div className="misuse-logo">{it.node}</div>
              <span className="misuse-x">×</span>
            </div>
            <figcaption>{it.label}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}

function Placement({ ctx }: { ctx: Ctx }) {
  const { b, d } = ctx
  const logo = d.mainLogo
  const frames = [
    { cls: 'pf-a4', label: 'Documents · top left', pos: 'tl', bg: '#FFFFFF' },
    { cls: 'pf-wide', label: 'Presentations and screens · bottom right', pos: 'br', bg: d.primary },
    { cls: 'pf-square', label: 'Covers and posters · centred', pos: 'c', bg: d.dark },
  ]
  return (
    <div className="stack">
      <H kicker="Logo" title="Logo placement">
        Align the logo to the layout margins in a corner. Centre it only on covers and closing pages. Its width should be about a quarter of the format’s
        shorter side.
      </H>
      <div className="placement">
        {frames.map((f) => (
          <figure key={f.cls}>
            <Surface bg={f.bg} className={`pf ${f.cls}`}>
              <div className="pf-margin" />
              <div className={`pf-logo pf-${f.pos}`}>
                <LogoImg logo={f.pos === 'c' ? logo : logo} style={{ objectPosition: f.pos === 'tl' ? 'left top' : f.pos === 'br' ? 'right bottom' : 'center' }} />
              </div>
              {f.pos !== 'c' && (
                <div className={`pf-copy pf-copy-${f.pos}`}>
                  <i style={{ width: '70%' }} />
                  <i style={{ width: '55%' }} />
                  <i style={{ width: '62%' }} />
                </div>
              )}
            </Surface>
            <figcaption>{f.label}</figcaption>
          </figure>
        ))}
      </div>
      {b.minPrintMm > 0 && <div className="placement-note">Never smaller than {b.minPrintMm} mm wide in print.</div>}
    </div>
  )
}

function SubBrandPage({ ctx, id }: { ctx: Ctx; id: string }) {
  const { d } = ctx
  const s = ctx.b.subBrands.find((x) => x.id === id)!
  const bg = s.color ? normHex(s.color) : d.dark
  return (
    <div className="split">
      <H kicker="Sub-brand" title={s.name}>
        {s.description}
      </H>
      <div className="sub-stages">
        <Surface bg={bg} className="stage">
          <div className="stage-logo">{s.logo ? <LogoImg logo={s.logo} /> : <div className="sub-name">{s.name}</div>}</div>
        </Surface>
        <Surface bg="#FFFFFF" className="stage line">
          <div className="stage-logo">{s.logo ? <LogoImg logo={s.logo} /> : <div className="sub-name">{s.name}</div>}</div>
        </Surface>
      </div>
    </div>
  )
}

/* ---------------- colour ---------------- */

const ROLE_SHARE = { primary: 30, secondary: 15, accent: 8, neutral: 15 }

function specs(c: BrandColor) {
  const hex = normHex(c.hex)
  const [r, g, bb] = hexToRgb(hex)
  return {
    hex,
    rgb: `${r} ${g} ${bb}`,
    cmyk: c.cmyk?.trim() || `≈ ${estimateCmyk(hex).join(' ')}`,
    pantone: c.pantone?.trim(),
  }
}

function Palette({ ctx }: { ctx: Ctx }) {
  const { b } = ctx
  const order = { primary: 0, secondary: 1, accent: 2, neutral: 3 }
  const cols = [...b.colors].sort((x, y) => order[x.role] - order[y.role])
  const share = (c: BrandColor) => (c.share && c.share > 0 ? c.share : ROLE_SHARE[c.role])
  const total = cols.reduce((n, c) => n + share(c), 0) || 1
  return (
    <div className="stack">
      <H kicker="Colour" title="Colour palette">
        Column widths show roughly how much of each colour to use. CMYK values marked ≈ are estimates; confirm them against a printed swatch before production.
      </H>
      <div className="palette">
        {cols.map((c) => {
          const s = specs(c)
          return (
            <div key={c.id} className="swatch" style={{ flex: `${share(c)} 1 0` }}>
              <div className="swatch-color" style={{ background: s.hex, color: inkOn(s.hex), outline: contrast(s.hex, '#fff') < 1.15 ? '0.2mm solid var(--rule)' : undefined }}>
                <span className="swatch-role">{c.role}</span>
                <span className="swatch-pct">{Math.round((share(c) / total) * 100)}%</span>
              </div>
              <div className="swatch-info">
                <strong>{c.name}</strong>
                <dl>
                  <dt>HEX</dt>
                  <dd>{s.hex}</dd>
                  <dt>RGB</dt>
                  <dd>{s.rgb}</dd>
                  <dt>CMYK</dt>
                  <dd>{s.cmyk}</dd>
                  {s.pantone && (
                    <>
                      <dt>PMS</dt>
                      <dd>{s.pantone}</dd>
                    </>
                  )}
                </dl>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ColourPage({ ctx, c, i }: { ctx: Ctx; c: BrandColor; i: number }) {
  const s = specs(c)
  const assoc = lines(c.associations)
  return (
    <div className="colour-page">
      <div className="cp-top">
        <span>
          Colour {pad2(i + 1)} · {c.role}
        </span>
        <span>{ctx.b.name}</span>
      </div>
      <div className="cp-main">
        <div className="cp-name">{c.name}</div>
        <div className="cp-text">
          {c.meaning && <p>{c.meaning}</p>}
          {assoc.length > 0 && (
            <ul>
              {assoc.map((a, k) => (
                <li key={k}>{a}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <dl className="cp-specs">
        <div>
          <dt>HEX</dt>
          <dd>{s.hex}</dd>
        </div>
        <div>
          <dt>RGB</dt>
          <dd>{s.rgb}</dd>
        </div>
        <div>
          <dt>CMYK</dt>
          <dd>{s.cmyk}</dd>
        </div>
        {s.pantone && (
          <div>
            <dt>Pantone</dt>
            <dd>{s.pantone}</dd>
          </div>
        )}
      </dl>
    </div>
  )
}

function Tints({ ctx }: { ctx: Ctx }) {
  const { b } = ctx
  const cols = b.colors.slice(0, 6)
  return (
    <div className="stack">
      <H kicker="Colour" title="Tints and shades">
        Perceptually even ramps (OKLCH) for interfaces, charts and backgrounds. Use them to support the core palette, not replace it.
      </H>
      <div className="tints">
        {cols.map((c) => (
          <div key={c.id} className="tint-row">
            <div className="tint-name">{c.name}</div>
            {ramp(c.hex).map((t) => (
              <div key={t.step} className="tint" style={{ background: t.hex, color: inkOn(t.hex) }}>
                <span>{t.step}</span>
                <span>{t.hex}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function Accessibility({ ctx }: { ctx: Ctx }) {
  const { b } = ctx
  const cols = [...b.colors.slice(0, 6).map((c) => ({ name: c.name, hex: normHex(c.hex) })), { name: 'White', hex: '#FFFFFF' }]
  return (
    <div className="stack">
      <H kicker="Colour" title="Accessible pairings">
        WCAG 2.2 contrast for text on each background. AA needs 4.5:1 for body text and 3:1 for large text and graphics.
      </H>
      <table className="matrix">
        <thead>
          <tr>
            <th>Text ↓ / Background →</th>
            {cols.map((c) => (
              <th key={c.hex}>{c.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cols.map((fg) => (
            <tr key={fg.hex}>
              <th>{fg.name}</th>
              {cols.map((bg) => {
                if (fg.hex === bg.hex) return <td key={bg.hex} className="m-same" />
                const r = contrast(fg.hex, bg.hex)
                const lvl = wcagLevel(r)
                return (
                  <td key={bg.hex} style={{ background: bg.hex, color: fg.hex }} className={lvl === 'Fail' ? 'm-fail' : ''}>
                    <span className="m-aa">Aa</span>
                    <span className="m-ratio">
                      {r.toFixed(1)} · {lvl}
                    </span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ---------------- typography ---------------- */

const ROLE_LABEL: Record<BrandFont['role'], string> = { heading: 'Primary typeface', body: 'Secondary typeface', accent: 'Accent typeface' }

function Specimen({ ctx, font }: { ctx: Ctx; font: BrandFont }) {
  const { b } = ctx
  const fam = fontStack(font)
  const weights = weightsOf(font)
  return (
    <div className="specimen">
      <div className="spec-left">
        <div className="g-kicker">{ROLE_LABEL[font.role]}</div>
        <div className="spec-aa" style={{ fontFamily: fam, fontWeight: weights[weights.length - 1] }}>
          Aa
        </div>
        <dl className="spec-meta">
          <dt>Font</dt>
          <dd style={{ fontFamily: fam, fontWeight: 600 }}>{font.family}</dd>
          <dt>Weights</dt>
          <dd>{weights.map((w) => WEIGHT_NAMES[w] ?? w).join(', ')}</dd>
          {font.language && (
            <>
              <dt>Language</dt>
              <dd>{font.language}</dd>
            </>
          )}
          <dt>Source</dt>
          <dd>{font.source === 'google' ? 'Google Fonts, free for commercial use' : font.source === 'upload' ? 'Licensed font' : 'System font'}</dd>
        </dl>
      </div>
      <div className="spec-right">
        <div className="spec-chars" style={{ fontFamily: fam }}>
          ABCDEFGHIJKLMNOPQRSTUVWXYZ
          <br />
          abcdefghijklmnopqrstuvwxyz
          <br />
          0123456789 !?&amp;@#%(),.;:
        </div>
        <div className="spec-weights">
          {weights.map((w) => (
            <div key={w} style={{ fontFamily: fam, fontWeight: w }}>
              <span>{WEIGHT_NAMES[w] ?? w}</span>
              {b.tagline || 'The quick brown fox jumps over the lazy dog'}
            </div>
          ))}
        </div>
        {font.usage && <p className="spec-usage">{font.usage}</p>}
      </div>
    </div>
  )
}

function TypeUsage({ ctx }: { ctx: Ctx }) {
  const { b } = ctx
  const fonts = b.fonts.filter((f) => f.family).slice(0, 3)
  return (
    <div className="stack">
      <H kicker="Typography" title="Typography usage">
        Each typeface has a job. Keep to these roles so layouts stay consistent across every touchpoint.
      </H>
      <div className="tu" style={{ gridTemplateColumns: `repeat(${fonts.length}, 1fr)` }}>
        {fonts.map((f, i) => {
          const ws = weightsOf(f)
          return (
            <div key={i} className="tu-col">
              <div className="g-kicker">{ROLE_LABEL[f.role]}</div>
              <div className="tu-name" style={{ fontFamily: fontStack(f), fontWeight: ws[ws.length - 1] }}>
                {f.family}
              </div>
              <div className="tu-sample" style={{ fontFamily: fontStack(f) }}>
                {f.role === 'body' ? b.about.split('.').slice(0, 1).join('.') + '.' : b.tagline || b.name}
              </div>
              <div className="tu-label">Usage</div>
              <p>{f.usage || (f.role === 'heading' ? 'Headlines and display text.' : f.role === 'body' ? 'Body copy and captions.' : 'Short accents only.')}</p>
              <div className="tu-label">Weights</div>
              <div className="tu-weights">
                {ws.map((w) => (
                  <span key={w} style={{ fontFamily: fontStack(f), fontWeight: w }}>
                    {WEIGHT_NAMES[w] ?? w}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Hierarchy({ ctx }: { ctx: Ctx }) {
  const { b, d } = ctx
  const r = b.typeScaleRatio || 1.25
  const base = b.typeBase || 16
  const levels = [
    { name: 'Display', step: 5, font: d.heading, weight: 'max', lh: 1.05 },
    { name: 'Heading 1', step: 4, font: d.heading, weight: 'max', lh: 1.1 },
    { name: 'Heading 2', step: 3, font: d.heading, weight: 'max', lh: 1.15 },
    { name: 'Heading 3', step: 2, font: d.heading, weight: 'mid', lh: 1.2 },
    { name: 'Body', step: 0, font: d.body, weight: 'min', lh: 1.5 },
    { name: 'Caption', step: -1, font: d.body, weight: 'min', lh: 1.4 },
  ]
  return (
    <div className="split hier-split">
      <H kicker="Typography" title="Type hierarchy">
        A modular scale with a {base}px base and a {r} ratio. Sizes are shown for screen; multiply by 0.75 for points in print.
      </H>
      <div className="hier">
        {levels.map((l) => {
          const px = Math.round(base * Math.pow(r, l.step))
          const ws = weightsOf(l.font)
          const w = l.weight === 'max' ? ws[ws.length - 1] : l.weight === 'mid' ? ws[Math.floor(ws.length / 2)] : ws[0]
          return (
            <div key={l.name} className="hier-row">
              <div className="hier-meta">
                <strong>{l.name}</strong>
                <span>
                  {px}px / {Math.round(px * l.lh)}px · {WEIGHT_NAMES[w] ?? w}
                </span>
              </div>
              <div className="hier-sample" style={{ fontFamily: fontStack(l.font), fontWeight: w, fontSize: `${px * 0.7}pt`, lineHeight: l.lh }}>
                {l.step >= 4 ? b.name : l.step >= 2 ? b.tagline || b.name : 'Every detail of the identity works together so the brand is recognised instantly.'}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ---------------- brand elements ---------------- */

function Patterns({ ctx }: { ctx: Ctx }) {
  const { b, d } = ctx
  const panels = [
    { style: 'crop' as const, bg: d.primary, label: 'Oversized mark' },
    { style: 'grid' as const, bg: d.dark, label: 'Repeat' },
    { style: 'outline' as const, bg: d.light, label: 'Outline repeat' },
    { style: 'offset' as const, bg: '#FFFFFF', label: 'Offset repeat', ink: d.primary },
  ]
  return (
    <div className="stack">
      <H kicker="Brand elements" title="Patterns">
        Built from the logomark. Use patterns as a quiet background texture on covers, packaging, merchandise and social posts, keeping contrast low so content
        stays readable.
      </H>
      <div className="patterns">
        {panels.map((p) => (
          <figure key={p.style}>
            <Surface bg={p.bg} className="pat-tile">
              <Pattern mark={d.mark} bg={p.bg} style={p.style} opacity={p.style === 'crop' ? 0.18 : 0.12} ink={p.ink} density={0.9} anchor="center" />
            </Surface>
            <figcaption>
              {p.label}
              {b.pattern === p.style && <b> · default</b>}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}

function Shapes({ ctx }: { ctx: Ctx }) {
  const { b } = ctx
  const els = b.elements.slice(0, 8)
  return (
    <div className="stack">
      <H kicker="Brand elements" title="Shapes and graphic elements">
        Supporting graphics that extend the identity. Use them to frame content and add rhythm, never as a replacement for the logo.
      </H>
      <div className="shapes" style={{ gridTemplateColumns: `repeat(${Math.min(els.length, 4)}, 1fr)` }}>
        {els.map((e) => (
          <figure key={e.id}>
            <div className="shape-tile">
              <img src={svgUrl(e.svg)} alt="" />
            </div>
            <figcaption>{e.name}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}

function Photo({ id, caption }: { id: string; caption?: string }) {
  const url = useImage(id)
  return (
    <figure className="photo">
      <div className="photo-img" style={{ backgroundImage: url ? `url(${url})` : undefined }} />
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  )
}

function Imagery({ ctx }: { ctx: Ctx }) {
  const { b } = ctx
  const imgs = b.imagery.slice(0, 6)
  return (
    <div className="split imagery-split">
      <H kicker="Brand elements" title="Imagery">
        {b.imageryNotes}
      </H>
      <div className={`imagery n${imgs.length}`}>
        {imgs.map((im) => (
          <Photo key={im.id} id={im.id} caption={im.caption} />
        ))}
      </div>
    </div>
  )
}

/* ---------------- applications ---------------- */

export function SocialFrame({ ctx, kind }: { ctx: Ctx; kind: 'post' | 'story' }) {
  const { b, d } = ctx
  const bg = kind === 'post' ? d.primary : d.dark
  return (
    <Surface bg={bg} className={`sf sf-${kind}`}>
      <Pattern mark={d.mark} bg={bg} style={b.pattern === 'none' ? 'none' : b.pattern} opacity={b.patternOpacity} />
      {kind === 'story' && <div className="sf-safe top" />}
      {kind === 'story' && <div className="sf-safe bottom" />}
      <div className="sf-logo">
        <LogoImg logo={kind === 'post' ? d.mainLogo : d.mark} style={{ objectPosition: kind === 'post' ? 'left top' : 'center' }} />
      </div>
      <div className="sf-text" style={{ fontFamily: fontStack(d.heading) }}>
        {b.tagline || b.name}
      </div>
      <div className="sf-url">{siteOf(b)}</div>
    </Surface>
  )
}

function Social({ ctx }: { ctx: Ctx }) {
  const { d } = ctx
  return (
    <div className="split social-split">
      <H kicker="Applications" title="Social media">
        Logo placement and safe zones for the main formats. On stories keep the top and bottom bands clear of text; the app’s interface covers them.
      </H>
      <div className="social">
        <figure>
          <SocialFrame ctx={ctx} kind="post" />
          <figcaption>Post · 1080 × 1080 px</figcaption>
        </figure>
        <figure>
          <SocialFrame ctx={ctx} kind="story" />
          <figcaption>Story · 1080 × 1920 px</figcaption>
        </figure>
        <figure className="social-avatar-fig">
          <Surface bg={d.primary} className="social-avatar">
            <div className="social-avatar-logo">
              <LogoImg logo={d.mark} />
            </div>
          </Surface>
          <figcaption>Profile picture · 400 × 400 px</figcaption>
        </figure>
      </div>
    </div>
  )
}

function Applications({ ctx }: { ctx: Ctx }) {
  return (
    <div className="apps">
      <Surface bg={mix(ctx.t.content, '#888888', 0.12)} className="apps-cards">
        <BusinessCards {...ctx} />
      </Surface>
      <Surface bg="#F4F4F2" className="apps-icon">
        <AppIcon {...ctx} />
      </Surface>
      <div className="apps-social">
        <SocialPost {...ctx} />
      </div>
    </div>
  )
}

function Applications2({ ctx }: { ctx: Ctx }) {
  return (
    <div className="apps2">
      <WebsiteHero {...ctx} />
      <Poster {...ctx} />
    </div>
  )
}

/* ---------------- back ---------------- */

function Contact({ ctx }: { ctx: Ctx }) {
  const { b } = ctx
  const rows: [string, string | undefined][] = [
    ['Email', b.contactEmail],
    ['Phone', b.contactPhone],
    ['Website', b.website],
    ['Address', b.address],
  ]
  return (
    <div className="contact">
      <div className="contact-main">
        <div className="g-kicker">Contact and support</div>
        <div className="contact-big">Questions about the {b.name} brand, or need a file you can’t find? Get in touch.</div>
      </div>
      <div className="contact-cols">
        <dl>
          {rows
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
        </dl>
        {b.studio && (
          <dl>
            <div>
              <dt>Brand identity by</dt>
              <dd>{b.studio}</dd>
            </div>
            {b.studioEmail && (
              <div>
                <dt>Studio</dt>
                <dd>
                  {b.studioEmail}
                  {b.studioSite && (
                    <>
                      <br />
                      {b.studioSite}
                    </>
                  )}
                </dd>
              </div>
            )}
          </dl>
        )}
      </div>
    </div>
  )
}

export function Closing({ ctx }: { ctx: Ctx }) {
  const { b, d, t } = ctx
  return (
    <div className="closing">
      <Pattern mark={d.mark} bg={t.closing} style={b.pattern === 'none' ? 'none' : 'crop'} opacity={Math.max(0.08, b.patternOpacity)} />
      <div className="closing-logo">
        <LogoImg logo={d.mainLogo} />
      </div>
      <div className="closing-copy">
        © {b.client || b.name} {b.year || new Date().getFullYear()}. All rights reserved.
      </div>
    </div>
  )
}

export { Cover }
