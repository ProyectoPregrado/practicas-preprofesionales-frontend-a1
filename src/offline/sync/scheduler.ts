import { db } from '@/offline/db'
import { calculateBackoff, DEFAULT_RETRY_CONFIG, type RetryConfig } from './backoff'
import { pullChanges } from './pull'
import { pushOutbox } from './push'
import { setStatus } from './status'

const SYNC_INTERVAL_MS = 60_000
// Tope de rondas de pull por corrida: evita que un servidor que siempre
// responda hasMore:true cuelgue el scheduler en un bucle infinito.
const MAX_PULL_ROUNDS = 20

function hasSession(): boolean {
  return typeof localStorage !== 'undefined' && Boolean(localStorage.getItem('access_token'))
}

let currentSync: Promise<void> | null = null
let retryTimer: number | null = null
let activeRetryConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG }

export function getRetryConfig(): RetryConfig {
  return activeRetryConfig
}

export function setRetryConfig(config: Partial<RetryConfig>): void {
  activeRetryConfig = { ...activeRetryConfig, ...config }
}

export function cancelRetry(): void {
  if (retryTimer != null) {
    window.clearTimeout(retryTimer)
    retryTimer = null
  }
  setStatus({ retrying: false })
}

export function getRetryTimer(): number | null {
  return retryTimer
}

async function getFailedCount(): Promise<number> {
  return db.hourLogs.where('syncState').equals('failed').count()
}

async function pullAllRounds(): Promise<void> {
  let hasMore = true
  let rounds = 0
  while (hasMore && rounds < MAX_PULL_ROUNDS) {
    const result = await pullChanges()
    hasMore = result.hasMore
    rounds += 1
  }
}

async function scheduleNextRetry(pending: number): Promise<void> {
  const stillOnline = typeof navigator === 'undefined' || navigator.onLine
  if (!stillOnline || pending <= 0 || !hasSession()) {
    cancelRetry()
    return
  }

  const entries = await db.outbox.toArray()
  const maxAttempts = entries.length > 0 ? Math.max(...entries.map((e) => e.attempts)) : 1
  const delay = calculateBackoff(maxAttempts, activeRetryConfig)

  setStatus({ retrying: true })
  retryTimer = window.setTimeout(() => {
    retryTimer = null
    void syncNow()
  }, delay)
}

async function runSync(): Promise<void> {
  if (!hasSession()) return

  // Si no hay red, interrumpir reintentos y no intentar llamada de red para cuidar la batería
  const isOnline = typeof navigator === 'undefined' || navigator.onLine
  if (!isOnline) {
    cancelRetry()
    setStatus({ syncing: false, online: false })
    return
  }

  cancelRetry()
  setStatus({ syncing: true })

  try {
    await pullAllRounds()
    await pushOutbox(activeRetryConfig)

    const pending = await db.outbox.count()
    const failed = await getFailedCount()

    // Un solo setStatus para evitar ventana inconsistente (D-08)
    setStatus({
      syncing: false,
      retrying: false,
      lastSyncAt: new Date().toISOString(),
      pending,
      failed,
    })
  } catch (err) {
    console.error('sincronización falló', err)

    const pending = await db.outbox.count()
    const failed = await getFailedCount()
    setStatus({ syncing: false, pending, failed })

    await scheduleNextRetry(pending)
  }
}

/** Corre pull + push. Si ya hay una corrida en curso, la reutiliza en vez de duplicarla. */
export function syncNow(): Promise<void> {
  if (!currentSync) {
    currentSync = runSync().finally(() => {
      currentSync = null
    })
  }
  return currentSync
}

/**
 * Arranca el scheduler: sincroniza al montar, al recuperar conexión, y cada
 * 60s. Cancela reintentos ante desconexión y reactiva al volver en línea.
 */
export function startSync(config?: Partial<RetryConfig>): () => void {
  if (config) {
    setRetryConfig(config)
  }

  void syncNow()

  const handleOnline = () => {
    setStatus({ online: true })
    cancelRetry()
    // Reactivar automáticamente al reconectar
    void syncNow()
  }

  const handleOffline = () => {
    setStatus({ online: false })
    // Interrumpir reintentos ante desconexión de red para no agotar la batería
    cancelRetry()
  }

  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)

  const intervalId = window.setInterval(() => {
    void syncNow()
  }, SYNC_INTERVAL_MS)

  return () => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
    window.clearInterval(intervalId)
    cancelRetry()
  }
}
