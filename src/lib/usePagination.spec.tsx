import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as authContext from '@/auth/AuthContext'
import { usePagination } from './usePagination'

vi.mock('@/auth/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/auth/AuthContext')>()
  return { ...actual, useAuth: vi.fn() }
})

const signInAs = (id: number | null) =>
  vi.mocked(authContext.useAuth).mockReturnValue({
    user: id === null ? null : { id, email: 'u@miyura.com', fullName: 'U', role: 'STUDENT', companyId: null },
    role: id === null ? null : 'STUDENT',
    login: vi.fn(),
    logout: vi.fn(),
  })

const rows = (count: number) => Array.from({ length: count }, (_, index) => index + 1)

// REDISEÑO-5: el estado de página y de tamaño de página que comparten todas las tablas.
describe('usePagination', () => {
  beforeEach(() => {
    localStorage.clear()
    signInAs(1)
  })

  it('por defecto muestra 10 filas, la primera página', () => {
    const { result } = renderHook(() => usePagination(rows(25)))

    expect(result.current.visibleItems).toEqual(rows(10))
    expect(result.current.pagination).toMatchObject({ page: 1, pageCount: 3, pageSize: 10, totalCount: 25 })
  })

  it('al cambiar de página muestra las filas que tocan', () => {
    const { result } = renderHook(() => usePagination(rows(25)))

    act(() => result.current.pagination.onPageChange(3))

    expect(result.current.visibleItems).toEqual([21, 22, 23, 24, 25])
  })

  it('al elegir otro tamaño recalcula las páginas y vuelve a la primera', () => {
    const { result } = renderHook(() => usePagination(rows(25)))
    act(() => result.current.pagination.onPageChange(3))

    act(() => result.current.pagination.onPageSizeChange(5))

    expect(result.current.pagination).toMatchObject({ page: 1, pageCount: 5, pageSize: 5 })
    expect(result.current.visibleItems).toEqual(rows(5))
  })

  it('con 30 filas por página caben todos los registros de una tabla de 30', () => {
    const { result } = renderHook(() => usePagination(rows(30)))

    act(() => result.current.pagination.onPageSizeChange(30))

    expect(result.current.visibleItems).toHaveLength(30)
    expect(result.current.pagination.pageCount).toBe(1)
  })

  it('un tamaño que no es una opción se ignora y queda el valor por defecto', () => {
    const { result } = renderHook(() => usePagination(rows(25)))

    act(() => result.current.pagination.onPageSizeChange(7))

    expect(result.current.pagination.pageSize).toBe(10)
  })

  it('recuerda la elección: otra pantalla del mismo usuario empieza con ese tamaño', () => {
    const first = renderHook(() => usePagination(rows(25)))
    act(() => first.result.current.pagination.onPageSizeChange(20))
    first.unmount()

    const second = renderHook(() => usePagination(rows(25)))

    expect(second.result.current.pagination.pageSize).toBe(20)
  })

  it('la preferencia es de cada usuario: otra persona en el mismo equipo empieza con el valor por defecto', () => {
    const mine = renderHook(() => usePagination(rows(25)))
    act(() => mine.result.current.pagination.onPageSizeChange(30))
    mine.unmount()

    signInAs(2)
    const theirs = renderHook(() => usePagination(rows(25)))

    expect(theirs.result.current.pagination.pageSize).toBe(10)
  })

  it('si la lista se acorta y la página actual ya no existe, muestra la última', () => {
    let items = rows(25)
    const { result, rerender } = renderHook(() => usePagination(items))
    act(() => result.current.pagination.onPageChange(3))

    items = rows(12)
    rerender()

    expect(result.current.pagination).toMatchObject({ page: 2, pageCount: 2 })
    expect(result.current.visibleItems).toEqual([11, 12])
  })

  it('mientras los datos cargan (undefined) no hay filas ni páginas que mostrar', () => {
    const { result } = renderHook(() => usePagination<number>(undefined))

    expect(result.current.visibleItems).toEqual([])
    expect(result.current.pagination).toMatchObject({ page: 1, pageCount: 1, totalCount: 0 })
  })

  it('resetPage vuelve a la primera página (por ejemplo, al cambiar un filtro)', () => {
    const { result } = renderHook(() => usePagination(rows(25)))
    act(() => result.current.pagination.onPageChange(2))

    act(() => result.current.resetPage())

    expect(result.current.pagination.page).toBe(1)
  })
})
