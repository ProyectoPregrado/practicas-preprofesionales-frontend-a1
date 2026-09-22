import { db } from '@/offline/db'
import { getCrossTabChannel, getCrossTabLock, waitForSyncCompletion } from './crossTab'
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

async function runSync(): Promise<void> {
  if (!hasSession()) return

  // Evita ciclos concurrentes duplicados sobre la cola local de Dexie desde pestañas simultáneas
  const lock = getCrossTabLock()
  const acquired = lock.acquire()
  if (!acquired) {
    // Si otra pestaña ya está sincronizando, esperamos a que termine en lugar de duplicar la corrida
    await waitForSyncCompletion()
    return
  }

  setStatus({ syncing: true })
  getCrossTabChannel().postMessage('SYNC_START')

  try {
    let hasMore = true
    let rounds = 0
    while (hasMore && rounds < MAX_PULL_ROUNDS) {
      const result = await pullChanges()
      hasMore = result.hasMore
      rounds += 1
    }

    await pushOutbox()

    const pending = await db.outbox.count()
    // Notificación unificada para evitar ventana inconsistente (D-08)
    setStatus({
      syncing: false,
      lastSyncAt: new Date().toISOString(),
      pending,
    })
  } catch (err) {
    console.error('sincronización falló', err)
    const pending = await db.outbox.count()
    setStatus({ syncing: false, pending })
  } finally {
    lock.release()
    getCrossTabChannel().postMessage('SYNC_END')
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
 * 60s. Debe llamarse una sola vez (desde un useEffect en AppLayout) — llamar
 * en cada hook crearía un timer y un listener por cada consumidor.
 */
export function startSync(): () => void {
  void syncNow()

  const handleOnline = () => {
    setStatus({ online: true })
    void syncNow()
  }
  const handleOffline = () => {
    setStatus({ online: false })
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
  }
}
