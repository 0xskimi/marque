import type { Brand, BrandColor, Logo, LogoSlot } from '../types'
import { contrast, luminance, normHex } from './color'

export interface Derived {
  primary: string
  dark: string
  light: string
  accent: string
  heading?: Brand['fonts'][number]
  body?: Brand['fonts'][number]
  logo: (slot: LogoSlot) => Logo | undefined
  mainLogo?: Logo
  mark?: Logo
}

export function derive(b: Brand): Derived {
  const cols = b.colors.length ? b.colors : [{ hex: '#111111' } as BrandColor]
  const byLum = [...cols].sort((x, y) => luminance(x.hex) - luminance(y.hex))
  const darkest = normHex(byLum[0].hex)
  const lightest = normHex(byLum[byLum.length - 1].hex)
  // Prefer the most saturated primary for colour blocks; fall back to the first colour.
  const primaries = cols.filter((c) => c.role === 'primary')
  const primary = normHex((primaries.find((c) => luminance(c.hex) > 0.03 && luminance(c.hex) < 0.6) ?? primaries[0] ?? cols[0]).hex)
  const accent = normHex((cols.find((c) => c.role === 'accent') ?? cols.find((c) => normHex(c.hex) !== primary) ?? cols[0]).hex)
  const logo = (slot: LogoSlot) => b.logos[slot]
  const mainLogo = b.logos.primary ?? b.logos.secondary ?? b.logos.wordmark ?? b.logos.logomark
  const mark = b.logos.logomark ?? mainLogo
  return {
    primary,
    dark: luminance(darkest) < 0.08 ? darkest : '#111111',
    light: luminance(lightest) > 0.8 ? lightest : '#FFFFFF',
    accent,
    heading: b.fonts.find((f) => f.role === 'heading') ?? b.fonts[0],
    body: b.fonts.find((f) => f.role === 'body') ?? b.fonts[1] ?? b.fonts[0],
    logo,
    mainLogo,
    mark,
  }
}

/** Distinct colours actually used in the artwork. */
export function logoColors(svg: string): string[] {
  const found = new Set<string>()
  for (const m of svg.matchAll(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) found.add(normHex(m[0]))
  if (/fill\s*[:=]\s*["']?(black|#000)/i.test(svg)) found.add('#000000')
  if (!found.size) found.add('#000000') // SVG default fill
  return [...found]
}

export type LogoVersion = 'full' | 'white' | 'black'

/** Which version of the logo to use on a given background, from real contrast. */
export function versionFor(svg: string, bg: string): { version: LogoVersion; ratio: number } {
  const cols = logoColors(svg).filter((c) => luminance(c) < 0.95 || luminance(bg) < 0.5)
  const fullRatio = cols.length ? Math.min(...cols.map((c) => contrast(c, bg))) : 1
  if (fullRatio >= 3) return { version: 'full', ratio: fullRatio }
  const w = contrast('#FFFFFF', bg)
  const k = contrast('#000000', bg)
  return w >= k ? { version: 'white', ratio: w } : { version: 'black', ratio: k }
}

/** The palette colour the logo is hardest to see on, for the misuse page. */
export function worstBackground(svg: string, colors: BrandColor[]): string | undefined {
  const cols = logoColors(svg)
  let worst: { hex: string; r: number } | undefined
  for (const c of colors) {
    const r = Math.min(...cols.map((l) => contrast(l, c.hex)))
    if (r > 1.05 && (!worst || r < worst.r)) worst = { hex: normHex(c.hex), r }
  }
  return worst?.hex
}
