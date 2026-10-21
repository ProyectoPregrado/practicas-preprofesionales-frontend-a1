import { CheckCircle2, Circle, Timer } from 'lucide-react'
import type { Requirement, RequirementState } from '@/lib/placementRequirements'
import { cn } from '@/lib/utils'

const STATE_ICON = {
  done: { Icon: CheckCircle2, className: 'text-stamp' },
  progress: { Icon: Timer, className: 'text-dotPending' },
  todo: { Icon: Circle, className: 'text-inkMute' },
} as const

const STATE_LABEL: Record<RequirementState, string> = {
  done: 'Hecho',
  progress: 'En curso',
  todo: 'Pendiente',
}

/** Lo que falta para acreditar, con su estado: el icono se acompaña de texto para no depender solo del color. */
export function RequirementsList({ items }: { items: Requirement[] }) {
  const done = items.filter((item) => item.state === 'done').length

  return (
    <section aria-label="Requisitos para acreditar" className="rounded-2xl bg-surface p-5 shadow-[0_2px_12px_hsl(var(--scrim)/0.05)]">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-15 font-bold text-ink">Requisitos para acreditar</h3>
        <span className="text-12 font-bold text-dotPending">
          {done} de {items.length}
        </span>
      </div>

      <ul className="mt-3 flex flex-col gap-3">
        {items.map(({ key, title, detail, state }) => {
          const { Icon, className } = STATE_ICON[state]
          return (
            <li key={key} className={cn('flex items-start gap-2.5', state === 'todo' && 'opacity-80')}>
              <Icon aria-hidden="true" className={cn('mt-0.5 size-5 flex-none', className)} />
              <div className="min-w-0 flex-1">
                <p className="text-13 font-semibold text-ink">
                  {title} <span className="sr-only">({STATE_LABEL[state]})</span>
                </p>
                <p className="text-12 text-inkSoft">{detail}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
