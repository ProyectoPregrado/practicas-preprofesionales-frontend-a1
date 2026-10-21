import { type FormEvent, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useParams } from 'react-router-dom'
import { ApiError, api } from '@/api/client'
import { useAuth } from '@/auth/AuthContext'
import { CalendarDays, Undo2 } from 'lucide-react'
import { FilterTabs } from '@/components/FilterTabs'
import { PageHeader } from '@/components/PageHeader'
import { ProgressBar } from '@/components/ProgressBar'
import { KpiCard } from '@/components/placement/KpiCard'
import { KpiGrid } from '@/components/placement/KpiGrid'
import { ApprovedHoursKpi, PendingHoursKpi } from '@/components/placement/HoursKpis'
import { EmptyState, LoadingState, Panel } from '@/components/Panel'
import { Pagination } from '@/components/Pagination'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Ledger, LedgerHeaderRow } from '@/components/ledger/Ledger'
import { LedgerRow } from '@/components/ledger/LedgerRow'
import { parseLocalDate } from '@/lib/date'
import { type HoursSummary, summarizeHours } from '@/lib/hours'
import { type StatusFilter, countByStatus } from '@/lib/hourLogFilters'
import { describeError } from '@/lib/describeError'
import { confirmar, error as notifyError, exito } from '@/lib/notify'
import { plural } from '@/lib/utils'
import { usePagination } from '@/lib/usePagination'
import { db, type LocalHourLog, type LocalPlacement } from '@/offline/db'
import { syncNow } from '@/offline/sync/scheduler'

type ActionState = 'approving' | 'rejecting' | 'approved' | 'rejected' | null

// Los motivos que más se repiten al devolver un registro: se pegan al final
// de la nota para que el tutor no escriba lo mismo cada vez.
const COMMON_REASONS = [
  'Las horas no coinciden con el sitio',
  'Falta detalle de la actividad',
  'La fecha no corresponde',
]

function formatDate(dateValue: string): string {
  const parsed = parseLocalDate(dateValue)
  if (Number.isNaN(parsed.getTime())) return dateValue
  return new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'short', year: 'numeric' }).format(parsed)
}

function LedgerColumnHeader() {
  return (
    <LedgerHeaderRow>
      <span className="w-28">Fecha</span>
      <span className="w-28">Horario</span>
      <span className="w-14">Horas</span>
      <span className="flex-1">Actividad</span>
      <span className="w-32">Estado</span>
      <span className="w-44 text-right">Revisión</span>
    </LedgerHeaderRow>
  )
}

interface ReviewActionsProps {
  log: LocalHourLog
  state: ActionState
  onApprove: (log: LocalHourLog) => void
  onReject: (log: LocalHourLog) => void
}

function ReviewActions({ log, state, onApprove, onReject }: ReviewActionsProps) {
  if (state === 'approved') {
    return <span className="text-13 font-semibold text-stamp">Aprobada</span>
  }
  if (state === 'rejected') {
    return <span className="text-13 font-semibold text-void">Rechazada</span>
  }
  if (log.status !== 'SUBMITTED') return null

  const busy = state === 'approving' || state === 'rejecting'
  return (
    <>
      <Button type="button" size="sm" onClick={() => onApprove(log)} disabled={busy}>
        {state === 'approving' ? 'Aprobando…' : 'Aprobar'}
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={() => onReject(log)} disabled={busy}>
        Devolver
      </Button>
    </>
  )
}

interface ReviewListProps {
  logs: LocalHourLog[]
  /** Hay un filtro de estado activo: la lista vacía no significa que no haya nada que revisar. */
  filtered: boolean
  actionState: Record<number, ActionState>
  onApprove: (log: LocalHourLog) => void
  onReject: (log: LocalHourLog) => void
}

function ReviewList({ logs, filtered, actionState, onApprove, onReject }: ReviewListProps) {
  if (logs.length === 0 && filtered) {
    return <EmptyState title="Ningún registro con este estado" description="Elige «Todos» para ver el libro completo." />
  }
  if (logs.length === 0) {
    return (
      <EmptyState
        title="No tienes horas pendientes de revisar"
        description="Cuando tu practicante envíe horas nuevas, aparecen aquí."
      />
    )
  }

  return (
    <Ledger header={<LedgerColumnHeader />}>
      {logs.map((log) => (
          <LedgerRow key={log.id} syncState={log.syncState}>
            <span className="font-data text-14 text-ink sm:w-28">{formatDate(log.date)}</span>
            <span className="font-data text-13 text-inkSoft sm:w-28">
              {log.startTime}–{log.endTime}
            </span>
            <span className="font-data text-14 text-ink sm:w-14">{log.hours}</span>
            <span className="flex-1 text-14 text-inkBody">{log.activity}</span>
            <span className="sm:w-32">
              <StatusBadge status={log.status} domain="hour" />
            </span>
            <span className="flex flex-wrap justify-end gap-1.5 sm:w-44">
              <ReviewActions
                log={log}
                state={actionState[log.id] ?? null}
                onApprove={onApprove}
                onReject={onReject}
              />
            </span>
          </LedgerRow>
        ))}
    </Ledger>
  )
}

interface RejectDialogProps {
  /** Registro a devolver, o `null` con el modal cerrado. */
  log: LocalHourLog | null
  onCancel: () => void
  onConfirm: (logId: number, note: string) => void
}

function RejectDialog({ log, onCancel, onConfirm }: RejectDialogProps) {
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleOpenChange(open: boolean) {
    if (open) return
    setNote('')
    setError(null)
    onCancel()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!log) return
    const trimmed = note.trim()
    if (!trimmed) {
      setError('Escribe una nota para el rechazo')
      return
    }
    setNote('')
    setError(null)
    onConfirm(log.id, trimmed)
  }

  function appendReason(reason: string) {
    setNote((prev) => (prev ? `${prev.trimEnd()} ${reason}. ` : `${reason}. `))
    setError(null)
  }

  return (
    <Dialog open={log !== null} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Devolver el registro</DialogTitle>
          <DialogDescription>
            {log ? `${formatDate(log.date)} · ${log.activity} · ${log.hours} h` : null}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} noValidate>
          <DialogBody>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reject-note">¿Qué tiene que corregir?</Label>
              <p className="text-12 text-inkSoft">
                Lo lee tal cual lo escribas, con tu nombre y la fecha.
              </p>
              <Textarea
                id="reject-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                placeholder="Escribe qué falta o qué está mal"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'reject-note-error' : undefined}
              />
              {error ? (
                <p id="reject-note-error" role="alert" className="text-12 text-void">
                  {error}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-12 uppercase tracking-[0.06em] text-inkMute">
                Motivos frecuentes
              </span>
              <div className="flex flex-wrap gap-2">
                {COMMON_REASONS.map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => appendReason(reason)}
                    className="inline-flex h-8 items-center rounded-full border border-line px-3 text-13 text-inkBody transition-colors hover:border-stamp hover:bg-soft hover:text-ink"
                  >
                    {reason}
                  </button>
                ))}
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="submit">Devolver el registro</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

type ReviewFilter = Exclude<StatusFilter, 'DRAFT'>

// Los borradores no llegan al tutor: no tiene sentido un filtro para ellos.
const REVIEW_FILTERS: { value: ReviewFilter; label: string }[] = [
  { value: 'ALL', label: 'Todos' },
  { value: 'SUBMITTED', label: 'Sin revisar' },
  { value: 'APPROVED', label: 'Aprobados' },
  { value: 'REJECTED', label: 'Devueltos' },
]

interface ReviewKpisProps {
  hours: HoursSummary
  counts: Record<StatusFilter, number>
  lastLogDate: string | null
}

/** Indicadores del practicante: avance, lo que espera, lo devuelto y la última actividad. */
function ReviewKpis({ hours, counts, lastLogDate }: ReviewKpisProps) {
  return (
    <KpiGrid>
      <ApprovedHoursKpi
        hours={hours}
        footnote={
          <ProgressBar
            value={hours.approvedPct}
            pendingValue={hours.submittedPct}
            label="Progreso de horas aprobadas"
          />
        }
      />
      <PendingHoursKpi
        hours={hours}
        footnote={plural(counts.SUBMITTED, 'registro espera tu decisión', 'registros esperan tu decisión')}
      />
      <KpiCard
        label="Devueltos"
        value={String(counts.REJECTED)}
        unit={counts.REJECTED === 1 ? 'registro' : 'registros'}
        icon={Undo2}
        tone="soft"
        footnote="Esperan la corrección del estudiante"
      />
      <KpiCard
        label="Último registro"
        value={lastLogDate ? formatDate(lastLogDate) : '—'}
        icon={CalendarDays}
        tone="soft"
        footnote={plural(counts.ALL - counts.DRAFT, 'registro en el libro', 'registros en el libro')}
      />
    </KpiGrid>
  )
}

/**
 * Cola de aprobación de un placement. Las horas viven en Dexie (sincronizadas
 * por pull/push); aprobar o rechazar llama al backend y luego re-sincroniza
 * para traer el estado nuevo — el servidor es la autoridad, nunca se escribe
 * el resultado de la revisión a mano en Dexie.
 *
 * Nota: el backend no valida que quien revisa sea el tutor asignado a este
 * placement (deuda del backend). Esta pantalla no lo compensa ocultando ni
 * deshabilitando nada.
 */
export function ReviewHoursPage() {
  const { id } = useParams<{ id: string }>()
  const placementId = Number(id)
  const { user } = useAuth()

  const placement = useLiveQuery<LocalPlacement | null | undefined>(async () => {
    const found = await db.placements.get(placementId)
    return found ?? null
  }, [placementId])

  const logs = useLiveQuery<LocalHourLog[] | undefined>(
    () => db.hourLogs.where('placementId').equals(placementId).sortBy('date'),
    [placementId],
  )

  const [statusFilter, setStatusFilter] = useState<ReviewFilter>('ALL')

  // Más recientes primero; el hook los entrega de más antiguo a más reciente. Se paginan (5 a 30 filas, a elección del usuario).
  const newestFirst = useMemo(
    () => logs?.filter((log) => statusFilter === 'ALL' || log.status === statusFilter).reverse(),
    [logs, statusFilter],
  )
  const { visibleItems: visibleLogs, pagination } = usePagination(newestFirst)

  const [actionState, setActionState] = useState<Record<number, ActionState>>({})
  const [rejectingLog, setRejectingLog] = useState<LocalHourLog | null>(null)
  // Evita abrir dos preguntas (y revisar dos veces) con un doble clic mientras la confirmación está abierta.
  const confirming = useRef(false)

  function getReviewErrorMessage(err: unknown): string {
    return (
      describeError(err, {
        forbidden: 'No tienes permiso para revisar este registro porque no eres el tutor asignado a esta práctica.',
      }) ?? 'No se pudo enviar la revisión'
    )
  }

  async function reviewLog(logId: number, status: 'APPROVED' | 'REJECTED', note?: string) {
    setActionState((prev) => ({ ...prev, [logId]: status === 'APPROVED' ? 'approving' : 'rejecting' }))
    try {
      await api(`/hour-logs/${logId}/review`, {
        method: 'PATCH',
        body: JSON.stringify({ status, note }),
      })
      await syncNow()
      setActionState((prev) => ({ ...prev, [logId]: status === 'APPROVED' ? 'approved' : 'rejected' }))
      exito(status === 'APPROVED' ? 'Horas aprobadas' : 'Registro devuelto al estudiante')
    } catch (err) {
      // UX-4: un aviso que la persona tiene que leer (el mensaje en línea quedaba arriba de la lista, fuera de la
      // vista). Se espera: los botones siguen deshabilitados hasta que se cierra.
      // UX-10: un 400 significa que el registro ya no está pendiente (otra pestaña u otro equipo lo revisó): la lista
      // local está vieja, así que se re-sincroniza antes del aviso. Si falla, el aviso sigue siendo lo importante.
      if (err instanceof ApiError && err.statusCode === 400) await syncNow().catch(() => undefined)
      await notifyError(
        status === 'APPROVED' ? 'No se pudo aprobar las horas' : 'No se pudo devolver el registro',
        getReviewErrorMessage(err),
      )
      setActionState((prev) => ({ ...prev, [logId]: null }))
    }
  }

  // Aprobar cuenta para el acta y no se puede deshacer: se pide confirmación. Devolver ya tiene su diálogo con la nota.
  async function approve(log: LocalHourLog) {
    if (confirming.current) return
    confirming.current = true
    try {
      const { approvedHours, requiredHours } = hours
      const completes = approvedHours + log.hours >= requiredHours
      const completionNote = completes ? `Con estas horas la práctica llega a las ${requiredHours} requeridas y se completa. ` : ''
      const accepted = await confirmar({
        titulo: `¿Aprobar ${log.hours} h del ${formatDate(log.date)}?`,
        texto: `${completionNote}Se suman ${log.hours} h a las ${approvedHours} aprobadas de ${requiredHours}. Esta decisión no se puede deshacer.`,
        confirmar: 'Sí, aprobar',
      })
      if (accepted) await reviewLog(log.id, 'APPROVED')
    } finally {
      confirming.current = false
    }
  }

  function confirmReject(logId: number, note: string) {
    setRejectingLog(null)
    void reviewLog(logId, 'REJECTED', note)
  }

  if (placement === undefined || logs === undefined) {
    return <LoadingState>Cargando libro de horas…</LoadingState>
  }

  if (placement === null) {
    return (
      <EmptyState
        title="No se encontró este practicante"
        description="El practicante no existe o no está registrado en tu lista."
        action={
          <Button asChild size="sm">
            <Link to="/practicantes">Volver a la lista</Link>
          </Button>
        }
      />
    )
  }

  if (user?.role === 'TUTOR' && placement.tutorId !== user.id) {
    return (
      <EmptyState
        title="Práctica no asignada"
        description="Esta práctica está asignada a otro tutor. No tienes permisos para revisar sus horas."
        action={
          <Button asChild size="sm">
            <Link to="/practicantes">Volver a la lista</Link>
          </Button>
        }
      />
    )
  }

  const hours = summarizeHours(logs, placement.requiredHours)
  const counts = countByStatus(logs)
  const pendingCount = counts.SUBMITTED

  return (
    <>
      <PageHeader
        title="Horas del practicante"
        subtitle={`Estudiante #${placement.studentId} · Empresa #${placement.companyId} · ${formatDate(placement.startDate)} – ${formatDate(placement.endDate)}`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/practicantes">Volver a la lista</Link>
            </Button>
            <Button asChild>
              <Link to={`/practicantes/${placementId}/evaluar`}>Evaluar practicante</Link>
            </Button>
          </>
        }
      />

      <ReviewKpis hours={hours} counts={counts} lastLogDate={logs.at(-1)?.date ?? null} />

      <Panel
        toolbar={
          <>
            <FilterTabs
              label="Filtrar por estado"
              surface="well"
              options={REVIEW_FILTERS.map(({ value, label }) => ({ value, label: `${label} · ${counts[value]}` }))}
              value={statusFilter}
              onChange={(value) => setStatusFilter(value as ReviewFilter)}
            />
            <span className="ml-auto font-data text-12 text-inkSoft">
              {plural(pendingCount, 'registro', 'registros')} sin revisar
            </span>
          </>
        }
      >
        <ReviewList
          logs={visibleLogs}
          filtered={statusFilter !== 'ALL'}
          actionState={actionState}
          onApprove={approve}
          onReject={setRejectingLog}
        />
        <div className="px-4 pb-4">
          <Pagination {...pagination} />
        </div>
      </Panel>

      <RejectDialog
        log={rejectingLog}
        onCancel={() => setRejectingLog(null)}
        onConfirm={confirmReject}
      />
    </>
  )
}
