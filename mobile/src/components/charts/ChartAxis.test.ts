import { axisTicks } from './ChartAxis'

describe('axisTicks', () => {
  it('shows a handful of labels for a long daily series, inside the chart', () => {
    const ticks = axisTicks(180, 340, 'edges')
    expect(ticks.length).toBeLessThanOrEqual(6)
    expect(ticks[0]).toEqual({ index: 0, left: 0 })
    for (const t of ticks) {
      expect(t.left).toBeGreaterThanOrEqual(0)
      expect(t.left).toBeLessThanOrEqual(340 - 64)
    }
  })

  it('never lets two labels touch, even after the edge ones shift inwards', () => {
    for (const [count, width] of [[180, 340], [30, 340], [12, 200], [90, 380]] as const) {
      const ticks = axisTicks(count, width, 'edges')
      ticks.slice(1).forEach((t, i) => expect(t.left - ticks[i]!.left).toBeGreaterThanOrEqual(68))
    }
  })

  it('labels every point when they fit', () => {
    expect(axisTicks(4, 340, 'centers').map((t) => t.index)).toEqual([0, 1, 2, 3])
  })

  it('never overlaps on a narrow chart', () => {
    const ticks = axisTicks(12, 200, 'centers')
    expect(ticks.length).toBeLessThanOrEqual(3)
  })

  it('handles empty and unmeasured charts', () => {
    expect(axisTicks(0, 300, 'edges')).toEqual([])
    expect(axisTicks(10, 0, 'edges')).toEqual([])
  })
})
