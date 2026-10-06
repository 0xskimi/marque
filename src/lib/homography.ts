/**
 * CSS matrix3d that maps a w×h box (origin top-left) onto four points:
 * top-left, top-right, bottom-right, bottom-left. Use with transform-origin: 0 0.
 */
export function quadTransform(w: number, h: number, q: [number, number][]): string {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q
  const dx1 = x1 - x2
  const dx2 = x3 - x2
  const dx3 = x0 - x1 + x2 - x3
  const dy1 = y1 - y2
  const dy2 = y3 - y2
  const dy3 = y0 - y1 + y2 - y3
  let g = 0
  let k = 0
  if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) {
    const den = dx1 * dy2 - dx2 * dy1 || 1e-9
    g = (dx3 * dy2 - dx2 * dy3) / den
    k = (dx1 * dy3 - dx3 * dy1) / den
  }
  const a = x1 - x0 + g * x1
  const b = x3 - x0 + k * x3
  const d = y1 - y0 + g * y1
  const e = y3 - y0 + k * y3
  const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, k / h, 0, 0, 1, 0, x0, y0, 0, 1]
  return `matrix3d(${m.map((n) => +n.toFixed(9)).join(',')})`
}

/** Aspect ratio (width / height) of a quad, averaged over opposite sides. */
export function quadAspect(q: [number, number][], scaleX = 1, scaleY = 1): number {
  const len = (a: [number, number], b: [number, number]) => Math.hypot((a[0] - b[0]) * scaleX, (a[1] - b[1]) * scaleY)
  const w = (len(q[0], q[1]) + len(q[3], q[2])) / 2
  const h = (len(q[0], q[3]) + len(q[1], q[2])) / 2
  return w / (h || 1)
}
