import type { Brand, Logo } from '../types'
import type { Derived } from './derive'
import { versionFor } from './derive'
import { inkOn, normHex } from './color'
import { outlined, rasterize, recolor, svgUrl, viewBox } from './svg'

/** Place a logo SVG inside another SVG as a nested, still-vector element. */
function nest(svg: string, x: number, y: number, w: number, h: number) {
  const body = svg.replace(/^[\s\S]*?<svg/, '<svg')
  const open = body.match(/^<svg[^>]*>/)![0]
  const clean = open.replace(/\s(x|y|width|height|preserveAspectRatio)="[^"]*"/g, '')
  return body.replace(open, clean.replace('<svg', `<svg x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"`))
}

/** Seamless pattern tile, vector. */
export function patternTile(mark: Logo, style: 'grid' | 'offset' | 'outline', ink: string, bg?: string) {
  const [, , w, h] = viewBox(mark.svg)
  const s = 100
  const mw = w >= h ? s : (s * w) / h
  const mh = w >= h ? (s * h) / w : s
  const T = s * 1.9
  const art = style === 'outline' ? outlined(mark.svg, ink, 1.2) : recolor(mark.svg, ink)
  const cells =
    style === 'offset'
      ? [nest(art, (T - mw) / 2, (T - mh) / 2, mw, mh), nest(art, -mw / 2, T + (T - mh) / 2, mw, mh), nest(art, T - mw / 2, T + (T - mh) / 2, mw, mh)]
      : [nest(art, (T - mw) / 2, (T - mh) / 2, mw, mh)]
  const H = style === 'offset' ? T * 2 : T
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${T} ${H}" width="${T}" height="${H}">${bg ? `<rect width="${T}" height="${H}" fill="${bg}"/>` : ''}${cells.join('')}</svg>`
}

function loadImg(src: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.src = src
  return img.decode().then(() => img)
}

function toPng(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('PNG export failed'))), 'image/png'))
}

async function drawLogo(ctx: CanvasRenderingContext2D, logo: Logo, bg: string, x: number, y: number, w: number, h: number, align: 'left' | 'center' = 'left') {
  const svg = logo.svg
  const v = versionFor(svg, bg).version
  const art = v === 'full' ? svg : recolor(svg, v === 'white' ? '#FFFFFF' : '#000000')
  const [, , vw, vh] = viewBox(art)
  const k = Math.min(w / vw, h / vh)
  const img = await loadImg(URL.createObjectURL(await rasterize(art, Math.round(vw * k * 2), { height: Math.round(vh * k * 2) })))
  const dw = vw * k
  ctx.drawImage(img, align === 'left' ? x : x + (w - dw) / 2, y + (h - vh * k) / 2, dw, vh * k)
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/)
  const out: string[] = []
  let line = ''
  for (const w of words) {
    const t = line ? `${line} ${w}` : w
    if (ctx.measureText(t).width > maxW && line) {
      out.push(line)
      line = w
    } else line = t
  }
  if (line) out.push(line)
  return out
}

/** Social templates rendered on canvas with the brand's real fonts. */
export async function socialTemplates(b: Brand, d: Derived): Promise<{ name: string; blob: Blob }[]> {
  const head = d.heading?.family ? `"${d.heading.family}", sans-serif` : 'sans-serif'
  await document.fonts.load(`700 80px ${head}`).catch(() => undefined)
  const formats = [
    { name: 'instagram-post-1080x1080', w: 1080, h: 1080, bg: d.primary, kind: 'post' },
    { name: 'instagram-story-1080x1920', w: 1080, h: 1920, bg: d.dark, kind: 'story' },
    { name: 'linkedin-banner-1584x396', w: 1584, h: 396, bg: d.primary, kind: 'banner' },
    { name: 'x-header-1500x500', w: 1500, h: 500, bg: d.dark, kind: 'banner' },
    { name: 'facebook-cover-1640x624', w: 1640, h: 624, bg: d.primary, kind: 'banner' },
  ]
  const out: { name: string; blob: Blob }[] = []
  for (const f of formats) {
    const c = document.createElement('canvas')
    c.width = f.w
    c.height = f.h
    const x = c.getContext('2d')!
    x.fillStyle = f.bg
    x.fillRect(0, 0, f.w, f.h)
    const ink = inkOn(f.bg)
    if (d.mark && b.pattern !== 'none') {
      // Oversized mark bleeding off the right edge, as in the guidelines.
      const art = recolor(d.mark.svg, ink)
      const [, , vw, vh] = viewBox(art)
      const H = Math.max(f.h, f.w * 0.6) * 1.3
      const W = (H * vw) / vh
      const img = await loadImg(svgUrl(art.replace('<svg', `<svg width="${vw}" height="${vh}"`)))
      x.globalAlpha = Math.min(1, b.patternOpacity * 1.1)
      x.drawImage(img, f.w - W * 0.62, f.h - H * 0.72, W, H)
      x.globalAlpha = 1
    }
    const m = Math.round(Math.min(f.w, f.h) * (f.kind === 'banner' ? 0.16 : 0.08))
    x.fillStyle = ink
    if (f.kind === 'story') {
      if (d.mark) await drawLogo(x, d.mark, f.bg, 0, f.h * 0.16, f.w, 140, 'center')
      x.font = `700 96px ${head}`
      x.textAlign = 'center'
      wrap(x, b.tagline || b.name, f.w - 200).forEach((l, i, a) => x.fillText(l, f.w / 2, f.h / 2 - ((a.length - 1) * 104) / 2 + i * 104))
      x.font = `500 34px ${head}`
      x.globalAlpha = 0.8
      x.fillText(b.website, f.w / 2, f.h * 0.78)
      x.globalAlpha = 1
    } else if (f.kind === 'post') {
      if (d.mainLogo) await drawLogo(x, d.mainLogo, f.bg, m, m, f.w * 0.42, 90)
      x.font = `700 92px ${head}`
      x.textAlign = 'left'
      const ls = wrap(x, b.tagline || b.name, f.w * 0.72)
      ls.forEach((l, i) => x.fillText(l, m, f.h - m - 60 - (ls.length - 1 - i) * 100))
      x.font = `500 30px ${head}`
      x.globalAlpha = 0.8
      x.fillText(b.website, m, f.h - m)
      x.globalAlpha = 1
    } else {
      // Keep the logo in the centre-left where profile pictures don't cover it.
      if (d.mainLogo) await drawLogo(x, d.mainLogo, f.bg, f.w * 0.34, f.h * 0.39, f.w * 0.32, f.h * 0.22, 'center')
    }
    out.push({ name: f.name, blob: await toPng(c) })
  }
  return out
}

/** Pattern backgrounds at 1920×1080 on each main colour, plus vector tiles. */
export async function patternFiles(b: Brand, d: Derived): Promise<{ name: string; data: Blob | string }[]> {
  if (!d.mark) return []
  const out: { name: string; data: Blob | string }[] = []
  for (const style of ['grid', 'offset', 'outline'] as const) {
    out.push({ name: `tile-${style}-${b.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.svg`, data: patternTile(d.mark, style, d.primary) })
  }
  for (const [label, bg] of [
    ['brand', d.primary],
    ['dark', d.dark],
    ['light', d.light],
  ] as const) {
    const ink = inkOn(bg)
    const tile = patternTile(d.mark, 'grid', ink)
    const [, , tw, th] = viewBox(tile)
    const W = 1920
    const H = 1080
    const t = 160
    const cells: string[] = []
    for (let yy = 0; yy < H; yy += (t * th) / tw) for (let xx = 0; xx < W; xx += t) cells.push(nest(tile, xx, yy, t, (t * th) / tw))
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${normHex(bg)}"/><g opacity="${Math.min(0.4, b.patternOpacity * 1.5)}">${cells.join('')}</g></svg>`
    out.push({ name: `background-${label}-1920x1080.png`, data: await rasterize(svg, W, { height: H }) })
  }
  return out
}

/** Email signature as table-based HTML that survives Gmail, Outlook and Apple Mail. */
export function emailSignatureHtml(b: Brand, d: Derived, logoUrl: string) {
  const p = b.person
  const c = d.primary
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(b.name)} email signature</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;padding:24px">
<p style="color:#777;font-size:13px">Open this file in your browser, select the signature below, copy it and paste it into your email app's signature settings. Replace the logo URL with a hosted copy of <b>email-logo.png</b> for best results.</p>
<hr style="border:0;border-top:1px solid #eee;margin:16px 0 24px">
<table cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,Helvetica,sans-serif;color:#222">
<tr>
<td style="padding-right:16px;vertical-align:middle"><img src="${logoUrl}" width="64" height="64" alt="${esc(b.name)}" style="display:block;border:0"></td>
<td style="border-left:3px solid ${c};padding-left:16px;vertical-align:middle">
<div style="font-size:16px;font-weight:bold;color:${c}">${esc(p.name || 'Your Name')}</div>
<div style="font-size:12px;color:#666;padding-bottom:6px">${esc(p.title)}${p.title ? ' · ' : ''}${esc(b.client || b.name)}</div>
<div style="font-size:12px;color:#444">${esc(p.phone || b.contactPhone)}${(p.phone || b.contactPhone) && (p.email || b.contactEmail) ? ' &nbsp;|&nbsp; ' : ''}<a href="mailto:${esc(p.email || b.contactEmail)}" style="color:#444;text-decoration:none">${esc(p.email || b.contactEmail)}</a></div>
${b.website ? `<div style="font-size:12px"><a href="https://${esc(b.website.replace(/^https?:\/\//, ''))}" style="color:${c};text-decoration:none">${esc(b.website)}</a></div>` : ''}
</td></tr></table>
</body></html>`
}
