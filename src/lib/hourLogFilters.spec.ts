import { describe, expect, it } from 'vitest'
import type { LocalHourLog } from '@/offline/db'
import { NO_FILTERS, countByStatus, filterHourLogs, hasActiveFilters, monthsOf } from './hourLogFilters'

let nextId = 0
const log = (date: string, activity: string, status: LocalHourLog['status'] = 'APPROVED'): LocalHourLog => ({
  id: ++nextId,
  placementId: 1,
  date,
  startTime: '08:00',
  endTime: '12:00',
  hours: 4,
  activity,
  status,
  version: 1,
  updatedAt: '2026-04-01T00:00:00.000Z',
  syncState: 'synced',
})

const logs = [
  log('2026-03-30', 'Reunión de arranque', 'APPROVED'),
  log('2026-04-01', 'Optimización de consultas en PostgreSQL', 'SUBMITTED'),
  log('2026-04-07T00:00:00.000Z', 'Pruebas unitarias', 'REJECTED'),
  log('2026-04-10', 'Documentación de endpoints', 'DRAFT'),
]

// REDISEÑO-4: filtros del libro de horas. Se aplican en el cliente, sobre los registros que ya están en el dispositivo.
describe('filterHourLogs', () => {
  it('sin filtros devuelve todo, en el mismo orden', () => {
    expect(filterHourLogs(logs, NO_FILTERS)).toEqual(logs)
  })

  it('filtra por estado', () => {
    expect(filterHourLogs(logs, { ...NO_FILTERS, status: 'SUBMITTED' }).map((item) => item.activity)).toEqual([
      'Optimización de consultas en PostgreSQL',
    ])
  })

  it('filtra por mes, también con fechas que llegan con hora del servidor', () => {
    expect(filterHourLogs(logs, { ...NO_FILTERS, month: '2026-04' })).toHaveLength(3)
    expect(filterHourLogs(logs, { ...NO_FILTERS, month: '2026-03' })).toHaveLength(1)
  })

  it('busca en la actividad sin distinguir mayúsculas ni tildes', () => {
    expect(filterHourLogs(logs, { ...NO_FILTERS, query: 'optimizacion' })).toHaveLength(1)
    expect(filterHourLogs(logs, { ...NO_FILTERS, query: 'REUNION' })).toHaveLength(1)
    expect(filterHourLogs(logs, { ...NO_FILTERS, query: 'postgresql' })).toHaveLength(1)
  })

  it('busca también por fecha', () => {
    expect(filterHourLogs(logs, { ...NO_FILTERS, query: '2026-04-10' }).map((item) => item.activity)).toEqual([
      'Documentación de endpoints',
    ])
  })

  it('ignora los espacios sobrantes de la búsqueda', () => {
    expect(filterHourLogs(logs, { ...NO_FILTERS, query: '  pruebas  ' })).toHaveLength(1)
  })

  it('combina los filtros: deben cumplirse todos', () => {
    expect(filterHourLogs(logs, { status: 'APPROVED', query: 'pruebas', month: '2026-04' })).toEqual([])
    expect(filterHourLogs(logs, { status: 'REJECTED', query: 'pruebas', month: '2026-04' })).toHaveLength(1)
  })

  it('no modifica el arreglo original', () => {
    const copy = [...logs]
    filterHourLogs(logs, { ...NO_FILTERS, status: 'APPROVED' })
    expect(logs).toEqual(copy)
  })
})

describe('countByStatus', () => {
  it('cuenta el total y cada estado', () => {
    expect(countByStatus(logs)).toEqual({ ALL: 4, APPROVED: 1, SUBMITTED: 1, REJECTED: 1, DRAFT: 1 })
  })

  it('sin registros todo es cero', () => {
    expect(countByStatus([])).toEqual({ ALL: 0, APPROVED: 0, SUBMITTED: 0, REJECTED: 0, DRAFT: 0 })
  })
})

describe('monthsOf', () => {
  it('devuelve los meses con registros, del más reciente al más antiguo y sin repetir', () => {
    expect(monthsOf(logs)).toEqual(['2026-04', '2026-03'])
  })

  it('sin registros no hay meses', () => {
    expect(monthsOf([])).toEqual([])
  })
})

describe('hasActiveFilters', () => {
  it('es falso sin filtros y verdadero con cualquiera', () => {
    expect(hasActiveFilters(NO_FILTERS)).toBe(false)
    expect(hasActiveFilters({ ...NO_FILTERS, status: 'APPROVED' })).toBe(true)
    expect(hasActiveFilters({ ...NO_FILTERS, query: 'x' })).toBe(true)
    expect(hasActiveFilters({ ...NO_FILTERS, month: '2026-04' })).toBe(true)
  })

  it('una búsqueda de solo espacios no cuenta como filtro', () => {
    expect(hasActiveFilters({ ...NO_FILTERS, query: '   ' })).toBe(false)
  })
})
