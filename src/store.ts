import { useEffect, useState } from 'react'
import type { Brand } from './types'
import { SAMPLE_MARK, SAMPLE_PRIMARY, SAMPLE_WORDMARK } from './sample'
import { viewBox } from './lib/svg'

const KEY = 'marque.projects.v1'

export const uid = () => Math.random().toString(36).slice(2, 10)

function sampleLogo(svg: string, fileName: string) {
  const [, , width, height] = viewBox(svg)
  return { svg, width, height, fileName }
}

export function sampleBrand(): Brand {
  return {
    id: uid(),
    name: 'Northwind',
    tagline: 'Find your direction',
    about:
      'Northwind builds navigation tools for people who work outdoors. The identity is built on a single idea: a clear point of direction inside a calm, confident field.',
    values: 'Clear, Grounded, Optimistic, Precise',
    version: '1.0',
    logos: {
      primary: sampleLogo(SAMPLE_PRIMARY, 'northwind-primary.svg'),
      logomark: sampleLogo(SAMPLE_MARK, 'northwind-mark.svg'),
      wordmark: sampleLogo(SAMPLE_WORDMARK, 'northwind-wordmark.svg'),
    },
    colors: [
      {
        id: uid(),
        name: 'Signal Blue',
        hex: '#2B45F5',
        role: 'primary',
        cmyk: 'C85 M70 Y0 K0',
        pantone: '2728 C',
        share: 30,
        meaning: 'Signal Blue is the colour of a clear sky on a good day out: confident, trustworthy and easy to spot from a distance.',
        associations: 'Trust and dependability\nClarity and focus\nVisibility outdoors',
      },
      {
        id: uid(),
        name: 'Night',
        hex: '#0B1530',
        role: 'primary',
        cmyk: 'C100 M88 Y35 K55',
        pantone: '2766 C',
        share: 30,
        meaning: 'Night grounds the palette. It is the calm, deep tone behind the signal, used for text and large backgrounds.',
        associations: 'Calm and authority\nDepth and seriousness\nLegibility',
      },
      { id: uid(), name: 'Glacier', hex: '#DCE6FF', role: 'secondary', share: 15, meaning: 'A cool, airy tint for backgrounds and quiet surfaces.', associations: 'Openness\nFreshness' },
      { id: uid(), name: 'Ember', hex: '#FF7A45', role: 'accent', share: 5, meaning: 'A small spark of warmth reserved for calls to action and highlights.', associations: 'Energy\nWarmth\nAction' },
      { id: uid(), name: 'Paper', hex: '#F6F5F1', role: 'neutral', share: 20, meaning: 'A warm off-white that keeps layouts soft and readable.', associations: 'Simplicity\nSpace' },
    ],
    fonts: [
      { family: 'Space Grotesk', role: 'heading', source: 'google', weights: '400;500;700', usage: 'Headlines, titles, large display text and the tagline.', language: 'Latin, Latin Extended, Vietnamese' },
      { family: 'Inter', role: 'body', source: 'google', weights: '400;500;600', usage: 'Body copy, captions, interfaces and long-form documents.', language: 'Latin, Cyrillic, Greek, Vietnamese' },
    ],
    clearspace: 0.5,
    clearspaceLabel: 'half the height of the logo',
    minDigitalPx: 96,
    minPrintMm: 25,
    typeScaleRatio: 1.333,
    typeBase: 16,
    template: 'swiss',
    pageFormat: 'wide',
    dividers: true,
    hiddenPages: [],
    year: String(new Date().getFullYear()),
    website: 'northwind.co',
    mission: 'To give everyone who works outdoors tools they can trust with their day.',
    vision: 'A world where nobody gets lost on the way to doing their best work.',
    collaboration:
      'These guidelines are the result of a close collaboration between Northwind and our studio. They exist to keep the brand consistent as it grows, so everyone who touches it can use it with confidence.',
    nameMeaning: [
      { word: 'North', pronunciation: '/nɔːθ/', meaning: 'The fixed point every navigator returns to.' },
      { word: 'Wind', pronunciation: '/wɪnd/', meaning: 'Movement, momentum and the conditions outside.' },
    ],
    ethosIntro: 'Four ideas guide how Northwind looks, speaks and behaves.',
    ethos:
      'Clear: We say what we mean and design so nothing gets in the way.\nGrounded: We are built for real conditions, not showrooms.\nOptimistic: Every trip out is a chance to do something good.\nPrecise: Small details are what make tools dependable.',
    architecture: 'Northwind is a single master brand. Product lines sit under it as descriptors and never get their own logos.',
    subBrands: [],
    elements: [],
    pattern: 'crop',
    patternOpacity: 0.08,
    imagery: [],
    imageryNotes: 'Real people in real weather. Natural light, wide horizons, and the product in use rather than posed.',
    contactEmail: 'brand@northwind.co',
    contactPhone: '+1 555 010 2030',
    address: '12 Harbour Street, Portland, OR 97201',
    person: { name: 'Alex Morgan', title: 'Founder', email: 'alex@northwind.co', phone: '+1 555 010 2030' },
    cardSize: '85x55',
    vectorMockups: ['cards', 'stationery', 'folder', 'idcard', 'polo', 'cap-mug', 'bottle-notebook', 'bags', 'phone', 'signage', 'email'],
    photoMockups: [],
    client: 'Northwind Outdoor Co.',
    studio: 'Your Studio',
    studioEmail: 'hello@yourstudio.com',
    studioSite: 'yourstudio.com',
    brief:
      'Northwind needed an identity that feels as dependable as the tools they make, works at tiny sizes on devices, and stands out on a crowded outdoor retail shelf.',
    rationale:
      'The mark is a compass needle cut from a solid circle: one confident shape that reads at 16px and holds up on a billboard. The heavy wordmark balances the mark and keeps the lockup compact.',
  }
}

export function blankBrand(): Brand {
  return {
    ...sampleBrand(),
    id: uid(),
    name: 'New brand',
    tagline: '',
    about: '',
    values: '',
    logos: {},
    colors: [{ id: uid(), name: 'Primary', hex: '#111111', role: 'primary' }],
    client: '',
    brief: '',
    rationale: '',
    website: '',
    mission: '',
    vision: '',
    collaboration: '',
    nameMeaning: [],
    ethosIntro: '',
    ethos: '',
    architecture: '',
    imageryNotes: '',
    contactEmail: '',
    contactPhone: '',
    address: '',
    person: { name: '', title: '', email: '', phone: '' },
  }
}

/** Fill in fields added in later versions so older projects keep working. */
export function migrate(p: Partial<Brand>): Brand {
  const base = blankBrand()
  return {
    ...base,
    ...p,
    person: { ...base.person, ...(p.person ?? {}) },
    hiddenPages: p.hiddenPages ?? [],
    vectorMockups: p.vectorMockups ?? base.vectorMockups,
  } as Brand
}

interface State {
  projects: Brand[]
  activeId: string
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = JSON.parse(raw) as State
      if (s.projects?.length) return { ...s, projects: s.projects.map(migrate) }
    }
  } catch {
    /* fall through to sample */
  }
  const b = sampleBrand()
  return { projects: [b], activeId: b.id }
}

export function useProjects() {
  const [state, setState] = useState<State>(load)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
      setSaveError(null)
    } catch {
      setSaveError('Browser storage is full, so changes are not being saved. Export the project to keep it.')
    }
  }, [state])

  const brand = state.projects.find((p) => p.id === state.activeId) ?? state.projects[0]

  return {
    projects: state.projects,
    brand,
    saveError,
    update(patch: Partial<Brand>) {
      setState((s) => ({ ...s, projects: s.projects.map((p) => (p.id === brand.id ? { ...p, ...patch } : p)) }))
    },
    select(id: string) {
      setState((s) => ({ ...s, activeId: id }))
    },
    add(b: Brand) {
      setState((s) => ({ projects: [...s.projects, b], activeId: b.id }))
    },
    remove(id: string) {
      setState((s) => {
        const projects = s.projects.filter((p) => p.id !== id)
        if (!projects.length) projects.push(blankBrand())
        return { projects, activeId: projects[0].id }
      })
    },
  }
}
