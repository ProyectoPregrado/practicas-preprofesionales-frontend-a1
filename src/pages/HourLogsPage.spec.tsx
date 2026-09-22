import { render, screen } from '@testing-library/react'
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
})
