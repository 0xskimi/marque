import type { Brand } from '../types'

/** Logos bigger than this are left out of the request and mentioned instead. */
const MAX_LOGO_CHARS = 40_000

/** The brand kit written out for Claude: only fields that are filled in. */
export function brandText(b: Brand): string {
  const out: string[] = []
  const line = (label: string, v?: string) => v?.trim() && out.push(`${label}: ${v.trim()}`)
  line('Brand name', b.name)
  line('Tagline', b.tagline)
  line('About', b.about)
  line('Mission', b.mission)
  line('Vision', b.vision)
  line('Values', b.values)
  line('Ethos', [b.ethosIntro, b.ethos].filter(Boolean).join('\n'))
  if (b.nameMeaning.length) line('Name meaning', b.nameMeaning.map((n) => `${n.word} (${n.pronunciation}): ${n.meaning}`).join('; '))
  line('Brand architecture', b.architecture)
  if (b.subBrands.length) line('Sub-brands', b.subBrands.map((s) => `${s.name}: ${s.description}`).join('; '))
  line('Client', b.client)
  line('Brief', b.brief)
  line('Design rationale', b.rationale)
  line('Imagery notes', b.imageryNotes)
  line('Website', b.website)

  if (b.colors.length) {
    out.push('Colours:')
    for (const c of b.colors)
      out.push(`- ${c.name} ${c.hex} (${c.role})${c.meaning ? `: ${c.meaning}` : ''}${c.associations ? ` [${c.associations.split('\n').join(', ')}]` : ''}`)
  }
  if (b.fonts.length) {
    out.push('Typefaces:')
    for (const f of b.fonts) if (f.family) out.push(`- ${f.family} (${f.role}, weights ${f.weights})${f.usage ? `: ${f.usage}` : ''}`)
  }

  const logo = b.logos.primary ?? b.logos.logomark ?? b.logos.wordmark ?? b.logos.secondary
  if (logo) {
    if (logo.svg.length <= MAX_LOGO_CHARS) out.push(`Current logo (SVG):\n${logo.svg}`)
    else out.push('Current logo: present, but too detailed to include here.')
  } else out.push('Current logo: none yet.')
  return out.join('\n')
}
