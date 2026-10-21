import type { LocalHourLog } from '@/offline/db'

export interface WeekDay {
  /** Fecha del día, `AAAA-MM-DD`. */
  key: string
  label: string
  approved: number
  submitted: number
  isToday: boolean
}

export interface WeekSummary {
  days: WeekDay[]
  /** Horas aprobadas y enviadas de toda la semana. */
  total: number
}

const LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const pad = (value: number): string => String(value).padStart(2, '0')
const keyOf = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

/**
 * Horas por día de la semana (lunes a domingo) que contiene `today`. Cuentan las aprobadas y las enviadas; los
 * rechazados y borradores no suman. Las fechas pueden venir con hora (`2026-04-07T00:00:00.000Z`), como las que
 * sincroniza el servidor: solo importa el día.
 */
export function weekHours(logs: LocalHourLog[] | undefined, today: Date): WeekSummary {
  const sinceMonday = (today.getDay() + 6) % 7
  const days: WeekDay[] = LABELS.map((label, index) => ({
    key: keyOf(new Date(today.getFullYear(), today.getMonth(), today.getDate() - sinceMonday + index)),
    label,
    approved: 0,
    submitted: 0,
    isToday: index === sinceMonday,
  }))
  const byKey = new Map(days.map((day) => [day.key, day]))

  for (const log of logs ?? []) {
    const day = byKey.get(log.date.split('T')[0])
    if (!day) continue
    if (log.status === 'APPROVED') day.approved += log.hours
    if (log.status === 'SUBMITTED') day.submitted += log.hours
  }

  const total = days.reduce((sum, day) => sum + day.approved + day.submitted, 0)
  return { days, total }
}
