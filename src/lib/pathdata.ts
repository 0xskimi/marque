/** SVG path data normalised to absolute M / L / C / Z segments. */
export type Seg =
  | { type: 'M'; x: number; y: number }
  | { type: 'L'; x: number; y: number }
  | { type: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number; arc?: { cx: number; cy: number; r: number } }
  | { type: 'Z' }

const PARAMS: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 }

function tokenize(d: string): (string | number)[] {
  const out: (string | number)[] = []
  const re = /([MmLlHhVvCcSsQqTtAaZz])|([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(d))) out.push(m[1] ?? parseFloat(m[2]))
  return out
}

export function parsePath(d: string): Seg[] {
  const t = tokenize(d)
  const segs: Seg[] = []
  let i = 0
  let cmd = ''
  let x = 0, y = 0, sx = 0, sy = 0
  let lcx = 0, lcy = 0 // last control point, for S/T reflection
  let lastType = ''
  const next = () => t[i++] as number

  while (i < t.length) {
    if (typeof t[i] === 'string') cmd = t[i++] as string
    else if (!cmd) { i++; continue }
    const lower = cmd.toLowerCase()
    const rel = cmd !== cmd.toUpperCase()
    if (lower === 'z') {
      segs.push({ type: 'Z' })
      x = sx; y = sy
      lastType = 'z'
      cmd = ''
      continue
    }
    if (i + PARAMS[lower] > t.length) break
    switch (lower) {
      case 'm': {
        x = (rel ? x : 0) + next(); y = (rel ? y : 0) + next()
        sx = x; sy = y
        segs.push({ type: 'M', x, y })
        cmd = rel ? 'l' : 'L' // implicit lineto after moveto
        break
      }
      case 'l':
        x = (rel ? x : 0) + next(); y = (rel ? y : 0) + next()
        segs.push({ type: 'L', x, y })
        break
      case 'h':
        x = (rel ? x : 0) + next()
        segs.push({ type: 'L', x, y })
        break
      case 'v':
        y = (rel ? y : 0) + next()
        segs.push({ type: 'L', x, y })
        break
      case 'c': {
        const ox = rel ? x : 0, oy = rel ? y : 0
        const x1 = ox + next(), y1 = oy + next(), x2 = ox + next(), y2 = oy + next()
        x = ox + next(); y = oy + next()
        segs.push({ type: 'C', x1, y1, x2, y2, x, y })
        lcx = x2; lcy = y2
        break
      }
      case 's': {
        const ox = rel ? x : 0, oy = rel ? y : 0
        const x1 = lastType === 'c' || lastType === 's' ? 2 * x - lcx : x
        const y1 = lastType === 'c' || lastType === 's' ? 2 * y - lcy : y
        const x2 = ox + next(), y2 = oy + next()
        x = ox + next(); y = oy + next()
        segs.push({ type: 'C', x1, y1, x2, y2, x, y })
        lcx = x2; lcy = y2
        break
      }
      case 'q': {
        const ox = rel ? x : 0, oy = rel ? y : 0
        const qx = ox + next(), qy = oy + next()
        const ex = ox + next(), ey = oy + next()
        segs.push(quad(x, y, qx, qy, ex, ey))
        lcx = qx; lcy = qy
        x = ex; y = ey
        break
      }
      case 't': {
        const ox = rel ? x : 0, oy = rel ? y : 0
        const qx = lastType === 'q' || lastType === 't' ? 2 * x - lcx : x
        const qy = lastType === 'q' || lastType === 't' ? 2 * y - lcy : y
        const ex = ox + next(), ey = oy + next()
        segs.push(quad(x, y, qx, qy, ex, ey))
        lcx = qx; lcy = qy
        x = ex; y = ey
        break
      }
      case 'a': {
        const rx = next(), ry = next(), rot = next(), large = next(), sweep = next()
        const ex = (rel ? x : 0) + next(), ey = (rel ? y : 0) + next()
        segs.push(...arcToCubics(x, y, rx, ry, rot, !!large, !!sweep, ex, ey))
        x = ex; y = ey
        break
      }
    }
    lastType = lower
  }
  return segs
}

function quad(x0: number, y0: number, qx: number, qy: number, x: number, y: number): Seg {
  return {
    type: 'C',
    x1: x0 + (2 / 3) * (qx - x0), y1: y0 + (2 / 3) * (qy - y0),
    x2: x + (2 / 3) * (qx - x), y2: y + (2 / 3) * (qy - y),
    x, y,
  }
}

/** Endpoint-parameterised arc to cubic Béziers (SVG spec, appendix F.6). */
function arcToCubics(x1: number, y1: number, rx: number, ry: number, rotDeg: number, large: boolean, sweep: boolean, x2: number, y2: number): Seg[] {
  if (rx === 0 || ry === 0) return [{ type: 'L', x: x2, y: y2 }]
  if (x1 === x2 && y1 === y2) return []
  rx = Math.abs(rx); ry = Math.abs(ry)
  const phi = (rotDeg * Math.PI) / 180
  const cos = Math.cos(phi), sin = Math.sin(phi)
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2
  const x1p = cos * dx + sin * dy
  const y1p = -sin * dx + cos * dy
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
  if (lambda > 1) { rx *= Math.sqrt(lambda); ry *= Math.sqrt(lambda) }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
  let coef = Math.sqrt(Math.max(0, num / den))
  if (large === sweep) coef = -coef
  const cxp = (coef * rx * y1p) / ry
  const cyp = (-coef * ry * x1p) / rx
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
    return a
  }
  const th1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
  let dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
  if (!sweep && dth > 0) dth -= 2 * Math.PI
  if (sweep && dth < 0) dth += 2 * Math.PI
  const n = Math.max(1, Math.ceil(Math.abs(dth) / (Math.PI / 2) - 1e-9))
  const step = dth / n
  const k = (4 / 3) * Math.tan(step / 4)
  const circle = Math.abs(rx - ry) < Math.max(rx, ry) * 1e-3 ? { cx, cy, r: rx } : undefined
  const out: Seg[] = []
  const pt = (t: number) => ({
    x: cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin,
    y: cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos,
  })
  const deriv = (t: number) => ({
    x: -rx * Math.sin(t) * cos - ry * Math.cos(t) * sin,
    y: -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos,
  })
  let t = th1
  for (let s = 0; s < n; s++) {
    const t2 = t + step
    const p1 = pt(t), p2 = pt(t2), d1 = deriv(t), d2 = deriv(t2)
    const end = s === n - 1 ? { x: x2, y: y2 } : p2
    out.push({ type: 'C', x1: p1.x + k * d1.x, y1: p1.y + k * d1.y, x2: p2.x - k * d2.x, y2: p2.y - k * d2.y, x: end.x, y: end.y, arc: circle })
    t = t2
  }
  return out
}
