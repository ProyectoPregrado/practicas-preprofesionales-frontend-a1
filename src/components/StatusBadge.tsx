import { Chip, type ChipTone } from '@/components/Chip'
import { type StatusDomain, statusLabel } from '@/lib/statusLabels'

const STATUS_TONE: Record<string, ChipTone> = {
  APPROVED: 'stamp',
  ACCEPTED: 'stamp',
  ACTIVE: 'stamp',
  VALIDATED: 'stamp',
  PUBLISHED: 'stamp',
  ACREDITADO: 'stamp',
  SUBMITTED: 'pending',
  PENDING: 'pending',
  PENDING_DOCS: 'pending',
  INTERVIEW: 'pending',
  DRAFT: 'pending',
  PENDIENTE: 'pending',
  ACREDITADO_CON_OBSERVACIONES: 'pending',
  REJECTED: 'void',
  ABANDONED: 'void',
  SUSPENDED: 'void',
  CLOSED: 'void',
  WITHDRAWN: 'void',
  NO_ACREDITADO: 'void',
}

interface StatusBadgeProps {
  /** Valor del backend: de él sale el color. */
  status: string
  /** Si se indica, el texto se muestra en español; sin él se muestra el valor tal cual. */
  domain?: StatusDomain
}

export function StatusBadge({ status, domain }: StatusBadgeProps) {
  return <Chip tone={STATUS_TONE[status] ?? 'neutral'}>{domain ? statusLabel(status, domain) : status}</Chip>
}
