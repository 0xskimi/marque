import type { CSSProperties, ReactNode } from 'react'
import type { Brand } from '../types'
import { fontStack } from '../lib/fonts'
import { LogoImg, Surface } from './common'
import { Pattern } from './Pattern'
import type { Ctx } from './Guidelines'

/** Trim sizes in mm. */
export function cardDims(b: Brand): [number, number] {
  const [w, h] = (b.cardSize || '85x55').split('x').map(Number)
  return [w, h]
}
export const LETTER: [number, number] = [210, 297]
export const DL: [number, number] = [220, 110]

/** Artwork box at true size; bleed extends the background past the trim. */
export function ArtBox({
  w,
  h,
  bleed = 0,
  bg,
  children,
  className = '',
  style,
}: {
  w: number
  h: number
  bleed?: number
  bg: string
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  return (
    <Surface bg={bg} className={`art ${className}`} style={{ width: `${w + bleed * 2}mm`, height: `${h + bleed * 2}mm`, overflow: 'hidden', ...style }}>
      {children && (
        <div className="art-trim" style={{ position: 'absolute', left: `${bleed}mm`, top: `${bleed}mm`, width: `${w}mm`, height: `${h}mm`, ['--bleed' as string]: `${bleed}mm` }}>
          {children}
        </div>
      )}
    </Surface>
  )
}

const fonts = (ctx: Ctx) => ({ head: fontStack(ctx.d.heading), body: fontStack(ctx.d.body) })

export function CardFront({ ctx, bleed = 0 }: { ctx: Ctx; bleed?: number }) {
  const { b, d } = ctx
  const [w, h] = cardDims(b)
  return (
    <ArtBox w={w} h={h} bleed={bleed} bg={d.primary}>
      <div className="to-bleed">
        <Pattern mark={d.mark} bg={d.primary} style={b.pattern === 'none' ? 'none' : 'crop'} opacity={b.patternOpacity} />
      </div>
      <div style={{ position: 'absolute', left: '30%', right: '30%', top: '24%', bottom: '24%' }}>
        <LogoImg logo={d.mainLogo} />
      </div>
    </ArtBox>
  )
}

export function CardBack({ ctx, bleed = 0 }: { ctx: Ctx; bleed?: number }) {
  const { b, d } = ctx
  const [w, h] = cardDims(b)
  const f = fonts(ctx)
  const p = b.person
  return (
    <ArtBox w={w} h={h} bleed={bleed} bg="#FFFFFF">
      <div style={{ position: 'absolute', left: '6mm', top: '6mm', width: '9mm', height: '9mm' }}>
        <LogoImg logo={d.mark} style={{ objectPosition: 'left top' }} />
      </div>
      <div style={{ position: 'absolute', left: '6mm', bottom: '6mm', right: '6mm', fontFamily: f.body, fontSize: '6.2pt', lineHeight: 1.45, color: '#222' }}>
        <div style={{ fontFamily: f.head, fontSize: '10pt', fontWeight: 700, color: d.primary, lineHeight: 1.1 }}>{p.name || 'Your Name'}</div>
        <div style={{ marginBottom: '2.5mm', color: '#666' }}>{p.title || 'Job title'}</div>
        <div>{p.phone || b.contactPhone}</div>
        <div>{p.email || b.contactEmail}</div>
        <div>{b.website}</div>
        {b.address && <div style={{ color: '#666' }}>{b.address}</div>}
      </div>
      <div className="to-bleed" style={{ left: 'auto', width: 'calc(2.2mm + var(--bleed))', background: d.primary }} />
    </ArtBox>
  )
}

export function Letterhead({ ctx, bleed = 0 }: { ctx: Ctx; bleed?: number }) {
  const { b, d } = ctx
  const f = fonts(ctx)
  return (
    <ArtBox w={LETTER[0]} h={LETTER[1]} bleed={bleed} bg="#FFFFFF">
      <div style={{ position: 'absolute', left: '20mm', top: '18mm', width: '52mm', height: '14mm' }}>
        <LogoImg logo={d.mainLogo} style={{ objectPosition: 'left center' }} />
      </div>
      <div style={{ position: 'absolute', right: '20mm', top: '20mm', textAlign: 'right', fontFamily: f.body, fontSize: '7pt', lineHeight: 1.5, color: '#555' }}>
        {b.address && <div>{b.address}</div>}
        <div>{b.contactPhone}</div>
        <div>{b.contactEmail}</div>
      </div>
      <div style={{ position: 'absolute', left: '20mm', right: '20mm', top: '60mm', display: 'flex', flexDirection: 'column', gap: '3.2mm' }}>
        {[38, 0, 92, 96, 88, 94, 72, 0, 95, 90, 60].map((x, i) => (
          <i key={i} style={{ display: 'block', height: '1.1mm', width: `${x}%`, background: '#E9E9E9', borderRadius: '1mm' }} />
        ))}
      </div>
      <div style={{ position: 'absolute', left: '20mm', right: '20mm', bottom: '14mm', borderTop: `0.3mm solid ${d.primary}`, paddingTop: '3mm', display: 'flex', justifyContent: 'space-between', fontFamily: f.body, fontSize: '6.5pt', color: '#777' }}>
        <span>{b.website}</span>
        <span>{b.tagline}</span>
      </div>
      <div className="to-bleed" style={{ right: 'auto', width: 'calc(5mm + var(--bleed))', background: d.primary }} />
    </ArtBox>
  )
}

export function Envelope({ ctx, bleed = 0 }: { ctx: Ctx; bleed?: number }) {
  const { b, d } = ctx
  const f = fonts(ctx)
  return (
    <ArtBox w={DL[0]} h={DL[1]} bleed={bleed} bg="#FFFFFF">
      <div style={{ position: 'absolute', left: '12mm', top: '11mm', width: '40mm', height: '11mm' }}>
        <LogoImg logo={d.mainLogo} style={{ objectPosition: 'left center' }} />
      </div>
      <div style={{ position: 'absolute', left: '12mm', bottom: '11mm', fontFamily: f.body, fontSize: '6.5pt', lineHeight: 1.5, color: '#666' }}>
        <div style={{ fontFamily: f.head, fontSize: '9pt', color: d.primary, fontWeight: 700 }}>{b.tagline}</div>
        <div>{b.website}</div>
      </div>
      <div className="to-bleed" style={{ left: 'auto', width: 'calc(34mm + var(--bleed))', background: d.primary, overflow: 'hidden' }}>
        <Surface bg={d.primary} style={{ position: 'absolute', inset: 0 }}>
          <Pattern mark={d.mark} bg={d.primary} style={b.pattern === 'none' ? 'none' : 'crop'} opacity={b.patternOpacity * 1.4} anchor="center" />
        </Surface>
      </div>
    </ArtBox>
  )
}

export function FolderCover({ ctx }: { ctx: Ctx }) {
  const { b, d } = ctx
  return (
    <ArtBox w={220} h={310} bg={d.primary}>
      <Pattern mark={d.mark} bg={d.primary} style={b.pattern === 'none' ? 'none' : 'crop'} opacity={b.patternOpacity * 1.3} />
      <div style={{ position: 'absolute', left: '20mm', top: '22mm', width: '70mm', height: '18mm' }}>
        <LogoImg logo={d.mainLogo} style={{ objectPosition: 'left center' }} />
      </div>
      <div style={{ position: 'absolute', left: '20mm', bottom: '24mm', fontFamily: fontStack(d.heading), fontSize: '26pt', fontWeight: 700, lineHeight: 1.05, maxWidth: '150mm', letterSpacing: '-0.02em' }}>
        {b.tagline || b.name}
      </div>
    </ArtBox>
  )
}
