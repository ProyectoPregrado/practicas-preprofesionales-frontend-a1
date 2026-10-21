import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { HourLogsPage } from './HourLogsPage'
import * as placementHooks from '@/offline/hooks/usePlacement'
import * as hourLogsHooks from '@/offline/hooks/useHourLogs'
import type { LocalHourLog, LocalPlacement } from '@/offline/db'

vi.mock('@/offline/hooks/usePlacement')
vi.mock('@/offline/hooks/useHourLogs')

describe('HourLogsPage', () => {
  it('muestra el badge y mensaje de fallo permanente cuando syncState es failed', () => {
    vi.mocked(placementHooks.usePlacement).mockReturnValue({
      id: 1,
      studentId: 10,
      tutorId: 2,
      companyId: 3,
      startDate: '2026-01-01',
      endDate: '2026-06-01',
      requiredHours: 240,
      status: 'ACTIVE',
      version: 1,
      updatedAt: '2026-01-01T00:00:00.000Z',
    } as LocalPlacement)

    const failedLog: LocalHourLog = {
      id: 101,
      placementId: 1,
      date: '2026-04-01',
      startTime: '08:00',
      endTime: '12:00',
      hours: 4,
      activity: 'Desarrollo de módulos',
      status: 'SUBMITTED',
      syncState: 'failed',
      reviewNote: 'Rechazado por el servidor',
      version: 1,
      updatedAt: '2026-04-01T12:00:00.000Z',
    }

    vi.mocked(hourLogsHooks.useHourLogs).mockReturnValue([failedLog])

    render(<HourLogsPage />)

    expect(screen.getByText(/desarrollo de módulos/i)).toBeInTheDocument()
    expect(screen.getByText(/fallo permanente: rechazado por el servidor/i)).toBeInTheDocument()
    expect(screen.getByText('Fallo permanente')).toBeInTheDocument()
  })

  describe('paginación con 500 registros (E6-05)', () => {
    const mockPlacement: LocalPlacement = {
      id: 1,
      studentId: 10,
      tutorId: 2,
      companyId: 3,
      startDate: '2026-01-01',
      endDate: '2026-06-01',
      requiredHours: 240,
      status: 'ACTIVE',
      version: 1,
      updatedAt: '2026-01-01T00:00:00.000Z',
    }

    function createMockLogs(count: number): LocalHourLog[] {
      return Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        placementId: 1,
        date: `2026-04-${String((i % 28) + 1).padStart(2, '0')}`,
        startTime: '08:00',
        endTime: '12:00',
        hours: 4,
        activity: `Actividad ${i + 1}`,
        status: (i % 2 === 0 ? 'APPROVED' : 'SUBMITTED') as 'APPROVED' | 'SUBMITTED',
        syncState: 'synced' as const,
        version: 1,
        updatedAt: '2026-04-01T12:00:00.000Z',
      }))
    }

    it('con 500 registros solo renderiza 10 filas visibles en el DOM por página', async () => {
      vi.mocked(placementHooks.usePlacement).mockReturnValue(mockPlacement)
      const logs500 = createMockLogs(500)
      vi.mocked(hourLogsHooks.useHourLogs).mockReturnValue(logs500)

      const start = performance.now()
      render(<HourLogsPage />)
      const elapsed = performance.now() - start

      // El total de registros en la barra de herramientas debe mostrar los 500 registros
      expect(screen.getByText('500 registros')).toBeInTheDocument()

      // En el DOM solo deben renderizarse 10 filas de actividades correspondientes a la página visible
      const activities = screen.getAllByText(/^Actividad \d+$/)
      expect(activities).toHaveLength(10)

      // Debe mostrar el control de paginación
      expect(screen.getByText('Página 1 de 50')).toBeInTheDocument()
      expect(elapsed).toBeLessThan(1000)
    })

    it('permite navegar entre páginas con los botones Siguiente y Anterior', async () => {
      const user = userEvent.setup()
      vi.mocked(placementHooks.usePlacement).mockReturnValue(mockPlacement)
      const logs500 = createMockLogs(500)
      vi.mocked(hourLogsHooks.useHourLogs).mockReturnValue(logs500)

      render(<HourLogsPage />)

      // Dado que los logs se invierten para mostrar los más recientes primero (500, 499, ...):
      expect(screen.getByText('Actividad 500')).toBeInTheDocument()
      expect(screen.getByText('Actividad 491')).toBeInTheDocument()
      expect(screen.queryByText('Actividad 490')).not.toBeInTheDocument()

      // Avanzamos a la página 2
      await user.click(screen.getByRole('button', { name: 'Siguiente' }))
      expect(screen.getByText('Página 2 de 50')).toBeInTheDocument()
      expect(screen.getByText('Actividad 490')).toBeInTheDocument()
      expect(screen.getByText('Actividad 481')).toBeInTheDocument()
      expect(screen.queryByText('Actividad 500')).not.toBeInTheDocument()

      // Regresamos a la página 1
      await user.click(screen.getByRole('button', { name: 'Anterior' }))
      expect(screen.getByText('Página 1 de 50')).toBeInTheDocument()
      expect(screen.getByText('Actividad 500')).toBeInTheDocument()
    })

    // Los hooks deben llamarse en el mismo orden en cada render: la pantalla empieza cargando
    // (usePlacement devuelve undefined) y después muestra la plaza y los registros.
    it('pasa de cargando a cargado sin romper el orden de los hooks', () => {
      vi.mocked(placementHooks.usePlacement).mockReturnValue(undefined)
      vi.mocked(hourLogsHooks.useHourLogs).mockReturnValue(undefined)
      const { rerender } = render(<HourLogsPage />)
      expect(screen.getByText(/Cargando tu práctica/)).toBeInTheDocument()

      vi.mocked(placementHooks.usePlacement).mockReturnValue(mockPlacement)
      vi.mocked(hourLogsHooks.useHourLogs).mockReturnValue(createMockLogs(12))
      rerender(<HourLogsPage />)

      expect(screen.getByText('Página 1 de 2')).toBeInTheDocument()
    })

    it('no muestra controles de paginación si hay 10 o menos registros', () => {
      vi.mocked(placementHooks.usePlacement).mockReturnValue(mockPlacement)
      const logs8 = createMockLogs(8)
      vi.mocked(hourLogsHooks.useHourLogs).mockReturnValue(logs8)

      render(<HourLogsPage />)

      expect(screen.getAllByText(/^Actividad \d+$/)).toHaveLength(8)
      expect(screen.queryByRole('button', { name: 'Siguiente' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Anterior' })).toBeNull()
    })

    it('calcula los totales del resumen sobre los 500 registros y no solo sobre los 10 visibles', () => {
      vi.mocked(placementHooks.usePlacement).mockReturnValue(mockPlacement)
      const logs500 = createMockLogs(500) // 500 logs de 4 horas cada uno = 2000 horas
      vi.mocked(hourLogsHooks.useHourLogs).mockReturnValue(logs500)

      render(<HourLogsPage />)

      // Total de 500 registros: 250 aprobados * 4h = 1000h aprobadas
      expect(screen.getByText(/1000\.0\s*\/\s*240\s*aprobadas/)).toBeInTheDocument()
      expect(screen.getByText(/1000\.0\s*sin aprobar/)).toBeInTheDocument()
    })
  })
})

// REDISEÑO-4: el libro de horas como panel (progreso, indicadores, filtros, tabla y estado de sincronización), con
// datos reales. Los filtros trabajan sobre los registros que ya están en el dispositivo; los totales, siempre sobre todos.
describe('libro de horas rediseñado (REDISEÑO-4)', () => {
  const placement: LocalPlacement = {
    id: 1,
    studentId: 10,
    tutorId: 2,
    companyId: 3,
    startDate: '2026-03-01',
    endDate: '2026-07-31',
    requiredHours: 240,
    status: 'ACTIVE',
    version: 1,
    updatedAt: '2026-03-01T00:00:00.000Z',
  }

  const entry = (
    id: number,
    date: string,
    activity: string,
    status: LocalHourLog['status'],
    syncState: LocalHourLog['syncState'],
  ): LocalHourLog => ({
    id,
    placementId: 1,
    date,
    startTime: '08:00',
    endTime: '12:00',
    hours: 4,
    activity,
    status,
    syncState,
    version: 1,
    updatedAt: '2026-04-01T12:00:00.000Z',
  })

  // El hook los entrega de más antiguo a más reciente.
  const logs = [
    entry(1, '2026-03-30', 'Reunión de arranque', 'APPROVED', 'synced'),
    entry(2, '2026-04-01', 'Optimización de consultas', 'SUBMITTED', 'queued'),
    entry(3, '2026-04-07', 'Pruebas unitarias', 'REJECTED', 'failed'),
    entry(4, '2026-04-10', 'Documentación de endpoints', 'SUBMITTED', 'local'),
  ]

  function renderPage(data: LocalHourLog[] = logs) {
    vi.mocked(placementHooks.usePlacement).mockReturnValue(placement)
    vi.mocked(hourLogsHooks.useHourLogs).mockReturnValue(data)
    return render(<HourLogsPage />)
  }

  it('el encabezado presenta el libro y deja registrar horas', () => {
    renderPage()

    expect(screen.getByRole('heading', { level: 1, name: 'Libro de horas' })).toBeInTheDocument()
    expect(screen.getByText(/Se guarda en este dispositivo aunque no haya señal/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrar horas' })).toBeInTheDocument()
  })

  it('la tarjeta de progreso dice la meta y reparte las horas aprobadas, sin revisar y restantes', () => {
    renderPage()

    const card = screen.getByRole('region', { name: 'Progreso del ciclo práctico' })
    expect(within(card).getByText('Meta: 240 horas')).toBeInTheDocument()
    const legend = within(card).getByRole('list', { name: 'Reparto de las horas' })
    expect(within(legend).getByText('4.0 h')).toBeInTheDocument()
    expect(within(legend).getByText('8.0 h')).toBeInTheDocument()
    expect(within(legend).getByText('228.0 h')).toBeInTheDocument()
  })

  it('los indicadores muestran aprobadas, en revisión, registros con su rango de fechas y el promedio por día', () => {
    renderPage()

    const kpis = screen.getByRole('list', { name: 'Indicadores' })
    const card = (label: string) => within(within(kpis).getByText(label).closest('li') as HTMLElement)
    expect(card('Horas aprobadas').getByText('4.0')).toBeInTheDocument()
    expect(card('En revisión').getByText('8.0')).toBeInTheDocument()
    expect(card('En revisión').getByText('2 registros')).toBeInTheDocument()
    expect(card('Registros').getByText('Del 30 mar 2026 al 10 abr 2026')).toBeInTheDocument()
    expect(card('Promedio diario').getByText('4.0')).toBeInTheDocument()
    expect(card('Promedio diario').getByText('por día registrado')).toBeInTheDocument()
  })

  describe('filtros', () => {
    it('ofrece los estados con su conteo; «Todos» está activo al empezar y no hay «Borradores» si no hay ninguno', () => {
      renderPage()

      const group = screen.getByRole('group', { name: 'Filtrar por estado' })
      expect(within(group).getByRole('button', { name: 'Todos (4)' })).toHaveAttribute('aria-pressed', 'true')
      expect(within(group).getByRole('button', { name: 'Aprobadas (1)' })).toHaveAttribute('aria-pressed', 'false')
      expect(within(group).getByRole('button', { name: 'En revisión (2)' })).toBeInTheDocument()
      expect(within(group).getByRole('button', { name: 'Rechazadas (1)' })).toBeInTheDocument()
      expect(within(group).queryByRole('button', { name: /Borradores/ })).toBeNull()
    })

    it('al elegir un estado solo quedan esos registros y el conteo de la tabla se ajusta', async () => {
      const user = userEvent.setup()
      renderPage()

      await user.click(screen.getByRole('button', { name: 'En revisión (2)' }))

      expect(screen.getByRole('button', { name: 'En revisión (2)' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByText('Optimización de consultas')).toBeInTheDocument()
      expect(screen.getByText('Documentación de endpoints')).toBeInTheDocument()
      expect(screen.queryByText('Pruebas unitarias')).toBeNull()
      expect(screen.getByText('2 registros', { selector: '[data-testid="table-count"]' })).toBeInTheDocument()
    })

    it('la búsqueda filtra por actividad sin distinguir mayúsculas ni tildes', async () => {
      const user = userEvent.setup()
      renderPage()

      await user.type(screen.getByRole('searchbox', { name: 'Buscar en el libro' }), 'OPTIMIZACION')

      expect(screen.getByText('Optimización de consultas')).toBeInTheDocument()
      expect(screen.queryByText('Reunión de arranque')).toBeNull()
    })

    it('el selector de mes lista solo los meses con registros y filtra por el elegido', async () => {
      const user = userEvent.setup()
      renderPage()
      const month = screen.getByRole('combobox', { name: 'Mes' })

      expect(within(month).getAllByRole('option').map((option) => option.textContent)).toEqual([
        'Todos los meses',
        'Abril 2026',
        'Marzo 2026',
      ])
      await user.selectOptions(month, '2026-03')

      expect(screen.getByText('Reunión de arranque')).toBeInTheDocument()
      expect(screen.queryByText('Pruebas unitarias')).toBeNull()
    })

    it('si nada coincide lo dice y «Quitar filtros» devuelve todos los registros', async () => {
      const user = userEvent.setup()
      renderPage()

      await user.type(screen.getByRole('searchbox', { name: 'Buscar en el libro' }), 'zzz')
      expect(screen.getByText('Ningún registro coincide con los filtros')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Quitar filtros' }))

      expect(screen.getByText('Pruebas unitarias')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Todos (4)' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('filtrar no cambia los totales: el resumen sigue contando todos los registros', async () => {
      const user = userEvent.setup()
      renderPage()

      await user.click(screen.getByRole('button', { name: 'Aprobadas (1)' }))

      const legend = screen.getByRole('list', { name: 'Reparto de las horas' })
      expect(within(legend).getByText('8.0 h')).toBeInTheDocument()
    })

    it('al cambiar de filtro vuelve a la primera página', async () => {
      const user = userEvent.setup()
      const many = Array.from({ length: 25 }, (_, i) =>
        entry(i + 1, `2026-04-${String((i % 28) + 1).padStart(2, '0')}`, `Tarea ${i + 1}`, i % 2 === 0 ? 'APPROVED' : 'SUBMITTED', 'synced'),
      )
      renderPage(many)

      await user.click(screen.getByRole('button', { name: 'Siguiente' }))
      expect(screen.getByText('Página 2 de 3')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Aprobadas (13)' }))

      expect(screen.getByText('Página 1 de 2')).toBeInTheDocument()
    })
  })

  describe('tabla', () => {
    it('cada fila muestra el día, el mes, el día de la semana y las horas', () => {
      renderPage()

      expect(screen.getByText('Miércoles')).toBeInTheDocument()
      expect(screen.getByText('Lunes')).toBeInTheDocument()
      expect(screen.getAllByText('4.0 h').length).toBeGreaterThanOrEqual(4)
    })

    it('conserva el indicador de sincronización de cada fila', () => {
      renderPage()

      expect(screen.getByRole('img', { name: 'Sincronizado' })).toBeInTheDocument()
      expect(screen.getByRole('img', { name: 'En cola' })).toBeInTheDocument()
      expect(screen.getByRole('img', { name: 'Sin sincronizar' })).toBeInTheDocument()
      expect(screen.getByRole('img', { name: 'Rechazado (fallo permanente)' })).toBeInTheDocument()
    })
  })

  describe('estado de sincronización', () => {
    it('avisa cuántos registros esperan sincronizarse y, aparte, cuántos tuvieron un fallo permanente', () => {
      renderPage()

      // En cola y sin sincronizar esperan; el rechazado definitivamente no «espera»: ya no se reintenta.
      expect(screen.getByText('2 registros esperan sincronizarse con el servidor')).toBeInTheDocument()
      expect(screen.getByText('1 registro con fallo permanente')).toBeInTheDocument()
    })

    it('si todo está sincronizado lo dice', () => {
      renderPage(logs.map((item) => ({ ...item, syncState: 'synced' as const })))

      expect(screen.getByText('Todos tus registros están sincronizados')).toBeInTheDocument()
    })

    it('con un solo registro pendiente habla en singular', () => {
      renderPage([entry(1, '2026-04-01', 'Tarea única', 'SUBMITTED', 'local')])

      expect(screen.getByText('1 registro espera sincronizarse con el servidor')).toBeInTheDocument()
    })
  })
})
