export interface RetryConfig {
  /** Tiempo base inicial en milisegundos (por defecto: 1000ms = 1s) */
  initialDelayMs: number
  /** Factor multiplicador del retroceso exponencial (por defecto: 2) */
  factor: number
  /** Límite máximo de espera en ms parametrizable (por defecto: 8000ms = 8s) */
  maxDelayMs: number
  /** Límite máximo de intentos antes de marcar fallo permanente (por defecto: 5) */
  maxAttempts: number
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  initialDelayMs: 1000,
  factor: 2,
  maxDelayMs: 8000,
  maxAttempts: 5,
}

/**
 * Calcula la espera creciente con retroceso exponencial según el número de intentos:
 * Intento 1 -> 1s (1000 ms)
 * Intento 2 -> 2s (2000 ms)
 * Intento 3 -> 4s (4000 ms)
 * Intento 4 -> 8s (8000 ms)
 * Respeta el límite máximo parametrizable maxDelayMs.
 */
export function calculateBackoff(
  attempts: number,
  config?: Partial<RetryConfig>,
): number {
  if (attempts <= 0) return 0

  const initial = config?.initialDelayMs ?? DEFAULT_RETRY_CONFIG.initialDelayMs
  const factor = config?.factor ?? DEFAULT_RETRY_CONFIG.factor
  const maxDelay = config?.maxDelayMs ?? DEFAULT_RETRY_CONFIG.maxDelayMs

  const delay = initial * Math.pow(factor, attempts - 1)
  return Math.min(delay, maxDelay)
}
