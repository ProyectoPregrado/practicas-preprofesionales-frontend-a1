import { api } from './client'

export type HintLevel = 'green' | 'yellow' | 'red'

export interface HourLogDraft {
  date: string
  startTime: string
  endTime: string
  hours: number | null
  activity: string
  followUp: string
  warnings: string[]
  /** `false` cuando respondió el modo básico (sin clave de IA o con la API caída). */
  aiUsed: boolean
}

export interface ReviewHint {
  logId: number
  level: HintLevel
  reasons: string[]
  suggestedNote: string
}

export interface ReviewHintsResult {
  aiUsed: boolean
  hints: ReviewHint[]
}

export interface DocumentFinding {
  level: HintLevel
  message: string
}

export interface DocumentCheckResult {
  aiUsed: boolean
  extracted: {
    documentType: string
    personName: string
    companyName: string
    validFrom: string
    validTo: string
    policyNumber: string
    summary: string
  } | null
  findings: DocumentFinding[]
}

/** IA-1: si el servidor tiene la IA configurada. */
export function getAiStatus(): Promise<{ enabled: boolean }> {
  return api<{ enabled: boolean }>('/ai/status')
}

/** Lo que la persona contó de su día, convertido en un registro para revisar antes de guardar. */
export function draftHourLog(text: string, today: string): Promise<HourLogDraft> {
  return api<HourLogDraft>('/ai/hour-log-draft', { method: 'POST', body: JSON.stringify({ text, today }) })
}

/** IA-3: el audio del dictado (WAV), transcrito por la IA del servidor. */
export function transcribeAudio(audio: Blob): Promise<{ text: string }> {
  const form = new FormData()
  form.append('audio', audio, 'dictado.wav')
  return api<{ text: string }>('/ai/transcribe', { method: 'POST', body: form })
}

/** Semáforo de los registros sin revisar de una práctica. */
export function getReviewHints(placementId: number): Promise<ReviewHintsResult> {
  return api<ReviewHintsResult>(`/ai/placements/${placementId}/review-hints`)
}

/** La IA lee el documento y lo compara con la práctica. */
export function checkDocument(documentId: number): Promise<DocumentCheckResult> {
  return api<DocumentCheckResult>(`/ai/documents/${documentId}/check`, { method: 'POST' })
}
