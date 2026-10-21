import { Chip } from '@/components/Chip'
import { LedgerRow } from '@/components/ledger/LedgerRow'
import { StatusBadge } from '@/components/StatusBadge'
import { parseLocalDate } from '@/lib/date'
import type { LocalHourLog } from '@/offline/db'
import { cn } from '@/lib/utils'

const dayFormatter = new Intl.DateTimeFormat('es-EC', { day: '2-digit' })
const monthYearFormatter = new Intl.DateTimeFormat('es-EC', { month: 'short', year: 'numeric' })
const weekdayFormatter = new Intl.DateTimeFormat('es-EC', { weekday: 'long' })

const HOURS_TONE: Record<LocalHourLog['status'], string> = {
  APPROVED: 'bg-chipStamp text-stamp',
  SUBMITTED: 'bg-chipPending text-pending',
  REJECTED: 'bg-chipVoid text-void',
  DRAFT: 'bg-soft text-inkSoft',
}

function DateBlock({ date }: { date: string }) {
  const parsed = parseLocalDate(date)
  if (Number.isNaN(parsed.getTime())) return <span className="font-data text-14 text-ink sm:w-32">{date}</span>
  const weekday = weekdayFormatter.format(parsed)
  return (
    <div className="sm:w-32">
      <span className="font-display text-17 font-bold text-ink">{dayFormatter.format(parsed)}</span>
      <span className="ml-1 text-13 font-medium text-inkSoft">{monthYearFormatter.format(parsed)}</span>
      <p className="text-11 text-inkMute">{weekday.charAt(0).toUpperCase() + weekday.slice(1)}</p>
    </div>
  )
}

/** Fila del libro de horas: conserva el indicador de sincronización y el aviso de fallo permanente. */
export function HourLogRow({ log }: { log: LocalHourLog }) {
  return (
    <LedgerRow syncState={log.syncState}>
      <DateBlock date={log.date} />
      <span className="font-data text-13 text-inkSoft sm:w-28">
        {log.startTime}–{log.endTime}
      </span>
      <span className="sm:w-20">
        <span className={cn('inline-flex rounded-full px-2.5 py-1 text-12 font-bold', HOURS_TONE[log.status])}>
          {log.hours.toFixed(1)} h
        </span>
      </span>
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
        {log.syncState === 'failed' && <Chip tone="void">Fallo permanente</Chip>}
      </div>
    </LedgerRow>
  )
}
