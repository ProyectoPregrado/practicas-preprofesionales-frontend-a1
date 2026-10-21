import { Eye, FileImage, FileText } from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { FilterTabs } from '@/components/FilterTabs'
import { EmptyState, LoadingState, Section } from '@/components/Panel'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/date'
import { DOCUMENT_KIND_LABEL, type DocumentKind, documentKindLabel, formatFileSize } from '@/lib/documentFiles'
import { plural } from '@/lib/utils'
import type { LocalDocument } from '@/offline/db'
import { DocumentViewer } from './DocumentViewer'

const KIND_FILTERS = [
  { value: 'ALL', label: 'Todos' },
  ...(Object.keys(DOCUMENT_KIND_LABEL) as DocumentKind[]).map((kind) => ({ value: kind, label: DOCUMENT_KIND_LABEL[kind] })),
]

interface DocumentListProps {
  title: ReactNode
  documents: LocalDocument[] | undefined
  emptyTitle: string
  emptyDescription?: string
}

/**
 * Lista de documentos con filtro por tipo, los más recientes primero, y un visor para abrir cada uno sin salir de la
 * pantalla. La usan el estudiante (sus documentos) y el tutor (los de su practicante).
 */
export function DocumentList({ title, documents, emptyTitle, emptyDescription }: DocumentListProps) {
  const [kindFilter, setKindFilter] = useState('ALL')
  const [viewing, setViewing] = useState<LocalDocument | null>(null)

  const visible = useMemo(
    () =>
      (documents ?? [])
        .filter((doc) => kindFilter === 'ALL' || doc.kind === kindFilter)
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
    [documents, kindFilter],
  )

  if (documents === undefined) {
    return (
      <Section title={title}>
        <LoadingState>Cargando documentos…</LoadingState>
      </Section>
    )
  }

  if (documents.length === 0) {
    return (
      <Section title={title}>
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </Section>
    )
  }

  return (
    <Section
      title={title}
      aside={<span className="font-data text-12 text-inkSoft">{plural(documents.length, 'documento', 'documentos')}</span>}
    >
      <div className="border-b border-paperRule px-[18px] py-2.5">
        <FilterTabs label="Filtrar por tipo" surface="well" options={KIND_FILTERS} value={kindFilter} onChange={setKindFilter} />
      </div>
      {visible.length === 0 ? (
        <EmptyState title="Ningún documento de este tipo" description="Elige «Todos» para ver la lista completa." />
      ) : (
        <ul className="divide-y divide-paperRule">
          {visible.map((doc) => {
            const Icon = doc.mimeType?.startsWith('image/') ? FileImage : FileText
            return (
              <li key={doc.id} className="flex min-h-row items-center gap-3 px-[18px] py-2.5">
                <span aria-hidden="true" className="flex size-9 flex-none items-center justify-center rounded-xl bg-soft text-stamp">
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-14 font-semibold text-ink">{doc.filename}</div>
                  <div className="mt-0.5 text-12 text-inkSoft">
                    {documentKindLabel(doc.kind)} · <span className="font-data">{formatDate(doc.updatedAt)}</span>
                    {doc.size ? <span className="font-data"> · {formatFileSize(doc.size)}</span> : null}
                  </div>
                </div>
                <StatusBadge status={doc.status} domain="document" />
                <Button type="button" size="sm" variant="outline" onClick={() => setViewing(doc)} aria-label={`Ver ${doc.filename}`}>
                  <Eye aria-hidden="true" />
                  Ver
                </Button>
              </li>
            )
          })}
        </ul>
      )}
      <DocumentViewer document={viewing} onClose={() => setViewing(null)} />
    </Section>
  )
}
