import { GraduationCap, Zap } from 'lucide-react'
import { ProgressBar } from '@/components/ProgressBar'
import type { HoursSummary } from '@/lib/hours'
import { cn, plural } from '@/lib/utils'

function LegendItem({ dot, value, label }: { dot: string; value: string; label: string }) {
  return (
    <li className="flex items-center gap-1.5 text-12">
      <span aria-hidden="true" className={cn('size-3 flex-none rounded-full', dot)} />
      <span className="font-semibold text-ink">{value}</span>
      <span className="text-inkSoft">{label}</span>
    </li>
  )
}

function SideCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-well px-4 py-3.5">
      <div className="text-11 font-bold uppercase tracking-[0.06em] text-inkSoft">{label}</div>
      <div className="mt-1.5 font-display text-15 font-semibold leading-snug text-ink">{children}</div>
    </div>
  )
}

interface HoursHeroCardProps {
  hours: HoursSummary
  pendingDocuments: number
}

/** Tarjeta principal del inicio: cuánto falta, el reparto de las horas y lo que espera una revisión. */
export function HoursHeroCard({ hours, pendingDocuments }: HoursHeroCardProps) {
  const { approvedHours, submittedHours, requiredHours, approvedPct, submittedPct } = hours
  const remaining = Math.max(0, requiredHours - approvedHours)
  const toRegister = Math.max(0, requiredHours - approvedHours - submittedHours)

  return (
    <section className="relative overflow-hidden rounded-2xl bg-surface p-6 shadow-[0_4px_24px_hsl(var(--scrim)/0.07)] lg:p-7">
      <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-20 size-80 rounded-full bg-[hsl(var(--cafe-light)/0.2)] blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 left-1/3 size-72 rounded-full bg-hero blur-3xl" />

      <div className="relative z-10 flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-stamp px-3 py-1 text-11 font-bold text-surface">
              <GraduationCap aria-hidden="true" className="size-3.5" />
              Meta: {requiredHours} horas
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-chipPending px-2.5 py-1 text-11 font-bold text-pending">
              <Zap aria-hidden="true" className="size-3.5" />
              Aprobado: {Math.round(approvedPct)} %
            </span>
          </div>

          <h2 className="mt-4 max-w-2xl font-display text-22 font-bold leading-tight tracking-[-0.02em] text-stamp">
            {remaining > 0 ? (
              <>
                Te faltan{' '}
                <span className="underline decoration-dotPending decoration-2 underline-offset-4">
                  {remaining.toFixed(1)} horas aprobadas
                </span>{' '}
                para completar tu práctica
              </>
            ) : (
              'Completaste las horas requeridas de tu práctica'
            )}
          </h2>
          <p className="mt-1.5 max-w-xl text-14 leading-relaxed text-inkMid">
            Registra tus horas el mismo día. Tu tutor las revisa y lo que apruebe cuenta para el acta final.
          </p>

          <ProgressBar
            className="mt-4"
            size="lg"
            value={approvedPct}
            pendingValue={submittedPct}
            label="Progreso de horas aprobadas"
          />
          <ul aria-label="Reparto de las horas" className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
            <LegendItem dot="bg-stamp" value={`${approvedHours.toFixed(1)} h`} label="aprobadas" />
            <LegendItem dot="bg-dotPending" value={`${submittedHours.toFixed(1)} h`} label="sin revisar" />
            <LegendItem dot="bg-line" value={`${toRegister.toFixed(1)} h`} label="por registrar" />
          </ul>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2 xl:w-[260px] xl:grid-cols-1">
          <SideCard label="Sin aprobar">{submittedHours.toFixed(1)} h esperando a tu tutor</SideCard>
          <SideCard label="Documentos">{plural(pendingDocuments, 'documento pendiente', 'documentos pendientes')}</SideCard>
        </div>
      </div>
    </section>
  )
}
