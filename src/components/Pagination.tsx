import { Button } from '@/components/ui/button'
import { MIN_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '@/lib/pageSize'

interface PaginationProps {
  page: number
  pageCount: number
  onPageChange: (page: number) => void
  /** Filas por página en uso. Junto con `onPageSizeChange` y `totalCount` activa el selector de tamaño. */
  pageSize?: number
  onPageSizeChange?: (size: number) => void
  /** Total de registros: con 5 o menos no hay nada que elegir y el selector no aparece. */
  totalCount?: number
}

export function Pagination({ page, pageCount, onPageChange, pageSize, onPageSizeChange, totalCount = 0 }: PaginationProps) {
  const showSizeSelect = pageSize !== undefined && onPageSizeChange !== undefined && totalCount > MIN_PAGE_SIZE
  if (pageCount <= 1 && !showSizeSelect) return null
  return (
    <nav aria-label="Paginación" className="flex flex-wrap items-center justify-between gap-3 px-1 pt-3">
      {showSizeSelect ? (
        <label className="flex items-center gap-2 text-12 text-inkSoft">
          Filas por página
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="h-8 rounded-lg border border-line bg-surface px-2 text-12 font-semibold text-ink hover:border-stamp/40 focus-visible:border-stamp focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stamp/25"
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <span />
      )}
      {pageCount > 1 ? (
        <div className="flex items-center gap-3">
          <Button type="button" size="sm" variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            Anterior
          </Button>
          <span className="font-data text-12 text-inkSoft">
            Página {page} de {pageCount}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
          >
            Siguiente
          </Button>
        </div>
      ) : null}
    </nav>
  )
}
