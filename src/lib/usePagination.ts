import { useCallback, useState } from 'react'
import { useAuth } from '@/auth/AuthContext'
import { normalizePageSize, readPageSize, writePageSize } from './pageSize'

/**
 * Página actual y filas por página de una tabla. El tamaño es una preferencia de cada usuario, compartida por todas las
 * tablas, y se recuerda en este dispositivo. Hay que llamarlo antes de cualquier `return` temprano de la pantalla.
 */
export function usePagination<T>(items: T[] | undefined) {
  const { user } = useAuth()
  const userId = user?.id
  const [pageSize, setPageSize] = useState(() => readPageSize(userId))
  const [page, setPage] = useState(1)
  const resetPage = useCallback(() => setPage(1), [])

  const list = items ?? []
  const pageCount = Math.max(1, Math.ceil(list.length / pageSize))
  // Si la lista se acorta (un filtro, un registro menos), no se queda en una página que ya no existe.
  const currentPage = Math.min(page, pageCount)
  const visibleItems = list.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  function onPageSizeChange(size: number) {
    const next = normalizePageSize(size)
    writePageSize(userId, next)
    setPageSize(next)
    setPage(1)
  }

  return {
    visibleItems,
    resetPage,
    pagination: {
      page: currentPage,
      pageCount,
      onPageChange: setPage,
      pageSize,
      onPageSizeChange,
      totalCount: list.length,
    },
  }
}
