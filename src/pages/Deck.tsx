import { Arrange } from '../edit/Arrange'
import { type ReactNode } from 'react'
import type { Brand } from '../types'
import { LOGO_SLOTS } from '../types'
import { derive, versionFor, type Derived } from '../lib/derive'
import { hexToRgb, inkOn, normHex } from '../lib/color'
import { fontStack, weightsOf } from '../lib/fonts'
import { ConstructionView, LogoImg } from './common'
import { docVars, makeCtx, type Ctx as DocCtx } from './Guidelines'
import { AppIcon, BusinessCards, Poster, SocialPost, WebsiteHero } from './Mockups'
import { Pattern } from './Pattern'
import { MM, PhotoScene } from './PhotoScene'
import { useLibrary } from '../lib/library'

interface Ctx {
  b: Brand
  d: Derived
}

const paras = (t: string) => t.split(/\n+/).map((p) => p.trim()).filter(Boolean)
const firstSentence = (t: string) => (t.match(/^[^.!?]*[.!?]/)?.[0] ?? t).trim()
/** Long copy steps down a size so it never runs into the footer. */
const fit = (t: string) => (t.length > 900 ? 's-fit-xs' : t.length > 520 ? 's-fit-s' : t.length > 300 ? 's-fit-m' : '')

function Slide({ children, bg, label, n, ctx, art }: { children: ReactNode; bg?: string; label?: string; n: number; ctx: Ctx; art?: ReactNode }) {
  const back = bg ?? '#FFFFFF'
  return (
    <section className="slide" style={{ background: back, color: inkOn(back) }}>
      {art}
      {label && (
        <header className="slide-head">
          <span>{ctx.b.client || ctx.b.name}</span>
          <span>{label}</span>
        </header>
      )}
      <div className="slide-body">{children}</div>
      {label && (
        <footer className="slide-foot">
          <span>{ctx.b.studio}</span>
          <span>{String(n).padStart(2, '0')}</span>
        </footer>
      )}
    </section>
  )
}

export function Deck({ brand }: { brand: Brand }) {
  const d = derive(brand)
  const ctx = { b: brand, d }
  const main = d.mainLogo
  const docCtx: DocCtx = makeCtx(brand)
  const lib = useLibrary()
  const photos = (brand.photoMockups ?? []).map((id) => lib.find((m) => m.id === id)).filter((m) => m !== undefined)
  const onDark = (logo = main) => (logo ? versionFor(logo.svg, d.dark).version : 'full')
  const slides: [string, (n: number) => ReactNode][] = []
  const date = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })

  slides.push(['cover', (n) => (
    <Slide n={n} ctx={ctx} bg={d.dark} art={<Pattern mark={d.mark} bg={d.dark} style="crop" opacity={0.28} ink={d.primary} anchor="right" />}>
      <div className="s-cover">
        <div className="s-cover-logo">
          <LogoImg logo={main} version={onDark()} style={{ objectPosition: 'left center' }} />
        </div>
        <div className="s-cover-k">Brand identity presentation</div>
        <div className="s-cover-t">{brand.client || brand.name}</div>
        <div className="s-cover-m">{[brand.studio, date].filter(Boolean).join(' · ')}</div>
      </div>
    </Slide>
  )])

  if (brand.brief)
    slides.push(['brief', (n) => (
      <Slide n={n} ctx={ctx} label="The brief">
        <div className={`s-text ${fit(brand.brief)}`}>
          <div className="s-k">The brief</div>
          {paras(brand.brief).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </Slide>
    )])

  if (brand.about)
    slides.push(['about', (n) => (
      <Slide n={n} ctx={ctx} label="The company">
        <div className="s-about">
          <div className="s-text s-fit-m">
            <div className="s-k">About {brand.name}</div>
            <p>{paras(brand.about)[0]}</p>
          </div>
          <div className="s-about-cols">
            {[
              ['Vision', brand.vision],
              ['Mission', brand.mission],
            ]
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k}>
                  <div className="s-k">{k}</div>
                  <p>{v}</p>
                </div>
              ))}
          </div>
        </div>
      </Slide>
    )])

  const words = (brand.nameMeaning ?? []).filter((w) => w.word.trim())
  if (words.length)
    slides.push(['name', (n) => (
      <Slide n={n} ctx={ctx} label="The name">
        <div className="s-name">
          <div>
            <div className="s-k">The name</div>
            <div className="s-name-t">{brand.name}</div>
            <div className="s-name-p">{words.map((w) => w.pronunciation).filter(Boolean).join(' · ')}</div>
          </div>
          <div className="s-name-parts" style={{ gridTemplateColumns: `repeat(${words.length}, 1fr)` }}>
            {words.map((w) => (
              <div key={w.word}>
                <strong>{w.word}</strong>
                <p>{w.meaning}</p>
              </div>
            ))}
          </div>
        </div>
      </Slide>
    )])

  const points = (brand.ethos || '')
    .split('\n')
    .map((l) => {
      const k = l.indexOf(':')
      return k > 0 ? { title: l.slice(0, k).trim(), text: l.slice(k + 1).trim() } : null
    })
    .filter((x) => x !== null)
  const values = points.length ? points : brand.values.split(',').map((v) => ({ title: v.trim(), text: '' })).filter((v) => v.title)
  if (values.length)
    slides.push(['ethos', (n) => (
      <Slide n={n} ctx={ctx} label="What we stand for">
        <div className="s-ethos">
          <div className="s-k">{points.length ? 'Brand ethos' : 'Values'}</div>
          {brand.ethosIntro && <p className="s-ethos-intro">{firstSentence(brand.ethosIntro)}</p>}
          <div className="s-ethos-grid" style={{ gridTemplateColumns: `repeat(${values.length > 4 ? 3 : values.length}, 1fr)` }}>
            {values.map((v, i) => (
              <div key={v.title}>
                <span>{String(i + 1).padStart(2, '0')}</span>
                <strong>{v.title}</strong>
                {v.text && <p>{v.text}</p>}
              </div>
            ))}
          </div>
        </div>
      </Slide>
    )])

  if (brand.rationale)
    slides.push(['concept', (n) => (
      <Slide n={n} ctx={ctx} label="The concept">
        <div className="s-split">
          <div className={`s-text ${fit(brand.rationale)}`}>
            <div className="s-k">The concept</div>
            {paras(brand.rationale).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <div className="s-visual">
            <LogoImg logo={d.mark} />
          </div>
        </div>
      </Slide>
    )])

  if (main) {
    slides.push(['hero-light', (n) => (
      <Slide n={n} ctx={ctx}>
        <div className="s-reveal">
          <LogoImg logo={main} />
        </div>
      </Slide>
    )])
    slides.push(['hero-dark', (n) => (
      <Slide n={n} ctx={ctx} bg={d.primary}>
        <div className="s-reveal">
          <LogoImg logo={main} version={versionFor(main.svg, d.primary).version} />
        </div>
      </Slide>
    )])
    slides.push(['construction', (n) => (
      <Slide n={n} ctx={ctx} label="Construction">
        <div className="s-split">
          <div className="s-text">
            <div className="s-k">Construction</div>
            <p>Every curve and angle is deliberate. The drawing is built on a precise geometry that keeps it balanced at every size.</p>
          </div>
          <div className="s-visual">
            <ConstructionView logo={d.mark!} ink={d.primary} />
          </div>
        </div>
      </Slide>
    )])
    const family = LOGO_SLOTS.filter((s) => brand.logos[s.id])
    if (family.length > 1)
      slides.push(['family', (n) => (
        <Slide n={n} ctx={ctx} label="Logo family">
          <div className="s-family" style={{ gridTemplateColumns: `repeat(${family.length}, 1fr)` }}>
            {family.map((s) => (
              <figure key={s.id}>
                <div className="s-family-tile">
                  <LogoImg logo={brand.logos[s.id]} />
                </div>
                <figcaption>{s.label}</figcaption>
              </figure>
            ))}
          </div>
        </Slide>
      )])
  }

  slides.push(['colour', (n) => (
    <Slide n={n} ctx={ctx} label="Colour">
      <div className="s-colors">
        {brand.colors.map((c) => {
          const hex = normHex(c.hex)
          return (
            <div key={c.id} className="s-color" style={{ background: hex, color: inkOn(hex), flexGrow: c.role === 'primary' ? 2 : c.role === 'neutral' ? 0.8 : 1 }}>
              <strong>{c.name}</strong>
              <span>{hex}</span>
              <span>RGB {hexToRgb(hex).join(' ')}</span>
            </div>
          )
        })}
      </div>
    </Slide>
  )])

  slides.push(['type', (n) => (
    <Slide n={n} ctx={ctx} label="Typography">
      <div className="s-type">
        {brand.fonts
          .filter((f) => f.family)
          .map((f) => (
            <div key={f.family + f.role} className="s-type-col">
              <div className="s-k">{f.role === 'heading' ? 'Headlines' : 'Text'}</div>
              <div className="s-type-aa" style={{ fontFamily: fontStack(f), fontWeight: weightsOf(f).slice(-1)[0] }}>
                Aa
              </div>
              <div className="s-type-name" style={{ fontFamily: fontStack(f) }}>
                {f.family}
              </div>
              <div className="s-type-sample" style={{ fontFamily: fontStack(f) }}>
                ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789
              </div>
            </div>
          ))}
      </div>
    </Slide>
  )])

  if (d.mark)
    slides.push(['pattern', (n) => (
      <Slide n={n} ctx={ctx} bg={d.dark} art={<Pattern mark={d.mark} bg={d.dark} style="crop" opacity={1} ink={d.primary} anchor="right" />}>
        <div className="s-pattern">
          <div className="s-k" style={{ color: inkOn(d.dark) }}>Brand pattern</div>
          <p>The mark, scaled up and cropped, becomes a graphic device for covers, signage and social.</p>
        </div>
      </Slide>
    )])

  if (brand.subBrands?.length)
    slides.push(['architecture', (n) => (
      <Slide n={n} ctx={ctx} label="Brand architecture">
        <div className="s-arch">
          <div className="s-arch-master">
            <LogoImg logo={main} />
          </div>
          <div className="s-arch-subs" style={{ gridTemplateColumns: `repeat(${brand.subBrands.length}, 1fr)` }}>
            {brand.subBrands.map((sb) => (
              <div key={sb.id}>
                <div className="s-arch-lockup">
                  <span>
                    <LogoImg logo={sb.logo ?? d.mark} />
                  </span>
                  <i />
                  <strong>{sb.name}</strong>
                </div>
                <p>{sb.description}</p>
              </div>
            ))}
          </div>
        </div>
      </Slide>
    )])

  if (photos.length) {
    for (const m of photos.slice(0, 8))
      slides.push([`photo-${m.id}`, () => (
        <section className="slide slide-photo">
          <PhotoScene ctx={docCtx} mockup={m} width={320 * MM} height={180 * MM}>
            <div className="ps-label">{m.title}</div>
          </PhotoScene>
        </section>
      )])
  } else {
    slides.push(['apps-1', (n) => (
      <Slide n={n} ctx={ctx} label="Applications">
        <div className="s-apps">
          <div className="s-apps-cards">
            <BusinessCards {...ctx} />
          </div>
          <div className="s-apps-side">
            <AppIcon {...ctx} />
            <SocialPost {...ctx} />
          </div>
        </div>
      </Slide>
    )])
    slides.push(['apps-2', (n) => (
      <Slide n={n} ctx={ctx} label="Applications">
        <div className="s-apps2">
          <WebsiteHero {...ctx} />
          <Poster {...ctx} />
        </div>
      </Slide>
    )])
  }

  slides.push(['end', (n) => (
    <Slide n={n} ctx={ctx} bg={d.dark} art={<Pattern mark={d.mark} bg={d.dark} style="crop" opacity={0.28} ink={d.primary} anchor="right" />}>
      <div className="s-end">
        <div className="s-end-t">Thank you</div>
        <div className="s-end-m">
          {[brand.studio, brand.studioEmail, brand.studioSite].filter(Boolean).map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
      </div>
    </Slide>
  )])

  return (
    <div className="doc doc-deck" style={docVars(ctx)}>
      <Arrange doc="deck" items={slides.map(([k, s], i) => ({ key: k, node: s(i + 1) }))} />
    </div>
  )
}
