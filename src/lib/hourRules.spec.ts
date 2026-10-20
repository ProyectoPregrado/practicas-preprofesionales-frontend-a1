import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/offline/db'
import {
  MAX_HOURS_PER_DAY,
  MIN_HOURS_PER_LOG,
  getDailyRegisteredHours,
  hoursRangeError,
  timeOrderError,
  validateHourEntry,
} from './hourRules'

describe('hourRules — límites y mensajes base (E6-01)', () => {
  it('constantes alineadas con el backend', () => {
    expect(MIN_HOURS_PER_LOG).toBe(0.5)
    expect(MAX_HOURS_PER_DAY).toBe(8)
  })

  it('hoursRangeError valida límites por registro', () => {
    expect(hoursRangeError(0.5)).toBeNull()
    expect(hoursRangeError(4)).toBeNull()
    expect(hoursRangeError(8)).toBeNull()

    expect(hoursRangeError(0.2)).toMatch(/entre 0\.5 y 8/)
    expect(hoursRangeError(8.5)).toMatch(/entre 0\.5 y 8/)
  })

  it('timeOrderError valida orden cronológico', () => {
    expect(timeOrderError('08:00', '12:00')).toBeNull()
    expect(timeOrderError('12:00', '08:00')).toMatch(/posterior a la de inicio/)
    expect(timeOrderError('09:00', '09:00')).toMatch(/posterior a la de inicio/)
  })
})

describe('validateHourEntry — validación completa (E6-01)', () => {
  it('rechaza valores no numéricos o vacíos', () => {
    expect(validateHourEntry('', '08:00', '12:00')).toBe('Ingresa un número de horas válido')
    expect(validateHourEntry('abc', '08:00', '12:00')).toBe('Ingresa un número de horas válido')
  })

  it('rechaza registros con menos de 0.5 horas', () => {
    expect(validateHourEntry('0.25', '08:00', '08:15')).toMatch(/entre 0\.5 y 8/)
    expect(validateHourEntry('0', '08:00', '08:00')).toMatch(/entre 0\.5 y 8/)
  })

  it('rechaza fin menor o igual a inicio', () => {
    expect(validateHourEntry('2', '12:00', '10:00')).toBe('La hora de fin debe ser posterior a la de inicio')
    expect(validateHourEntry('2', '10:00', '10:00')).toBe('La hora de fin debe ser posterior a la de inicio')
  })

  it('permite registrar hasta 8 horas sin registros previos', () => {
    expect(validateHourEntry('8', '08:00', '16:00', 0, '2026-10-20')).toBeNull()
  })

  it('rechaza más de 8 horas sin registros previos', () => {
    expect(validateHourEntry('9', '08:00', '17:00', 0, '2026-10-20')).toBe(
      'No puedes registrar más de 8 horas en un mismo día',
    )
  })

  it('permite completar el total de 8 horas con registros previos (5 + 3 = 8)', () => {
    expect(validateHourEntry('3', '14:00', '17:00', 5, '2026-10-20')).toBeNull()
  })

  it('rechaza si la suma supera 8 horas e indica lo ya registrado y la fecha', () => {
    expect(validateHourEntry('4', '14:00', '18:00', 5, '2026-10-20')).toBe(
      'No puedes registrar más de 8 horas en un mismo día (ya tienes 5 registradas el 2026-10-20)',
    )
  })
})

describe('getDailyRegisteredHours — consulta en Dexie (E6-01)', () => {
  beforeEach(async () => {
    await db.hourLogs.clear()
  })

  it('suma horas activas del placement y fecha, ignorando REJECTED y otros placements/fechas', async () => {
    const today = '2026-10-20'
    await db.hourLogs.bulkPut([
      {
        id: 1,
        placementId: 5,
        date: today,
        startTime: '08:00',
        endTime: '11:00',
        hours: 3,
        activity: 'Actividad 1',
        status: 'SUBMITTED',
        syncState: 'synced',
        version: 1,
        updatedAt: new Date().toISOString(),
      },
      {
        id: 2,
        placementId: 5,
        date: today,
        startTime: '11:00',
        endTime: '13:00',
        hours: 2,
        activity: 'Actividad 2',
        status: 'APPROVED',
        syncState: 'synced',
        version: 1,
        updatedAt: new Date().toISOString(),
      },
      {
        id: 3,
        placementId: 5,
        date: today,
        startTime: '14:00',
        endTime: '16:00',
        hours: 2,
        activity: 'Actividad rechazada',
        status: 'REJECTED',
        syncState: 'synced',
        version: 1,
        updatedAt: new Date().toISOString(),
      },
      {
        id: 4,
        placementId: 99, // Otro placement
        date: today,
        startTime: '08:00',
        endTime: '12:00',
        hours: 4,
        activity: 'Otro placement',
        status: 'APPROVED',
        syncState: 'synced',
        version: 1,
        updatedAt: new Date().toISOString(),
      },
      {
        id: 5,
        placementId: 5,
        date: '2026-10-19', // Otra fecha
        startTime: '08:00',
        endTime: '12:00',
        hours: 4,
        activity: 'Ayer',
        status: 'APPROVED',
        syncState: 'synced',
        version: 1,
        updatedAt: new Date().toISOString(),
      },
    ])

    const total = await getDailyRegisteredHours(5, today)
    // 3 (id: 1) + 2 (id: 2) = 5 (id 3 rechazado, id 4 otro placement, id 5 otra fecha)
    expect(total).toBe(5)
  })

  it('permite excluir un id al editar', async () => {
    const today = '2026-10-20'
    await db.hourLogs.put({
      id: 10,
      placementId: 5,
      date: today,
      startTime: '08:00',
      endTime: '12:00',
      hours: 4,
      activity: 'Actividad existente',
      status: 'SUBMITTED',
      syncState: 'synced',
      version: 1,
      updatedAt: new Date().toISOString(),
    })

    const totalExcluido = await getDailyRegisteredHours(5, today, 10)
    expect(totalExcluido).toBe(0)
  })

  it('reconoce registros sincronizados con timestamp ISO ("YYYY-MM-DDT00:00:00.000Z")', async () => {
    const inputDate = '2026-10-20'
    await db.hourLogs.put({
      id: 20,
      placementId: 5,
      date: '2026-10-20T00:00:00.000Z',
      startTime: '08:00',
      endTime: '13:33',
      hours: 5.55,
      activity: 'Sincronizada del servidor',
      status: 'SUBMITTED',
      syncState: 'synced',
      version: 1,
      updatedAt: new Date().toISOString(),
    })

    const total = await getDailyRegisteredHours(5, inputDate)
    expect(total).toBe(5.55)
  })
})
