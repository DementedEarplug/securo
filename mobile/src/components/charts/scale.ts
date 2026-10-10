/** Map a value domain onto pixel space, padding the domain so zero is included. */
export function linearScale(values: number[], height: number, padding = 8) {
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  const span = max - min || 1
  const inner = height - padding * 2
  return (value: number) => padding + inner - ((value - min) / span) * inner
}
