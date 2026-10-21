import { ApiError } from '@/api/client'

interface ErrorContext {
  /** Texto para un 403: el «Forbidden» del servidor no le dice nada a la persona. */
  forbidden: string
  /** Texto para un 404; si falta, se deja pasar el mensaje del servidor. */
  notFound?: string
}

// UX-11: un solo lugar para traducir los errores del servidor. Los demás códigos (400, 409…) llevan un mensaje
// pensado para la persona («la postulación ya fue decidida»), así que se muestra tal cual. Si no es un error de la
// API (red caída, fallo inesperado) devuelve `undefined`: cada pantalla pone su propio mensaje por defecto.
export function describeError(err: unknown, { forbidden, notFound }: ErrorContext): string | undefined {
  if (!(err instanceof ApiError)) return undefined
  if (err.statusCode === 403) return forbidden
  if (err.statusCode === 404 && notFound) return notFound
  return err.message
}
