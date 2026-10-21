import { CheckCircle2, Hourglass } from 'lucide-react'
import type { ReactNode } from 'react'
import type { HoursSummary } from '@/lib/hours'
import { KpiCard } from './KpiCard'

interface HoursKpiProps {
  hours: HoursSummary
  /** Línea de contexto: cambia según quién mira (el estudiante o su tutor). */
  footnote: ReactNode
}

/** Horas aprobadas sobre la meta: el indicador que abre los paneles del estudiante y del tutor. */
export function ApprovedHoursKpi({ hours, footnote }: HoursKpiProps) {
  return (
    <KpiCard
      label="Horas aprobadas"
      value={hours.approvedHours.toFixed(1)}
      unit={`/ ${hours.requiredHours} h`}
      icon={CheckCircle2}
      footnote={footnote}
    />
  )
}

/** Horas enviadas que esperan la decisión del tutor. */
export function PendingHoursKpi({ hours, footnote }: HoursKpiProps) {
  return (
    <KpiCard
      label="Sin revisar"
      value={hours.submittedHours.toFixed(1)}
      unit="h"
      icon={Hourglass}
      tone="pending"
      footnote={footnote}
    />
  )
}
