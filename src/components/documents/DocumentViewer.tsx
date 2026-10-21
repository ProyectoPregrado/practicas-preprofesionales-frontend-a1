import { Download, ExternalLink, FileText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ApiError } from '@/api/client'
import { fetchDocumentFile } from '@/api/documents'
import { StatusBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { documentKindLabel, formatFileSize, previewKind } from '@/lib/documentFiles'
import type { LocalDocument } from '@/offline/db'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; url: string; mimeType: string }
  | { kind: 'error'; message: string }

// El backend escribe sus mensajes en minúscula y sin punto final («documento no encontrado»).
function asSentence(text: string): string {
  if (!text) return text
  const capitalized = `${text[0].toUpperCase()}${text.slice(1)}`
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`
}

function loadErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return asSentence(err.message)
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'Sin conexión: el archivo se ve solo con conexión.'
  return 'No se pudo abrir el archivo.'
}

/**
 * Pide el archivo con la sesión (no es una URL pública) y lo deja en una URL `blob:` que se libera al cambiar de
 * documento o cerrar. Una respuesta que llega tarde, de un documento que ya no se mira, se descarta.
 */
function useDocumentFile(documentId: number | undefined): LoadState {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  useEffect(() => {
    if (documentId === undefined) return
    let url: string | null = null
    let cancelled = false
    setState({ kind: 'loading' })
    fetchDocumentFile(documentId)
      .then((blob) => {
        if (cancelled) return
        url = URL.createObjectURL(blob)
        setState({ kind: 'ready', url, mimeType: blob.type })
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ kind: 'error', message: loadErrorMessage(err) })
      })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [documentId])

  return state
}

function Preview({ state, document }: { state: LoadState; document: LocalDocument }) {
  if (state.kind === 'loading') return <p className="py-16 text-center text-14 text-inkSoft">Abriendo el archivo…</p>
  if (state.kind === 'error') {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <FileText aria-hidden="true" className="size-8 text-inkMute" />
        <p role="alert" className="max-w-md text-14 text-void">
          {state.message}
        </p>
      </div>
    )
  }
  const kind = previewKind(state.mimeType || document.mimeType)
  if (kind === 'pdf') {
    return <iframe title={`Vista previa de ${document.filename}`} src={state.url} className="h-[65vh] w-full rounded-lg border border-line" />
  }
  if (kind === 'image') return <img src={state.url} alt={document.filename} className="mx-auto max-h-[65vh] rounded-lg object-contain" />
  return <p className="py-12 text-center text-14 text-inkSoft">Este tipo de archivo no se puede mostrar aquí. Descárgalo para abrirlo.</p>
}

function Details({ document }: { document: LocalDocument }) {
  return (
    <>
      <span>{documentKindLabel(document.kind)}</span>
      {document.size ? <span className="font-data">· {formatFileSize(document.size)}</span> : null}
      <StatusBadge status={document.status} domain="document" />
    </>
  )
}

interface DocumentViewerProps {
  /** Documento a mostrar, o `null` con el visor cerrado. */
  document: LocalDocument | null
  onClose: () => void
}

/** Visor de un documento sin salir de la pantalla: el PDF en un marco y las imágenes tal cual. */
export function DocumentViewer({ document, onClose }: DocumentViewerProps) {
  const state = useDocumentFile(document?.id)

  return (
    <Dialog open={document !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      {document ? (
        <DialogContent className="w-[min(960px,calc(100%-2rem))]">
          <DialogHeader>
            <DialogTitle className="truncate">{document.filename}</DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-2">
              <Details document={document} />
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Preview state={state} document={document} />
          </DialogBody>
          {state.kind === 'ready' ? (
            <DialogFooter>
              <Button asChild variant="outline">
                <a href={state.url} target="_blank" rel="noreferrer">
                  <ExternalLink aria-hidden="true" />
                  Abrir en otra pestaña
                </a>
              </Button>
              <Button asChild>
                <a href={state.url} download={document.filename}>
                  <Download aria-hidden="true" />
                  Descargar
                </a>
              </Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
