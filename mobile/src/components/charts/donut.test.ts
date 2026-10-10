import { stackGroup } from './BarChart'
import { arcPath, donutArcs } from './donut'

const g = { cx: 100, cy: 100, r: 100, inner: 60 }

describe('donutArcs', () => {
  it('shares the circle by value and skips empty values', () => {
    const arcs = donutArcs([1, 0, 3], g)
    expect(arcs.map((a) => a.index)).toEqual([0, 2])
    expect(arcs[0]!.share).toBeCloseTo(0.25)
    expect(arcs[0]!.end).toBeCloseTo(Math.PI / 2)
    expect(arcs[1]!.start).toBeCloseTo(Math.PI / 2)
    expect(arcs[1]!.end).toBeCloseTo(Math.PI * 2)
  })

  it('draws nothing for an empty total', () => {
    expect(donutArcs([0, 0], g)).toEqual([])
  })

  it('starts at 12 o’clock and uses the large-arc flag past half a turn', () => {
    expect(arcPath(g, 0, Math.PI / 2)).toMatch(/^M100\.00,0\.00 A100,100 0 0 1 200\.00,100\.00/)
    expect(arcPath(g, 0, Math.PI * 1.5)).toContain(' 0 1 1 ')
  })

  it('draws a full ring as two halves so it is not empty', () => {
    expect(arcPath(g, 0, Math.PI * 2).match(/M/g)).toHaveLength(2)
  })
})

describe('stackGroup', () => {
  it('stacks positives up and negatives down from zero', () => {
    expect(stackGroup([10, 5, -3, 2])).toEqual([
      { from: 0, to: 10 },
      { from: 10, to: 15 },
      { from: 0, to: -3 },
      { from: 15, to: 17 },
    ])
  })
})
