import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CrossTabChannel,
  CrossTabLock,
  getCrossTabLock,
  resetCrossTabForTesting,
  waitForSyncCompletion,
} from './crossTab'

describe('CrossTabChannel', () => {
  let tabA: CrossTabChannel
  let tabB: CrossTabChannel

  afterEach(() => {
    tabA?.close()
    tabB?.close()
    resetCrossTabForTesting()
    localStorage.clear()
  })

  it('comunica mensajes entre dos pestañas usando BroadcastChannel', async () => {
    tabA = new CrossTabChannel('test_channel', 'tab_a')
    tabB = new CrossTabChannel('test_channel', 'tab_b')

    const receivedByB: unknown[] = []
    tabB.onMessage((msg) => {
      receivedByB.push(msg)
    })

    tabA.postMessage('STATUS_UPDATE', { pending: 4 })

    await vi.waitFor(() => {
      expect(receivedByB).toHaveLength(1)
    })

    expect(receivedByB[0]).toMatchObject({
      type: 'STATUS_UPDATE',
      senderId: 'tab_a',
      payload: { pending: 4 },
    })
  })

  it('no entrega el mensaje a la misma pestaña que lo emitió', async () => {
    tabA = new CrossTabChannel('test_channel_self', 'tab_a')

    const receivedByA: unknown[] = []
    tabA.onMessage((msg) => {
      receivedByA.push(msg)
    })

    tabA.postMessage('STATUS_UPDATE', { pending: 1 })

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(receivedByA).toHaveLength(0)
  })

  it('funciona con fallback de evento storage cuando BroadcastChannel no está disponible', async () => {
    tabA = new CrossTabChannel('storage_fallback_channel', 'tab_a', true)
    tabB = new CrossTabChannel('storage_fallback_channel', 'tab_b', true)

    const receivedByB: unknown[] = []
    tabB.onMessage((msg) => {
      receivedByB.push(msg)
    })

    const payload = { pending: 9 }
    const storageKey = '__cross_tab_storage_fallback_channel__'
    const messageData = {
      type: 'STATUS_UPDATE',
      senderId: 'tab_a',
      payload,
      timestamp: Date.now(),
    }

    // Simula evento storage emitido en otra ventana
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: storageKey,
        newValue: JSON.stringify(messageData),
      }),
    )

    await vi.waitFor(() => {
      expect(receivedByB).toHaveLength(1)
    })

    expect(receivedByB[0]).toMatchObject({
      type: 'STATUS_UPDATE',
      senderId: 'tab_a',
      payload: { pending: 9 },
    })
  })
})

describe('CrossTabLock', () => {
  beforeEach(() => {
    localStorage.clear()
    resetCrossTabForTesting()
  })

  afterEach(() => {
    resetCrossTabForTesting()
    localStorage.clear()
  })

  it('permite a una pestaña adquirir el bloqueo y bloquea a pestañas concurrentes', () => {
    const lockA = new CrossTabLock('test_lock', 'tab_a')
    const lockB = new CrossTabLock('test_lock', 'tab_b')

    expect(lockA.acquire()).toBe(true)
    expect(lockA.isLocked()).toBe(true)

    // Pestaña B no puede adquirir mientras A lo tenga
    expect(lockB.acquire()).toBe(false)

    // Cuando A libera el bloqueo, B puede adquirirlo
    lockA.release()
    expect(lockA.isLocked()).toBe(false)
    expect(lockB.acquire()).toBe(true)
    expect(lockB.isLocked()).toBe(true)

    lockB.release()
  })

  it('expira automáticamente después del TTL para no colgarse si una pestaña se cierra', () => {
    const ttlMs = 100
    const lockA = new CrossTabLock('test_lock_ttl', 'tab_a', ttlMs)
    const lockB = new CrossTabLock('test_lock_ttl', 'tab_b', ttlMs)

    expect(lockA.acquire()).toBe(true)
    expect(lockB.acquire()).toBe(false)

    // Forzamos timestamp antiguo en localStorage simulando expiración del TTL
    const stored = JSON.parse(localStorage.getItem('test_lock_ttl')!)
    stored.acquiredAt = Date.now() - 200
    localStorage.setItem('test_lock_ttl', JSON.stringify(stored))

    // Ahora B puede reclamar el bloqueo expirado
    expect(lockB.acquire()).toBe(true)
    lockB.release()
  })

  it('waitForSyncCompletion resuelve inmediatamente si no hay bloqueo activo', async () => {
    await expect(waitForSyncCompletion(1000)).resolves.toBeUndefined()
  })

  it('waitForSyncCompletion espera a que la otra pestaña emita SYNC_END', async () => {
    const lock = getCrossTabLock()
    // Simulamos que otra pestaña tiene el bloqueo
    localStorage.setItem(
      lock.lockKey,
      JSON.stringify({ owner: 'other_tab', acquiredAt: Date.now() }),
    )

    let completed = false
    const promise = waitForSyncCompletion(2000).then(() => {
      completed = true
    })

    expect(completed).toBe(false)

    // Simulamos que la otra pestaña finaliza y emite SYNC_END por el canal
    const otherChannel = new CrossTabChannel('offline_sync_channel', 'other_tab')
    otherChannel.postMessage('SYNC_END')

    await promise
    expect(completed).toBe(true)
    otherChannel.close()
  })
})
