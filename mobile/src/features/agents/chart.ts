// Assistant replies can embed a chart as a ```securo-chart fenced JSON block
// (see frontend/src/components/agents/agent-chart.tsx for the format):
//   { type: "line"|"bar"|"area"|"pie", title?, subtitle?, currency?, data, series? }

/** Same palette as the web's in-chat charts. */
export const CHART_PALETTE = ['#6366F1', '#10B981', '#F59E0B', '#F43F5E', '#8B5CF6', '#06B6D4', '#EC4899', '#84CC16']

export interface ChartSeries {
  key: string
  name: string
  color: string
  values: number[]
}

export type ChartModel =
  | { type: 'line' | 'bar' | 'area'; title?: string; subtitle?: string; currency?: string; labels: string[]; series: ChartSeries[] }
  | { type: 'pie'; title?: string; subtitle?: string; currency?: string; slices: { name: string; value: number; color: string }[] }

const asNumber = (value: unknown): number => {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}
const optionalText = (value: unknown): string | undefined => (typeof value === 'string' && value ? value : undefined)

/**
 * Validate and normalize a chart block. Returns null when it isn't a chart we
 * can draw, so the caller can show the raw JSON instead (like the web does).
 */
export function parseChart(raw: string): ChartModel | null {
  let spec: unknown
  try {
    spec = JSON.parse(raw)
  } catch {
    return null
  }
  if (!spec || typeof spec !== 'object') return null
  const { type, data, series } = spec as { type?: unknown; data?: unknown; series?: unknown }
  if (type !== 'line' && type !== 'bar' && type !== 'area' && type !== 'pie') return null
  if (!Array.isArray(data)) return null
  const rows = data.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
  const meta = {
    title: optionalText((spec as { title?: unknown }).title),
    subtitle: optionalText((spec as { subtitle?: unknown }).subtitle),
    currency: optionalText((spec as { currency?: unknown }).currency),
  }

  if (type === 'pie') {
    return {
      type,
      ...meta,
      slices: rows.map((row, i) => ({
        name: String(row.name ?? row.x ?? row.label ?? `#${i + 1}`),
        value: asNumber(row.value ?? row.y),
        color: CHART_PALETTE[i % CHART_PALETTE.length]!,
      })),
    }
  }

  const specs =
    Array.isArray(series) && series.length > 0
      ? series.filter((s): s is { key: string; name?: unknown; color?: unknown } => Boolean(s) && typeof s.key === 'string')
      : [{ key: 'y' }]
  return {
    type,
    ...meta,
    labels: rows.map((row) => String(row.x ?? '')),
    series: specs.map((s, i) => ({
      key: s.key,
      name: optionalText((s as { name?: unknown }).name) ?? s.key,
      color: optionalText((s as { color?: unknown }).color) ?? CHART_PALETTE[i % CHART_PALETTE.length]!,
      values: rows.map((row) => asNumber(row[s.key])),
    })),
  }
}
