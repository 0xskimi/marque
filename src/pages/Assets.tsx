import { Arrange, type SheetItem } from '../edit/Arrange'
import type { ReactNode } from 'react'
import type { Brand } from '../types'
import { VECTOR_MOCKUPS } from '../types'
import { useLibrary } from '../lib/library'
import { LogoImg, BgScope } from './common'
import { Closing, Cover, docVars, makeCtx, NOIR, type Ctx } from './Guidelines'
import { VECTOR_SCENES } from './Merch'
import { MM, PhotoScene } from './PhotoScene'
import { Pattern } from './Pattern'
import { toneVars } from '../lib/color'

function Slide({ bg, label, brand, children, bleed }: { bg: string; label?: string; brand: string; children: ReactNode; bleed?: boolean }) {
  return (
    <BgScope bg={bg}>
      <section className={`slide asset-slide ${bleed ? 'bleed' : ''}`} style={{ ...(toneVars(bg) as object), background: bg }}>
        {!bleed && (
          <header className="asset-head">
            <span>{label}</span>
            <span>{brand}</span>
          </header>
        )}
        <div className="asset-body">{children}</div>
      </section>
    </BgScope>
  )
}

/** The Brand Assets deck: logo, design approach and every mockup, on dark 16:9 slides. */
export function Assets({ brand }: { brand: Brand }) {
  const base = makeCtx(brand)
  const dark = brand.template === 'bold' ? base.d.dark : NOIR
  const ctx: Ctx = { ...base, t: { ...base.t, cover: dark, content: dark, feature: dark } }
  const { b, d } = ctx
  const lib = useLibrary()
  const photos = (b.photoMockups ?? []).map((id) => lib.find((m) => m.id === id)).filter((m) => m !== undefined)
  const vectors = VECTOR_MOCKUPS.filter((m) => b.vectorMockups?.includes(m.id))
  const items: SheetItem[] = []
  items.push({
    key: 'cover',
    node: (
      <Slide bg={dark} brand={b.name} bleed>
        <Cover ctx={ctx} kind="Brand Assets" />
      </Slide>
    ),
  })
  items.push({
    key: 'logo',
    node: (
      <Slide bg={dark} brand={b.name} label="Logo">
        <div className="as-logo">
          <LogoImg logo={d.mainLogo} />
        </div>
      </Slide>
    ),
  })
  if (b.rationale.trim())
    items.push({
      key: 'approach',
      node: (
        <Slide bg={dark} brand={b.name} label="Design approach">
          <div className="as-approach">
            <div className="as-approach-text">
              {b.rationale
                .split(/\n+/)
                .filter(Boolean)
                .map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
            </div>
            <div className="as-approach-art stage-gridlines">
              <div className="as-approach-mark">
                <LogoImg logo={d.mark} />
              </div>
            </div>
          </div>
        </Slide>
      ),
    })
  for (const m of vectors) {
    const Scene = VECTOR_SCENES[m.id]
    items.push({
      key: `v-${m.id}`,
      node: (
        <Slide bg={dark} brand={b.name} label={m.label}>
          <Scene ctx={ctx} />
        </Slide>
      ),
    })
  }
  for (const m of photos)
    items.push({
      key: `p-${m.id}`,
      node: (
        <Slide bg={dark} brand={b.name} bleed>
          <PhotoScene ctx={ctx} mockup={m} width={320 * MM} height={180 * MM}>
            <div className="ps-label">{m.title}</div>
          </PhotoScene>
        </Slide>
      ),
    })
  items.push({
    key: 'closing',
    bg: ctx.t.closing,
    node: (
      <Slide bg={ctx.t.closing} brand={b.name} bleed>
        <Closing ctx={ctx} />
      </Slide>
    ),
  })
  return (
    <div className="doc doc-assets" style={docVars(ctx)}>
      <Arrange doc="assets" defaultBg={dark} items={items} />
    </div>
  )
}
