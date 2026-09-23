export interface CrossTabMessage<T = unknown> {
  type: string
  senderId: string
  payload?: T
  timestamp: number
}

export type CrossTabListener<T = unknown> = (msg: CrossTabMessage<T>) => void

export function generateTabId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `tab_${Math.random().toString(36).slice(2, 9)}_${Date.now()}`
}

export class CrossTabChannel<T = unknown> {
  public readonly tabId: string
  public readonly name: string
  private channel: BroadcastChannel | null = null
  private storageListener: ((e: StorageEvent) => void) | null = null
  private listeners = new Set<CrossTabListener<T>>()
  private storageKey: string

  constructor(name: string, tabId: string = generateTabId(), forceStorageFallback: boolean = false) {
    this.name = name
    this.tabId = tabId
    this.storageKey = `__cross_tab_${name}__`

    const BC = !forceStorageFallback
      ? (typeof window !== 'undefined' && window.BroadcastChannel) ||
        (typeof BroadcastChannel !== 'undefined' && BroadcastChannel) ||
        (typeof globalThis !== 'undefined' &&
          (globalThis as unknown as { BroadcastChannel?: typeof BroadcastChannel }).BroadcastChannel)
      : null

    if (BC) {
      this.channel = new BC(name)
      this.channel.onmessage = (event: MessageEvent) => {
        const data = event.data as CrossTabMessage<T> | undefined
        if (data && data.senderId !== this.tabId) {
          this.notify(data)
        }
      }
    } else if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      this.storageListener = (event: StorageEvent) => {
        if (event.key === this.storageKey && event.newValue) {
          try {
            const data = JSON.parse(event.newValue) as CrossTabMessage<T>
            if (data && data.senderId !== this.tabId) {
              this.notify(data)
            }
          } catch {
            // Ignora errores al parsear mensaje de storage
          }
        }
      }
      window.addEventListener('storage', this.storageListener)
    }
  }

  postMessage(type: string, payload?: T): void {
    const message: CrossTabMessage<T> = {
      type,
      senderId: this.tabId,
      payload,
      timestamp: Date.now(),
    }

    if (this.channel) {
      this.channel.postMessage(message)
    } else if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(message))
      } catch {
        // Ignora excepciones de almacenamiento lleno o deshabilitado
      }
    }
  }

  onMessage(listener: CrossTabListener<T>): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify(msg: CrossTabMessage<T>): void {
    for (const listener of this.listeners) {
      try {
        listener(msg)
      } catch (err) {
        console.error('Error en listener de canal entre pestañas', err)
      }
    }
  }

  close(): void {
    if (this.channel) {
      this.channel.close()
      this.channel = null
    }
    if (this.storageListener && typeof window !== 'undefined') {
      window.removeEventListener('storage', this.storageListener)
      this.storageListener = null
    }
    this.listeners.clear()
  }
}

const DEFAULT_SYNC_LOCK_KEY = '__offline_sync_lock__'
const DEFAULT_LOCK_TTL_MS = 20_000

export class CrossTabLock {
  constructor(
    public readonly lockKey: string = DEFAULT_SYNC_LOCK_KEY,
    public readonly tabId: string = generateTabId(),
    public readonly ttlMs: number = DEFAULT_LOCK_TTL_MS,
  ) {}

  acquire(): boolean {
    if (typeof localStorage === 'undefined') return true
    const now = Date.now()
    const raw = localStorage.getItem(this.lockKey)
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { owner: string; acquiredAt: number }
        if (parsed.owner && parsed.owner !== this.tabId && now - parsed.acquiredAt < this.ttlMs) {
          return false
        }
      } catch {
        // En caso de dato corrupto, permite adquirir
      }
    }
    localStorage.setItem(
      this.lockKey,
      JSON.stringify({ owner: this.tabId, acquiredAt: now }),
    )
    return true
  }

  release(): void {
    if (typeof localStorage === 'undefined') return
    const raw = localStorage.getItem(this.lockKey)
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { owner: string }
        if (parsed.owner === this.tabId) {
          localStorage.removeItem(this.lockKey)
        }
      } catch {
        localStorage.removeItem(this.lockKey)
      }
    }
  }

  isLocked(): boolean {
    if (typeof localStorage === 'undefined') return false
    const raw = localStorage.getItem(this.lockKey)
    if (!raw) return false
    try {
      const parsed = JSON.parse(raw) as { acquiredAt: number }
      return Date.now() - parsed.acquiredAt < this.ttlMs
    } catch {
      return false
    }
  }
}

let defaultChannel: CrossTabChannel | null = null
let defaultLock: CrossTabLock | null = null

export function getCrossTabChannel(): CrossTabChannel {
  if (!defaultChannel) {
    defaultChannel = new CrossTabChannel('offline_sync_channel')
  }
  return defaultChannel
}

export function getCrossTabLock(): CrossTabLock {
  if (!defaultLock) {
    defaultLock = new CrossTabLock(DEFAULT_SYNC_LOCK_KEY, getCrossTabChannel().tabId)
  }
  return defaultLock
}

export function waitForSyncCompletion(timeoutMs: number = 10_000): Promise<void> {
  return new Promise((resolve) => {
    const lock = getCrossTabLock()
    if (!lock.isLocked()) {
      resolve()
      return
    }

    const channel = getCrossTabChannel()
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId)
      unsubscribe()
    }

    const unsubscribe = channel.onMessage((msg) => {
      const isSyncEnd = msg.type === 'SYNC_END'
      const isStatusSyncDone =
        msg.type === 'STATUS_UPDATE' &&
        typeof msg.payload === 'object' &&
        msg.payload !== null &&
        (msg.payload as { syncing?: boolean }).syncing === false

      if (isSyncEnd || isStatusSyncDone) {
        cleanup()
        resolve()
      }
    })

    timeoutId = setTimeout(() => {
      cleanup()
      resolve()
    }, timeoutMs)
  })
}

export function resetCrossTabForTesting(): void {
  if (defaultChannel) {
    defaultChannel.close()
    defaultChannel = null
  }
  if (defaultLock) {
    defaultLock.release()
    defaultLock = null
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(DEFAULT_SYNC_LOCK_KEY)
  }
}
