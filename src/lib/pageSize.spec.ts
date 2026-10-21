import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PAGE_SIZE, MIN_PAGE_SIZE, PAGE_SIZE_OPTIONS, normalizePageSize, readPageSize, writePageSize } from './pageSize'

// REDISEÑO-5: cuántas filas ve cada persona por página. Mínimo 5, de 5 en 5 hasta 30, y se recuerda por usuario.
describe('opciones', () => {
  it('van de 5 en 5, desde 5 hasta 30', () => {
    expect(PAGE_SIZE_OPTIONS).toEqual([5, 10, 15, 20, 25, 30])
    expect(MIN_PAGE_SIZE).toBe(5)
  })

  it('por defecto son 10 filas, que es lo que había antes en el libro de horas', () => {
    expect(DEFAULT_PAGE_SIZE).toBe(10)
    expect(PAGE_SIZE_OPTIONS).toContain(DEFAULT_PAGE_SIZE)
  })
})

describe('normalizePageSize', () => {
  it.each([5, 10, 15, 20, 25, 30])('acepta %i', (size) => {
    expect(normalizePageSize(size)).toBe(size)
  })

  it.each([0, 1, 4, 6, 7, 12, 31, 35, 100, -5, 7.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'un valor fuera de las opciones (%s) vuelve al valor por defecto',
    (value) => {
      expect(normalizePageSize(value)).toBe(DEFAULT_PAGE_SIZE)
    },
  )

  it('lo que no es un número tampoco sirve', () => {
    expect(normalizePageSize('15')).toBe(DEFAULT_PAGE_SIZE)
    expect(normalizePageSize(null)).toBe(DEFAULT_PAGE_SIZE)
    expect(normalizePageSize(undefined)).toBe(DEFAULT_PAGE_SIZE)
  })
})

describe('readPageSize / writePageSize', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('sin nada guardado devuelve el valor por defecto', () => {
    expect(readPageSize(1)).toBe(DEFAULT_PAGE_SIZE)
  })

  it('recuerda lo que se guardó', () => {
    writePageSize(1, 25)

    expect(readPageSize(1)).toBe(25)
  })

  it('cada usuario tiene su preferencia', () => {
    writePageSize(1, 5)
    writePageSize(2, 30)

    expect(readPageSize(1)).toBe(5)
    expect(readPageSize(2)).toBe(30)
    expect(readPageSize(3)).toBe(DEFAULT_PAGE_SIZE)
  })

  it('sin usuario cargado se usa una preferencia aparte, sin pisar la de nadie', () => {
    writePageSize(1, 20)
    writePageSize(undefined, 5)

    expect(readPageSize(undefined)).toBe(5)
    expect(readPageSize(null)).toBe(5)
    expect(readPageSize(1)).toBe(20)
  })

  it.each(['abc', '7', '0', '-10', '', '15.5', '1000'])('un valor guardado inválido («%s») se ignora', (stored) => {
    localStorage.setItem('pageSize:1', stored)

    expect(readPageSize(1)).toBe(DEFAULT_PAGE_SIZE)
  })

  it('no guarda un tamaño que no es una opción', () => {
    writePageSize(1, 7)

    expect(readPageSize(1)).toBe(DEFAULT_PAGE_SIZE)
  })

  it('si el almacenamiento falla (navegador en modo privado), no rompe: lee el valor por defecto', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })

    expect(readPageSize(1)).toBe(DEFAULT_PAGE_SIZE)
  })

  it('si no se puede escribir, tampoco rompe', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('cuota llena')
    })

    expect(() => writePageSize(1, 15)).not.toThrow()
  })
})
