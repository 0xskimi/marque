import { Arrange } from '../edit/Arrange'
import { type ReactNode } from 'react'
import type { Brand } from '../types'
import { LOGO_SLOTS } from '../types'
import { derive, versionFor, type Derived } from '../lib/derive'
import { hexToRgb, inkOn, normHex } from '../lib/color'
import { fontStack, weightsOf } from '../lib/fonts'
import { ConstructionView, LogoImg } from './common'
import { docVars } from './Guidelines'
import { AppIcon, BusinessCards, Poster, SocialPost, WebsiteHero } from './Mockups'

interface Ctx {
  b: Brand
  d: Derived
}

function Slide({ children, bg, label, n, ctx }: { children: ReactNode; bg?: string; label?: string; n: number; ctx: Ctx }) {
  const back = bg ?? '#FFFFFF'
  return (
    <section className="slide" style={{ background: back, color: inkOn(back) }}>
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
  const slides: [string, (n: number) => ReactNode][] = []
  const date = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
  const main = d.mainLogo

  slides.push(['cover', (n) => (
    <Slide n={n} ctx={ctx} bg={d.light}>
      <div className="s-cover">
        <div className="s-cover-k">Brand identity presentation</div>
        <div className="s-cover-t">{brand.client || brand.name}</div>
        <div className="s-cover-m">
          {brand.studio} · {date}
        </div>
        <div className="s-cover-band" style={{ background: d.primary }} />
      </div>
    </Slide>
  )])

  if (brand.brief)
    slides.push(['brief', (n) => (
      <Slide n={n} ctx={ctx} label="The brief">
        <div className="s-text">
          <div className="s-k">The brief</div>
          <p>{brand.brief}</p>
        </div>
      </Slide>
    )])

  if (brand.rationale)
    slides.push(['concept', (n) => (
      <Slide n={n} ctx={ctx} label="The concept">
        <div className="s-split">
          <div className="s-text">
            <div className="s-k">The concept</div>
            <p>{brand.rationale}</p>
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

  slides.push(['end', (n) => (
    <Slide n={n} ctx={ctx} bg={d.dark}>
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
