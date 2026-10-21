import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type KpiTone = 'stamp' | 'pending' | 'soft'

const ICON_TONES: Record<KpiTone, string> = {
  stamp: 'bg-chipStamp text-stamp',
  pending: 'bg-chipPending text-pending',
  soft: 'bg-soft text-dotPending',
}

interface KpiCardProps {
  label: string
  value: ReactNode
  /** Lo que acompaña al número: «/ 240 h», «validados». */
  unit?: ReactNode
  icon: LucideIcon
  tone?: KpiTone
  /** Línea de contexto bajo el número. */
  footnote?: ReactNode
}

/** Indicador del panel: etiqueta con icono, número grande y una línea de contexto. */
export function KpiCard({ label, value, unit, icon: Icon, tone = 'stamp', footnote }: KpiCardProps) {
  return (
    <li className="rounded-2xl bg-surface p-5 shadow-[0_2px_12px_hsl(var(--scrim)/0.05)]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-11 font-bold uppercase tracking-[0.06em] text-inkSoft">{label}</span>
        <span aria-hidden="true" className={cn('flex size-9 flex-none items-center justify-center rounded-xl', ICON_TONES[tone])}>
          <Icon className="size-5" />
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-display text-[30px] font-extrabold leading-none tracking-[-0.025em] text-ink">{value}</span>
        {unit ? <span className="text-14 text-inkSoft">{unit}</span> : null}
      </div>
      {footnote ? <div className="mt-3 flex flex-wrap items-center gap-1.5 text-12 text-inkSoft">{footnote}</div> : null}
    </li>
  )
}
