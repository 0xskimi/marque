import { createContext, useContext, type CSSProperties, type ReactNode } from 'react'
import type { Logo } from '../types'
import { analyze, outlined, recolor, svgUrl, viewBox } from '../lib/svg'
import { versionFor, type LogoVersion } from '../lib/derive'
import { toneVars } from '../lib/color'

/** Background colour of whatever the logo currently sits on. */
const BgContext = createContext('#FFFFFF')
export const useBg = () => useContext(BgContext)

/** A block with its own background: text colours follow, and logos pick their version. */
export function Surface({
  bg,
  children,
  className = '',
  style,
}: {
  bg: string
  children?: ReactNode
  className?: string
  style?: CSSProperties
}) {
  return (
    <BgContext.Provider value={bg}>
      <div className={`surface ${className}`} style={{ ...(toneVars(bg) as CSSProperties), background: bg, color: 'var(--fg)', ...style }}>
        {children}
      </div>
    </BgContext.Provider>
  )
}

export function BgScope({ bg, children }: { bg: string; children: ReactNode }) {
  return <BgContext.Provider value={bg}>{children}</BgContext.Provider>
}

export function logoSvg(logo: Logo, version: LogoVersion | string = 'full'): string {
  if (version === 'full') return logo.svg
  if (version === 'white') return recolor(logo.svg, '#FFFFFF')
  if (version === 'black') return recolor(logo.svg, '#000000')
  return recolor(logo.svg, version)
}

const variantCache = new Map<string, string>()
function cached(key: string, make: () => string) {
  let v = variantCache.get(key)
  if (v === undefined) {
    v = make()
    variantCache.set(key, v)
  }
  return v
}

export function LogoImg({
  logo,
  version = 'auto',
  outline,
  style,
  className,
}: {
  logo?: Logo
  version?: LogoVersion | 'auto' | string
  outline?: string
  style?: CSSProperties
  className?: string
}) {
  const bg = useBg()
  if (!logo) return <div className="logo-missing">No logo uploaded</div>
  if (version === 'auto') version = versionFor(logo.svg, bg).version
  const svg = outline
    ? cached(`o|${outline}|${logo.svg}`, () => outlined(logo.svg, outline, 1))
    : cached(`${version}|${logo.svg}`, () => logoSvg(logo, version))
  return <img className={className} src={svgUrl(svg)} alt="" style={{ objectFit: 'contain', width: '100%', height: '100%', ...style }} />
}

/** Logo with anchors, handles and fitted construction circles drawn over it. */
export function ConstructionView({ logo, ink = '#2B45F5', showCircles = true }: { logo: Logo; ink?: string; showCircles?: boolean }) {
  const bg = useBg()
  const dot = toneVars(bg)['--bg']
  const c = analyze(logo.svg)
  const [x, y, w, h] = c.viewBox
  const s = Math.max(w, h)
  const pad = s * 0.06
  const a = s / 110 // anchor size
  const line = s / 700
  return (
    <svg viewBox={`${x - pad} ${y - pad} ${w + pad * 2} ${h + pad * 2}`} style={{ width: '100%', height: '100%' }}>
      <image href={svgUrl(logoSvg(logo, versionFor(logo.svg, bg).version))} x={x} y={y} width={w} height={h} opacity={0.14} />
      {showCircles &&
        c.circles.map((ci, i) => (
          <circle key={i} cx={ci.cx} cy={ci.cy} r={ci.r} fill="none" stroke={ink} strokeOpacity={0.45} strokeWidth={line} strokeDasharray={`${line * 6} ${line * 4}`} />
        ))}
      {c.outlines.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={ink} strokeWidth={line * 1.6} />
      ))}
      {c.handles.map((hd, i) => (
        <g key={i}>
          <line x1={hd.x1} y1={hd.y1} x2={hd.x2} y2={hd.y2} stroke={ink} strokeWidth={line} strokeOpacity={0.7} />
          <circle cx={hd.x2} cy={hd.y2} r={a * 0.38} fill={dot} stroke={ink} strokeWidth={line} />
        </g>
      ))}
      {c.anchors.map((p, i) => {
        const col = p.issue ? '#E5383B' : ink
        const size = p.issue ? a * 1.6 : a
        return <rect key={i} x={p.x - size / 2} y={p.y - size / 2} width={size} height={size} fill={p.issue ? col : dot} stroke={col} strokeWidth={line * 1.2} />
      })}
    </svg>
  )
}

/** Logo inside its clearspace zone, with X markers. */
export function ClearspaceView({ logo, ratio, ink, version = 'auto' }: { logo: Logo; ratio: number; ink: string; version?: LogoVersion | 'auto' }) {
  const bg = useBg()
  if (version === 'auto') version = versionFor(logo.svg, bg).version
  const [x, y, w, h] = viewBox(logo.svg)
  const X = h * ratio
  const pad = X * 0.35
  const line = Math.max(w, h) / 600
  const vb = `${x - X - pad} ${y - X - pad} ${w + 2 * X + 2 * pad} ${h + 2 * X + 2 * pad}`
  const marker = (mx: number, my: number, key: string) => (
    <g key={key}>
      <rect x={mx} y={my} width={X} height={X} fill={ink} fillOpacity={0.12} stroke={ink} strokeWidth={line} />
      <text x={mx + X / 2} y={my + X / 2} fontSize={X * 0.45} textAnchor="middle" dominantBaseline="central" fill={ink} fontFamily="Inter, sans-serif" fontWeight={600}>
        X
      </text>
    </g>
  )
  return (
    <svg viewBox={vb} style={{ width: '100%', height: '100%' }}>
      <rect x={x - X} y={y - X} width={w + 2 * X} height={h + 2 * X} fill="none" stroke={ink} strokeWidth={line} strokeDasharray={`${line * 5} ${line * 4}`} />
      <rect x={x} y={y} width={w} height={h} fill="none" stroke={ink} strokeOpacity={0.35} strokeWidth={line} />
      <image href={svgUrl(logoSvg(logo, version))} x={x} y={y} width={w} height={h} />
      {marker(x - X, y + h / 2 - X / 2, 'l')}
      {marker(x + w, y + h / 2 - X / 2, 'r')}
      {marker(x + w / 2 - X / 2, y - X, 't')}
      {marker(x + w / 2 - X / 2, y + h, 'b')}
    </svg>
  )
}

export function Page({
  children,
  className = '',
  style,
  label,
  num,
  brandName,
  bleed,
  bg = '#FFFFFF',
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
  label?: string
  num?: number
  brandName?: string
  bleed?: boolean
  bg?: string
}) {
  return (
    <BgContext.Provider value={bg}>
      <section className={`page ${bleed ? 'bleed' : ''} ${className}`} style={{ ...(toneVars(bg) as CSSProperties), background: bg, ...style }}>
        {!bleed && (label || brandName) && (
          <header className="page-head">
            <span>{label}</span>
            <span>{brandName}</span>
          </header>
        )}
        <div className="page-body">{children}</div>
        {!bleed && num !== undefined && (
          <footer className="page-foot">
            <span>{String(num).padStart(2, '0')}</span>
          </footer>
        )}
      </section>
    </BgContext.Provider>
  )
}
