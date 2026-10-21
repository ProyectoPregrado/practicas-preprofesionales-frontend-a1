import type { LocalHourLog } from '@/offline/db'

export type StatusFilter = 'ALL' | 'APPROVED' | 'SUBMITTED' | 'REJECTED' | 'DRAFT'

export interface HourLogFilters {
  status: StatusFilter
  query: string
  /** Mes `AAAA-MM`; vacío para todos. */
  month: string
}

export const NO_FILTERS: HourLogFilters = { status: 'ALL', query: '', month: '' }

const dayOf = (log: LocalHourLog): string => log.date.split('T')[0]

// Sin tildes ni mayúsculas: «optimizacion» encuentra «Optimización».
const normalize = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

export function hasActiveFilters({ status, query, month }: HourLogFilters): boolean {
  return status !== 'ALL' || query.trim() !== '' || month !== ''
}

/** Aplica los tres filtros a la vez (deben cumplirse todos) sin tocar el arreglo original. */
export function filterHourLogs(logs: LocalHourLog[], { status, query, month }: HourLogFilters): LocalHourLog[] {
  const needle = normalize(query.trim())
  return logs.filter((log) => {
    if (status !== 'ALL' && log.status !== status) return false
    if (month && !dayOf(log).startsWith(month)) return false
    return needle === '' || normalize(`${log.activity} ${dayOf(log)}`).includes(needle)
  })
}

/** Total y cantidad por estado, para los números de los botones de filtro. */
export function countByStatus(logs: LocalHourLog[]): Record<StatusFilter, number> {
  const counts: Record<StatusFilter, number> = { ALL: logs.length, APPROVED: 0, SUBMITTED: 0, REJECTED: 0, DRAFT: 0 }
  for (const log of logs) counts[log.status] += 1
  return counts
}

/** Meses `AAAA-MM` con registros, del más reciente al más antiguo. */
export function monthsOf(logs: LocalHourLog[]): string[] {
  return [...new Set(logs.map((log) => dayOf(log).slice(0, 7)))].sort().reverse()
}
