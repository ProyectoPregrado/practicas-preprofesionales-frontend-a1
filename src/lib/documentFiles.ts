export type DocumentKind = 'AGREEMENT' | 'INSURANCE' | 'REPORT' | 'EVIDENCE'

export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  AGREEMENT: 'Convenio',
  INSURANCE: 'Seguro',
  REPORT: 'Informe',
  EVIDENCE: 'Evidencia',
}

export function documentKindLabel(kind: string): string {
  return DOCUMENT_KIND_LABEL[kind as DocumentKind] ?? kind
}

/** Espejo de MAX_DOCUMENT_BYTES en el backend (document-file.ts). */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024

/** Lo que el selector de archivos deja elegir; el backend lo vuelve a comprobar por el contenido. */
export const ACCEPTED_DOCUMENT_TYPES = 'application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg'

const ACCEPTED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg']

/**
 * Comprobación previa al envío, para avisar sin gastar la subida. No reemplaza a la del servidor: el navegador puede
 * mentir sobre el tipo. `null` si el archivo se puede enviar.
 */
export function documentFileError(file: Pick<File, 'name' | 'size'>): string | null {
  const name = file.name.toLowerCase()
  if (!ACCEPTED_EXTENSIONS.some((extension) => name.endsWith(extension))) return 'Solo se aceptan PDF, PNG o JPG'
  if (file.size === 0) return 'El archivo está vacío'
  if (file.size > MAX_DOCUMENT_BYTES) return 'El archivo supera los 10 MB'
  return null
}

/** «1,2 MB», «840 KB»: el tamaño como lo lee una persona. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toLocaleString('es-EC', { maximumFractionDigits: 1 })} MB`
}

export type PreviewKind = 'pdf' | 'image' | 'none'

/** Cómo mostrar un archivo dentro de la app; `none` para lo que solo se puede descargar. */
export function previewKind(mimeType: string | undefined): PreviewKind {
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType === 'image/png' || mimeType === 'image/jpeg') return 'image'
  return 'none'
}
