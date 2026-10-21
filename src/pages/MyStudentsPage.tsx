import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarClock, Hourglass, TrendingDown, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { Chip } from '@/components/Chip'
import { PageHeader } from '@/components/PageHeader'
import { Pagination } from '@/components/Pagination'
import { usePagination } from '@/lib/usePagination'
import { EmptyState, LoadingState, Panel, TableHeaderRow, rowClass } from '@/components/Panel'
import { ProgressBar } from '@/components/ProgressBar'
import { KpiCard } from '@/components/placement/KpiCard'
import { KpiGrid } from '@/components/placement/KpiGrid'
import { TutorQueueHero } from '@/components/tutor/TutorQueueHero'
import { Button } from '@/components/ui/button'
import { Ledger } from '@/components/ledger/Ledger'
import { parseLocalDate } from '@/lib/date'
import { type StudentProgress, queueSummary, sortByQueue, studentProgress } from '@/lib/tutorQueue'
import { plural } from '@/lib/utils'
import { db } from '@/offline/db'

function formatShortDate(day: string): string {
  const parsed = parseLocalDate(day)
  if (Number.isNaN(parsed.getTime())) return day
  return new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'short' }).format(parsed)
}

function ColumnHeader() {
  return (
    <TableHeaderRow>
      <span className="w-32">Estudiante</span>
      <span className="hidden min-w-0 flex-1 xl:inline">Empresa</span>
      <span className="flex-1 xl:w-44 xl:flex-none">Horas aprobadas</span>
      <span className="hidden w-28 xl:inline">Último registro</span>
      <span className="w-40">Estado</span>
      <span className="w-24 text-right xl:w-44">Acciones</span>
    </TableHeaderRow>
  )
}

function StudentState({ row }: { row: StudentProgress }) {
  if (row.submittedHours > 0) return <Chip tone="pending">{row.submittedHours.toFixed(1)} h sin revisar</Chip>
  if (row.rejectedLogs > 0) return <Chip tone="void">{plural(row.rejectedLogs, 'devuelto', 'devueltos')}</Chip>
  return <Chip tone="stamp">Al día</Chip>
}

/**
 * Cola de trabajo del tutor: sus placements con el conteo de horas
 * pendientes de revisión por estudiante. Lee de Dexie, no de la red — tiene
 * que funcionar sin señal, igual que el resto de la app.
 */
export function MyStudentsPage() {
  const { user } = useAuth()

  const rows = useLiveQuery<StudentProgress[] | undefined>(async () => {
    if (!user) return undefined
    const placements = await db.placements.where('tutorId').equals(user.id).toArray()
    const progress = await Promise.all(
      placements.map(async (placement) => {
        const logs = await db.hourLogs.where('placementId').equals(placement.id).toArray()
        return studentProgress(placement, logs)
      }),
    )
    return sortByQueue(progress)
  }, [user?.id])

  // La lista es en vivo: si baja el número de páginas, no se queda en una que ya no existe (lo resuelve el hook).
  const { visibleItems: visibleRows, pagination } = usePagination(rows)

  if (rows === undefined) {
    return <LoadingState>Cargando tus practicantes…</LoadingState>
  }

  const summary = queueSummary(rows)
  const next = rows.find((row) => row.submittedLogs > 0)
  const behind = rows.filter((row) => row.approvedPct < 50).length

  return (
    <>
      <PageHeader
        title="Mis practicantes"
        subtitle="Ordenados por tu cola: primero quien tiene más horas esperando, luego quien va más atrasado."
      />

      {rows.length > 0 ? (
        <>
          <TutorQueueHero summary={summary} nextPlacementId={next?.placement.id ?? null} />

          <KpiGrid>
            <KpiCard label="Practicantes" value={String(summary.students)} unit="activos" icon={Users} tone="soft" />
            <KpiCard
              label="Esperando revisión"
              value={String(summary.waiting)}
              unit={summary.waiting === 1 ? 'practicante' : 'practicantes'}
              icon={Hourglass}
              tone="pending"
              footnote={plural(summary.pendingLogs, 'registro', 'registros')}
            />
            <KpiCard
              label="Horas sin revisar"
              value={summary.pendingHours.toFixed(1)}
              unit="h"
              icon={CalendarClock}
              tone="pending"
              footnote="Tu decisión"
            />
            <KpiCard
              label="Bajo la mitad"
              value={String(behind)}
              unit={behind === 1 ? 'practicante' : 'practicantes'}
              icon={TrendingDown}
              footnote="Con menos del 50 % aprobado"
            />
          </KpiGrid>
        </>
      ) : null}

      <Panel
        toolbar={
          rows.length > 0 ? (
            <span className="ml-auto font-data text-12 text-inkSoft">
              {plural(rows.length, 'practicante', 'practicantes')}
            </span>
          ) : undefined
        }
      >
        {rows.length === 0 ? (
          <EmptyState
            title="Todavía no tienes practicantes asignados"
            description="Cuando la coordinación te asigne uno, aparece aquí."
          />
        ) : (
          <Ledger header={<ColumnHeader />}>
            {visibleRows.map((row) => {
              const { placement, approvedHours, approvedPct, lastLogDate } = row
              return (
                <div key={placement.id} className={rowClass}>
                  <span className="whitespace-nowrap text-14 font-semibold text-ink sm:w-32 sm:flex-none">
                    Estudiante #{placement.studentId}
                  </span>
                  <span className="min-w-0 truncate text-14 text-inkBody sm:hidden xl:inline xl:flex-1">Empresa #{placement.companyId}</span>
                  <span className="flex items-center gap-2.5 sm:flex-1 xl:w-44 xl:flex-none">
                    <ProgressBar
                      size="sm"
                      value={approvedPct}
                      label={`Progreso del estudiante ${placement.studentId}`}
                      className="flex-1"
                    />
                    <span className="whitespace-nowrap font-data text-12 text-inkSoft">
                      {approvedHours.toFixed(1)}/{placement.requiredHours}
                    </span>
                  </span>
                  <span className="whitespace-nowrap font-data text-13 text-inkSoft sm:hidden xl:inline xl:w-28 xl:flex-none">
                    {lastLogDate ? formatShortDate(lastLogDate) : 'Sin registros'}
                  </span>
                  <span className="sm:w-40 sm:flex-none">
                    <StudentState row={row} />
                  </span>
                  <span className="flex gap-1.5 sm:w-24 sm:flex-none sm:justify-end xl:w-44">
                    <Button asChild size="sm" variant={row.submittedLogs > 0 ? 'default' : 'outline'}>
                      <Link to={`/practicantes/${placement.id}/horas`}>Revisar</Link>
                    </Button>
                    <Button asChild size="sm" variant="ghost" className="sm:hidden xl:inline-flex">
                      <Link to={`/practicantes/${placement.id}/evaluar`}>Evaluar</Link>
                    </Button>
                  </span>
                </div>
              )
            })}
          </Ledger>
        )}
        <Pagination {...pagination} />
      </Panel>
    </>
  )
}
