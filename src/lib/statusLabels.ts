/** Qué se está calificando: el género de la etiqueta («Rechazada» / «Rechazado») y sus valores dependen de eso. */
export type StatusDomain = 'hour' | 'document'

// Solo para mostrar. Lo que se guarda y se envía a la API sigue siendo el valor del backend.
const LABELS: Record<StatusDomain, Record<string, string>> = {
  hour: {
    DRAFT: 'Borrador',
    SUBMITTED: 'En revisión',
    APPROVED: 'Aprobada',
    REJECTED: 'Rechazada',
  },
  document: {
    PENDING: 'En revisión',
    VALIDATED: 'Validado',
    REJECTED: 'Rechazado',
  },
}

/** El estado en español; si no se conoce, el valor tal cual, para no esconder un estado nuevo del backend. */
export function statusLabel(status: string, domain: StatusDomain): string {
  return LABELS[domain][status] ?? status
}
