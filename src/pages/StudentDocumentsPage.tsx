import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useParams } from 'react-router-dom'
import { Chip } from '@/components/Chip'
import { DocumentList } from '@/components/documents/DocumentList'
import { PageHeader } from '@/components/PageHeader'
import { Section } from '@/components/Panel'
import { StatusBadge } from '@/components/StatusBadge'
import { TutorPlacementGate } from '@/components/tutor/TutorPlacementGate'
import { Button } from '@/components/ui/button'
import { DOCUMENT_KIND_LABEL, type DocumentKind } from '@/lib/documentFiles'
import { db, type LocalDocument, type LocalPlacement } from '@/offline/db'

// Espejo de REQUIRED_DOCS en el backend: los dos que bloquean la activación de la práctica.
const REQUIRED_KINDS: DocumentKind[] = ['AGREEMENT', 'INSURANCE']

function latestOfKind(documents: LocalDocument[], kind: DocumentKind): LocalDocument | undefined {
  return documents.filter((doc) => doc.kind === kind).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0]
}

function RequiredSummary({ documents }: { documents: LocalDocument[] | undefined }) {
  return (
    <Section title="Obligatorios para activar la práctica">
      <dl className="divide-y divide-paperRule">
        {REQUIRED_KINDS.map((kind) => {
          const latest = documents ? latestOfKind(documents, kind) : undefined
          return (
            <div key={kind} className="flex min-h-row items-center justify-between gap-4 px-[18px] py-2.5">
              <dt className="text-14 font-semibold text-ink">{DOCUMENT_KIND_LABEL[kind]}</dt>
              <dd>
                {latest ? <StatusBadge status={latest.status} domain="document" /> : <Chip tone="void">Sin subir</Chip>}
              </dd>
            </div>
          )
        })}
      </dl>
    </Section>
  )
}

function PlacementDocuments({ placement }: { placement: LocalPlacement }) {
  const documents = useLiveQuery(
    () => db.documents.where('placementId').equals(placement.id).toArray(),
    [placement.id],
  )

  return (
    <>
      <PageHeader
        title="Documentos del practicante"
        subtitle={`Estudiante #${placement.studentId} · Empresa #${placement.companyId}`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/practicantes">Volver a la lista</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to={`/practicantes/${placement.id}/horas`}>Ver libro de horas</Link>
            </Button>
          </>
        }
      />
      <RequiredSummary documents={documents} />
      <DocumentList
        title="Todos sus documentos"
        documents={documents}
        emptyTitle="Tu practicante todavía no ha subido documentos"
        emptyDescription="Cuando suba el convenio o el seguro, aparecen aquí."
      />
    </>
  )
}

/** DOC-2: los documentos de un practicante, para que el tutor los abra sin pedírselos por correo. */
export function StudentDocumentsPage() {
  const { id } = useParams<{ id: string }>()
  return (
    <TutorPlacementGate placementId={Number(id)} forbiddenAction="ver sus documentos">
      {(placement) => <PlacementDocuments placement={placement} />}
    </TutorPlacementGate>
  )
}
