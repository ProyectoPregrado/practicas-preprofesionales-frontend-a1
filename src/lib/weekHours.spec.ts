import { describe, expect, it } from 'vitest'
import type { LocalHourLog } from '@/offline/db'
import { weekHours } from './weekHours'

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

// El 8 de abril de 2026 es miércoles: su semana va del lunes 6 al domingo 12.
const WEDNESDAY = new Date(2026, 3, 8)

describe('weekHours', () => {
  it('devuelve los siete días de la semana que contiene la fecha, de lunes a domingo', () => {
    const { days } = weekHours([], WEDNESDAY)

    expect(days.map((day) => day.label)).toEqual(['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'])
    expect(days.map((day) => day.key)).toEqual([
      '2026-04-06',
      '2026-04-07',
      '2026-04-08',
      '2026-04-09',
      '2026-04-10',
      '2026-04-11',
      '2026-04-12',
    ])
  })

  it('marca solo el día de hoy', () => {
    const { days } = weekHours([], WEDNESDAY)

    expect(days.filter((day) => day.isToday).map((day) => day.key)).toEqual(['2026-04-08'])
  })

  it('suma por día las horas aprobadas y las enviadas, por separado', () => {
    const { days } = weekHours(
      [log('2026-04-06', 4), log('2026-04-06', 2), log('2026-04-07', 3, 'SUBMITTED'), log('2026-04-07', 1, 'APPROVED')],
      WEDNESDAY,
    )

    expect(days[0]).toMatchObject({ approved: 6, submitted: 0 })
    expect(days[1]).toMatchObject({ approved: 1, submitted: 3 })
  })

  it('no cuenta los registros rechazados ni los borradores', () => {
    const { days, total } = weekHours([log('2026-04-06', 4, 'REJECTED'), log('2026-04-06', 4, 'DRAFT')], WEDNESDAY)

    expect(days[0]).toMatchObject({ approved: 0, submitted: 0 })
    expect(total).toBe(0)
  })

  it('ignora los registros de otras semanas', () => {
    const { total } = weekHours([log('2026-04-05', 4), log('2026-04-13', 4), log('2026-03-30', 4)], WEDNESDAY)

    expect(total).toBe(0)
  })

  it('entiende las fechas con hora que llegan sincronizadas del servidor', () => {
    const { days } = weekHours([log('2026-04-07T00:00:00.000Z', 5)], WEDNESDAY)

    expect(days[1]).toMatchObject({ key: '2026-04-07', approved: 5 })
  })

  it('el total es la suma de lo aprobado y lo enviado de la semana, fines de semana incluidos', () => {
    const { total } = weekHours([log('2026-04-06', 4), log('2026-04-11', 3, 'SUBMITTED'), log('2026-04-12', 1)], WEDNESDAY)

    expect(total).toBe(8)
  })

  it('una semana que cruza de mes empieza en el mes anterior', () => {
    const { days } = weekHours([], new Date(2026, 3, 1))

    expect(days[0].key).toBe('2026-03-30')
    expect(days[6].key).toBe('2026-04-05')
  })

  it('si hoy es domingo, la semana termina hoy', () => {
    const { days } = weekHours([], new Date(2026, 3, 12))

    expect(days[0].key).toBe('2026-04-06')
    expect(days[6]).toMatchObject({ key: '2026-04-12', isToday: true })
  })

  it('mientras los registros cargan (undefined) todo queda en cero', () => {
    const { days, total } = weekHours(undefined, WEDNESDAY)

    expect(total).toBe(0)
    expect(days.every((day) => day.approved === 0 && day.submitted === 0)).toBe(true)
  })
})
