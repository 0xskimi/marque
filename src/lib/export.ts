import JSZip from 'jszip'
import { jsPDF } from 'jspdf'
import 'svg2pdf.js'
import type { Brand, Logo } from '../types'
import { LOGO_SLOTS } from '../types'
import { derive, versionFor } from './derive'
import { estimateCmyk, hexToRgb, normHex } from './color'
import { rasterize, recolor, viewBox } from './svg'
import { emailSignatureHtml, patternFiles, socialTemplates } from './extras'
import { estimatedInks, flatten, hasSpot, parseCmyk, toEps, toPdf } from './vector'

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'brand'

async function svgToPdf(svg: string): Promise<Blob> {
  const [, , w, h] = viewBox(svg)
  // Fit into a 500pt box so files are a sensible physical size.
  const scale = 500 / Math.max(w, h)
  const W = w * scale
  const H = h * scale
  const host = document.createElement('div')
  host.style.cssText = 'position:absolute;left:-10000px;top:0'
  host.innerHTML = svg
  document.body.appendChild(host)
  try {
    const el = host.querySelector('svg') as SVGSVGElement
    el.setAttribute('width', String(W))
    el.setAttribute('height', String(H))
    const pdf = new jsPDF({ unit: 'pt', format: [W, H], orientation: W > H ? 'landscape' : 'portrait' })
    await pdf.svg(el, { x: 0, y: 0, width: W, height: H })
    return pdf.output('blob')
  } finally {
    host.remove()
  }
}

/** Adobe Swatch Exchange file, so the palette drops straight into Illustrator. */
function aseFile(colors: { name: string; hex: string; cmyk?: number[]; spot?: boolean }[]): Uint8Array {
  const blocks: number[][] = []
  for (const c of colors) {
    const name = c.name || c.hex
    const nameBytes: number[] = []
    for (const ch of name + '\0') {
      const code = ch.charCodeAt(0)
      nameBytes.push(code >> 8, code & 0xff)
    }
    const model = c.cmyk ? 'CMYK' : 'RGB '
    const body: number[] = [((name.length + 1) >> 8) & 0xff, (name.length + 1) & 0xff, ...nameBytes, ...model.split('').map((s) => s.charCodeAt(0))]
    for (const v of c.cmyk ? c.cmyk.map((n) => n / 100) : hexToRgb(c.hex).map((n) => n / 255)) {
      const f = new DataView(new ArrayBuffer(4))
      f.setFloat32(0, v)
      body.push(...new Uint8Array(f.buffer))
    }
    body.push(0, c.spot ? 1 : 2) // 1 = spot, 2 = normal (non-global) colour
    const len = body.length
    blocks.push([0x00, 0x01, (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff, ...body])
  }
  const n = blocks.length
  const header = [0x41, 0x53, 0x45, 0x46, 0, 1, 0, 0, (n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]
  return new Uint8Array([...header, ...blocks.flat()])
}

/** .ico container holding PNG images. */
async function icoFile(pngs: { size: number; blob: Blob }[]): Promise<Uint8Array> {
  const datas = await Promise.all(pngs.map(async (p) => new Uint8Array(await p.blob.arrayBuffer())))
  const headerSize = 6 + 16 * pngs.length
  const total = headerSize + datas.reduce((a, d) => a + d.length, 0)
  const out = new Uint8Array(total)
  const dv = new DataView(out.buffer)
  dv.setUint16(2, 1, true)
  dv.setUint16(4, pngs.length, true)
  let offset = headerSize
  pngs.forEach((p, i) => {
    const e = 6 + i * 16
    out[e] = p.size >= 256 ? 0 : p.size
    out[e + 1] = p.size >= 256 ? 0 : p.size
    dv.setUint16(e + 4, 1, true)
    dv.setUint16(e + 6, 32, true)
    dv.setUint32(e + 8, datas[i].length, true)
    dv.setUint32(e + 12, offset, true)
    out.set(datas[i], offset)
    offset += datas[i].length
  })
  return out
}

export function tokensCss(b: Brand): string {
  const lines = b.colors.map((c) => `  --color-${slug(c.name)}: ${normHex(c.hex)};`)
  const fonts = b.fonts.filter((f) => f.family).map((f) => `  --font-${f.role}: "${f.family}", system-ui, sans-serif;`)
  const scale = [-1, 0, 1, 2, 3, 4, 5].map((s, i) => `  --text-${['sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl'][i]}: ${(b.typeBase * Math.pow(b.typeScaleRatio, s)) / 16}rem;`)
  return `:root {\n${[...lines, ...fonts, ...scale].join('\n')}\n}\n`
}

export function tokensJson(b: Brand) {
  return {
    color: Object.fromEntries(b.colors.map((c) => [slug(c.name), { $value: normHex(c.hex), $type: 'color', role: c.role, cmyk: c.cmyk || estimateCmyk(c.hex).join(' '), pantone: c.pantone || undefined }])),
    font: Object.fromEntries(b.fonts.filter((f) => f.family).map((f) => [f.role, { $value: f.family, $type: 'fontFamily', weights: f.weights }])),
  }
}

function readme(b: Brand, folders: string[], printIssues: Map<string, string[]>, estimated: string[], epsSkipped: string[]): string {
  const d = derive(b)
  const rows = b.colors
    .map((c) => `<tr><td><span class="sw" style="background:${normHex(c.hex)}"></span>${c.name}</td><td>${normHex(c.hex)}</td><td>${hexToRgb(c.hex).join(' ')}</td><td>${c.cmyk || '≈ ' + estimateCmyk(c.hex).join(' ')}</td><td>${c.pantone || '—'}</td></tr>`)
    .join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>${b.name} logo files</title>
<style>body{font:15px/1.55 -apple-system,Inter,system-ui,sans-serif;color:#1a1a1a;max-width:760px;margin:48px auto;padding:0 24px}
h1{font-size:28px;margin:0 0 4px}h2{font-size:17px;margin:32px 0 8px}code{background:#f2f2f2;padding:1px 5px;border-radius:4px}
table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:6px 8px;border-bottom:1px solid #eee;font-size:14px}
.sw{display:inline-block;width:14px;height:14px;border-radius:3px;margin-right:8px;vertical-align:-2px;border:1px solid #0001}
.bar{height:6px;background:${d.primary};border-radius:3px;margin:16px 0 28px}</style></head><body>
<h1>${b.name} logo files</h1><div>Version ${b.version}${b.studio ? ' · prepared by ' + b.studio : ''}</div><div class="bar"></div>
<h2>Which file should I use?</h2>
<p>Every logo folder is split into <b>Digital (RGB)</b> for screens and <b>Print</b> for anything that gets printed, embroidered or cut.</p>
<ul><li><b>Digital (RGB) / SVG</b>: websites, apps and anything digital. Scales to any size without losing quality.</li>
<li><b>Digital (RGB) / PNG</b>: documents, slides and social media when SVG isn't accepted. Transparent background. Pick the size closest to what you need.</li>
<li><b>Digital (RGB) / JPG</b>: places that don't support transparency, such as some forms and upload portals. The white logo sits on the brand colour.</li>
<li><b>Print (CMYK) / PDF or EPS</b>: send these to printers, sign makers and merchandise suppliers. Vector, four-colour process inks.</li>
<li><b>Print (Pantone) / PDF or EPS</b>: for spot-colour printing, such as screen print, embroidery threads matched to Pantone, or offset jobs that specify Pantone inks. Each brand colour prints as its named Pantone ink.</li></ul>
<h2>Which version?</h2>
<ul><li><b>Full colour</b>: the default, on white or light backgrounds.</li>
<li><b>White</b>: on dark backgrounds and photos.</li><li><b>Black</b>: single-colour printing such as newspapers, stamps or engraving.</li>
<li><b>One colour</b>: single-colour printing in the brand colour.</li></ul>
<h2>Folders</h2><ul>${folders.map((f) => `<li><code>${f}</code></li>`).join('')}</ul>
<h2>Rules</h2><ul><li>Keep clear space of at least ${b.clearspaceLabel || Math.round(b.clearspace * 100) + '% of the logo height'} around the logo.</li>
<li>Don't use the logo smaller than ${b.minPrintMm} mm wide in print or ${b.minDigitalPx} px on screen.</li>
<li>Never stretch, recolour, rotate, outline or add effects to the logo.</li></ul>
<h2>Brand colours</h2><table><tr><th>Colour</th><th>HEX</th><th>RGB</th><th>CMYK</th><th>Pantone</th></tr>${rows}</table>
<p style="color:#777;font-size:13px">CMYK values marked ≈ are estimates; confirm against a printed swatch for your press.</p>
${estimated.length ? `<p style="color:#777;font-size:13px">The print files use estimated CMYK for: ${estimated.join(', ')}.</p>` : ''}
${epsSkipped.length ? `<p style="color:#777;font-size:13px">No EPS for ${epsSkipped.join(', ')}: the artwork uses transparency, which EPS can't hold. Use the PDF.</p>` : ''}
${printIssues.size ? `<h2>Print file notes</h2><p>These versions contain features that can't be written as CMYK or Pantone, so they have an RGB PDF in <code>Print/PDF RGB fallback</code> instead. Fix them in the source artwork and re-export for full print files.</p><ul>${[...printIssues].map(([k, v]) => `<li><b>${k}</b>: ${v.join(', ')}</li>`).join('')}</ul>` : ''}
${b.studioEmail ? `<h2>Questions</h2><p>${b.studio} · ${b.studioEmail}</p>` : ''}</body></html>`
}

export async function exportPackage(b: Brand, onProgress: (msg: string) => void): Promise<Blob> {
  const zip = new JSZip()
  const root = zip.folder(`${b.name} Brand Package`)!
  const base = slug(b.name)
  const d = derive(b)
  const folders: string[] = []
  const printIssues = new Map<string, string[]>()
  const epsSkipped: string[] = []
  const primaryHex = d.primary

  let idx = 1
  for (const slot of LOGO_SLOTS) {
    const logo = b.logos[slot.id]
    if (!logo) continue
    const folderName = `${String(idx++).padStart(2, '0')} ${slot.label}`
    folders.push(folderName)
    const f = root.folder(folderName)!
    const variants: [string, string][] = [
      ['full-colour', logo.svg],
      ['black', recolor(logo.svg, '#000000')],
      ['white', recolor(logo.svg, '#FFFFFF')],
    ]
    if (primaryHex !== '#000000') variants.push(['one-colour', recolor(logo.svg, primaryHex)])
    for (const [vname, svg] of variants) {
      onProgress(`${slot.label}: ${vname}`)
      const name = `${base}-${slug(slot.id)}-${vname}`
      const dark = vname === 'white'
      const jpgBg = dark ? (primaryHex !== '#FFFFFF' ? primaryHex : '#000000') : '#FFFFFF'
      f.file(`Digital (RGB)/SVG/${name}.svg`, svg)
      for (const w of [500, 1000, 2000]) f.file(`Digital (RGB)/PNG/${name}-${w}px.png`, await rasterize(svg, w))
      f.file(`Digital (RGB)/JPG/${name}-2000px.jpg`, await rasterize(svg, 2000, { background: jpgBg, padding: 0, type: 'image/jpeg' }))

      const flat = flatten(svg)
      if (flat.issues.length) {
        // Fall back to the browser converter: still vector, but RGB only.
        printIssues.set(`${slot.label} (${vname})`, flat.issues)
        f.file(`Print/PDF RGB fallback/${name}.pdf`, await svgToPdf(svg))
        continue
      }
      f.file(`Print (CMYK)/PDF/${name}-cmyk.pdf`, toPdf(flat, b, 'cmyk', 500, `${b.name} ${slot.label}`))
      // EPS has no transparency, so artwork with see-through parts ships as PDF only.
      const eps = !flat.shapes.some((sh) => sh.opacity < 1)
      if (!eps) epsSkipped.push(`${slot.label} (${vname})`)
      if (eps) f.file(`Print (CMYK)/EPS/${name}-cmyk.eps`, toEps(flat, b, 'cmyk', 500, `${b.name} ${slot.label}`))
      if (vname !== 'black' && vname !== 'white' && hasSpot(flat, b)) {
        f.file(`Print (Pantone)/PDF/${name}-pantone.pdf`, toPdf(flat, b, 'spot', 500, `${b.name} ${slot.label}`))
        if (eps) f.file(`Print (Pantone)/EPS/${name}-pantone.eps`, toEps(flat, b, 'spot', 500, `${b.name} ${slot.label}`))
      }
    }
  }

  const mark: Logo | undefined = d.mark
  if (mark) {
    onProgress('Icons and favicons')
    const folderName = `${String(idx++).padStart(2, '0')} Icons and favicons`
    folders.push(folderName)
    const f = root.folder(folderName)!
    const favSvg = mark.svg
    const favs = await Promise.all([16, 32, 48].map(async (size) => ({ size, blob: await rasterize(favSvg, size, { height: size, padding: size >= 32 ? 1 : 0 }) })))
    favs.forEach((p) => f.file(`favicon-${p.size}.png`, p.blob))
    f.file('favicon.ico', await icoFile(favs))
    f.file('favicon.svg', favSvg)
    const onBrand = recolor(mark.svg, versionFor(mark.svg, primaryHex).version === 'black' ? '#000000' : '#FFFFFF')
    const iconSvg = versionFor(mark.svg, primaryHex).version === 'full' ? mark.svg : onBrand
    f.file('apple-touch-icon.png', await rasterize(iconSvg, 180, { height: 180, background: primaryHex, padding: 32 }))
    f.file('icon-192.png', await rasterize(iconSvg, 192, { height: 192, background: primaryHex, padding: 36 }))
    f.file('icon-512.png', await rasterize(iconSvg, 512, { height: 512, background: primaryHex, padding: 96 }))
    f.file('social-avatar-800.png', await rasterize(iconSvg, 800, { height: 800, background: primaryHex, padding: 190 }))
  }

  onProgress('Colours and tokens')
  const colorFolder = `${String(idx++).padStart(2, '0')} Colours and tokens`
  folders.push(colorFolder)
  const cf = root.folder(colorFolder)!
  cf.file(`${base}-palette-rgb.ase`, aseFile(b.colors.map((c) => ({ name: c.name, hex: normHex(c.hex) }))))
  cf.file(
    `${base}-palette-print.ase`,
    aseFile(
      b.colors.map((c) => ({
        name: c.pantone ? (/pantone/i.test(c.pantone) ? c.pantone : `PANTONE ${c.pantone}`) : c.name,
        hex: normHex(c.hex),
        cmyk: parseCmyk(c.cmyk) || estimateCmyk(c.hex),
        spot: !!c.pantone,
      })),
    ),
  )
  cf.file('tokens.css', tokensCss(b))
  cf.file('tokens.json', JSON.stringify(tokensJson(b), null, 2))
  cf.file(
    'tailwind-colors.js',
    `// Paste into theme.extend.colors in tailwind.config.js\nexport default ${JSON.stringify(Object.fromEntries(b.colors.map((c) => [slug(c.name), normHex(c.hex)])), null, 2)}\n`,
  )

  if (d.mark) {
    onProgress('Patterns')
    const pf = `${String(idx++).padStart(2, '0')} Patterns`
    folders.push(pf)
    for (const f of await patternFiles(b, d)) root.file(`${pf}/${f.name}`, f.data)
  }

  onProgress('Social media templates')
  const sf = `${String(idx++).padStart(2, '0')} Social media`
  folders.push(sf)
  for (const t of await socialTemplates(b, d)) root.file(`${sf}/${t.name}.png`, t.blob)

  if (d.mark) {
    onProgress('Email signature')
    const ef = `${String(idx++).padStart(2, '0')} Email signature`
    folders.push(ef)
    const ink = versionFor(d.mark.svg, '#FFFFFF').version
    const markSvg = ink === 'full' ? d.mark.svg : recolor(d.mark.svg, '#000000')
    const png = await rasterize(markSvg, 256, { height: 256, padding: 8 })
    const dataUrl = await new Promise<string>((res) => {
      const r = new FileReader()
      r.onload = () => res(r.result as string)
      r.readAsDataURL(png)
    })
    root.file(`${ef}/email-logo.png`, png)
    root.file(`${ef}/email-signature.html`, emailSignatureHtml(b, d, dataUrl))
  }

  const estimated = estimatedInks(LOGO_SLOTS.map((s) => b.logos[s.id]?.svg).filter((v): v is string => !!v), b)
  root.file('00 Read me.html', readme(b, folders, printIssues, estimated, epsSkipped))
  onProgress('Compressing')
  return zip.generateAsync({ type: 'blob' })
}

export function download(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}
