import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'
import * as documentsApi from '@/api/documents'
import * as authContext from '@/auth/AuthContext'
import { db, type LocalDocument } from '@/offline/db'
import { DocumentsPage } from './DocumentsPage'
import { StudentDocumentsPage } from './StudentDocumentsPage'

// DOC-2: subir el archivo de verdad, verlo dentro de la app y que el tutor vea los de su practicante.

vi.mock('@/api/documents')
// UX-9: subir avisa con notify (SweetAlert2), que en jsdom falla por falta de matchMedia; aquí no se prueba el aviso.
vi.mock('@/lib/notify')
vi.mock('@/auth/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/auth/AuthContext')>()
  return { ...actual, useAuth: vi.fn() }
})

beforeAll(() => {
  // jsdom no trae URL.createObjectURL ni las APIs de puntero que usa Radix.
  URL.createObjectURL = vi.fn(() => 'blob:vista-previa')
  URL.revokeObjectURL = vi.fn()
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
  Element.prototype.scrollIntoView = () => {}
})

const STUDENT = { id: 10, email: 'estudiante0@miyura.com', fullName: 'Estudiante 0', role: 'STUDENT' as const, companyId: null }
const TUTOR = { id: 2, email: 'tutor0@miyura.com', fullName: 'Tutor 0', role: 'TUTOR' as const, companyId: null }

function signIn(user: typeof STUDENT | typeof TUTOR) {
  vi.mocked(authContext.useAuth).mockReturnValue({ user, role: user.role, login: vi.fn(), logout: vi.fn() })
}

function doc(id: number, overrides: Partial<LocalDocument> = {}): LocalDocument {
  return {
    id,
    placementId: 1,
    kind: 'AGREEMENT',
    filename: `documento-${id}.pdf`,
    mimeType: 'application/pdf',
    size: 2048,
    status: 'PENDING',
    version: 1,
    updatedAt: `2026-03-0${id}T10:00:00.000Z`,
    ...overrides,
  }
}

beforeEach(async () => {
  vi.clearAllMocks()
  await db.placements.clear()
  await db.documents.clear()
  await db.placements.put({
    id: 1, studentId: 10, tutorId: 2, companyId: 1, startDate: '2026-03-01', endDate: '2026-07-31',
    requiredHours: 240, status: 'PENDING_DOCS', version: 1, updatedAt: '2026-03-01T00:00:00.000Z',
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('DocumentsPage — subir el archivo', () => {
  function renderStudent() {
    signIn(STUDENT)
    return render(
      <MemoryRouter>
        <DocumentsPage />
      </MemoryRouter>,
    )
  }

  it('sube el archivo elegido con su tipo y lo agrega a la lista', async () => {
    vi.mocked(documentsApi.uploadDocument).mockResolvedValue(doc(5, { filename: 'Convenio firmado.pdf' }))
    renderStudent()
    const file = new File(['%PDF-1.7'], 'Convenio firmado.pdf', { type: 'application/pdf' })

    fireEvent.change(await screen.findByLabelText('Archivo'), { target: { files: [file] } })
    expect(screen.getByText(/Convenio firmado\.pdf · 8 B/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Subir documento' }))

    await waitFor(() => expect(documentsApi.uploadDocument).toHaveBeenCalledWith(1, 'AGREEMENT', file))
    expect(await screen.findByText('Convenio firmado.pdf')).toBeInTheDocument()
  })

  it('avisa antes de enviar si el archivo no es PDF, PNG ni JPG, y no lo envía', async () => {
    renderStudent()
    const file = new File(['hola'], 'informe.docx')

    fireEvent.change(await screen.findByLabelText('Archivo'), { target: { files: [file] } })
    expect(screen.getByRole('alert')).toHaveTextContent('Solo se aceptan PDF, PNG o JPG')
    fireEvent.click(screen.getByRole('button', { name: 'Subir documento' }))

    expect(documentsApi.uploadDocument).not.toHaveBeenCalled()
  })

  it('sin conexión no deja subir y lo dice', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    renderStudent()

    expect(await screen.findByText(/para subir un archivo hace falta conexión/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Subir documento' })).toBeDisabled()
    vi.restoreAllMocks()
  })
})

describe('visor de documentos', () => {
  async function openFirst() {
    signIn(STUDENT)
    await db.documents.bulkPut([doc(1), doc(2, { kind: 'INSURANCE', filename: 'seguro.png', mimeType: 'image/png' })])
    render(
      <MemoryRouter>
        <DocumentsPage />
      </MemoryRouter>,
    )
    return userEvent.setup()
  }

  it('abre el PDF dentro de la app y ofrece descargarlo con su nombre', async () => {
    vi.mocked(documentsApi.fetchDocumentFile).mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }))
    const user = await openFirst()

    await user.click(await screen.findByRole('button', { name: 'Ver documento-1.pdf' }))

    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByTitle('Vista previa de documento-1.pdf')).toHaveAttribute('src', 'blob:vista-previa')
    expect(within(dialog).getByRole('link', { name: 'Descargar' })).toHaveAttribute('download', 'documento-1.pdf')
    expect(documentsApi.fetchDocumentFile).toHaveBeenCalledWith(1)
  })

  it('muestra una imagen como imagen', async () => {
    vi.mocked(documentsApi.fetchDocumentFile).mockResolvedValue(new Blob(['png'], { type: 'image/png' }))
    const user = await openFirst()

    await user.click(await screen.findByRole('button', { name: 'Ver seguro.png' }))

    expect(await within(await screen.findByRole('dialog')).findByRole('img', { name: 'seguro.png' })).toBeInTheDocument()
  })

  it('un documento registrado sin archivo explica que hay que volver a subirlo', async () => {
    vi.mocked(documentsApi.fetchDocumentFile).mockRejectedValue(
      new ApiError(404, 'este documento se registró sin archivo; hay que volver a subirlo'),
    )
    const user = await openFirst()

    await user.click(await screen.findByRole('button', { name: 'Ver documento-1.pdf' }))

    expect(await within(await screen.findByRole('dialog')).findByRole('alert')).toHaveTextContent(
      'Este documento se registró sin archivo; hay que volver a subirlo.',
    )
  })

  it('filtra la lista por tipo', async () => {
    const user = await openFirst()
    await screen.findByText('documento-1.pdf')

    await user.click(screen.getByRole('button', { name: 'Seguro' }))

    expect(screen.queryByText('documento-1.pdf')).toBeNull()
    expect(screen.getByText('seguro.png')).toBeInTheDocument()
  })
})

describe('StudentDocumentsPage — el tutor ve los documentos de su practicante', () => {
  function renderTutor(placementId = 1) {
    return render(
      <MemoryRouter initialEntries={[`/practicantes/${placementId}/documentos`]}>
        <Routes>
          <Route path="/practicantes/:id/documentos" element={<StudentDocumentsPage />} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('lista sus documentos, marca el obligatorio que falta y deja abrirlos', async () => {
    signIn(TUTOR)
    vi.mocked(documentsApi.fetchDocumentFile).mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }))
    await db.documents.put(doc(1, { status: 'VALIDATED' }))
    renderTutor()

    expect(await screen.findByText('documento-1.pdf')).toBeInTheDocument()
    expect(screen.getByText('Sin subir')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Ver documento-1.pdf' }))
    expect(await screen.findByTitle('Vista previa de documento-1.pdf')).toBeInTheDocument()
  })

  it('no muestra los documentos de una práctica de otro tutor', async () => {
    signIn({ ...TUTOR, id: 99 })
    await db.documents.put(doc(1))
    renderTutor()

    expect(await screen.findByText('Práctica no asignada')).toBeInTheDocument()
    expect(screen.queryByText('documento-1.pdf')).toBeNull()
  })

  it('una práctica que no existe dice que no se encontró', async () => {
    signIn(TUTOR)
    renderTutor(404)

    expect(await screen.findByText('No se encontró este practicante')).toBeInTheDocument()
  })
})
