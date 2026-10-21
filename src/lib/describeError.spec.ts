import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/client'
import { describeError } from './describeError'

const FORBIDDEN = 'No tienes permiso para hacer esto.'
const NOT_FOUND = 'Esto ya no existe.'

// UX-11: antes cada pantalla repetía su propia traducción de 403 / 404 / mensaje del servidor.
describe('describeError', () => {
  it('un 403 se explica con el texto de la pantalla, no con el «Forbidden» del servidor', () => {
    expect(describeError(new ApiError(403, 'Forbidden'), { forbidden: FORBIDDEN })).toBe(FORBIDDEN)
  })

  it('un 404 usa el texto de la pantalla cuando lo hay', () => {
    expect(describeError(new ApiError(404, 'oferta no encontrada'), { forbidden: FORBIDDEN, notFound: NOT_FOUND })).toBe(
      NOT_FOUND,
    )
  })

  it('un 404 sin texto propio deja pasar el mensaje del servidor', () => {
    expect(describeError(new ApiError(404, 'oferta no encontrada'), { forbidden: FORBIDDEN })).toBe(
      'oferta no encontrada',
    )
  })

  it.each([400, 409, 500])('un %i deja pasar el mensaje del servidor', (status) => {
    expect(describeError(new ApiError(status, 'la postulación ya fue decidida'), { forbidden: FORBIDDEN })).toBe(
      'la postulación ya fue decidida',
    )
  })

  it.each([
    ['un TypeError de red', new TypeError('Failed to fetch')],
    ['un texto suelto', 'boom'],
    ['undefined', undefined],
  ])('con %s no hay texto: quien llama pone su mensaje por defecto', (_caso, failure) => {
    expect(describeError(failure, { forbidden: FORBIDDEN, notFound: NOT_FOUND })).toBeUndefined()
  })
})
