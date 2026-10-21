import { CheckCheck, Sparkles } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { type ReviewHint, getReviewHints } from '@/api/ai'
import { Button } from '@/components/ui/button'
import { describeError } from '@/lib/describeError'
import { plural } from '@/lib/utils'
import { AiModeTag } from './HintDot'

export interface ReviewAssistant {
  hints: Map<number, ReviewHint>
  aiUsed: boolean
  loading: boolean
  error: string | null
  analyzed: boolean
  run: () => Promise<void>
}

/** IA-1: pide el semáforo de los registros sin revisar de una práctica y lo guarda por id de registro. */
export function useReviewAssistant(placementId: number): ReviewAssistant {
  const [hints, setHints] = useState<Map<number, ReviewHint>>(new Map())
  const [aiUsed, setAiUsed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analyzed, setAnalyzed] = useState(false)

  const run = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getReviewHints(placementId)
      setHints(new Map(result.hints.map((hint) => [hint.logId, hint])))
      setAiUsed(result.aiUsed)
      setAnalyzed(true)
    } catch (err) {
      setError(
        describeError(err, { forbidden: 'Esta práctica está asignada a otro tutor.' }) ??
          'No se pudo analizar. Revisa tu conexión e inténtalo de nuevo.',
      )
    } finally {
      setLoading(false)
    }
  }, [placementId])

  return { hints, aiUsed, loading, error, analyzed, run }
}

function analyzeLabel({ loading, analyzed }: ReviewAssistant): string {
  if (loading) return 'Analizando…'
  return analyzed ? 'Volver a analizar' : 'Analizar con IA'
}

interface ReviewAssistantBarProps {
  assistant: ReviewAssistant
  /** Ids de los registros que siguen sin revisar, para no contar los que ya se decidieron. */
  pendingIds: Set<number>
  onApproveGreens: (logIds: number[]) => Promise<void> | void
  busy: boolean
}

/**
 * Barra de la revisión asistida: analizar, el resumen del semáforo y aprobar de una vez lo que está en verde. Lo
 * amarillo y lo rojo queda para que el tutor lo mire uno por uno.
 */
export function ReviewAssistantBar({ assistant, pendingIds, onApproveGreens, busy }: ReviewAssistantBarProps) {
  const pending = useMemo(
    () => [...assistant.hints.values()].filter((hint) => pendingIds.has(hint.logId)),
    [assistant.hints, pendingIds],
  )
  const greens = pending.filter((hint) => hint.level === 'green').map((hint) => hint.logId)
  const toCheck = pending.length - greens.length

  return (
    <section
      aria-label="Revisión asistida"
      className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface px-[18px] py-3.5 shadow-[0_2px_12px_hsl(var(--scrim)/0.05)]"
    >
      <Sparkles aria-hidden="true" className="size-5 text-stamp" />
      <div className="min-w-0 flex-1">
        <p className="font-display text-15 font-semibold text-ink">Revisión asistida</p>
        <p className="text-13 text-inkSoft">
          {assistant.analyzed
            ? `${plural(greens.length, 'registro se ve bien', 'registros se ven bien')} · ${plural(toCheck, 'necesita tu revisión', 'necesitan tu revisión')}`
            : 'La IA marca cada registro en verde, amarillo o rojo y sugiere la nota para devolver.'}
        </p>
        {assistant.error ? (
          <p role="alert" className="text-12 text-void">
            {assistant.error}
          </p>
        ) : null}
      </div>
      {assistant.analyzed ? <AiModeTag aiUsed={assistant.aiUsed} /> : null}
      <Button type="button" variant="outline" onClick={assistant.run} disabled={assistant.loading || pendingIds.size === 0}>
        <Sparkles aria-hidden="true" />
        {analyzeLabel(assistant)}
      </Button>
      {greens.length > 0 ? (
        <Button type="button" onClick={() => onApproveGreens(greens)} disabled={busy}>
          <CheckCheck aria-hidden="true" />
          Aprobar {plural(greens.length, 'verde', 'verdes')}
        </Button>
      ) : null}
    </section>
  )
}
