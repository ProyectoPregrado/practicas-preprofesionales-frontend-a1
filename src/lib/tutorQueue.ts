import type { LocalHourLog, LocalPlacement } from '@/offline/db'

/** Lo que el tutor necesita de cada practicante para decidir a quién revisar primero. */
export interface StudentProgress {
  placement: LocalPlacement
  approvedHours: number
  submittedHours: number
  /** Registros enviados que esperan la decisión del tutor. */
  submittedLogs: number
  /** Registros devueltos que el estudiante aún no corrige. */
  rejectedLogs: number
  /** Día `AAAA-MM-DD` del registro más reciente, o `null` si no hay ninguno. */
  lastLogDate: string | null
  /** Porcentaje aprobado de la meta, acotado a 100. */
  approvedPct: number
}

export function studentProgress(placement: LocalPlacement, logs: LocalHourLog[]): StudentProgress {
  let approvedHours = 0
  let submittedHours = 0
  let submittedLogs = 0
  let rejectedLogs = 0
  let lastLogDate: string | null = null
  for (const log of logs) {
    if (log.status === 'APPROVED') approvedHours += log.hours
    if (log.status === 'SUBMITTED') {
      submittedHours += log.hours
      submittedLogs += 1
    }
    if (log.status === 'REJECTED') rejectedLogs += 1
    const day = log.date.split('T')[0]
    if (lastLogDate === null || day > lastLogDate) lastLogDate = day
  }
  const { requiredHours } = placement
  const approvedPct = requiredHours > 0 ? Math.min(100, (approvedHours / requiredHours) * 100) : 0
  return { placement, approvedHours, submittedHours, submittedLogs, rejectedLogs, lastLogDate, approvedPct }
}

/**
 * Orden de la cola: primero quien tiene más horas esperando; entre quienes no esperan nada, el que va más atrasado.
 * El id desempata para que el orden no salte entre una sincronización y otra.
 */
export function sortByQueue(rows: StudentProgress[]): StudentProgress[] {
  return rows.slice().sort((a, b) => {
    if (a.submittedHours !== b.submittedHours) return b.submittedHours - a.submittedHours
    if (a.approvedPct !== b.approvedPct) return a.approvedPct - b.approvedPct
    return a.placement.id - b.placement.id
  })
}

export interface QueueSummary {
  students: number
  /** Practicantes con al menos un registro sin revisar. */
  waiting: number
  pendingHours: number
  pendingLogs: number
  /** Promedio del porcentaje aprobado; `null` sin practicantes (un 0 % diría que nadie avanzó). */
  averagePct: number | null
}

export function queueSummary(rows: StudentProgress[]): QueueSummary {
  let waiting = 0
  let pendingHours = 0
  let pendingLogs = 0
  let pctTotal = 0
  for (const row of rows) {
    if (row.submittedLogs > 0) waiting += 1
    pendingHours += row.submittedHours
    pendingLogs += row.submittedLogs
    pctTotal += row.approvedPct
  }
  return {
    students: rows.length,
    waiting,
    pendingHours,
    pendingLogs,
    averagePct: rows.length > 0 ? pctTotal / rows.length : null,
  }
}
