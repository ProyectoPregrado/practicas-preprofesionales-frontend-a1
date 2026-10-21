import { useLiveQuery } from 'dexie-react-hooks'
import { BookOpen, CheckCircle2, Hourglass, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Chip } from '@/components/Chip'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState, LoadingState, Section } from '@/components/Panel'
import { NewHourLogDialog } from '@/components/hour-log/NewHourLogDialog'
import { HoursHeroCard } from '@/components/placement/HoursHeroCard'
import { KpiCard } from '@/components/placement/KpiCard'
import { RequirementsList } from '@/components/placement/RequirementsList'
import { WeeklyHoursChart } from '@/components/placement/WeeklyHoursChart'
import { StatusBadge } from '@/components/StatusBadge'
import { Ledger } from '@/components/ledger/Ledger'
import { LedgerRow } from '@/components/ledger/LedgerRow'
import { parseLocalDate } from '@/lib/date'
import { type HoursSummary, averagePerRegisteredDay, summarizeHours } from '@/lib/hours'
import { placementRequirements } from '@/lib/placementRequirements'
import { plural } from '@/lib/utils'
import { weekHours } from '@/lib/weekHours'
import { db, type LocalDocument, type LocalHourLog } from '@/offline/db'
import { useHourLogs } from '@/offline/hooks/useHourLogs'
import { usePlacement } from '@/offline/hooks/usePlacement'

function formatDate(dateValue: string): string {
  const parsed = parseLocalDate(dateValue)
  if (Number.isNaN(parsed.getTime())) return dateValue
  return new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'short', year: 'numeric' }).format(parsed)
}

function formatPeriod(startDate: string, endDate: string): string {
  return `${formatDate(startDate)} – ${formatDate(endDate)}`
}

function DataRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-[18px] py-3">
      <dt className="text-14 text-inkSoft">{label}</dt>
      <dd className="text-14 text-ink">{children}</dd>
    </div>
  )
}

/** Documentos que activan la plaza: el convenio y el seguro. */
const KEY_DOCUMENT_KINDS = ['AGREEMENT', 'INSURANCE']

function PlacementKpis({
  hours,
  documents,
  logs,
}: {
  hours: HoursSummary
  documents: LocalDocument[] | undefined
  logs: LocalHourLog[] | undefined
}) {
  const submittedLogs = logs?.filter((log) => log.status === 'SUBMITTED').length ?? 0
  const validatedKeyDocuments = KEY_DOCUMENT_KINDS.filter((kind) =>
    documents?.some((doc) => doc.kind === kind && doc.status === 'VALIDATED'),
  ).length
  const average = averagePerRegisteredDay(logs)

  return (
    <ul aria-label="Indicadores" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Horas aprobadas"
        value={hours.approvedHours.toFixed(1)}
        unit={`/ ${hours.requiredHours} h`}
        icon={CheckCircle2}
        footnote={`${Math.round(hours.approvedPct)} % de la meta`}
      />
      <KpiCard
        label="Sin revisar"
        value={hours.submittedHours.toFixed(1)}
        unit="h"
        icon={Hourglass}
        tone="pending"
        footnote={
          <>
            <span className="rounded-full bg-chipPending px-2 py-0.5 text-11 font-semibold text-pending">
              {plural(submittedLogs, 'registro', 'registros')}
            </span>
            <span>con tu tutor</span>
          </>
        }
      />
      <KpiCard
        label="Documentos clave"
        value={`${validatedKeyDocuments} / ${KEY_DOCUMENT_KINDS.length}`}
        unit="validados"
        icon={ShieldCheck}
        tone="soft"
        footnote="Convenio y seguro"
      />
      <KpiCard
        label="Registros"
        value={String(logs?.length ?? 0)}
        unit="en el libro"
        icon={BookOpen}
        tone="soft"
        footnote={average === null ? 'Aún sin registros' : `${average.toFixed(1)} h por día registrado`}
      />
    </ul>
  )
}

function PendingDocuments({ documents }: { documents: LocalDocument[] | undefined }) {
  const aside = (
    <Link to="/documentos" className="text-13 font-semibold text-stamp hover:underline">
      Ir a documentos
    </Link>
  )

  if (documents === undefined) {
    return (
      <Section title="Documentos pendientes" aside={aside}>
        <LoadingState>Cargando documentos…</LoadingState>
      </Section>
    )
  }

  const pending = documents.filter((doc) => doc.status === 'PENDING')
  if (pending.length === 0) {
    return (
      <Section title="Documentos pendientes" aside={aside}>
        <EmptyState
          title="No tienes documentos pendientes"
          description="Todo lo que subiste ya fue revisado."
        />
      </Section>
    )
  }

  return (
    <Section title="Documentos pendientes" aside={aside}>
      <div className="divide-y divide-paperRule">
        {pending.map((doc, index) => (
          <div
            key={index}
            className="flex min-h-row items-center justify-between gap-4 px-[18px] py-2.5"
          >
            <div className="min-w-0">
              <div className="truncate text-14 font-semibold text-ink">{doc.filename}</div>
              <div className="mt-0.5 text-12 text-inkSoft">{doc.kind}</div>
            </div>
            <StatusBadge status={doc.status} />
          </div>
        ))}
      </div>
    </Section>
  )
}

function RecentLogs({ logs }: { logs: LocalHourLog[] | undefined }) {
  const aside = (
    <Link to="/horas" className="text-13 font-semibold text-stamp hover:underline">
      Ver el libro de horas
    </Link>
  )

  if (logs === undefined) {
    return (
      <Section title="Últimos registros de horas" aside={aside}>
        <LoadingState>Cargando registros…</LoadingState>
      </Section>
    )
  }

  const recent = logs.slice(-5).reverse()
  if (recent.length === 0) {
    return (
      <Section title="Últimos registros de horas" aside={aside}>
        <EmptyState
          title="Todavía no has registrado horas"
          description="Puedes hacerlo sin conexión."
        />
      </Section>
    )
  }

  return (
    <Section title="Últimos registros de horas" aside={aside}>
      <Ledger>
        {recent.map((log, index) => (
          <LedgerRow key={index} syncState={log.syncState}>
            <span className="font-data text-14 text-ink sm:w-28">{formatDate(log.date)}</span>
            <span className="font-data text-13 text-inkSoft sm:w-28">
              {log.startTime}–{log.endTime}
            </span>
            <span className="font-data text-14 text-ink sm:w-14">{log.hours}</span>
            <div className="flex-1 text-14 text-inkBody">
              <div>{log.activity}</div>
              {log.syncState === 'failed' && (
                <div className="mt-0.5 text-12 font-medium text-void">
                  Fallo permanente: {log.reviewNote || 'Error en la sincronización'}
                </div>
              )}
            </div>
            <div className="flex flex-col items-end gap-1 sm:w-32 sm:text-right">
              <StatusBadge status={log.status} />
              {log.syncState === 'failed' && (
                <Chip tone="void">Fallo permanente</Chip>
              )}
            </div>
          </LedgerRow>
        ))}
      </Ledger>
    </Section>
  )
}

export function MyPlacementPage() {
  const placement = usePlacement()
  const logs = useHourLogs(placement?.id ?? -1)
  const documents = useLiveQuery<LocalDocument[] | undefined>(async () => {
    if (!placement) return undefined
    return db.documents.where('placementId').equals(placement.id).toArray()
  }, [placement?.id])

  if (placement === undefined) {
    return <LoadingState>Cargando tu práctica…</LoadingState>
  }

  if (placement === null) {
    return (
      <EmptyState
        title="No tienes una práctica activa todavía"
        description="Cuando la coordinación active tu plaza, la verás aquí."
      />
    )
  }

  const pendingDocuments = documents?.filter((doc) => doc.status === 'PENDING').length ?? 0
  const hours = summarizeHours(logs, placement.requiredHours)

  return (
    <>
      <PageHeader
        title="Mi práctica"
        subtitle={`Empresa #${placement.companyId} · ${formatPeriod(placement.startDate, placement.endDate)}`}
        actions={<NewHourLogDialog placementId={placement.id} />}
      />

      <HoursHeroCard hours={hours} pendingDocuments={pendingDocuments} />

      <PlacementKpis hours={hours} documents={documents} logs={logs} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-7">
          <RecentLogs logs={logs} />
          <WeeklyHoursChart week={weekHours(logs, new Date())} />
        </div>

        <div className="flex min-w-0 flex-col gap-4 xl:col-span-5">
          <Section title="Datos de la práctica">
            <dl className="divide-y divide-paperRule">
              <DataRow label="Empresa">Empresa #{placement.companyId}</DataRow>
              <DataRow label="Tutor">Tutor #{placement.tutorId}</DataRow>
              <DataRow label="Periodo">
                <span className="font-data">{formatPeriod(placement.startDate, placement.endDate)}</span>
              </DataRow>
              <DataRow label="Estado">
                <StatusBadge status={placement.status} />
              </DataRow>
            </dl>
          </Section>

          <RequirementsList items={placementRequirements({ documents, hours })} />

          <PendingDocuments documents={documents} />
        </div>
      </div>
    </>
  )
}
