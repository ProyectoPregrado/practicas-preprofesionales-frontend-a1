import { describe, expect, it } from 'vitest'
import { buildFormErrors } from './hourLogErrors'

describe('hourLogErrors (E6-04)', () => {
  it('no devuelve errores cuando todos los campos son válidos', () => {
    const errors = buildFormErrors('2026-10-20', '08:00', '12:00', '4', 'Desarrollo frontend', 0)
    expect(errors).toEqual({})
  })

  it('exige la fecha si está vacía', () => {
    const errors = buildFormErrors('', '08:00', '12:00', '4', 'Actividad', 0)
    expect(errors.date).toBe('La fecha es obligatoria')
  })

  it('rechaza una fecha posterior a hoy', () => {
    const errors = buildFormErrors('2099-01-01', '08:00', '12:00', '4', 'Actividad', 0)
    expect(errors.date).toBe('La fecha no puede ser posterior a hoy')
  })

  it('exige hora de inicio y fin', () => {
    const errors = buildFormErrors('2026-10-20', '', '', '4', 'Actividad', 0)
    expect(errors.startTime).toBe('La hora de inicio es obligatoria')
    expect(errors.endTime).toBe('La hora de fin es obligatoria')
  })

  it('exige actividad y rechaza cadenas compuestas solo de espacios en blanco', () => {
    const emptyErrors = buildFormErrors('2026-10-20', '08:00', '12:00', '4', '', 0)
    expect(emptyErrors.activity).toBe('Describe la actividad realizada')

    const whitespaceErrors = buildFormErrors('2026-10-20', '08:00', '12:00', '4', '     ', 0)
    expect(whitespaceErrors.activity).toBe('Describe la actividad realizada')
  })

  it('integra la validación de horas contra el tope diario', () => {
    const errors = buildFormErrors('2026-10-20', '08:00', '14:00', '6', 'Actividad', 5)
    expect(errors.hours).toContain('No puedes registrar más de 8 horas en un mismo día')
  })
})
