export interface DonutGeometry {
  cx: number
  cy: number
  /** Outer radius. */
  r: number
  /** Inner radius (the hole). */
  inner: number
}

export interface DonutArc {
  index: number
  /** Angles in radians, clockwise from 12 o'clock. */
  start: number
  end: number
  share: number
  path: string
}

const TAU = Math.PI * 2

function point(cx: number, cy: number, radius: number, angle: number): string {
  return `${(cx + radius * Math.sin(angle)).toFixed(2)},${(cy - radius * Math.cos(angle)).toFixed(2)}`
}

/** An annulus sector from `start` to `end` (radians, clockwise from the top). */
export function arcPath(g: DonutGeometry, start: number, end: number): string {
  // A full ring can't be one arc (its ends meet); draw it as two halves.
  if (end - start >= TAU - 1e-6) {
    const mid = start + Math.PI
    return `${arcPath(g, start, mid)} ${arcPath(g, mid, start + TAU)}`
  }
  const large = end - start > Math.PI ? 1 : 0
  return [
    `M${point(g.cx, g.cy, g.r, start)}`,
    `A${g.r},${g.r} 0 ${large} 1 ${point(g.cx, g.cy, g.r, end)}`,
    `L${point(g.cx, g.cy, g.inner, end)}`,
    `A${g.inner},${g.inner} 0 ${large} 0 ${point(g.cx, g.cy, g.inner, start)}`,
    'Z',
  ].join(' ')
}

/**
 * One arc per positive value, in order, sharing the full circle by value.
 * Zero or negative values get no arc (their share is 0).
 */
export function donutArcs(values: number[], g: DonutGeometry): DonutArc[] {
  const total = values.reduce((sum, v) => sum + Math.max(0, v), 0)
  if (total <= 0) return []
  const arcs: DonutArc[] = []
  let angle = 0
  values.forEach((value, index) => {
    if (value <= 0) return
    const share = value / total
    const end = angle + share * TAU
    arcs.push({ index, start: angle, end, share, path: arcPath(g, angle, end) })
    angle = end
  })
  return arcs
}
