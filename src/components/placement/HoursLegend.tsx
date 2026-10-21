import type { HoursSummary } from '@/lib/hours'
import { cn } from '@/lib/utils'

function LegendItem({ dot, value, label }: { dot: string; value: string; label: string }) {
  return (
    <li className="flex items-center gap-1.5 text-12">
      <span aria-hidden="true" className={cn('size-3 flex-none rounded-full', dot)} />
      <span className="font-semibold text-ink">{value}</span>
      <span className="text-inkSoft">{label}</span>
    </li>
  )
}

/** Reparto de las horas: aprobadas, sin revisar y por registrar. Lo comparten el inicio y el libro de horas. */
export function HoursLegend({ hours, className }: { hours: HoursSummary; className?: string }) {
  const { approvedHours, submittedHours, requiredHours } = hours
  const toRegister = Math.max(0, requiredHours - approvedHours - submittedHours)

  return (
    <ul aria-label="Reparto de las horas" className={cn('flex flex-wrap gap-x-5 gap-y-1.5', className)}>
      <LegendItem dot="bg-stamp" value={`${approvedHours.toFixed(1)} h`} label="aprobadas" />
      <LegendItem dot="bg-dotPending" value={`${submittedHours.toFixed(1)} h`} label="sin revisar" />
      <LegendItem dot="bg-line" value={`${toRegister.toFixed(1)} h`} label="por registrar" />
    </ul>
  )
}
