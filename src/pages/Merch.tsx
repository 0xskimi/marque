import { useId, type CSSProperties, type ReactNode } from 'react'
import type { Logo, VectorMockupId } from '../types'
import { versionFor } from '../lib/derive'
import { inkOn, mix } from '../lib/color'
import { svgUrl } from '../lib/svg'
import { fontStack } from '../lib/fonts'
import { logoSvg, LogoImg, Surface } from './common'
import { Pattern } from './Pattern'
import { CardBack, CardFront, Envelope, FolderCover, Letterhead } from './Stationery'
import type { Ctx } from './Guidelines'

/** Logo as an SVG <image>, in the version that reads on `bg`. */
function logoHref(logo: Logo | undefined, bg: string) {
  if (!logo) return ''
  return svgUrl(logoSvg(logo, versionFor(logo.svg, bg).version))
}

/** Scales true-size artwork down for a scene. */
function Scaled({ k, children, style }: { k: number; children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="scaled" style={style}>
      <div style={{ transform: `scale(${k})`, transformOrigin: '0 0' }}>{children}</div>
    </div>
  )
}

/** Soft cylinder / fabric shading over an SVG shape. */
function Shade({ id, dir = 'h', strength = 0.35 }: { id: string; dir?: 'h' | 'v'; strength?: number }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2={dir === 'h' ? '1' : '0'} y2={dir === 'v' ? '1' : '0'}>
      <stop offset="0" stopColor="#000" stopOpacity={strength} />
      <stop offset="0.18" stopColor="#000" stopOpacity={strength * 0.25} />
      <stop offset="0.38" stopColor="#fff" stopOpacity={0.22} />
      <stop offset="0.55" stopColor="#fff" stopOpacity={0} />
      <stop offset="0.85" stopColor="#000" stopOpacity={strength * 0.4} />
      <stop offset="1" stopColor="#000" stopOpacity={strength} />
    </linearGradient>
  )
}

/* ---------- stationery scenes ---------- */

function Cards({ ctx }: { ctx: Ctx }) {
  return (
    <div className="scene">
      <Scaled k={1.25} style={{ left: '40mm', top: '18mm', transform: 'rotate(-7deg)' }}>
        <div className="paper">
          <CardFront ctx={ctx} />
        </div>
      </Scaled>
      <Scaled k={1.25} style={{ left: '128mm', top: '44mm', transform: 'rotate(5deg)' }}>
        <div className="paper">
          <CardBack ctx={ctx} />
        </div>
      </Scaled>
    </div>
  )
}

function Stationery({ ctx }: { ctx: Ctx }) {
  return (
    <div className="scene">
      <Scaled k={0.46} style={{ left: '50mm', top: '0mm', transform: 'rotate(-4deg)' }}>
        <div className="paper">
          <Letterhead ctx={ctx} />
        </div>
      </Scaled>
      <Scaled k={0.62} style={{ left: '130mm', top: '58mm', transform: 'rotate(3deg)' }}>
        <div className="paper">
          <Envelope ctx={ctx} />
        </div>
      </Scaled>
      <Scaled k={1} style={{ left: '190mm', top: '6mm', transform: 'rotate(8deg)' }}>
        <div className="paper">
          <CardBack ctx={ctx} />
        </div>
      </Scaled>
    </div>
  )
}

function Folder({ ctx }: { ctx: Ctx }) {
  const { d } = ctx
  return (
    <div className="scene">
      <Scaled k={0.42} style={{ left: '44mm', top: '2mm' }}>
        <div className="paper">
          <FolderCover ctx={ctx} />
        </div>
      </Scaled>
      <div className="folder-open" style={{ left: '150mm', top: '2mm' }}>
        <Surface bg="#F2F2F0" className="folder-inside">
          <Scaled k={0.36} style={{ left: '22mm', top: '8mm' }}>
            <div className="paper">
              <Letterhead ctx={ctx} />
            </div>
          </Scaled>
          <Surface bg={d.primary} className="folder-pocket">
            <div className="folder-pocket-mark">
              <LogoImg logo={d.mark} />
            </div>
          </Surface>
        </Surface>
      </div>
    </div>
  )
}

function IdCard({ ctx }: { ctx: Ctx }) {
  const { b, d } = ctx
  const f = fontStack(d.body)
  const card = (back: boolean, left: number, rot: number) => (
    <div className="idc-wrap" style={{ left: `${left}mm`, transform: `rotate(${rot}deg)` }}>
      <svg className="idc-strap" viewBox="0 0 40 120" preserveAspectRatio="none">
        <path d="M14 0 L26 0 L24 112 L16 112 Z" fill={d.primary} />
        <path d="M14 0 L26 0 L24 112 L16 112 Z" fill="url(#strap)" />
        <rect x="15" y="104" width="10" height="14" rx="2" fill="#B9B9B9" />
      </svg>
      <Surface bg="#FFFFFF" className="idc">
        <div className="idc-clip" />
        {!back ? (
          <>
            <Surface bg={d.primary} className="idc-band">
              <div className="idc-logo">
                <LogoImg logo={d.mainLogo} />
              </div>
            </Surface>
            <div className="idc-photo" style={{ background: mix(d.primary, '#FFFFFF', 0.82) }}>
              <svg viewBox="0 0 40 40">
                <circle cx="20" cy="15" r="7" fill={mix(d.primary, '#FFFFFF', 0.45)} />
                <path d="M6 40 Q20 18 34 40Z" fill={mix(d.primary, '#FFFFFF', 0.45)} />
              </svg>
            </div>
            <div className="idc-name" style={{ fontFamily: fontStack(d.heading) }}>
              {b.person.name || 'Your Name'}
            </div>
            <div className="idc-title" style={{ fontFamily: f }}>
              {b.person.title || 'Job title'}
            </div>
            <Surface bg={d.primary} className="idc-foot">
              {b.tagline}
            </Surface>
          </>
        ) : (
          <div className="idc-back" style={{ fontFamily: f }}>
            <div className="idc-back-mark">
              <LogoImg logo={d.mark} />
            </div>
            <p>This card is the property of {b.client || b.name}. If found, please return to:</p>
            <p>{b.address}</p>
            <p>
              {b.contactPhone}
              <br />
              {b.contactEmail}
            </p>
            <div className="idc-barcode" />
          </div>
        )}
      </Surface>
    </div>
  )
  return (
    <div className="scene">
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <Shade id="strap" />
        </defs>
      </svg>
      {card(false, 92, -3)}
      {card(true, 168, 4)}
    </div>
  )
}

/* ---------- apparel and objects ---------- */

const POLO_BODY = 'M95 40 L60 52 L20 98 L44 142 L72 122 L72 310 Q150 322 228 310 L228 122 L256 142 L280 98 L240 52 L205 40 Q150 72 95 40 Z'

function Polo({ ctx }: { ctx: Ctx }) {
  const { b, d } = ctx
  const uid = useId().replace(/:/g, '')
  const shirt = '#F7F7F5'
  const trim = d.primary
  const shirtSvg = (back: boolean) => (
    <svg viewBox="0 0 300 330" className="polo">
      <defs>
        <Shade id={`ps${uid}`} strength={0.22} />
        <clipPath id={`pc${uid}${back}`}>
          <path d={POLO_BODY} />
        </clipPath>
      </defs>
      <path d={POLO_BODY} fill={shirt} />
      <g clipPath={`url(#pc${uid}${back})`}>
        <path d="M20 98 L44 142 L52 136 L28 92 Z" fill={trim} />
        <path d="M280 98 L256 142 L248 136 L272 92 Z" fill={trim} />
        <rect x="60" y="300" width="180" height="30" fill={mix(shirt, '#000', 0.04)} />
      </g>
      {!back ? (
        <>
          <rect x="141" y="66" width="18" height="64" fill={mix(shirt, '#000', 0.05)} stroke={mix(shirt, '#000', 0.12)} strokeWidth="0.6" />
          <rect x="141" y="66" width="18" height="10" fill={trim} />
          <circle cx="150" cy="92" r="2.4" fill={trim} />
          <circle cx="150" cy="112" r="2.4" fill={trim} />
          <path d="M95 40 Q150 72 205 40 L194 30 Q150 50 106 30 Z" fill={trim} />
          <path d="M106 30 L150 70 L128 92 L94 44 Z" fill={shirt} stroke={mix(shirt, '#000', 0.15)} strokeWidth="0.8" />
          <path d="M194 30 L150 70 L172 92 L206 44 Z" fill={shirt} stroke={mix(shirt, '#000', 0.15)} strokeWidth="0.8" />
          <path d="M100 38 L128 86" stroke={trim} strokeWidth="3" />
          <path d="M200 38 L172 86" stroke={trim} strokeWidth="3" />
          <image href={logoHref(d.logo('wordmark') ?? d.mainLogo, shirt)} x="168" y="98" width="46" height="20" preserveAspectRatio="xMidYMid meet" />
        </>
      ) : (
        <>
          <path d="M95 40 Q150 60 205 40 L196 31 Q150 48 104 31 Z" fill={trim} />
          <image href={logoHref(d.mark, shirt)} x="140" y="64" width="20" height="20" preserveAspectRatio="xMidYMid meet" />
          <text x="150" y="282" textAnchor="middle" fontSize="9" fill={mix(trim, '#000', 0.1)} style={{ fontFamily: fontStack(d.heading), fontWeight: 600 }}>
            {b.tagline}
          </text>
        </>
      )}
      <path d={POLO_BODY} fill={`url(#ps${uid})`} />
    </svg>
  )
  return (
    <div className="scene scene-row">
      {shirtSvg(false)}
      {shirtSvg(true)}
    </div>
  )
}

function CapMug({ ctx }: { ctx: Ctx }) {
  const { b, d } = ctx
  const uid = useId().replace(/:/g, '')
  const cap = d.primary
  const brim = mix(d.primary, '#000', 0.35)
  const mug = d.dark
  return (
    <div className="scene scene-row">
      <svg viewBox="0 0 300 220" className="cap">
        <defs>
          <radialGradient id={`cr${uid}`} cx="0.42" cy="0.35" r="0.75">
            <stop offset="0" stopColor="#fff" stopOpacity="0.25" />
            <stop offset="0.6" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.35" />
          </radialGradient>
        </defs>
        <path d="M58 150 Q56 42 160 34 Q262 40 264 150 Z" fill={cap} />
        <path d="M160 34 Q120 70 110 150 M160 34 Q205 70 214 150" stroke="#000" strokeOpacity="0.18" strokeWidth="1.2" fill="none" />
        <path d="M58 150 Q56 42 160 34 Q262 40 264 150 Z" fill={`url(#cr${uid})`} />
        <circle cx="160" cy="36" r="6" fill={mix(cap, '#000', 0.2)} />
        <image href={logoHref(d.mainLogo, cap)} x="112" y="88" width="100" height="36" preserveAspectRatio="xMidYMid meet" />
        <path d="M36 152 Q160 186 292 150 Q302 168 276 184 Q160 214 26 176 Q20 160 36 152 Z" fill={brim} />
        <path d="M36 152 Q160 186 292 150" stroke="#000" strokeOpacity="0.25" strokeWidth="2" fill="none" />
      </svg>
      <svg viewBox="0 0 220 220" className="mug">
        <defs>
          <Shade id={`mg${uid}`} strength={0.45} />
        </defs>
        <path d="M158 70 C214 70 214 168 158 168 L158 150 C192 150 192 88 158 88 Z" fill={mix(mug, '#000', 0.2)} />
        <path d="M40 40 L160 40 L160 186 Q160 198 148 198 L52 198 Q40 198 40 186 Z" fill={mug} />
        <path d="M40 40 L160 40 L160 186 Q160 198 148 198 L52 198 Q40 198 40 186 Z" fill={`url(#mg${uid})`} />
        <ellipse cx="100" cy="40" rx="60" ry="7" fill={mix(mug, '#000', 0.4)} />
        <image href={logoHref(d.mark, mug)} x="70" y="86" width="60" height="60" preserveAspectRatio="xMidYMid meet" />
        <text x="100" y="176" textAnchor="middle" fontSize="7" fill={inkOn(mug)} opacity="0.8" style={{ fontFamily: fontStack(d.heading) }}>
          {b.tagline}
        </text>
      </svg>
    </div>
  )
}

function BottleNotebook({ ctx }: { ctx: Ctx }) {
  const { b, d } = ctx
  const uid = useId().replace(/:/g, '')
  const bottle = d.primary
  const word = d.logo('wordmark') ?? d.mainLogo
  return (
    <div className="scene scene-row">
      <svg viewBox="0 0 120 340" className="flask">
        <defs>
          <Shade id={`fl${uid}`} strength={0.4} />
        </defs>
        <rect x="42" y="6" width="36" height="40" rx="7" fill="#222" />
        <path d="M46 46 L74 46 L80 62 Q98 70 98 98 L98 318 Q98 334 82 334 L38 334 Q22 334 22 318 L22 98 Q22 70 40 62 Z" fill={bottle} />
        <path d="M46 46 L74 46 L80 62 Q98 70 98 98 L98 318 Q98 334 82 334 L38 334 Q22 334 22 318 L22 98 Q22 70 40 62 Z" fill={`url(#fl${uid})`} />
        <g transform="rotate(-90 60 210)">
          <image href={logoHref(word, bottle)} x="-25" y="196" width="170" height="28" preserveAspectRatio="xMidYMid meet" />
        </g>
        <path d="M46 46 L74 46 L80 62 Q98 70 98 98 L98 318 Q98 334 82 334 L38 334 Q22 334 22 318 L22 98 Q22 70 40 62 Z" fill="none" stroke="#000" strokeOpacity="0.2" />
      </svg>
      <div className="notebook">
        <div className="notebook-pages" />
        <Surface bg={d.primary} className="notebook-cover">
          <Pattern mark={d.mark} bg={d.primary} style={b.pattern === 'none' ? 'crop' : b.pattern} opacity={0.12} />
          <div className="notebook-year" style={{ fontFamily: fontStack(d.heading) }}>
            {b.year}
          </div>
          <div className="notebook-logo">
            <LogoImg logo={d.mark} />
          </div>
          <div className="notebook-band" />
        </Surface>
      </div>
    </div>
  )
}

function Bags({ ctx }: { ctx: Ctx }) {
  const { b, d } = ctx
  const canvas = '#EEE8DC'
  return (
    <div className="scene scene-row">
      <div className="tote">
        <svg className="tote-handles" viewBox="0 0 100 60">
          <path d="M28 60 C28 0 72 0 72 60" stroke={d.dark} strokeWidth="5" fill="none" />
        </svg>
        <Surface bg={canvas} className="tote-body">
          <Pattern mark={d.mark} bg={canvas} style="crop" ink={d.primary} opacity={0.5} />
          <div className="tote-text" style={{ fontFamily: fontStack(d.heading), color: d.dark }}>
            {b.tagline || b.name}
          </div>
        </Surface>
      </div>
      <div className="shopper">
        <svg className="shopper-handles" viewBox="0 0 100 50">
          <path d="M34 50 C34 6 66 6 66 50" stroke={mix(d.primary, '#000', 0.4)} strokeWidth="2.4" fill="none" />
        </svg>
        <Surface bg={d.primary} className="shopper-body">
          <div className="shopper-fold" />
          <div className="shopper-logo">
            <LogoImg logo={d.mainLogo} />
          </div>
          <div className="shopper-url">{b.website}</div>
        </Surface>
        <div className="shopper-side" style={{ background: mix(d.primary, '#000', 0.3) }} />
      </div>
    </div>
  )
}

function Phone({ ctx }: { ctx: Ctx }) {
  const { b, d } = ctx
  const tiles = [d.primary, d.dark, d.light, d.accent, d.primary, d.dark]
  return (
    <div className="scene scene-row">
      <div className="phone">
        <Surface bg="#FFFFFF" className="phone-screen">
          <div className="ph-top">
            <Surface bg={d.primary} className="ph-avatar">
              <div className="ph-avatar-logo">
                <LogoImg logo={d.mark} />
              </div>
            </Surface>
            <div className="ph-stats">
              <b>128</b>
              <span>posts</span>
              <b>12.4k</b>
              <span>followers</span>
            </div>
          </div>
          <div className="ph-name">{b.name}</div>
          <div className="ph-bio">{b.tagline}</div>
          <div className="ph-url">{b.website}</div>
          <div className="ph-grid">
            {tiles.map((t, i) => (
              <Surface key={i} bg={t} className="ph-tile">
                {i % 2 === 0 ? (
                  <Pattern mark={d.mark} bg={t} style={i === 2 ? 'grid' : 'crop'} opacity={0.14} />
                ) : (
                  <div className="ph-tile-logo">
                    <LogoImg logo={d.mark} />
                  </div>
                )}
              </Surface>
            ))}
          </div>
        </Surface>
      </div>
      <div className="phone">
        <Surface bg={d.dark} className="phone-screen story">
          <Pattern mark={d.mark} bg={d.dark} style={b.pattern === 'none' ? 'crop' : b.pattern} opacity={b.patternOpacity} />
          <div className="story-logo">
            <LogoImg logo={d.mainLogo} />
          </div>
          <div className="story-text" style={{ fontFamily: fontStack(d.heading) }}>
            {b.tagline || b.name}
          </div>
          <Surface bg={d.accent} className="story-cta">
            Learn more
          </Surface>
        </Surface>
      </div>
    </div>
  )
}

function Signage({ ctx }: { ctx: Ctx }) {
  const { d } = ctx
  return (
    <div className="scene">
      <div className="wall">
        <Surface bg={d.primary} className="sign-plate">
          <div className="sign-logo">
            <LogoImg logo={d.mainLogo} />
          </div>
        </Surface>
        <div className="blade">
          <div className="blade-arm" />
          <Surface bg="#FFFFFF" className="blade-disc">
            <div className="blade-logo">
              <LogoImg logo={d.mark} />
            </div>
          </Surface>
        </div>
        <div className="door" />
      </div>
    </div>
  )
}

export function EmailSignature({ ctx }: { ctx: Ctx }) {
  const { b, d } = ctx
  const p = b.person
  return (
    <div className="esig" style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>
      <div className="esig-mark">
        <LogoImg logo={d.mark} />
      </div>
      <div className="esig-text">
        <div className="esig-name" style={{ color: d.primary }}>
          {p.name || 'Your Name'}
        </div>
        <div className="esig-title">
          {p.title} · {b.client || b.name}
        </div>
        <div className="esig-lines">
          <span>{p.phone || b.contactPhone}</span>
          <span>{p.email || b.contactEmail}</span>
          <span>{b.website}</span>
        </div>
      </div>
    </div>
  )
}

function Email({ ctx }: { ctx: Ctx }) {
  const { b } = ctx
  return (
    <div className="scene scene-row">
      <Surface bg="#FFFFFF" className="mail">
        <div className="mail-bar">
          <i /> <i /> <i />
        </div>
        <div className="mail-head">
          <div>
            <b>To:</b> client@example.com
          </div>
          <div>
            <b>Subject:</b> Hello from {b.name}
          </div>
        </div>
        <div className="mail-body">
          <p>Hi there,</p>
          <p>Thanks for your time today. I’ve attached the files we discussed.</p>
          <p>Best regards,</p>
          <EmailSignature ctx={ctx} />
        </div>
      </Surface>
    </div>
  )
}

export const VECTOR_SCENES: Record<VectorMockupId, (p: { ctx: Ctx }) => ReactNode> = {
  cards: Cards,
  stationery: Stationery,
  folder: Folder,
  idcard: IdCard,
  polo: Polo,
  'cap-mug': CapMug,
  'bottle-notebook': BottleNotebook,
  bags: Bags,
  phone: Phone,
  signage: Signage,
  email: Email,
}
