import { describe, expect, it } from 'vitest'
import type { LocalHourLog, LocalPlacement } from '@/offline/db'
import { accreditationTable, hourLogTable, studentQueueTable } from './exportTables'
import { studentProgress } from './tutorQueue'

function log(id: number, status: LocalHourLog['status'], hours: number, extra: Partial<LocalHourLog> = {}): LocalHourLog {
  return {
    id, placementId: 1, date: `2026-03-0${id}T00:00:00.000Z`, startTime: '08:00', endTime: '12:00', hours,
    activity: `Tarea ${id}`, status, version: 1, updatedAt: '2026-03-01T00:00:00.000Z', syncState: 'synced', ...extra,
  }
}

const placement: LocalPlacement = {
  id: 1, studentId: 22, tutorId: 2, companyId: 7, startDate: '2026-03-01', endDate: '2026-07-31',
  requiredHours: 240, status: 'ACTIVE', version: 1, updatedAt: '2026-03-01T00:00:00.000Z',
}

describe('hourLogTable', () => {
  it('una fila por registro con el estado en español y la nota, y los totales al final', () => {
    const rows = hourLogTable([
      log(1, 'APPROVED', 4),
      log(2, 'SUBMITTED', 2.5),
      log(3, 'REJECTED', 3, { reviewNote: 'Falta detalle' }),
    ])

    expect(rows[0]).toEqual(['Fecha', 'Inicio', 'Fin', 'Horas', 'Actividad', 'Estado', 'Nota de revisión'])
    expect(rows[1]).toEqual(['2026-03-01', '08:00', '12:00', 4, 'Tarea 1', 'Aprobada', ''])
    expect(rows[3]).toEqual(['2026-03-03', '08:00', '12:00', 3, 'Tarea 3', 'Rechazada', 'Falta detalle'])
    expect(rows.slice(-2)).toEqual([
      ['Total aprobado', '', '', 4],
      ['Total en revisión', '', '', 2.5],
    ])
  })
})

describe('studentQueueTable', () => {
  it('resume a cada practicante con su avance redondeado', () => {
    const rows = studentQueueTable([studentProgress(placement, [log(1, 'APPROVED', 60), log(2, 'SUBMITTED', 4), log(3, 'REJECTED', 1)])])

    expect(rows[1]).toEqual(['Estudiante #22', 'Empresa #7', 60, 240, 25, 4, 1, '2026-03-03'])
  })
})

describe('accreditationTable', () => {
  it('traduce el nivel y junta las razones en una celda', () => {
    const rows = accreditationTable(
      [{ placementId: 1, studentName: 'Ana Pérez', level: 'NO_ACREDITADO', reasons: ['horas insuficientes', 'falta el seguro'], completionPercentage: 40 }],
      '2026-1',
    )

    expect(rows[1]).toEqual(['2026-1', 'Ana Pérez', 'No acreditado', 40, 'horas insuficientes; falta el seguro'])
  })
})
