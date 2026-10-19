import { render, screen } from '@testing-library/react'
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
