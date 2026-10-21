import { describe, expect, it } from 'vitest'
import { statusLabel } from './statusLabels'

// REDISEÑO-5: la persona lee el estado en español; el valor que viaja a la API no cambia (ver las specs de las pantallas).
describe('statusLabel', () => {
  it.each([
    ['DRAFT', 'Borrador'],
    ['SUBMITTED', 'En revisión'],
    ['APPROVED', 'Aprobada'],
    ['REJECTED', 'Rechazada'],
  ])('hora %s se lee «%s»', (status, label) => {
    expect(statusLabel(status, 'hour')).toBe(label)
  })

  it.each([
    ['PENDING', 'En revisión'],
    ['VALIDATED', 'Validado'],
    ['REJECTED', 'Rechazado'],
  ])('documento %s se lee «%s»', (status, label) => {
    expect(statusLabel(status, 'document')).toBe(label)
  })

  it('el género sigue a lo que se califica: una hora «Rechazada», un documento «Rechazado»', () => {
    expect(statusLabel('REJECTED', 'hour')).toBe('Rechazada')
    expect(statusLabel('REJECTED', 'document')).toBe('Rechazado')
  })

  it('un estado desconocido se muestra tal cual, para no esconder un valor nuevo del backend', () => {
    expect(statusLabel('ARCHIVED', 'hour')).toBe('ARCHIVED')
    expect(statusLabel('ARCHIVED', 'document')).toBe('ARCHIVED')
  })

  it('un estado de documento no se traduce como si fuera de hora', () => {
    expect(statusLabel('VALIDATED', 'hour')).toBe('VALIDATED')
    expect(statusLabel('PENDING', 'hour')).toBe('PENDING')
  })
})
