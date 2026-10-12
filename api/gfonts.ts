import type { IncomingMessage, ServerResponse } from 'node:http'

// /__gfonts/css on Vercel (see vercel.json). Google Fonts only sends WOFF2 to browsers;
// asking with a plain user agent returns TrueType files, which the vector PDF export embeds.
export default async function gfonts(req: IncomingMessage, res: ServerResponse) {
  const query = (req.url ?? '').split('?')[1] ?? ''
  const r = await fetch(`https://fonts.googleapis.com/css?${query}`, { headers: { 'User-Agent': 'Marque' } })
  res.statusCode = r.status
  res.setHeader('Content-Type', r.headers.get('content-type') ?? 'text/css')
  if (r.ok) res.setHeader('Cache-Control', 'public, max-age=86400')
  res.end(await r.text())
}
