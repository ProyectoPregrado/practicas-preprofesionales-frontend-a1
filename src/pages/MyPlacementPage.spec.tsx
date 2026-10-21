import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as authContext from '@/auth/AuthContext'
import { db, type LocalDocument, type LocalHourLog } from '@/offline/db'
import { MyPlacementPage } from './MyPlacementPage'

vi.mock('@/auth/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/auth/AuthContext')>()
  return { ...actual, useAuth: vi.fn() }
})

const pad = (value: number) => String(value).padStart(2, '0')
const todayKey = () => {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

let nextId = 1
const hourLog = (hours: number, status: LocalHourLog['status'], date = '2026-03-10'): LocalHourLog => ({
  id: nextId++,
  placementId: 1,
  date,
  startTime: '08:00',
  endTime: '12:00',
  hours,
  activity: `Actividad ${nextId}`,
  status,
  version: 1,
  updatedAt: new Date().toISOString(),
  syncState: 'synced',
})

const document = (kind: string, status: string): LocalDocument => ({
  id: nextId++,
  placementId: 1,
  kind,
  filename: `${kind}.pdf`,
  status,
  version: 1,
  updatedAt: '2026-03-02T00:00:00.000Z',
})

async function seed({ logs = [] as LocalHourLog[], documents = [] as LocalDocument[], requiredHours = 240 } = {}) {
  vi.mocked(authContext.useAuth).mockReturnValue({
    user: { id: 10, email: 'estudiante0@miyura.com', fullName: 'Estudiante 0', role: 'STUDENT', companyId: null },
    role: 'STUDENT',
    login: vi.fn(),
    logout: vi.fn(),
  })
  await db.placements.put({
    id: 1,
    studentId: 10,
    tutorId: 2,
    companyId: 7,
    startDate: '2026-03-01',
    endDate: '2026-07-31',
    requiredHours,
    status: 'ACTIVE',
    version: 1,
    updatedAt: new Date().toISOString(),
  })
  await db.hourLogs.bulkPut(logs)
  await db.documents.bulkPut(documents)
}

const renderPage = () =>
  render(
    <MemoryRouter>
      <MyPlacementPage />
    </MemoryRouter>,
  )

// REDISEÑO-3: el inicio del estudiante como panel (progreso, indicadores, requisitos y semana), con datos reales.
describe('MyPlacementPage — panel de inicio (REDISEÑO-3)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    nextId = 1
    await db.placements.clear()
    await db.hourLogs.clear()
    await db.documents.clear()
  })

  it('sin práctica activa explica que todavía no hay nada que mostrar', async () => {
    vi.mocked(authContext.useAuth).mockReturnValue({
      user: { id: 10, email: 'e@miyura.com', fullName: 'Estudiante 0', role: 'STUDENT', companyId: null },
      role: 'STUDENT',
      login: vi.fn(),
      logout: vi.fn(),
    })
    renderPage()

    expect(await screen.findByText('No tienes una práctica activa todavía')).toBeInTheDocument()
  })

  it('el encabezado dice la empresa y el periodo, y ofrece registrar horas', async () => {
    await seed()
    renderPage()

    expect(await screen.findByRole('heading', { level: 1, name: 'Mi práctica' })).toBeInTheDocument()
    expect(screen.getByText(/Empresa #7 · /)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrar horas' })).toBeInTheDocument()
  })

  // «Mis horas» ya está en la navegación: el botón del inicio abre el registro en un modal, sin cambiar de página.
  describe('registrar horas desde el inicio', () => {
    it('abre el formulario de registro en un modal y la página de inicio sigue ahí', async () => {
      const user = userEvent.setup()
      await seed()
      renderPage()

      await user.click(await screen.findByRole('button', { name: 'Registrar horas' }))

      const dialog = await screen.findByRole('dialog', { name: 'Registrar horas' })
      expect(within(dialog).getByLabelText('Fecha')).toBeInTheDocument()
      expect(within(dialog).getByLabelText('Actividad')).toBeInTheDocument()
      // Con el modal abierto el resto de la página queda oculto para lectores de pantalla, pero sigue montado.
      expect(screen.getByRole('heading', { level: 1, name: 'Mi práctica', hidden: true })).toBeInTheDocument()
    })

    it('ya no es un enlace a /horas', async () => {
      await seed()
      renderPage()

      await screen.findByRole('heading', { level: 1, name: 'Mi práctica' })
      expect(screen.queryByRole('link', { name: 'Registrar horas' })).toBeNull()
    })

    it('se cierra con Escape sin guardar nada', async () => {
      const user = userEvent.setup()
      await seed()
      renderPage()
      await user.click(await screen.findByRole('button', { name: 'Registrar horas' }))
      await screen.findByRole('dialog', { name: 'Registrar horas' })

      await user.keyboard('{Escape}')

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(await db.hourLogs.count()).toBe(0)
    })
  })

  describe('tarjeta de progreso', () => {
    it('dice cuántas horas aprobadas faltan y reparte aprobadas, sin revisar y por registrar', async () => {
      await seed({ logs: [hourLog(60, 'APPROVED'), hourLog(20, 'SUBMITTED')] })
      renderPage()

      // Faltan 180 h aprobadas (240 - 60); de ellas, 20 ya se enviaron y 160 todavía no se registran.
      expect(
        await screen.findByRole('heading', { name: 'Te faltan 180.0 horas aprobadas para completar tu práctica' }),
      ).toBeInTheDocument()
      const legend = screen.getByRole('list', { name: 'Reparto de las horas' })
      expect(within(legend).getByText('60.0 h')).toBeInTheDocument()
      expect(within(legend).getByText('20.0 h')).toBeInTheDocument()
      expect(within(legend).getByText('160.0 h')).toBeInTheDocument()
      expect(screen.getByRole('progressbar', { name: 'Progreso de horas aprobadas' })).toHaveAttribute('aria-valuenow', '25')
    })

    it('muestra la meta y el porcentaje aprobado', async () => {
      await seed({ logs: [hourLog(60, 'APPROVED')] })
      renderPage()

      expect(await screen.findByText('Meta: 240 horas')).toBeInTheDocument()
      expect(await screen.findByText('Aprobado: 25 %')).toBeInTheDocument()
    })

    it('al llegar a las horas requeridas lo celebra en vez de pedir más', async () => {
      await seed({ logs: [hourLog(240, 'APPROVED')] })
      renderPage()

      expect(await screen.findByRole('heading', { name: 'Completaste las horas requeridas de tu práctica' })).toBeInTheDocument()
      expect(screen.queryByText(/Te faltan/)).toBeNull()
    })
  })

  describe('indicadores', () => {
    it('muestra horas aprobadas, sin revisar, documentos clave y registros', async () => {
      await seed({
        logs: [hourLog(60, 'APPROVED'), hourLog(8, 'SUBMITTED'), hourLog(12, 'SUBMITTED', '2026-03-11')],
        documents: [document('AGREEMENT', 'VALIDATED'), document('INSURANCE', 'PENDING')],
      })
      renderPage()

      const kpis = await screen.findByRole('list', { name: 'Indicadores' })
      await waitFor(() => {
        expect(within(kpis).getByText('Horas aprobadas')).toBeInTheDocument()
        expect(within(kpis).getByText('60.0')).toBeInTheDocument()
        expect(within(kpis).getByText('20.0')).toBeInTheDocument()
        expect(within(kpis).getByText('2 registros')).toBeInTheDocument()
        expect(within(kpis).getByText('1 / 2')).toBeInTheDocument()
        expect(within(kpis).getByText('Convenio y seguro')).toBeInTheDocument()
        expect(within(kpis).getByText('3')).toBeInTheDocument()
      })
    })

    it('el promedio de horas por día cuenta solo los días con registros', async () => {
      await seed({ logs: [hourLog(4, 'APPROVED', '2026-03-10'), hourLog(2, 'APPROVED', '2026-03-10'), hourLog(4, 'SUBMITTED', '2026-03-11')] })
      renderPage()

      // 10 h repartidas en 2 días: 5,0 h por día.
      expect(await screen.findByText('5.0 h por día registrado')).toBeInTheDocument()
    })

    it('sin registros no inventa un promedio', async () => {
      await seed()
      renderPage()

      const kpis = await screen.findByRole('list', { name: 'Indicadores' })
      expect(within(kpis).queryByText(/por día registrado/)).toBeNull()
      expect(within(kpis).getByText('Aún sin registros')).toBeInTheDocument()
    })
  })

  describe('requisitos para acreditar', () => {
    it('lista los cuatro requisitos con su estado real y cuántos van hechos', async () => {
      await seed({
        logs: [hourLog(60, 'APPROVED'), hourLog(20, 'SUBMITTED')],
        documents: [document('AGREEMENT', 'VALIDATED'), document('INSURANCE', 'PENDING')],
      })
      renderPage()

      const section = await screen.findByRole('region', { name: 'Requisitos para acreditar' })
      await waitFor(() => {
        expect(within(section).getByText('1 de 4')).toBeInTheDocument()
        const items = within(section).getAllByRole('listitem')
        expect(items).toHaveLength(4)
        expect(items[0]).toHaveTextContent('Convenio validado')
        expect(items[0]).toHaveTextContent('Validado')
        expect(items[1]).toHaveTextContent('Seguro validado')
        expect(items[1]).toHaveTextContent('En revisión')
        expect(items[2]).toHaveTextContent('Llevas 60.0 aprobadas y 20.0 sin revisar, de 240')
        expect(items[3]).toHaveTextContent('Informe final validado')
        expect(items[3]).toHaveTextContent('Falta subirlo')
      })
    })
  })

  describe('horas de esta semana', () => {
    it('muestra el total de la semana y las horas del día de hoy', async () => {
      await seed({ logs: [hourLog(4, 'APPROVED', todayKey()), hourLog(2, 'SUBMITTED', todayKey())] })
      renderPage()

      const chart = await screen.findByRole('region', { name: 'Horas de esta semana' })
      await waitFor(() => {
        expect(within(chart).getByText('6.0 h')).toBeInTheDocument()
        expect(
          within(chart).getByRole('img', { name: /\(hoy\): 4\.0 h aprobadas, 2\.0 h sin revisar/ }),
        ).toBeInTheDocument()
      })
    })

    it('los siete días aparecen aunque no haya registros', async () => {
      await seed()
      renderPage()

      const chart = await screen.findByRole('region', { name: 'Horas de esta semana' })
      expect(within(chart).getAllByRole('img')).toHaveLength(7)
    })
  })

  describe('lo que ya existía sigue estando', () => {
    it('muestra los datos de la práctica, los documentos pendientes y los últimos registros', async () => {
      await seed({
        logs: [hourLog(4, 'APPROVED', '2026-03-10')],
        documents: [document('REPORT', 'PENDING')],
      })
      renderPage()

      expect(await screen.findByText('Datos de la práctica')).toBeInTheDocument()
      expect(screen.getByText('Tutor #2')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Documentos pendientes' })).toBeInTheDocument()
      expect(await screen.findByText('REPORT.pdf')).toBeInTheDocument()
      await waitFor(() => expect(screen.getByText('Últimos registros de horas')).toBeInTheDocument())
    })
  })
})
