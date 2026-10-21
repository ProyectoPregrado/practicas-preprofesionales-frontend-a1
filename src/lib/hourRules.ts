import { db } from '@/offline/db'

// E6-01 / D-06: Regla de horas unificada con el backend (hour-rules.ts).
// La coordinación definió el tope: 8 horas por día, sumando todos los registros
// del estudiante en esa fecha, con mínimo 0.5 horas por registro.
export const MIN_HOURS_PER_LOG = 0.5
export const MAX_HOURS_PER_DAY = 8

export function hoursRangeMessage(): string {
  return `Las horas de un registro deben estar entre ${MIN_HOURS_PER_LOG} y ${MAX_HOURS_PER_DAY}`
}

export function hoursRangeError(hours: number): string | null {
  return hours >= MIN_HOURS_PER_LOG && hours <= MAX_HOURS_PER_DAY ? null : hoursRangeMessage()
}

export function timeOrderError(startTime: string, endTime: string): string | null {
  if (!startTime || !endTime) return null
  return startTime < endTime ? null : 'La hora de fin debe ser posterior a la de inicio'
}

/**
 * Valida un registro de horas considerando horas por registro, orden temporal y tope diario.
 * Retorna null si es válido o un string con el mensaje de error.
 */
export function validateHourEntry(
  hours: string | number,
  startTime: string,
  endTime: string,
  alreadyHours = 0,
  date = '',
): string | null {
  const hoursValue = typeof hours === 'number' ? hours : Number(hours)
  if (!hours || Number.isNaN(hoursValue)) {
    return 'Ingresa un número de horas válido'
  }

  if (hoursValue < MIN_HOURS_PER_LOG) {
    return hoursRangeMessage()
  }

  const timeErr = timeOrderError(startTime, endTime)
  if (timeErr) {
    return timeErr
  }

  const total = alreadyHours + hoursValue
  if (total > MAX_HOURS_PER_DAY) {
    return alreadyHours > 0
      ? `No puedes registrar más de ${MAX_HOURS_PER_DAY} horas en un mismo día (ya tienes ${alreadyHours} registradas el ${date})`
      : `No puedes registrar más de ${MAX_HOURS_PER_DAY} horas en un mismo día`
  }

  return null
}

export function normalizeDateKey(date: string): string {
  if (!date) return ''
  return date.split('T')[0]
}

export function isSameDay(dateA: string, dateB: string): boolean {
  if (!dateA || !dateB) return false
  return normalizeDateKey(dateA) === normalizeDateKey(dateB)
}

/**
 * Obtiene la suma de horas ya registradas en la base local (Dexie) para una fecha y placement,
 * ignorando registros con estado REJECTED y opcionalmente excluyendo un registro en edición.
 * Normaliza las fechas para que registros sincronizados con timestamp ISO ("YYYY-MM-DDT00:00:00.000Z")
 * coincidan correctamente con la fecha seleccionada ("YYYY-MM-DD").
 */
export async function getDailyRegisteredHours(
  placementId: number,
  date: string,
  excludeLogId?: number,
): Promise<number> {
  if (!placementId || !date) return 0
  const targetKey = normalizeDateKey(date)
  const logs = await db.hourLogs
    .where('placementId')
    .equals(placementId)
    .and((log) => {
      const isDateMatch = isSameDay(log.date, targetKey)
      const isNotRejected = log.status !== 'REJECTED'
      const isNotExcluded = excludeLogId === undefined || log.id !== excludeLogId
      return isDateMatch && isNotRejected && isNotExcluded
    })
    .toArray()
  return logs.reduce((sum, log) => sum + (Number(log.hours) || 0), 0)
}
