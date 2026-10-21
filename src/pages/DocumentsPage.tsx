import { type ChangeEvent, type FormEvent, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ApiError } from '@/api/client'
import { uploadDocument } from '@/api/documents'
import { Chip } from '@/components/Chip'
import { DocumentList } from '@/components/documents/DocumentList'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState, LoadingState, Section } from '@/components/Panel'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ACCEPTED_DOCUMENT_TYPES,
  DOCUMENT_KIND_LABEL as KIND_LABEL,
  type DocumentKind,
  documentFileError,
  formatFileSize,
} from '@/lib/documentFiles'
import { useOnline } from '@/offline/hooks/useOnline'
import { db, type LocalDocument } from '@/offline/db'
import { usePlacement } from '@/offline/hooks/usePlacement'

// Espejo de REQUIRED_DOCS en el backend (placement.service.ts): estos dos son
// los únicos que bloquean la activación de la práctica.
const REQUIRED_KINDS: DocumentKind[] = ['AGREEMENT', 'INSURANCE']

const DOC_ROW_CLASS = 'flex min-h-row items-center justify-between gap-4 px-[18px] py-2.5'

/** Último estado conocido de un tipo de documento, o `null` si no se subió. */
function latestStatus(documents: LocalDocument[], kind: DocumentKind): string | null {
  return (
    documents
      .filter((doc) => doc.kind === kind)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0]?.status ?? null
  )
}

function RequiredStatus({ documents, kind }: { documents: LocalDocument[] | undefined; kind: DocumentKind }) {
  if (documents === undefined) return <span className="text-12 text-inkSoft">Cargando…</span>
  const status = latestStatus(documents, kind)
  if (status) return <StatusBadge status={status} domain="document" />
  return <Chip tone="void">Falta subir</Chip>
}

function RequiredDocuments({ documents }: { documents: LocalDocument[] | undefined }) {
  return (
    <Section title="Obligatorios para activar la práctica">
      <div className="divide-y divide-paperRule">
        {REQUIRED_KINDS.map((kind) => (
          <div key={kind} className={DOC_ROW_CLASS}>
            <span className="text-14 font-semibold text-ink">{KIND_LABEL[kind]}</span>
            <RequiredStatus documents={documents} kind={kind} />
          </div>
        ))}
      </div>
    </Section>
  )
}

export function DocumentsPage() {
  const placement = usePlacement()
  const documents = useLiveQuery<LocalDocument[] | undefined>(async () => {
    if (!placement) return undefined
    return db.documents.where('placementId').equals(placement.id).toArray()
  }, [placement?.id])

  const [kind, setKind] = useState<DocumentKind>('AGREEMENT')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const online = useOnline()

  if (placement === undefined) {
    return <LoadingState>Cargando tu práctica…</LoadingState>
  }

  if (placement === null) {
    return (
      <EmptyState
        title="No tienes una práctica activa todavía"
        description="Cuando la coordinación active tu plaza, vas a poder subir documentos."
      />
    )
  }

function getUploadErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.statusCode === 403) {
    return 'No tienes permiso para subir documentos a esta práctica.'
  }
  if (err instanceof ApiError) {
    return err.message
  }
  return 'No se pudo subir el documento'
}

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setUploadError(null)

    if (!file) {
      setUploadError('Selecciona un archivo')
      return
    }
    const fileError = documentFileError(file)
    if (fileError) {
      setUploadError(fileError)
      return
    }

    setUploading(true)
    try {
      const created = await uploadDocument(placement!.id, kind, file)
      await db.documents.put(created)
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      setUploadError(getUploadErrorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0] ?? null
    setFile(chosen)
    setUploadError(chosen ? documentFileError(chosen) : null)
  }

  return (
    <>
      <PageHeader
        title="Documentos"
        subtitle="Sube el convenio, el seguro y tus informes, y ábrelos cuando quieras. Subir necesita conexión."
      />

      <RequiredDocuments documents={documents} />

      <Section title="Subir documento">
        <form className="flex flex-col gap-4 px-[18px] py-4" onSubmit={handleUpload} noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="document-kind">Tipo de documento</Label>
              <Select value={kind} onValueChange={(value) => setKind(value as DocumentKind)}>
                <SelectTrigger id="document-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(KIND_LABEL) as DocumentKind[]).map((kindOption) => (
                    <SelectItem key={kindOption} value={kindOption}>
                      {KIND_LABEL[kindOption]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="document-file">Archivo</Label>
              <input
                id="document-file"
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_DOCUMENT_TYPES}
                aria-describedby="document-file-hint"
                onChange={handleFileChange}
                className="flex h-field w-full items-center rounded border border-line bg-surface px-[13px] text-13 text-inkBody file:mr-3 file:h-7 file:rounded-md file:border file:border-line file:bg-soft file:px-3 file:font-display file:text-13 file:font-medium file:text-ink"
              />
              <p id="document-file-hint" className="text-12 text-inkSoft">
                {file ? `${file.name} · ${formatFileSize(file.size)}` : 'PDF, PNG o JPG, hasta 10 MB.'}
              </p>
            </div>
          </div>

          {uploadError ? (
            <p role="alert" className="rounded-md bg-chipVoid px-3 py-2.5 text-13 text-void">
              {uploadError}
            </p>
          ) : null}

          {!online ? (
            <p className="rounded-md bg-chipPending px-3 py-2.5 text-13 text-pending">
              Sin conexión: puedes ver la lista, pero para subir un archivo hace falta conexión.
            </p>
          ) : null}

          <Button type="submit" disabled={uploading || !online} className="self-start">
            {uploading ? 'Subiendo…' : 'Subir documento'}
          </Button>
        </form>
      </Section>

      <DocumentList
        title="Todos tus documentos"
        documents={documents}
        emptyTitle="Todavía no has subido documentos"
        emptyDescription="Empieza por el convenio y el seguro."
      />
    </>
  )
}
