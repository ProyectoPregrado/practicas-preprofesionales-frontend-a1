import { ClipboardCheck, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { HeroSurface } from '@/components/HeroSurface'
import { ProgressBar } from '@/components/ProgressBar'
import { Button } from '@/components/ui/button'
import type { QueueSummary } from '@/lib/tutorQueue'
import { plural } from '@/lib/utils'

interface TutorQueueHeroProps {
  summary: QueueSummary
  /** Plaza del primer practicante de la cola con horas esperando; `null` si no hay nada que revisar. */
  nextPlacementId: number | null
}

/** Tarjeta principal del tutor: cuánto le espera, a quién revisar primero y cómo va el grupo. */
export function TutorQueueHero({ summary, nextPlacementId }: TutorQueueHeroProps) {
  const { students, waiting, pendingHours, pendingLogs, averagePct } = summary

  return (
    <HeroSurface>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-stamp px-3 py-1 text-11 font-bold text-surface">
            <Users aria-hidden="true" className="size-3.5" />
            {plural(students, 'practicante', 'practicantes')}
          </span>
          {waiting > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-chipPending px-2.5 py-1 text-11 font-bold text-pending">
              <ClipboardCheck aria-hidden="true" className="size-3.5" />
              {plural(pendingLogs, 'registro por revisar', 'registros por revisar')}
            </span>
          ) : null}
        </div>

        <h2 className="mt-4 max-w-2xl font-display text-22 font-bold leading-tight tracking-[-0.02em] text-stamp">
          {waiting > 0 ? (
            <>
              Tienes{' '}
              <span className="underline decoration-dotPending decoration-2 underline-offset-4">
                {pendingHours.toFixed(1)} horas por revisar
              </span>{' '}
              de {plural(waiting, 'practicante', 'practicantes')}
            </>
          ) : (
            'Estás al día: no hay horas esperando tu revisión'
          )}
        </h2>
        <p className="mt-1.5 max-w-xl text-14 leading-relaxed text-inkMid">
          Lo que apruebes cuenta para el acta final. Si devuelves un registro, el estudiante lee tu nota tal cual.
        </p>

        {averagePct !== null ? (
          <div className="mt-4 max-w-xl">
            <div className="flex items-baseline justify-between gap-3 text-12 text-inkSoft">
              <span>Avance medio del grupo</span>
              <span className="font-data">{Math.round(averagePct)} %</span>
            </div>
            <ProgressBar className="mt-1.5" value={averagePct} label="Avance medio de horas aprobadas" />
          </div>
        ) : null}
      </div>

      {nextPlacementId !== null ? (
        <div className="flex flex-col gap-2 xl:w-[220px]">
          <Button asChild size="lg">
            <Link to={`/practicantes/${nextPlacementId}/horas`}>Revisar al primero de la cola</Link>
          </Button>
          <p className="text-12 text-inkSoft">El que más horas tiene esperando.</p>
        </div>
      ) : null}
    </HeroSurface>
  )
}
