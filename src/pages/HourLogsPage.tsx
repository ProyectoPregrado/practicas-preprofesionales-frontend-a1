import { useMemo, useState } from 'react'
import { BookOpen, CalendarDays, CheckCircle2, CircleCheckBig, CloudUpload, Hourglass, PieChart, TriangleAlert } from 'lucide-react'
import { HourLogFilterBar } from '@/components/hour-log/HourLogFilterBar'
import { HourLogRow } from '@/components/hour-log/HourLogRow'
import { NewHourLogDialog } from '@/components/hour-log/NewHourLogDialog'
import { PageHeader } from '@/components/PageHeader'
import { Pagination } from '@/components/Pagination'
import { EmptyState, LoadingState, Panel } from '@/components/Panel'
import { HoursLegend } from '@/components/placement/HoursLegend'
import { KpiCard } from '@/components/placement/KpiCard'
import { ProgressBar } from '@/components/ProgressBar'
import { Button } from '@/components/ui/button'
import { Ledger, LedgerHeaderRow } from '@/components/ledger/Ledger'
import { parseLocalDate } from '@/lib/date'
import { type HoursSummary, averagePerRegisteredDay, summarizeHours } from '@/lib/hours'
import { NO_FILTERS, countByStatus, filterHourLogs, monthsOf } from '@/lib/hourLogFilters'
import { plural } from '@/lib/utils'
import { usePagination } from '@/lib/usePagination'
import type { LocalHourLog, LocalPlacement } from '@/offline/db'
import { useHourLogs } from '@/offline/hooks/useHourLogs'
import { usePlacement } from '@/offline/hooks/usePlacement'

// Formateador a nivel de módulo para evitar instanciar Intl.DateTimeFormat repetidamente en cada fila
const dateFormatter = new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'short', year: 'numeric' })

function formatDate(dateValue: string): string {
  const parsed = parseLocalDate(dateValue)
  if (Number.isNaN(parsed.getTime())) return dateValue
  return dateFormatter.format(parsed)
}

function LedgerColumnHeader() {
  return (
    <LedgerHeaderRow>
      <span className="w-32">Fecha</span>
      <span className="w-28">Horario</span>
      <span className="w-20">Horas</span>
      <span className="flex-1">Actividad</span>
      <span className="w-32 text-right">Estado</span>
    </LedgerHeaderRow>
  )
}

function submittedNote(hours: HoursSummary) {
  if (hours.submittedHours <= 0) return null
  return <span className="text-pending"> · {hours.submittedHours.toFixed(1)} sin aprobar</span>
}

/** Tarjeta de progreso del libro: meta, contador, barra y reparto de las horas (siempre sobre todos los registros). */
function ProgressCard({ hours }: { hours: HoursSummary }) {
  return (
    <section
      aria-label="Progreso del ciclo práctico"
      className="rounded-2xl bg-surface p-5 shadow-[0_4px_20px_hsl(var(--scrim)/0.06)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div>
          <h2 className="flex items-center gap-2 font-display text-16 font-bold text-ink">
            <PieChart aria-hidden="true" className="size-5 text-stamp" />
            Progreso del ciclo práctico
          </h2>
          <span className="text-12 text-inkSoft">Meta: {hours.requiredHours} horas</span>
        </div>
        <p className="font-data text-13 text-inkSoft">
          {hours.approvedHours.toFixed(1)} / {hours.requiredHours} aprobadas
          {submittedNote(hours)}
        </p>
      </div>
      <ProgressBar
        className="mt-4"
        size="lg"
        value={hours.approvedPct}
        pendingValue={hours.submittedPct}
        label="Progreso de horas aprobadas"
      />
      <HoursLegend className="mt-3" hours={hours} />
    </section>
  )
}

/** Del primer al último día con registros, p. ej. «Del 30 mar 2026 al 10 abr 2026». */
function rangeNote(logs: LocalHourLog[]): string {
  if (logs.length === 0) return 'Aún sin registros'
  const days = logs.map((log) => log.date.split('T')[0]).sort()
  return `Del ${formatDate(days[0])} al ${formatDate(days[days.length - 1])}`
}

function BookKpis({ logs, hours }: { logs: LocalHourLog[]; hours: HoursSummary }) {
  const approvedCount = logs.filter((log) => log.status === 'APPROVED').length
  const submittedCount = logs.filter((log) => log.status === 'SUBMITTED').length
  const average = averagePerRegisteredDay(logs)

  return (
    <ul aria-label="Indicadores" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Horas aprobadas"
        value={hours.approvedHours.toFixed(1)}
        unit={`/ ${hours.requiredHours} h`}
        icon={CheckCircle2}
        footnote={plural(approvedCount, 'registro aprobado', 'registros aprobados')}
      />
      <KpiCard
        label="En revisión"
        value={hours.submittedHours.toFixed(1)}
        unit="h"
        icon={Hourglass}
        tone="pending"
        footnote={
          <>
            <span className="rounded-full bg-chipPending px-2 py-0.5 text-11 font-semibold text-pending">
              {plural(submittedCount, 'registro', 'registros')}
            </span>
            <span>con tu tutor</span>
          </>
        }
      />
      <KpiCard
        label="Registros"
        value={String(logs.length)}
        unit="en el libro"
        icon={BookOpen}
        tone="soft"
        footnote={rangeNote(logs)}
      />
      <KpiCard
        label="Promedio diario"
        value={average === null ? '—' : average.toFixed(1)}
        unit="h"
        icon={CalendarDays}
        tone="soft"
        footnote={average === null ? 'Aún sin registros' : 'por día registrado'}
      />
    </ul>
  )
}

/** Cuántos registros esperan salir del dispositivo y cuántos fallaron para siempre; si no hay ninguno, lo dice. */
function SyncBanner({ logs }: { logs: LocalHourLog[] }) {
  const waiting = logs.filter((log) => log.syncState === 'local' || log.syncState === 'queued').length
  const failed = logs.filter((log) => log.syncState === 'failed').length
  const upToDate = waiting === 0 && failed === 0
  const Icon = upToDate ? CircleCheckBig : CloudUpload

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-well p-4">
      <span aria-hidden="true" className="flex size-10 flex-none items-center justify-center rounded-xl bg-chipPending text-pending">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 text-13">
        <p className="font-semibold text-ink">
          {waiting > 0 ? `${plural(waiting, 'registro espera', 'registros esperan')} sincronizarse con el servidor` : null}
          {upToDate ? 'Todos tus registros están sincronizados' : null}
        </p>
        {failed > 0 ? (
          <p className="flex items-center gap-1.5 font-medium text-void">
            <TriangleAlert aria-hidden="true" className="size-4" />
            {plural(failed, 'registro con fallo permanente', 'registros con fallo permanente')}
          </p>
        ) : null}
        <p className="text-inkSoft">Puedes registrar horas sin conexión: se envían cuando vuelva la señal.</p>
      </div>
    </div>
  )
}

function EmptyBook() {
  return (
    <EmptyState
      title="Todavía no has registrado horas"
      description="Puedes hacerlo sin conexión: se sincroniza cuando vuelva la señal."
    />
  )
}

function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <EmptyState
      title="Ningún registro coincide con los filtros"
      description="Prueba con otra palabra, otro estado u otro mes."
      action={
        <Button type="button" size="sm" variant="outline" onClick={onClear}>
          Quitar filtros
        </Button>
      }
    />
  )
}

/** El libro ya cargado: el estado de los filtros y la página vive aquí, no en la pantalla que espera los datos. */
function HourLogBook({ placement, logs }: { placement: LocalPlacement; logs: LocalHourLog[] }) {
  const [filters, setFilters] = useState(NO_FILTERS)
  // Más recientes primero; el hook los entrega de más antiguo a más reciente.
  const sortedLogs = useMemo(() => logs.slice().reverse(), [logs])
  const filtered = useMemo(() => filterHourLogs(sortedLogs, filters), [sortedLogs, filters])

  // Totales recalculados en cada render a propósito: no hace falta más que sumar un arreglo.
  const hours = summarizeHours(logs, placement.requiredHours)

  // Paginación (5 a 30 filas por página, a elección de cada usuario) para mantener fluidez con 500+ registros
  const { visibleItems: visibleLogs, resetPage, pagination } = usePagination(filtered)

  function changeFilters(next: typeof filters) {
    setFilters(next)
    resetPage()
  }

  return (
    <>
      <PageHeader
        title="Libro de horas"
        subtitle="Todo lo que registraste este período. Se guarda en este dispositivo aunque no haya señal."
        actions={<NewHourLogDialog placementId={placement.id} />}
      />

      <ProgressCard hours={hours} />
      <BookKpis logs={logs} hours={hours} />

      <HourLogFilterBar filters={filters} counts={countByStatus(logs)} months={monthsOf(logs)} onChange={changeFilters} />

      <Panel
        className="shadow-[0_4px_24px_hsl(var(--scrim)/0.06)]"
        toolbar={
          <span data-testid="table-count" className="ml-auto font-data text-12 text-inkSoft">
            {plural(filtered.length, 'registro', 'registros')}
          </span>
        }
      >
        {logs.length === 0 ? <EmptyBook /> : null}
        {logs.length > 0 && filtered.length === 0 ? <NoMatches onClear={() => changeFilters(NO_FILTERS)} /> : null}
        {filtered.length > 0 ? (
          <Ledger header={<LedgerColumnHeader />}>
            {visibleLogs.map((log) => (
              <HourLogRow key={log.id} log={log} />
            ))}
          </Ledger>
        ) : null}
        <div className="px-4 pb-4">
          <Pagination {...pagination} />
        </div>
      </Panel>

      <SyncBanner logs={logs} />
    </>
  )
}

export function HourLogsPage() {
  const placement = usePlacement()
  const logs = useHourLogs(placement?.id ?? -1)

  if (placement === undefined) {
    return <LoadingState>Cargando tu práctica…</LoadingState>
  }

  if (placement === null) {
    return (
      <EmptyState
        title="No tienes una práctica activa todavía"
        description="Cuando la coordinación active tu plaza, vas a poder registrar horas."
      />
    )
  }

  if (logs === undefined) {
    return <LoadingState>Cargando registros de horas…</LoadingState>
  }

  return <HourLogBook placement={placement} logs={logs} />
}
