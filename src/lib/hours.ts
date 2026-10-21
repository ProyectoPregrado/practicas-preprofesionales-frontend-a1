import type { LocalHourLog } from '@/offline/db'

export interface HoursSummary {
  approvedHours: number
  submittedHours: number
  requiredHours: number
  /** Porcentaje aprobado, acotado a 100. */
  approvedPct: number
  /** Porcentaje enviado sin aprobar, acotado a lo que sobra tras el aprobado. */
  submittedPct: number
}

/** Suma las horas de un libro y las traduce a los porcentajes de la barra. */
export function summarizeHours(
  logs: LocalHourLog[] | undefined,
  requiredHours: number,
): HoursSummary {
  let approvedHours = 0
  let submittedHours = 0
  for (const log of logs ?? []) {
    if (log.status === 'APPROVED') approvedHours += log.hours
    if (log.status === 'SUBMITTED') submittedHours += log.hours
  }
  const approvedPct = requiredHours > 0 ? Math.min(100, (approvedHours / requiredHours) * 100) : 0
  const submittedPct =
    requiredHours > 0 ? Math.min(100 - approvedPct, (submittedHours / requiredHours) * 100) : 0
  return { approvedHours, submittedHours, requiredHours, approvedPct, submittedPct }
}

/**
 * Promedio de horas de los días en que sí hubo registros (aprobados o enviados), no de todos los días del calendario.
 * `null` si no hay ninguno: un 0 diría que se trabajó cero horas por día.
 */
export function averagePerRegisteredDay(logs: LocalHourLog[] | undefined): number | null {
  const hoursByDay = new Map<string, number>()
  for (const log of logs ?? []) {
    if (log.status !== 'APPROVED' && log.status !== 'SUBMITTED') continue
    const day = log.date.split('T')[0]
    hoursByDay.set(day, (hoursByDay.get(day) ?? 0) + log.hours)
  }
  if (hoursByDay.size === 0) return null
  const total = [...hoursByDay.values()].reduce((sum, hours) => sum + hours, 0)
  return total / hoursByDay.size
}
