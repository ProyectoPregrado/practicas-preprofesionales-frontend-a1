import { Loader2, Mic, Square, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { type HourLogDraft, draftHourLog } from '@/api/ai'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { describeError } from '@/lib/describeError'
import { todayAsInputValue } from '@/lib/hourLogHelpers'
import { useOnline } from '@/offline/hooks/useOnline'
import { AiModeTag } from './HintDot'
import { type DictationState, useVoiceDictation } from './useVoiceDictation'

interface FeedbackProps {
  online: boolean
  result: HourLogDraft | null
  error: string | null
  speechError: string | null
}

/** Lo que el asistente le dice a la persona después de completar: qué falta, qué no cumple y qué hacer. */
function DraftFeedback({ online, result, error, speechError }: FeedbackProps) {
  return (
    <>
      {!online ? <p className="text-12 text-inkSoft">Sin conexión: llena el formulario a mano; se guarda igual.</p> : null}
      {speechError ? <p className="text-12 text-void">{speechError}</p> : null}
      {error ? (
        <p role="alert" className="text-12 text-void">
          {error}
        </p>
      ) : null}
      {result?.followUp ? <p className="text-13 font-semibold text-pending">{result.followUp}</p> : null}
      {result?.warnings.map((warning) => (
        <p key={warning} className="text-12 text-void">
          {warning}
        </p>
      ))}
      {result && !result.followUp ? (
        <p className="text-12 text-inkSoft">Revisa los datos de abajo y pulsa «Guardar horas».</p>
      ) : null}
    </>
  )
}

interface DictateButtonProps {
  state: DictationState
  disabled: boolean
  onStart: () => void
  onStop: () => void
}

/** Un solo botón para las tres fases del dictado: grabar, detener y esperar la transcripción. */
function DictateButton({ state, disabled, onStart, onStop }: DictateButtonProps) {
  if (state === 'transcribing') {
    return (
      <Button type="button" size="sm" variant="outline" disabled>
        <Loader2 aria-hidden="true" className="animate-spin" />
        Transcribiendo…
      </Button>
    )
  }
  if (state === 'recording') {
    return (
      <Button type="button" size="sm" variant="outline" onClick={onStop}>
        <Square aria-hidden="true" />
        Detener
      </Button>
    )
  }
  return (
    <Button type="button" size="sm" variant="outline" onClick={onStart} disabled={disabled}>
      <Mic aria-hidden="true" />
      Dictar
    </Button>
  )
}

interface DictateDayPanelProps {
  /** Recibe el borrador para llenar el formulario; la persona lo revisa antes de guardar. */
  onDraft: (draft: HourLogDraft) => void
}

/**
 * IA-1: «cuéntale tu día». La persona escribe o dicta qué hizo y la IA llena fecha, horario, horas y una actividad
 * bien redactada. Necesita conexión; sin ella el formulario se llena a mano como siempre.
 */
export function DictateDayPanel({ onDraft }: DictateDayPanelProps) {
  const online = useOnline()
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<HourLogDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const dictation = useVoiceDictation((said) => setText((prev) => (prev ? `${prev} ${said}` : said)))
  const canComplete = online && !loading && dictation.state === 'idle' && text.trim() !== ''

  async function complete() {
    setLoading(true)
    setError(null)
    try {
      const draft = await draftHourLog(text.trim(), todayAsInputValue())
      setResult(draft)
      onDraft(draft)
    } catch (err) {
      setError(
        describeError(err, { forbidden: 'Solo el estudiante puede completar su registro con IA.' }) ??
          'No se pudo completar el registro. Llénalo a mano.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <section aria-label="Asistente de registro" className="flex flex-col gap-2 rounded-xl bg-hero/60 p-3.5">
      <div className="flex items-center gap-2">
        <Sparkles aria-hidden="true" className="size-4 text-stamp" />
        <Label htmlFor="dictate-day" className="font-display text-14 font-semibold text-ink">
          Cuéntale tu día a la IA
        </Label>
      </div>
      <Textarea
        id="dictate-day"
        rows={3}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Ej.: Hoy de 8 a 12 configuré el servidor de pruebas y documenté la instalación."
        disabled={!online}
      />
      <div className="flex flex-wrap items-center gap-2">
        {dictation.supported ? (
          <DictateButton state={dictation.state} disabled={!online} onStart={dictation.start} onStop={dictation.stop} />
        ) : null}
        <Button type="button" size="sm" onClick={complete} disabled={!canComplete}>
          <Sparkles aria-hidden="true" />
          {loading ? 'Completando…' : 'Completar con IA'}
        </Button>
        {dictation.state === 'recording' ? (
          <span className="text-12 font-semibold text-void">● Grabando… pulsa «Detener» al terminar</span>
        ) : null}
        {result ? <AiModeTag aiUsed={result.aiUsed} /> : null}
      </div>
      <DraftFeedback online={online} result={result} error={error} speechError={dictation.error} />
    </section>
  )
}
