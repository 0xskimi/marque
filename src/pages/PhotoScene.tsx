import type { ReactNode } from 'react'
import type { Logo, PhotoMockup, Placement } from '../types'
import { quadAspect, quadTransform } from '../lib/homography'
import { useImage } from '../lib/images'
import { versionFor } from '../lib/derive'
import { contrast, inkOn } from '../lib/color'
import { LogoImg, Surface } from './common'
import { Pattern } from './Pattern'
import { CardBack, CardFront, Envelope, Letterhead, cardDims, DL, LETTER } from './Stationery'
import { SocialFrame, type Ctx } from './Guidelines'
import { fontStack } from '../lib/fonts'

export const MM = 96 / 25.4

function fillHex(ctx: Ctx, f: Placement['fill']) {
  const { d } = ctx
  return f === 'primary' ? d.primary : f === 'dark' ? d.dark : f === 'light' ? d.light : f === 'accent' ? d.accent : undefined
}

function logoFor(ctx: Ctx, a: Placement['artwork']): Logo | undefined {
  const { d } = ctx
  if (a === 'logomark') return d.mark
  if (a === 'wordmark') return d.logo('wordmark') ?? d.mainLogo
  if (a === 'secondary') return d.logo('secondary') ?? d.mainLogo
  return d.mainLogo
}

/** Native size in px of the artwork element before it is warped onto the quad. */
function artwork(ctx: Ctx, p: Placement, aspect: number): { w: number; h: number; node: ReactNode } {
  const { b, d } = ctx
  const fill = fillHex(ctx, p.fill)
  // Lay true-size artwork out 3× larger so it stays sharp when the photo enlarges it.
  const Z = 3
  const native = (mm: [number, number], node: ReactNode) => ({ w: mm[0] * MM * Z, h: mm[1] * MM * Z, node: <div style={{ zoom: Z }}>{node}</div> })
  switch (p.artwork) {
    case 'card-front':
      return native(cardDims(b), <CardFront ctx={ctx} />)
    case 'card-back':
      return native(cardDims(b), <CardBack ctx={ctx} />)
    case 'letterhead':
      return native(LETTER, <Letterhead ctx={ctx} />)
    case 'envelope':
      return native(DL, <Envelope ctx={ctx} />)
    case 'social':
      return native([96, 96], <SocialFrame ctx={ctx} kind="post" />)
    default:
  }
  const W = 1200
  const H = W / (aspect || 1)
  const bg = fill ?? '#FFFFFF'
  let node: ReactNode
  if (p.artwork === 'pattern') {
    node = <Pattern mark={d.mark} bg={bg} style={b.pattern === 'none' || b.pattern === 'crop' ? 'grid' : b.pattern} opacity={0.2} density={0.6} />
  } else if (p.artwork === 'tagline') {
    node = (
      <div className="ps-tagline" style={{ fontFamily: fontStack(d.heading), fontSize: `${H * 0.32 * p.scale}px`, color: toneColor(ctx, p, bg) }}>
        {b.tagline || b.name}
      </div>
    )
  } else {
    const logo = logoFor(ctx, p.artwork)
    const version = p.tone === 'auto' ? (logo ? versionFor(logo.svg, fill ?? (p.blend === 'screen' ? '#000000' : '#FFFFFF')).version : 'full') : p.tone === 'primary' ? d.primary : p.tone === 'dark' ? d.dark : p.tone
    node = (
      <div className="ps-logo" style={{ width: `${p.scale * 100}%`, height: `${p.scale * 100}%` }}>
        <LogoImg logo={logo} version={version} />
      </div>
    )
  }
  return { w: W, h: H, node: fill ? <Surface bg={fill} className="ps-fill">{node}</Surface> : <div className="ps-fill">{node}</div> }
}

function toneColor(ctx: Ctx, p: Placement, bg: string) {
  if (p.tone === 'white') return '#FFFFFF'
  if (p.tone === 'black') return '#000000'
  if (p.tone === 'dark') return ctx.d.dark
  if (p.tone === 'primary' || p.tone === 'full') return ctx.d.primary
  return contrast(ctx.d.primary, bg) >= 3 ? ctx.d.primary : inkOn(bg)
}

/** A photo with brand artwork warped onto its surfaces. */
export function PhotoScene({
  ctx,
  mockup,
  width,
  height,
  fit = 'cover',
  children,
}: {
  ctx: Ctx
  mockup: PhotoMockup
  width: number
  height: number
  fit?: 'cover' | 'contain'
  children?: ReactNode
}) {
  const url = useImage(mockup.imageId)
  const k = fit === 'cover' ? Math.max(width / mockup.width, height / mockup.height) : Math.min(width / mockup.width, height / mockup.height)
  const dw = mockup.width * k
  const dh = mockup.height * k
  const ox = (width - dw) / 2
  const oy = (height - dh) / 2
  return (
    <div className="ps" style={{ width, height }}>
      {url && <img className="ps-photo" src={url} alt="" style={{ left: ox, top: oy, width: dw, height: dh }} />}
      {mockup.placements.map((p) => {
        const q = p.corners.map(([u, v]) => [ox + u * dw, oy + v * dh] as [number, number])
        const art = artwork(ctx, p, quadAspect(p.corners, mockup.width, mockup.height))
        return (
          <div
            key={p.id}
            className="ps-art"
            style={{ width: art.w, height: art.h, transform: quadTransform(art.w, art.h, q), mixBlendMode: p.blend, opacity: p.opacity }}
          >
            {art.node}
          </div>
        )
      })}
      {children}
    </div>
  )
}
