import type { Brand } from '../types'
import type { Derived } from '../lib/derive'
import { versionFor } from '../lib/derive'
import { inkOn } from '../lib/color'
import { fontStack } from '../lib/fonts'
import { LogoImg } from './common'

interface P {
  b: Brand
  d: Derived
}

function onBg(d: Derived, bg: string, which: 'main' | 'mark' = 'mark') {
  const logo = which === 'main' ? d.mainLogo : d.mark
  return { logo, version: logo ? versionFor(logo.svg, bg).version : 'full' }
}

export function BusinessCards({ b, d }: P) {
  const front = onBg(d, d.primary)
  const backLogo = d.logo('wordmark') ?? d.mainLogo
  return (
    <div className="mk-cards">
      <div className="mk-card" style={{ background: d.primary }}>
        <div className="mk-card-mark">
          <LogoImg logo={front.logo} version={front.version} />
        </div>
      </div>
      <div className="mk-card mk-card-back" style={{ background: d.light, color: d.dark }}>
        <div className="mk-card-wm">
          <LogoImg logo={backLogo} version={backLogo ? versionFor(backLogo.svg, d.light).version : 'full'} />
        </div>
        <div className="mk-card-info" style={{ fontFamily: fontStack(d.body) }}>
          <strong style={{ fontFamily: fontStack(d.heading) }}>Alex Morgan</strong>
          <span>Founder</span>
          <span style={{ marginTop: '2mm' }}>alex@{b.name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'brand'}.com</span>
          <span>+1 555 010 2030</span>
        </div>
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

export function WebsiteHero({ b, d }: P) {
  const head = d.light
  const nav = onBg(d, head, 'main')
  return (
    <div className="mk-web">
      <div className="mk-web-chrome">
        <i /> <i /> <i />
        <span>{b.name.toLowerCase().replace(/\s+/g, '')}.com</span>
      </div>
      <div className="mk-web-nav" style={{ background: head, color: inkOn(head), fontFamily: fontStack(d.body) }}>
        <div className="mk-web-logo">
          <LogoImg logo={nav.logo} version={nav.version} style={{ objectPosition: 'left center' }} />
        </div>
        <span>Product</span>
        <span>About</span>
        <span className="mk-web-cta" style={{ background: d.primary, color: inkOn(d.primary) }}>
          Get started
        </span>
      </div>
      <div className="mk-web-hero" style={{ background: d.primary, color: inkOn(d.primary) }}>
        <div style={{ fontFamily: fontStack(d.heading) }} className="mk-web-h1">
          {b.tagline || `Welcome to ${b.name}`}
        </div>
        <div style={{ fontFamily: fontStack(d.body) }} className="mk-web-p">
          {(b.about || '').split('.').slice(0, 1).join('.') || 'A short line about what you do.'}
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
