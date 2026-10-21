import type { HintLevel } from '@/api/ai'
import { cn } from '@/lib/utils'

const LEVEL: Record<HintLevel, { label: string; dot: string; chip: string }> = {
  green: { label: 'Se ve bien', dot: 'bg-stamp', chip: 'bg-chipStamp text-stamp' },
  yellow: { label: 'Revisar', dot: 'bg-dotPending', chip: 'bg-chipPending text-pending' },
  red: { label: 'Atención', dot: 'bg-dotVoid', chip: 'bg-chipVoid text-void' },
}

/** El color del semáforo con su palabra: no se depende solo del color para entenderlo. */
export function HintDot({ level, className }: { level: HintLevel; className?: string }) {
  const { label, dot, chip } = LEVEL[level]
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-11 font-semibold', chip, className)}>
      <span aria-hidden="true" className={cn('size-2 rounded-full', dot)} />
      {label}
    </span>
  )
}

/** «con IA» o «modo básico»: qué respondió, para no presentar reglas como si fueran IA. */
export function AiModeTag({ aiUsed }: { aiUsed: boolean }) {
  return (
    <span className="rounded-full bg-soft px-2 py-0.5 text-11 font-semibold text-inkSoft">
      {aiUsed ? 'Analizado con IA' : 'Modo básico (sin IA)'}
    </span>
  )
}
