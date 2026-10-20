import { describe, expect, it } from 'vitest'
import {
  durationInHours,
  formatDateForConfirmation,
  todayAsInputValue,
} from './hourLogHelpers'

describe('hourLogHelpers (E6-04)', () => {
  describe('todayAsInputValue', () => {
    it('devuelve una fecha válida en formato YYYY-MM-DD', () => {
      const result = todayAsInputValue()
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })

  describe('formatDateForConfirmation', () => {
    it('devuelve cadena vacía si la fecha es inválida o vacía', () => {
      expect(formatDateForConfirmation('')).toBe('')
      expect(formatDateForConfirmation('invalid-date')).toBe('')
    })

    it('formatea la fecha en español con formato completo', () => {
      const result = formatDateForConfirmation('2026-10-20')
      expect(result.toLowerCase()).toContain('2026')
      expect(result.toLowerCase()).toContain('20')
    })
  })

  describe('durationInHours', () => {
    it('calcula la diferencia correcta en horas con 2 decimales', () => {
      expect(durationInHours('08:00', '12:00')).toBe(4)
      expect(durationInHours('08:00', '12:30')).toBe(4.5)
      expect(durationInHours('08:15', '09:45')).toBe(1.5)
    })

    it('devuelve null si falta la hora de inicio o de fin', () => {
      expect(durationInHours('', '12:00')).toBeNull()
      expect(durationInHours('08:00', '')).toBeNull()
    })

    it('devuelve null si la hora de fin es menor o igual a la de inicio', () => {
      expect(durationInHours('12:00', '08:00')).toBeNull()
      expect(durationInHours('08:00', '08:00')).toBeNull()
    })

    it('devuelve null si el formato de hora no es válido', () => {
      expect(durationInHours('ab:cd', '12:00')).toBeNull()
      expect(durationInHours('08:00', 'ef:gh')).toBeNull()
    })
  })
})
