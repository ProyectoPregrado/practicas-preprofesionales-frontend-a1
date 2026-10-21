/** Parsea una fecha ISO como fecha local, no como medianoche UTC. */
export function parseLocalDate(value: string): Date {
  const [datePart] = value.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** «05 mar 2026»: una fecha `AAAA-MM-DD` (o con hora) como se lee en Ecuador. Si no se entiende, se devuelve tal cual. */
export function formatDate(value: string): string {
  const parsed = parseLocalDate(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'short', year: 'numeric' }).format(parsed)
}
