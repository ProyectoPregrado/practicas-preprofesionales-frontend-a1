import { Button } from '@/components/ui/button'

interface PaginationProps {
  page: number
  pageCount: number
  onPageChange: (page: number) => void
}

export function Pagination({ page, pageCount, onPageChange }: PaginationProps) {
  if (pageCount <= 1) return null
  return (
    <nav aria-label="Paginación" className="flex items-center justify-end gap-3 px-1 pt-3">
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
    </nav>
  )
}
