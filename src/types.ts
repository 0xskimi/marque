export type LogoSlot = 'primary' | 'logomark' | 'wordmark' | 'secondary'

export const LOGO_SLOTS: { id: LogoSlot; label: string; hint: string }[] = [
  { id: 'primary', label: 'Primary logo', hint: 'Full lockup (mark + wordmark)' },
  { id: 'logomark', label: 'Logomark', hint: 'Symbol on its own' },
  { id: 'wordmark', label: 'Wordmark', hint: 'Logotype on its own' },
  { id: 'secondary', label: 'Secondary lockup', hint: 'Stacked or alternate layout' },
]

export interface Logo {
  /** Normalised SVG markup, viewBox cropped tight to the artwork. */
  svg: string
  width: number
  height: number
  fileName: string
}

export type ColorRole = 'primary' | 'secondary' | 'accent' | 'neutral'

export interface BrandColor {
  id: string
  name: string
  hex: string
  role: ColorRole
  /** Exact print values from your swatch book; overrides the computed estimate. */
  cmyk?: string
  pantone?: string
  /** What the colour stands for, shown on its own page. */
  meaning?: string
  /** One association per line. */
  associations?: string
  /** Share of the palette in use, for the proportion bar (0 = auto). */
  share?: number
}

export interface BrandFont {
  family: string
  role: 'heading' | 'body' | 'accent'
  source: 'google' | 'upload' | 'system'
  weights: string
  /** Base64 font file when source is 'upload'. */
  data?: string
  /** Where to use it, e.g. "Headlines, titles and large display text". */
  usage?: string
  language?: string
}

export type Template = 'swiss' | 'bold' | 'noir'
export type PageFormat = 'wide' | 'a4'
export type PatternStyle = 'crop' | 'grid' | 'offset' | 'outline' | 'none'

export interface NameMeaning {
  word: string
  pronunciation: string
  meaning: string
}

export interface SubBrand {
  id: string
  name: string
  description: string
  logo?: Logo
  color?: string
}

/** A supporting graphic: shape, icon, pattern tile. */
export interface BrandElement {
  id: string
  name: string
  svg: string
}

/** Photo stored in IndexedDB, referenced by id. */
export interface ImageRef {
  id: string
  caption: string
}

export interface Person {
  name: string
  title: string
  email: string
  phone: string
}

/** What gets placed on a photo mockup surface. */
export type Artwork =
  | 'primary'
  | 'logomark'
  | 'wordmark'
  | 'secondary'
  | 'card-front'
  | 'card-back'
  | 'letterhead'
  | 'envelope'
  | 'pattern'
  | 'tagline'
  | 'social'

export type ArtTone = 'auto' | 'full' | 'white' | 'black' | 'primary' | 'dark'

export interface Placement {
  id: string
  /** Four corners (top-left, top-right, bottom-right, bottom-left) as fractions of the photo. */
  corners: [number, number][]
  artwork: Artwork
  tone: ArtTone
  blend: 'normal' | 'multiply' | 'screen' | 'overlay'
  opacity: number
  /** Logo size inside the surface, 0.1 to 1. */
  scale: number
  /** Fill the surface with a brand colour before placing artwork. */
  fill: 'none' | 'primary' | 'dark' | 'light' | 'accent'
}

/** A reusable photo mockup from the shared library. */
export interface PhotoMockup {
  id: string
  title: string
  imageId: string
  width: number
  height: number
  placements: Placement[]
}

export const VECTOR_MOCKUPS = [
  { id: 'cards', label: 'Business cards' },
  { id: 'stationery', label: 'Letterhead and envelope' },
  { id: 'folder', label: 'Presentation folder' },
  { id: 'idcard', label: 'ID card and lanyard' },
  { id: 'polo', label: 'Polo shirt, front and back' },
  { id: 'cap-mug', label: 'Cap and mug' },
  { id: 'bottle-notebook', label: 'Flask and notebook' },
  { id: 'bags', label: 'Tote and shopping bag' },
  { id: 'phone', label: 'Phone and social profile' },
  { id: 'signage', label: 'Signage' },
  { id: 'email', label: 'Email signature' },
] as const

export type VectorMockupId = (typeof VECTOR_MOCKUPS)[number]['id']

export interface Brand {
  id: string
  name: string
  tagline: string
  about: string
  values: string
  version: string
  logos: Partial<Record<LogoSlot, Logo>>
  colors: BrandColor[]
  fonts: BrandFont[]
  /** Clearspace as a fraction of the logo's height. */
  clearspace: number
  clearspaceLabel: string
  minDigitalPx: number
  minPrintMm: number
  typeScaleRatio: number
  typeBase: number
  template: Template
  pageFormat: PageFormat
  dividers: boolean
  /** Page keys switched off in the guidelines. */
  hiddenPages: string[]
  year: string
  website: string
  mission: string
  vision: string
  /** Optional note to the client at the front of the guidelines. */
  collaboration: string
  nameMeaning: NameMeaning[]
  ethosIntro: string
  /** Ethos or personality points, one per line, "Title: description". */
  ethos: string
  architecture: string
  subBrands: SubBrand[]
  elements: BrandElement[]
  pattern: PatternStyle
  patternOpacity: number
  imagery: ImageRef[]
  imageryNotes: string
  /** Contact and support details for the closing pages. */
  contactEmail: string
  contactPhone: string
  address: string
  person: Person
  /** Business card trim size in mm. */
  cardSize: '85x55' | '89x51' | '90x50' | '90x55'
  /** Mockups shown in the Brand Assets deck. */
  vectorMockups: VectorMockupId[]
  photoMockups: string[]
  /** Free layers (images, text, shapes, logos) placed on any page, keyed by page key. */
  overlays?: Record<string, Layer[]>
  /** Your own slides, inserted between the generated ones. */
  customSlides?: CustomSlide[]
  /** Generated pages switched off from the canvas, by page key. */
  hiddenSlides?: string[]
  /** Edits to items on generated pages (moved, scaled, retyped, recoloured), by page key then item path. */
  tweaks?: Record<string, Record<string, Tweak>>
  /** AI explorations from the Exploration tab, newest first. */
  explorations?: Exploration[]
  // Presentation deck
  client: string
  studio: string
  studioEmail: string
  studioSite: string
  brief: string
  rationale: string
}

// ---------------------------------------------------------------------------
// Artboard editing: layers you place yourself on top of any page, and custom slides.

export type DocId = 'guidelines' | 'assets' | 'deck'
export type LayerKind = 'image' | 'text' | 'rect' | 'logo' | 'svg'

export interface Layer {
  id: string
  kind: LayerKind
  /** Position and size as fractions of the page (0–1), so layers survive format changes. */
  x: number
  y: number
  w: number
  h: number
  opacity?: number
  // image
  imageId?: string
  fit?: 'cover' | 'contain'
  /** Corner radius in mm (images and shapes). */
  radius?: number
  // text
  text?: string
  font?: 'heading' | 'body'
  /** Points. */
  size?: number
  weight?: number
  color?: string
  align?: 'left' | 'center' | 'right'
  uppercase?: boolean
  /** Letter spacing in em. */
  tracking?: number
  lineHeight?: number
  // shape
  fill?: string
  // logo
  slot?: LogoSlot
  version?: 'auto' | 'full' | 'white' | 'black'
  // svg: artwork copied from a generated page, as standalone SVG markup
  svg?: string
}

/** A change to one item of a generated page. The page still updates from the sidebar underneath. */
export interface Tweak {
  /** Offset in mm. */
  dx?: number
  dy?: number
  /** Uniform scale around the item's centre. */
  s?: number
  /** Replacement text (only for items that are plain text). */
  text?: string
  /** Colour swaps inside the item, old hex to new hex. */
  colors?: Record<string, string>
  hide?: boolean
}

export interface CustomSlide {
  id: string
  doc: DocId
  /** Page key this slide follows; '^' for the very start. */
  after: string
  bg: string
}

// ---------------------------------------------------------------------------
// Exploration: ideas, concepts and logos generated from the brand kit.

export type ExploreMode = 'ideas' | 'concepts' | 'logos'

export interface IdeaItem {
  title: string
  summary: string
  applications: string[]
  why: string
}

export interface ConceptItem {
  name: string
  idea: string
  rationale: string
  tagline: string
  palette: { name: string; hex: string; role: ColorRole }[]
  headingFont: string
  bodyFont: string
  voice: string[]
  imagery: string
}

export interface LogoItem {
  name: string
  concept: string
  svg: string
}

export interface Exploration {
  id: string
  mode: ExploreMode
  prompt: string
  /** ISO time it was generated. */
  at: string
  items: (IdeaItem | ConceptItem | LogoItem)[]
}
