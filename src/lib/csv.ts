export type CsvCell = string | number | null | undefined

// Una celda que empieza así la ejecuta Excel o Sheets como fórmula («=HYPERLINK(...)» escrito en una actividad).
const FORMULA_START = /^[=+\-@\t\r]/

function escapeCell(cell: CsvCell): string {
  if (cell === null || cell === undefined) return ''
  if (typeof cell === 'number') return Number.isFinite(cell) ? String(cell) : ''
  const safe = FORMULA_START.test(cell) ? `'${cell}` : cell
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

/**
 * CSV de RFC 4180: coma, comillas dobles y saltos CRLF. Empieza con BOM para que Excel lo abra como UTF-8 y no
 * rompa las tildes.
 */
export function toCsv(rows: CsvCell[][]): string {
  return `\uFEFF${rows.map((row) => row.map(escapeCell).join(',')).join('\r\n')}\r\n`
}

/** «horas-estudiante-22-2026-10-21.csv»: nombre seguro para cualquier sistema, con la fecha del día. */
export function csvFilename(parts: (string | number)[], today = new Date()): string {
  const day = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-')
  const slug = parts
    .map((part) =>
      String(part)
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, ''),
    )
    .filter(Boolean)
    .join('-')
  return `${slug}-${day}.csv`
}

/** Descarga el CSV en el navegador. No toca la red: sale de lo que ya está en pantalla (o en este dispositivo). */
export function downloadCsv(filename: string, rows: CsvCell[][]): void {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Algunos navegadores leen la URL después del click: se libera en el siguiente turno.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
