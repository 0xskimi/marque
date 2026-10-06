import { converter, formatHex, clampChroma } from 'culori'

const toOklch = converter('oklch')

export function normHex(hex: string): string {
  let h = hex.trim().replace(/^#/, '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return '#000000'
  return '#' + h.toUpperCase()
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = normHex(hex).slice(1)
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
}

/**
 * Device-independent CMYK estimate. Real print values depend on the press
 * profile, so the UI marks these as estimates and lets you enter swatch values.
 */
export function estimateCmyk(hex: string): [number, number, number, number] {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255)
  const k = 1 - Math.max(r, g, b)
  if (k >= 1) return [0, 0, 0, 100]
  const c = (1 - r - k) / (1 - k)
  const m = (1 - g - k) / (1 - k)
  const y = (1 - b - k) / (1 - k)
  return [c, m, y, k].map((v) => Math.round(v * 100)) as [number, number, number, number]
}

function channel(v: number) {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG 2.x contrast ratio. */
export function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

export function wcagLevel(ratio: number): 'AAA' | 'AA' | 'AA Large' | 'Fail' {
  if (ratio >= 7) return 'AAA'
  if (ratio >= 4.5) return 'AA'
  if (ratio >= 3) return 'AA Large'
  return 'Fail'
}

/** Black or white, whichever reads better on the given background. */
export function inkOn(bg: string): string {
  return contrast(bg, '#FFFFFF') >= contrast(bg, '#111111') ? '#FFFFFF' : '#111111'
}

/** Perceptually even tint/shade ramp in OKLCH, light to dark. */
export function ramp(hex: string, steps = 9): { step: number; hex: string }[] {
  const base = toOklch(normHex(hex))
  if (!base) return []
  const out: { step: number; hex: string }[] = []
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1)
    const l = 0.97 - t * (0.97 - 0.22)
    // Ease chroma down at the extremes so light tints don't go neon.
    const c = (base.c ?? 0) * (1 - Math.pow(Math.abs(t - 0.5) * 2, 2) * 0.7)
    const col = clampChroma({ mode: 'oklch', l, c, h: base.h ?? 0 }, 'oklch')
    out.push({ step: (i + 1) * 100, hex: formatHex(col).toUpperCase() })
  }
  return out
}

/** A deliberately off-brand colour for the "don't recolour" example. */
export function offBrand(hex: string): string {
  const base = toOklch(normHex(hex))
  if (!base) return '#E4572E'
  const col = clampChroma({ mode: 'oklch', l: 0.68, c: 0.17, h: ((base.h ?? 0) + 150) % 360 }, 'oklch')
  return formatHex(col).toUpperCase()
}

/** Mix two colours in sRGB; t = 0 gives a, 1 gives b. */
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a)
  const y = hexToRgb(b)
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase()
}

/** Text, muted text, rules and panels that sit well on a page background. */
export function toneVars(bg: string): Record<string, string> {
  const dark = luminance(bg) < 0.25
  const fg = dark ? '#FFFFFF' : '#111111'
  return {
    '--bg': bg,
    '--fg': fg,
    '--muted': mix(bg, fg, dark ? 0.6 : 0.58),
    '--rule': mix(bg, fg, dark ? 0.18 : 0.12),
    '--panel': dark ? mix(bg, '#FFFFFF', 0.06) : luminance(bg) > 0.9 ? mix(bg, '#000000', 0.04) : mix(bg, '#FFFFFF', 0.4),
  }
}
