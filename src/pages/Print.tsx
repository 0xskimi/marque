import type { ReactNode } from 'react'
import type { Brand } from '../types'
import { docVars, makeCtx, type Ctx } from './Guidelines'
import { CardBack, CardFront, Envelope, Letterhead, cardDims, DL, LETTER } from './Stationery'

export const BLEED = 3
const SLUG = 7

export interface Sheet {
  name: string
  label: string
  trim: [number, number]
  render: (ctx: Ctx) => ReactNode
}

export function sheets(b: Brand): Sheet[] {
  const card = cardDims(b)
  return [
    { name: 'cardfront', label: 'Business card, front', trim: card, render: (c) => <CardFront ctx={c} bleed={BLEED} /> },
    { name: 'cardback', label: 'Business card, back', trim: card, render: (c) => <CardBack ctx={c} bleed={BLEED} /> },
    { name: 'letterhead', label: 'Letterhead, A4', trim: LETTER, render: (c) => <Letterhead ctx={c} bleed={BLEED} /> },
    { name: 'envelope', label: 'Envelope, DL', trim: DL, render: (c) => <Envelope ctx={c} bleed={BLEED} /> },
  ]
}

export function sheetSize(s: Sheet, marks: boolean): [number, number] {
  const m = BLEED + (marks ? SLUG : 0)
  return [s.trim[0] + m * 2, s.trim[1] + m * 2]
}

/** Named @page rules so each sheet prints at its own size in one PDF. */
export function printPageCss(b: Brand, marks: boolean) {
  return sheets(b)
    .map((s) => {
      const [w, h] = sheetSize(s, marks)
      return `@page ${s.name} { size: ${w}mm ${h}mm; margin: 0; } .print-sheet.${s.name} { page: ${s.name}; }`
    })
    .join('\n')
}

function CropMarks({ trim, off }: { trim: [number, number]; off: number }) {
  const [w, h] = trim
  const L = SLUG - 2
  const x = [off, off + w]
  const y = [off, off + h]
  const lines: [number, number, number, number][] = []
  for (const xi of x) {
    lines.push([xi, 0, xi, L], [xi, off + h + BLEED + 2, xi, off * 2 + h])
  }
  for (const yi of y) {
    lines.push([0, yi, L, yi], [off + w + BLEED + 2, yi, off * 2 + w, yi])
  }
  return (
    <svg className="crop-marks" width={`${w + off * 2}mm`} height={`${h + off * 2}mm`} viewBox={`0 0 ${w + off * 2} ${h + off * 2}`}>
      {lines.map(([a, b, c, d], i) => (
        <line key={i} x1={a} y1={b} x2={c} y2={d} stroke="#000" strokeWidth={0.1} />
      ))}
    </svg>
  )
}

export function Print({ brand, marks }: { brand: Brand; marks: boolean }) {
  const ctx = makeCtx(brand)
  return (
    <div className="doc doc-print" style={docVars(ctx)}>
      {sheets(brand).map((s) => {
        const [w, h] = sheetSize(s, marks)
        const off = marks ? SLUG : 0
        return (
          <div key={s.name} className="print-item">
            <div className="print-label">
              {s.label} · trim {s.trim[0]} × {s.trim[1]} mm · {BLEED} mm bleed{marks ? ' · crop marks' : ''}
            </div>
            <div className={`print-sheet ${s.name}`} style={{ width: `${w}mm`, height: `${h}mm` }}>
              <div style={{ position: 'absolute', left: `${off}mm`, top: `${off}mm` }}>{s.render(ctx)}</div>
              {marks && <CropMarks trim={s.trim} off={off + BLEED} />}
              <div className="trim-guide" style={{ left: `${off + BLEED}mm`, top: `${off + BLEED}mm`, width: `${s.trim[0]}mm`, height: `${s.trim[1]}mm` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
