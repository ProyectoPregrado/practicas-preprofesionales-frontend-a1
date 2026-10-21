import type { ReactNode } from 'react'

/** Fila de indicadores de un panel: una columna en el móvil, dos en tableta y cuatro en escritorio. */
export function KpiGrid({ children }: { children: ReactNode }) {
  return (
    <ul aria-label="Indicadores" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {children}
    </ul>
  )
}
