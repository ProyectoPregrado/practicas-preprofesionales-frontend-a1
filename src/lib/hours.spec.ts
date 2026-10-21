import { describe, expect, it } from 'vitest'
import type { LocalHourLog } from '@/offline/db'
import { averagePerRegisteredDay } from './hours'

let nextId = 0

const log = (date: string, hours: number, status: LocalHourLog['status'] = 'APPROVED'): LocalHourLog => ({
  id: ++nextId,
  placementId: 1,
  date,
  startTime: '08:00',
  endTime: '12:00',
  hours,
  activity: 'Actividad',
  status,
  version: 1,
  updatedAt: '2026-04-01T00:00:00.000Z',
  syncState: 'synced',
})

// REDISEÑO-3: promedio de horas de los días en que sí se registró algo (no de todos los días del calendario).
describe('averagePerRegisteredDay', () => {
  it('reparte las horas entre los días con registros', () => {
    expect(averagePerRegisteredDay([log('2026-03-10', 4), log('2026-03-10', 2), log('2026-03-11', 4, 'SUBMITTED')])).toBe(5)
  })

  it('un mismo día con fecha ISO y con fecha simple cuenta como un solo día', () => {
    expect(averagePerRegisteredDay([log('2026-03-10', 3), log('2026-03-10T00:00:00.000Z', 5)])).toBe(8)
  })

  it('no cuenta los rechazados ni los borradores', () => {
    expect(averagePerRegisteredDay([log('2026-03-10', 4), log('2026-03-11', 8, 'REJECTED'), log('2026-03-12', 8, 'DRAFT')])).toBe(4)
  })

  it('sin registros que cuenten devuelve null, no 0 ni NaN', () => {
    expect(averagePerRegisteredDay([])).toBeNull()
    expect(averagePerRegisteredDay(undefined)).toBeNull()
    expect(averagePerRegisteredDay([log('2026-03-10', 4, 'REJECTED')])).toBeNull()
  })
})
