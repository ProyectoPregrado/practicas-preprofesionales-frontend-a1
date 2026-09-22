export interface SyncStatus {
  online: boolean
  pending: number
  lastSyncAt: string | null
  syncing: boolean
  retrying?: boolean
  failed?: number
}

type Listener = () => void

let state: SyncStatus = {
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  pending: 0,
  lastSyncAt: null,
  syncing: false,
  retrying: false,
  failed: 0,
}

const listeners = new Set<Listener>()

export function getStatus(): SyncStatus {
  return state
}

export function setStatus(patch: Partial<SyncStatus>): void {
  state = { ...state, ...patch }
  for (const listener of listeners) listener()
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
