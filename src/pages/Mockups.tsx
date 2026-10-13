import type { Brand } from '../types'
import type { Derived } from '../lib/derive'
import { versionFor } from '../lib/derive'
import { inkOn } from '../lib/color'
import { fontStack } from '../lib/fonts'
import { LogoImg } from './common'
import { CardBack, CardFront } from './Stationery'
import type { Ctx } from './Guidelines'

interface P {
  b: Brand
  d: Derived
}

/** The brand's own domain, from its website field, else a stand-in built from the name. */
function domain(b: Brand) {
  const site = (b.website || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  return site || `${b.name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'brand'}.com`
}

function onBg(d: Derived, bg: string, which: 'main' | 'mark' = 'mark') {
  const logo = which === 'main' ? d.mainLogo : d.mark
  return { logo, version: logo ? versionFor(logo.svg, bg).version : 'full' }
}

/** The real card artwork, front and back, fanned out. */
export function BusinessCards({ b, d }: P) {
  const ctx = { b, d } as Ctx
  return (
    <div className="mk-cards">
      <div className="mk-card">
        <CardFront ctx={ctx} />
      </div>
      <div className="mk-card mk-card-back">
        <CardBack ctx={ctx} />
      </div>
    </div>
  )
}

export function AppIcon({ b, d }: P) {
  const m = onBg(d, d.primary)
  return (
    <div className="mk-appicon-wrap">
      <div className="mk-appicon" style={{ background: d.primary }}>
        <div style={{ width: '60%', height: '60%' }}>
          <LogoImg logo={m.logo} version={m.version} />
        </div>
      </div>
      <div className="mk-tab">
        <span className="mk-tab-fav">
          <LogoImg logo={d.mark} version={d.mark ? versionFor(d.mark.svg, '#FFFFFF').version : 'full'} />
        </span>
        <span className="mk-tab-title">{b.name}</span>
      </div>
    </div>
  )
}

export function SocialPost({ b, d }: P) {
  const bg = d.dark
  const m = onBg(d, bg, 'mark')
  return (
    <div className="mk-social" style={{ background: bg, color: inkOn(bg) }}>
      <div className="mk-social-mark">
        <LogoImg logo={m.logo} version={m.version} />
      </div>
      <div className="mk-social-text" style={{ fontFamily: fontStack(d.heading) }}>
        {b.tagline || b.name}
      </div>
      <div className="mk-social-bar" style={{ background: d.accent }} />
    </div>
  )
}

/** Website card: the address on a brand-colour band, then the browser tab and address bar it opens in. */
export function WebsiteHero({ b, d }: P) {
  const tile = d.dark
  const mark = onBg(d, tile, 'mark')
  const fav = onBg(d, '#FFFFFF', 'mark')
  const url = `www.${domain(b).replace(/^www\./, '')}`
  return (
    <div className="mk-web" style={{ fontFamily: fontStack(d.body) }}>
      <div className="mk-web-band" style={{ background: d.primary }}>
        <div className="mk-web-pill">
          <span className="mk-web-tile" style={{ background: tile }}>
            <LogoImg logo={mark.logo} version={mark.version} />
          </span>
          {url}
        </div>
      </div>
      <div className="mk-web-desk">
        <div className="mk-web-win">
          <div className="mk-web-tabs">
            <span className="mk-web-dots">
              <i /> <i /> <i />
            </span>
            <span className="mk-web-tab">
              <span className="mk-web-fav">
                <LogoImg logo={fav.logo} version={fav.version} />
              </span>
              {b.name}
            </span>
          </div>
          <div className="mk-web-bar">
            <span className="mk-web-nav">
              <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7.5 2.5 4 6l3.5 3.5" /></svg>
              <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 2.5 8 6 4.5 9.5" /></svg>
              <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 6a3.5 3.5 0 1 1-1-2.5M9.5 2v2h-2" /></svg>
            </span>
            <span className="mk-web-addr">
              <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 5.5h5v4h-5zM4.5 5.5V4a1.5 1.5 0 0 1 3 0v1.5" /></svg>
              {url}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export function Poster({ b, d }: P) {
  const bg = d.accent
  const ink = inkOn(bg)
  const m = onBg(d, bg, 'main')
  return (
    <div className="mk-poster" style={{ background: bg, color: ink }}>
      <div className="mk-poster-h" style={{ fontFamily: fontStack(d.heading) }}>
        {b.tagline || b.name}
      </div>
      <div className="mk-poster-logo">
        <LogoImg logo={m.logo} version={m.version} style={{ objectPosition: 'left bottom' }} />
      </div>
    </div>
  )
}
