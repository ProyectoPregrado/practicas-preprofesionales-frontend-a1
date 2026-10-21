import type { DocumentKind } from '@/lib/documentFiles'
import type { LocalDocument } from '@/offline/db'
import { api, apiBlob } from './client'

/**
 * DOC-2: sube el archivo de verdad (multipart). Necesita conexión: los documentos no pasan por la cola sin conexión
 * del libro de horas, porque un archivo de varios MB no cabe bien en IndexedDB ni en un reintento silencioso.
 */
export function uploadDocument(placementId: number, kind: DocumentKind, file: File): Promise<LocalDocument> {
  const form = new FormData()
  form.append('kind', kind)
  form.append('file', file, file.name)
  return api<LocalDocument>(`/placements/${placementId}/documents/upload`, { method: 'POST', body: form })
}

/** El archivo de un documento, para verlo en la app o descargarlo. */
export function fetchDocumentFile(documentId: number): Promise<Blob> {
  return apiBlob(`/documents/${documentId}/file`)
}
