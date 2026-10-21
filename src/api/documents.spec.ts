import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './client'
import { fetchDocumentFile, uploadDocument } from './documents'

describe('api de documentos (DOC-2)', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('access_token', 'token-de-prueba')
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sube el archivo como multipart, sin forzar Content-Type JSON, y con la sesión', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 7, filename: 'convenio.pdf' }), { status: 201 }))
    const file = new File(['%PDF-1.7'], 'convenio.pdf', { type: 'application/pdf' })

    const created = await uploadDocument(3, 'AGREEMENT', file)

    expect(created).toEqual({ id: 7, filename: 'convenio.pdf' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/placements\/3\/documents\/upload$/)
    expect(init.method).toBe('POST')
    const body = init.body as FormData
    expect(body.get('kind')).toBe('AGREEMENT')
    expect((body.get('file') as File).name).toBe('convenio.pdf')
    const headers = init.headers as Record<string, string>
    expect(headers['Content-Type']).toBeUndefined()
    expect(headers.Authorization).toBe('Bearer token-de-prueba')
  })

  it('devuelve el archivo como Blob', async () => {
    fetchMock.mockResolvedValue(new Response('%PDF', { status: 200, headers: { 'Content-Type': 'application/pdf' } }))

    const blob = await fetchDocumentFile(9)

    expect(blob.type).toBe('application/pdf')
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/documents\/9\/file$/)
  })

  it('un 404 del archivo llega como ApiError con el mensaje del servidor', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: 'este documento se registró sin archivo; hay que volver a subirlo' }), { status: 404 }),
    )

    await expect(fetchDocumentFile(9)).rejects.toEqual(
      new ApiError(404, 'este documento se registró sin archivo; hay que volver a subirlo'),
    )
  })
})
