import { useId } from 'react'
import type { Logo, PatternStyle } from '../types'
import { inkOn } from '../lib/color'
import { outlined, recolor, svgUrl, viewBox } from '../lib/svg'

/**
 * Brand pattern generated from the logomark. Fills its (relatively positioned) parent.
 * crop: one oversized mark bleeding off the edge; grid/offset: repeated marks; outline: repeated outlines.
 */
export function Pattern({
  mark,
  bg,
  style,
  opacity = 0.08,
  ink,
  density = 1,
  anchor = 'right',
}: {
  mark?: Logo
  bg: string
  style: PatternStyle
  opacity?: number
  ink?: string
  density?: number
  anchor?: 'right' | 'center' | 'left'
}) {
  const id = useId().replace(/:/g, '')
  if (!mark || style === 'none') return null
  const color = ink ?? inkOn(bg)
  const [, , w, h] = viewBox(mark.svg)
  const aspect = w / h

  if (style === 'crop') {
    const art = svgUrl(recolor(mark.svg, color))
    const H = 150
    const W = H * aspect
    const x = anchor === 'right' ? 100 - W * 0.62 : anchor === 'left' ? -W * 0.38 : 50 - W / 2
    return (
      <svg className="pattern" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <image href={art} x={x} y={100 - H * 0.72} width={W} height={H} opacity={Math.min(1, opacity * 1.1)} preserveAspectRatio="xMidYMid meet" />
      </svg>
    )
  }

  const art = svgUrl(style === 'outline' ? outlined(mark.svg, color, 1.2) : recolor(mark.svg, color))
  const size = 18 / density
  const tw = size * Math.max(1, aspect) * 1.9
  const th = (size / Math.min(1, aspect)) * 1.9
  const mw = size * Math.max(1, aspect)
  const mh = size / Math.min(1, aspect)
  const offset = style === 'offset'
  return (
    <svg className="pattern" width="100%" height="100%" aria-hidden>
      <defs>
        <pattern id={id} width={tw} height={offset ? th * 2 : th} patternUnits="userSpaceOnUse" patternTransform="scale(3.7795)">
          <image href={art} x={(tw - mw) / 2} y={(th - mh) / 2} width={mw} height={mh} />
          {offset && <image href={art} x={(tw - mw) / 2 - tw / 2} y={th + (th - mh) / 2} width={mw} height={mh} />}
          {offset && <image href={art} x={(tw - mw) / 2 + tw / 2} y={th + (th - mh) / 2} width={mw} height={mh} />}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} opacity={opacity * 2.2} />
    </svg>
  )
}
