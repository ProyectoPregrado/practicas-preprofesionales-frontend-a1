import { getCrossTabChannel } from './crossTab'

export interface SyncStatus {
  online: boolean
  pending: number
  lastSyncAt: string | null
  syncing: boolean
}

type Listener = () => void

const STATUS_CACHE_KEY = '__sync_status_cache__'

function loadCachedStatus(): Partial<SyncStatus> | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(STATUS_CACHE_KEY)
    if (raw) {
      const data = JSON.parse(raw) as Record<string, unknown>
      return {
        pending: typeof data.pending === 'number' ? data.pending : 0,
        lastSyncAt: typeof data.lastSyncAt === 'string' ? data.lastSyncAt : null,
      }
    }
  } catch {
    // Ignora errores al parsear cache
  }
  return null
}

function saveCachedStatus(current: SyncStatus): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(
      STATUS_CACHE_KEY,
      JSON.stringify({
        pending: current.pending,
        lastSyncAt: current.lastSyncAt,
      }),
    )
  } catch {
    // Ignora excepciones de storage
  }
}

const cached = loadCachedStatus()

let state: SyncStatus = {
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  pending: cached?.pending ?? 0,
  lastSyncAt: cached?.lastSyncAt ?? null,
  syncing: false,
}

const listeners = new Set<Listener>()
let unsubscribeChannel: (() => void) | null = null

function setupChannelSubscription(): void {
  if (unsubscribeChannel) return

  unsubscribeChannel = getCrossTabChannel().onMessage((msg) => {
    if (msg.type === 'STATUS_UPDATE' && msg.payload) {
      const patch = msg.payload as Partial<SyncStatus>
      state = { ...state, ...patch }
      saveCachedStatus(state)
      for (const listener of listeners) {
        try {
          listener()
        } catch (err) {
          console.error('Error en listener de estado de sync', err)
        }
      }
    } else if (msg.type === 'REQUEST_STATUS') {
      getCrossTabChannel().postMessage('STATUS_UPDATE', state)
    }
  })
}

setupChannelSubscription()

export function getStatus(): SyncStatus {
  return state
}

export function setStatus(
  patch: Partial<SyncStatus>,
  options: { broadcast?: boolean } = {},
): void {
  state = { ...state, ...patch }
  saveCachedStatus(state)
  for (const listener of listeners) {
    try {
      listener()
    } catch (err) {
      console.error('Error en listener de estado de sync', err)
    }
  }

  if (options.broadcast !== false) {
    getCrossTabChannel().postMessage('STATUS_UPDATE', patch)
  }
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function _resetStatusForTesting(): void {
  state = {
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    pending: 0,
    lastSyncAt: null,
    syncing: false,
  }
  listeners.clear()
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STATUS_CACHE_KEY)
  }
  if (unsubscribeChannel) {
    unsubscribeChannel()
    unsubscribeChannel = null
  }
  setupChannelSubscription()
}
