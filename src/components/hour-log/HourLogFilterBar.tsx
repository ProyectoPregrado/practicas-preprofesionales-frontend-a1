import { Search } from 'lucide-react'
import { parseLocalDate } from '@/lib/date'
import type { HourLogFilters, StatusFilter } from '@/lib/hourLogFilters'
import { cn } from '@/lib/utils'

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'ALL', label: 'Todos' },
  { value: 'APPROVED', label: 'Aprobadas' },
  { value: 'SUBMITTED', label: 'En revisión' },
  { value: 'REJECTED', label: 'Rechazadas' },
  { value: 'DRAFT', label: 'Borradores' },
]

const monthNameFormatter = new Intl.DateTimeFormat('es-EC', { month: 'long' })

/** «2026-04» → «Abril 2026» (es-EC escribiría «abril de 2026»). */
function monthLabel(month: string): string {
  const date = parseLocalDate(`${month}-01`)
  const name = monthNameFormatter.format(date)
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${date.getFullYear()}`
}

interface HourLogFilterBarProps {
  filters: HourLogFilters
  counts: Record<StatusFilter, number>
  months: string[]
  onChange: (filters: HourLogFilters) => void
}

/** Búsqueda, estado y mes del libro de horas. «Borradores» solo aparece si hay alguno. */
export function HourLogFilterBar({ filters, counts, months, onChange }: HourLogFilterBarProps) {
  const options = STATUS_OPTIONS.filter((option) => option.value !== 'DRAFT' || counts.DRAFT > 0)

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-surface p-3.5 shadow-[0_2px_12px_hsl(var(--scrim)/0.05)] xl:flex-row xl:items-center xl:justify-between">
      <div className="relative max-w-lg flex-1">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-inkMute" />
        <input
          type="search"
          aria-label="Buscar en el libro"
          placeholder="Buscar por actividad o fecha…"
          value={filters.query}
          onChange={(event) => onChange({ ...filters, query: event.target.value })}
          className="h-field w-full rounded-xl border border-line bg-well pl-10 pr-3 text-14 text-ink placeholder:text-inkMute hover:border-stamp/40 focus-visible:border-stamp focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stamp/25"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <div role="group" aria-label="Filtrar por estado" className="flex flex-wrap gap-1.5">
          {options.map(({ value, label }) => {
            const active = filters.status === value
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => onChange({ ...filters, status: value })}
                className={cn(
                  'h-8 rounded-xl px-3.5 text-12 transition-colors',
                  active
                    ? 'bg-stamp font-bold text-surface shadow-[0_2px_6px_hsl(var(--stamp)/0.2)]'
                    : 'bg-soft font-semibold text-inkMid hover:bg-pillHover hover:text-ink',
                )}
              >
                {label} ({counts[value]})
              </button>
            )
          })}
        </div>

        <label htmlFor="hour-log-month" className="sr-only">
          Mes
        </label>
        <select
          id="hour-log-month"
          value={filters.month}
          onChange={(event) => onChange({ ...filters, month: event.target.value })}
          className="h-8 rounded-xl border border-line bg-surface px-3 text-12 font-semibold text-ink hover:border-stamp/40 focus-visible:border-stamp focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stamp/25"
        >
          <option value="">Todos los meses</option>
          {months.map((month) => (
            <option key={month} value={month}>
              {monthLabel(month)}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
