import type { HoursSummary } from '@/lib/hours'
import type { LocalDocument } from '@/offline/db'

export type RequirementState = 'done' | 'progress' | 'todo'

export interface Requirement {
  key: 'agreement' | 'insurance' | 'hours' | 'report'
  title: string
  detail: string
  state: RequirementState
}

interface DocumentRule {
  key: 'agreement' | 'insurance' | 'report'
  kind: string
  title: string
}

const DOCUMENT_RULES: DocumentRule[] = [
  { key: 'agreement', kind: 'AGREEMENT', title: 'Convenio validado' },
  { key: 'insurance', kind: 'INSURANCE', title: 'Seguro validado' },
  { key: 'report', kind: 'REPORT', title: 'Informe final validado' },
]

/** El documento más reciente de un tipo, o `undefined` si no se subió ninguno. */
function latestOf(documents: LocalDocument[], kind: string): LocalDocument | undefined {
  return documents
    .filter((doc) => doc.kind === kind)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0]
}

function documentRequirement(documents: LocalDocument[], rule: DocumentRule): Requirement {
  const { key, title } = rule
  const status = latestOf(documents, rule.kind)?.status
  if (status === 'VALIDATED') return { key, title, state: 'done', detail: 'Validado' }
  if (status === 'REJECTED') return { key, title, state: 'todo', detail: 'Rechazado: sube uno nuevo' }
  if (status === undefined) return { key, title, state: 'todo', detail: 'Falta subirlo' }
  return { key, title, state: 'progress', detail: 'En revisión' }
}

function hoursRequirement(hours: HoursSummary): Requirement {
  const title = 'Horas requeridas aprobadas'
  const { approvedHours, submittedHours, requiredHours } = hours
  // E5-01b: sin horas requeridas el requisito de horas está cumplido.
  if (requiredHours <= 0) return { key: 'hours', title, state: 'done', detail: 'Esta práctica no exige horas' }
  if (approvedHours >= requiredHours) {
    return { key: 'hours', title, state: 'done', detail: `${approvedHours.toFixed(1)} de ${requiredHours} aprobadas` }
  }
  if (approvedHours + submittedHours > 0) {
    return {
      key: 'hours',
      title,
      state: 'progress',
      detail: `Llevas ${approvedHours.toFixed(1)} aprobadas y ${submittedHours.toFixed(1)} sin revisar, de ${requiredHours}`,
    }
  }
  return { key: 'hours', title, state: 'todo', detail: 'Aún no has registrado horas' }
}

interface RequirementsInput {
  /** `undefined` mientras cargan: se tratan como ausentes. */
  documents: LocalDocument[] | undefined
  hours: HoursSummary
}

/**
 * Lo que la acreditación pide a la persona, con su estado: convenio, seguro, horas e informe final. Solo usa datos
 * que la aplicación ya tiene (documentos y horas); las evaluaciones no se muestran porque aquí no se conocen.
 */
export function placementRequirements({ documents, hours }: RequirementsInput): Requirement[] {
  const docs = documents ?? []
  const [agreement, insurance, report] = DOCUMENT_RULES.map((rule) => documentRequirement(docs, rule))
  return [agreement, insurance, hoursRequirement(hours), report]
}
