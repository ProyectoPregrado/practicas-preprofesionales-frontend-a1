import { parseLocalDate } from '@/lib/date'
import type { WeekSummary } from '@/lib/weekHours'

// Tope de horas por día (E6-01): la altura de una barra llena equivale a un día completo.
const FULL_DAY_HOURS = 8

const dayMonth = new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'short' })

const heightOf = (hours: number): string => `${Math.min(100, (hours / FULL_DAY_HOURS) * 100)}%`

/** Horas de la semana en curso, día por día: lo aprobado en azul y lo que espera revisión en café. */
export function WeeklyHoursChart({ week }: { week: WeekSummary }) {
  const first = week.days[0]
  const last = week.days[week.days.length - 1]

  return (
    <section aria-label="Horas de esta semana" className="rounded-2xl bg-surface p-5 shadow-[0_2px_12px_hsl(var(--scrim)/0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-15 font-bold text-ink">Horas de esta semana</h3>
          <p className="text-12 text-inkSoft">
            Del {dayMonth.format(parseLocalDate(first.key))} al {dayMonth.format(parseLocalDate(last.key))}
          </p>
        </div>
        <span className="font-display text-15 font-bold text-stamp">{week.total.toFixed(1)} h</span>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-2">
        {week.days.map((day) => (
          <div key={day.key} className="flex flex-col items-center gap-2">
            <div
              role="img"
              aria-label={`${day.label} ${dayMonth.format(parseLocalDate(day.key))}${day.isToday ? ' (hoy)' : ''}: ${day.approved.toFixed(1)} h aprobadas, ${day.submitted.toFixed(1)} h sin revisar`}
              className="flex h-28 w-full flex-col-reverse gap-0.5 rounded-lg bg-soft p-1"
            >
              <span className="block w-full rounded-md bg-stamp" style={{ height: heightOf(day.approved) }} />
              <span className="block w-full rounded-md bg-dotPending" style={{ height: heightOf(day.submitted) }} />
            </div>
            <span className={day.isToday ? 'text-11 font-bold text-dotPending' : 'text-11 font-semibold text-inkSoft'}>
              {day.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
