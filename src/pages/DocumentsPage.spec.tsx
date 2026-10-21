import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api } from '@/api/client'
import * as authContext from '@/auth/AuthContext'
import * as notify from '@/lib/notify'
import { db } from '@/offline/db'
import { DocumentsPage } from './DocumentsPage'

vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/client')>()
  return { ...actual, api: vi.fn() }
})
vi.mock('@/lib/notify')
vi.mock('@/auth/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/auth/AuthContext')>()
  return { ...actual, useAuth: vi.fn() }
})

const created = {
  id: 7,
  placementId: 1,
  kind: 'AGREEMENT',
  filename: 'convenio.pdf',
  status: 'PENDING',
  version: 1,
  updatedAt: '2026-03-02T10:00:00.000Z',
}

function renderPage() {
  return render(
    <MemoryRouter>
      <DocumentsPage />
    </MemoryRouter>,
  )
}

// UX-9: el backend guarda hoy solo los datos del documento (nombre, tipo, tamaño); el archivo en sí no se almacena.
// Por eso el aviso dice «registrado», no «subido», y los errores del servidor salen en un aviso visible.
describe('DocumentsPage — avisos (UX-9)', () => {
  const user = userEvent.setup()

  async function chooseFileAndSubmit(name = 'convenio.pdf') {
    renderPage()
    const input = (await screen.findByLabelText('Archivo')) as HTMLInputElement
    await user.upload(input, new File(['contenido'], name, { type: 'application/pdf' }))
    fireEvent.click(screen.getByRole('button', { name: 'Subir documento' }))
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.mocked(authContext.useAuth).mockReturnValue({
      user: { id: 10, email: 'estudiante0@miyura.com', fullName: 'Estudiante 0', role: 'STUDENT', companyId: null },
      role: 'STUDENT',
      login: vi.fn(),
      logout: vi.fn(),
    })
    await db.placements.clear()
    await db.documents.clear()
    await db.placements.put({
      id: 1,
      studentId: 10,
      tutorId: 2,
      companyId: 1,
      startDate: '2026-03-01',
      endDate: '2026-07-31',
      requiredHours: 240,
      status: 'ACTIVE',
      version: 1,
      updatedAt: new Date().toISOString(),
    })
    vi.mocked(api).mockResolvedValue(created)
    vi.mocked(notify.exito).mockResolvedValue(undefined as never)
    vi.mocked(notify.error).mockResolvedValue(undefined as never)
  })

  it('al registrar un documento avisa con su nombre, sin decir que el archivo se subió', async () => {
    await chooseFileAndSubmit()

    await waitFor(() => expect(notify.exito).toHaveBeenCalledTimes(1))
    expect(notify.exito).toHaveBeenCalledWith('Documento «convenio.pdf» registrado')
    expect(vi.mocked(notify.exito).mock.calls[0][0]).not.toMatch(/subid/i)
    expect(await db.documents.count()).toBe(1)
    expect(api).toHaveBeenCalledTimes(1)
  })

  it('sin archivo seleccionado el error es de campo: sale en línea y no se llama al servidor', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Subir documento' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Selecciona un archivo')
    expect(api).not.toHaveBeenCalled()
    expect(notify.error).not.toHaveBeenCalled()
    expect(notify.exito).not.toHaveBeenCalled()
  })

  it.each([
    ['un 403', new ApiError(403, 'Forbidden'), 'No tienes permiso para subir documentos a esta práctica.'],
    ['un 400 del servidor, con su mensaje', new ApiError(400, 'el tipo de documento no es válido'), 'el tipo de documento no es válido'],
    ['un error que no es de la API, solo con el título', new TypeError('red'), undefined],
  ])('con %s muestra un aviso de error y no un mensaje en línea', async (_caso, failure, texto) => {
    vi.mocked(api).mockRejectedValue(failure)
    await chooseFileAndSubmit()

    await waitFor(() => expect(notify.error).toHaveBeenCalledTimes(1))
    expect(notify.error).toHaveBeenCalledWith('No se pudo subir el documento', texto)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(notify.exito).not.toHaveBeenCalled()
    expect(await db.documents.count()).toBe(0)
  })

  it('el botón sigue deshabilitado mientras el aviso de error está abierto y se habilita al cerrarlo', async () => {
    vi.mocked(api).mockRejectedValue(new ApiError(400, 'el tipo de documento no es válido'))
    let closeNotice!: () => void
    vi.mocked(notify.error).mockReturnValue(
      new Promise<void>((resolve) => {
        closeNotice = resolve
      }),
    )
    await chooseFileAndSubmit()

    await waitFor(() => expect(notify.error).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: /subiendo/i })).toBeDisabled()

    closeNotice()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Subir documento' })).not.toBeDisabled())
  })
})
