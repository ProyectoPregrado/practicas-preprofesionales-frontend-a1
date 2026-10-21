/** Filas por página que puede elegir cada persona: de 5 en 5, desde 5 hasta 30. */
export const PAGE_SIZE_OPTIONS = [5, 10, 15, 20, 25, 30] as const
export const MIN_PAGE_SIZE = PAGE_SIZE_OPTIONS[0]
/** Lo que había antes en el libro de horas. */
export const DEFAULT_PAGE_SIZE = 10

/** El tamaño si es una de las opciones; si no (o si no es un número), el valor por defecto. */
export function normalizePageSize(value: unknown): number {
  return typeof value === 'number' && (PAGE_SIZE_OPTIONS as readonly number[]).includes(value) ? value : DEFAULT_PAGE_SIZE
}

// La preferencia es de cada usuario y vive en este dispositivo. Sin usuario cargado se usa una clave aparte.
const keyOf = (userId: number | null | undefined): string => `pageSize:${userId ?? 'anon'}`

export function readPageSize(userId: number | null | undefined): number {
  try {
    return normalizePageSize(Number(localStorage.getItem(keyOf(userId))))
  } catch {
    // Almacenamiento bloqueado (modo privado): se usa el valor por defecto.
    return DEFAULT_PAGE_SIZE
  }
}

export function writePageSize(userId: number | null | undefined, size: number): void {
  try {
    localStorage.setItem(keyOf(userId), String(normalizePageSize(size)))
  } catch {
    // Sin almacenamiento la preferencia solo dura mientras la pantalla esté abierta.
  }
}
