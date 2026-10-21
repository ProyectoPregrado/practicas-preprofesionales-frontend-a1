import { type FormEvent, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { submitEvaluation } from '@/api/evaluations'
import { useAuth } from '@/auth/AuthContext'
import { PageHeader } from '@/components/PageHeader'
import { ProgressBar } from '@/components/ProgressBar'
import { EmptyState, LoadingState, Panel, Section } from '@/components/Panel'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { parseLocalDate } from '@/lib/date'
import { summarizeHours } from '@/lib/hours'
import { db, type LocalHourLog, type LocalPlacement } from '@/offline/db'

type ScoreField = 'technical' | 'communication' | 'punctuality'

// Rúbrica fija (technical, communication, punctuality, 1 a 5): una épica
// posterior del backlog la reemplaza por criterios configurables — no se
// adelanta esa flexibilidad aquí.
const CRITERIA: { field: ScoreField; label: string; hint: string }[] = [
  { field: 'technical', label: 'Desempeño técnico', hint: 'Calidad y autonomía en las tareas asignadas.' },
  { field: 'communication', label: 'Comunicación', hint: 'Claridad con el equipo y al pedir ayuda.' },
  { field: 'punctuality', label: 'Puntualidad', hint: 'Cumple horarios y plazos acordados.' },
]

// Cómo leer cada puntaje: se muestra junto a la rúbrica, no dentro del desplegable, para que las opciones sigan
// siendo solo el número.
const SCALE: { score: number; label: string }[] = [
  { score: 1, label: 'Insuficiente' },
  { score: 2, label: 'Por mejorar' },
  { score: 3, label: 'Cumple' },
  { score: 4, label: 'Bueno' },
  { score: 5, label: 'Excelente' },
]

/** Promedio de los puntajes ya elegidos; `null` mientras no haya ninguno. */
function averageOf(scores: Record<ScoreField, string>): number | null {
  const chosen = Object.values(scores).filter(Boolean).map(Number)
  if (chosen.length === 0) return null
  return chosen.reduce((sum, score) => sum + score, 0) / chosen.length
}

const SCORE_OPTIONS = ['1', '2', '3', '4', '5']

// Periodo académico AAAA-1 (enero-junio) o AAAA-2 (julio-diciembre), tal
// como lo espera el backend (ver AccreditationService.reportForPeriod). Se
// deriva de la fecha de inicio del placement: la rúbrica no le pide este
// dato al tutor.
function periodFromStartDate(startDate: string): string {
  const parsed = parseLocalDate(startDate)
  const year = parsed.getFullYear()
  const term = parsed.getMonth() < 6 ? 1 : 2
  return `${year}-${term}`
}

interface EvaluationSummaryProps {
  placement: LocalPlacement
  average: number | null
}

/** Columna de apoyo: cómo va el practicante en horas, el promedio que se está armando y la escala. */
function EvaluationSummary({ placement, average }: EvaluationSummaryProps) {
  const logs = useLiveQuery<LocalHourLog[]>(
    () => db.hourLogs.where('placementId').equals(placement.id).toArray(),
    [placement.id],
  )
  const hours = summarizeHours(logs, placement.requiredHours)
  return (
    <>
      <Section title="Resumen del practicante">
        <div className="flex flex-col gap-3 px-[18px] py-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-13 text-inkSoft">Horas aprobadas</span>
            <span className="font-data text-14 text-ink">
              {hours.approvedHours.toFixed(1)} / {hours.requiredHours}
            </span>
          </div>
          <ProgressBar value={hours.approvedPct} pendingValue={hours.submittedPct} label="Progreso de horas aprobadas" />
          <div className="flex items-baseline justify-between gap-3 border-t border-paperRule pt-3">
            <span className="text-13 text-inkSoft">Promedio de la rúbrica</span>
            <span className="font-display text-22 font-bold text-stamp">
              {average === null ? '—' : average.toFixed(1)}
              <span className="ml-1 text-13 font-normal text-inkSoft">/ 5</span>
            </span>
          </div>
        </div>
      </Section>

      <Section title="Escala">
        <dl className="divide-y divide-paperRule">
          {SCALE.map(({ score, label }) => (
            <div key={score} className="flex items-center gap-3 px-[18px] py-2.5">
              <dt className="flex size-7 flex-none items-center justify-center rounded-lg bg-soft font-data text-13 font-semibold text-stamp">
                {score}
              </dt>
              <dd className="text-14 text-inkBody">{label}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </>
  )
}

/** Evaluación del tutor sobre un placement: rúbrica fija + comentario. No sincronizable: siempre requiere red. */
export function EvaluatePage() {
  const { id } = useParams<{ id: string }>()
  const placementId = Number(id)
  const { user } = useAuth()

  const placement = useLiveQuery<LocalPlacement | null | undefined>(async () => {
    const found = await db.placements.get(placementId)
    return found ?? null
  }, [placementId])

  const [scores, setScores] = useState<Record<ScoreField, string>>({
    technical: '',
    communication: '',
    punctuality: '',
  })
  const [comment, setComment] = useState('')
  const [errors, setErrors] = useState<Partial<Record<ScoreField, string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  if (placement === undefined) {
    return <LoadingState>Cargando practicante…</LoadingState>
  }

  if (placement === null) {
    return (
      <EmptyState
        title="No se encontró este practicante"
        description="El practicante no existe o no está registrado en tu lista."
        action={
          <Button asChild size="sm">
            <Link to="/practicantes">Volver a la lista</Link>
          </Button>
        }
      />
    )
  }

  if (user?.role === 'TUTOR' && placement.tutorId !== user.id) {
    return (
      <EmptyState
        title="Práctica no asignada"
        description="Esta práctica está asignada a otro tutor. No tienes permisos para evaluarla."
        action={
          <Button asChild size="sm">
            <Link to="/practicantes">Volver a la lista</Link>
          </Button>
        }
      />
    )
  }

  const period = periodFromStartDate(placement.startDate)

function getEvaluateErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.statusCode === 403) {
    return 'No tienes permiso para evaluar esta práctica porque no eres el tutor asignado.'
  }
  if (err instanceof ApiError) {
    return err.message
  }
  return 'No se pudo enviar la evaluación'
}

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitError(null)

    const nextErrors: Partial<Record<ScoreField, string>> = {}
    for (const { field } of CRITERIA) {
      if (!scores[field]) nextErrors[field] = 'Selecciona un puntaje'
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    try {
      await submitEvaluation({
        placementId,
        kind: 'TUTOR',
        period,
        scores: {
          technical: Number(scores.technical),
          communication: Number(scores.communication),
          punctuality: Number(scores.punctuality),
        },
        comment: comment.trim() || undefined,
      })
      setSubmitted(true)
    } catch (err) {
      setSubmitError(getEvaluateErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Evaluar practicante"
        subtitle={`Estudiante #${placement.studentId} · Empresa #${placement.companyId} · periodo ${period}`}
        actions={
          <Button asChild variant="outline">
            <Link to={`/practicantes/${placementId}/horas`}>Ver libro de horas</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <EvaluationSummary placement={placement} average={averageOf(scores)} />
      </div>

      {submitted ? (
        <Panel>
          <EmptyState
            title="Evaluación enviada"
            description="La coordinación ya la puede ver en el acta del periodo."
            action={
              <Button asChild size="sm">
                <Link to="/practicantes">Volver a mis practicantes</Link>
              </Button>
            }
          />
        </Panel>
      ) : (
        <Section title="Rúbrica">
          <form className="flex flex-col gap-4 px-[18px] py-4" onSubmit={handleSubmit} noValidate>
            <div className="grid gap-4 sm:grid-cols-3">
              {CRITERIA.map(({ field, label, hint }) => (
                <div key={field} className="flex flex-col gap-1.5">
                  <Label htmlFor={`eval-${field}`}>{label}</Label>
                  <p className="text-12 text-inkSoft">{hint}</p>
                  <Select
                    value={scores[field]}
                    onValueChange={(value) => setScores((prev) => ({ ...prev, [field]: value }))}
                  >
                    <SelectTrigger
                      id={`eval-${field}`}
                      className="font-data"
                      aria-invalid={Boolean(errors[field])}
                    >
                      <SelectValue placeholder="1 a 5" />
                    </SelectTrigger>
                    <SelectContent>
                      {SCORE_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option} className="font-data">
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors[field] ? (
                    <p role="alert" className="text-12 text-void">
                      {errors[field]}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="eval-comment">Comentario</Label>
              <p className="text-12 text-inkSoft">
                Opcional. Queda en el acta junto con los puntajes.
              </p>
              <Textarea
                id="eval-comment"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                rows={4}
                placeholder="Observaciones sobre el desempeño del practicante"
              />
            </div>

            {submitError ? (
              <p role="alert" className="rounded-md bg-chipVoid px-3 py-2.5 text-13 text-void">
                {submitError}
              </p>
            ) : null}

            <Button type="submit" disabled={submitting} className="self-start">
              {submitting ? 'Enviando…' : 'Enviar evaluación'}
            </Button>
          </form>
        </Section>
      )}
    </>
  )
}
