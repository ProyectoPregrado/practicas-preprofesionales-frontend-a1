import { describe, expect, it } from 'vitest'
import type { LocalHourLog, LocalPlacement } from '@/offline/db'
import { queueSummary, sortByQueue, studentProgress } from './tutorQueue'

function placement(id: number, requiredHours = 100): LocalPlacement {
  return {
    id,
    studentId: 100 + id,
    tutorId: 2,
    companyId: 1,
    startDate: '2026-01-01',
    endDate: '2026-06-01',
    requiredHours,
    status: 'ACTIVE',
    version: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

let nextId = 1
function log(status: LocalHourLog['status'], hours: number, date = '2026-03-01'): LocalHourLog {
  return {
    id: nextId++,
    placementId: 1,
    date,
    startTime: '08:00',
    endTime: '12:00',
    hours,
    activity: 'Actividad',
    status,
    version: 1,
    updatedAt: '2026-03-01T00:00:00.000Z',
    syncState: 'synced',
  }
}

describe('studentProgress', () => {
  it('suma aprobadas y enviadas, cuenta registros sin revisar y devueltos, e ignora borradores en las horas', () => {
    const row = studentProgress(placement(1), [
      log('APPROVED', 4),
      log('APPROVED', 6),
      log('SUBMITTED', 3),
      log('SUBMITTED', 2),
      log('REJECTED', 5),
      log('DRAFT', 8),
    ])
    expect(row.approvedHours).toBe(10)
    expect(row.submittedHours).toBe(5)
    expect(row.submittedLogs).toBe(2)
    expect(row.rejectedLogs).toBe(1)
    expect(row.approvedPct).toBe(10)
  })

  it('el último registro es el día más reciente, aunque la fecha traiga hora', () => {
    const row = studentProgress(placement(1), [
      log('APPROVED', 1, '2026-03-02T00:00:00.000Z'),
      log('APPROVED', 1, '2026-03-10'),
      log('APPROVED', 1, '2026-03-05'),
    ])
    expect(row.lastLogDate).toBe('2026-03-10')
  })

  it('sin registros: cero horas, sin último registro', () => {
    const row = studentProgress(placement(1), [])
    expect(row.approvedHours).toBe(0)
    expect(row.lastLogDate).toBeNull()
  })

  it('acota el porcentaje a 100 y no divide entre cero', () => {
    expect(studentProgress(placement(1, 10), [log('APPROVED', 40)]).approvedPct).toBe(100)
    expect(studentProgress(placement(1, 0), [log('APPROVED', 4)]).approvedPct).toBe(0)
  })
})

describe('sortByQueue', () => {
  it('pone primero a quien más horas tiene esperando y luego al más atrasado', () => {
    const rows = [
      studentProgress(placement(1), [log('APPROVED', 50)]),
      studentProgress(placement(2), [log('SUBMITTED', 2)]),
      studentProgress(placement(3), [log('APPROVED', 10)]),
      studentProgress(placement(4), [log('SUBMITTED', 6)]),
    ]
    expect(sortByQueue(rows).map((row) => row.placement.id)).toEqual([4, 2, 3, 1])
  })

  it('desempata por id y no modifica el arreglo original', () => {
    const rows = [studentProgress(placement(3), []), studentProgress(placement(1), [])]
    expect(sortByQueue(rows).map((row) => row.placement.id)).toEqual([1, 3])
    expect(rows.map((row) => row.placement.id)).toEqual([3, 1])
  })
})

describe('queueSummary', () => {
  it('cuenta practicantes esperando, horas y registros sin revisar y el avance medio', () => {
    const summary = queueSummary([
      studentProgress(placement(1), [log('SUBMITTED', 2), log('SUBMITTED', 1), log('APPROVED', 20)]),
      studentProgress(placement(2), [log('APPROVED', 60)]),
    ])
    expect(summary).toEqual({ students: 2, waiting: 1, pendingHours: 3, pendingLogs: 2, averagePct: 40 })
  })

  it('sin practicantes el avance medio es null, no 0 %', () => {
    expect(queueSummary([]).averagePct).toBeNull()
  })
})
