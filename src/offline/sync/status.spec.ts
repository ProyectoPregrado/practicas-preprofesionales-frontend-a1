import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CrossTabChannel } from './crossTab'
import { _resetStatusForTesting, getStatus, setStatus, subscribe } from './status'

describe('sync status store', () => {
  beforeEach(() => {
    localStorage.clear()
    _resetStatusForTesting()
  })

  afterEach(() => {
    _resetStatusForTesting()
    localStorage.clear()
  })

  it('merges a partial patch into the current status', () => {
    setStatus({ pending: 3 })
    expect(getStatus()).toMatchObject({ pending: 3 })

    setStatus({ syncing: true })
    expect(getStatus()).toMatchObject({ pending: 3, syncing: true })
  })

  it('notifies subscribers on every update and stops after unsubscribing', () => {
    const listener = vi.fn()
    const unsubscribe = subscribe(listener)

    setStatus({ online: false })
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    setStatus({ online: true })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('emite el cambio de estado a otras pestañas a través del canal', async () => {
    const remoteTab = new CrossTabChannel('offline_sync_channel', 'remote_tab_1')
    const received: unknown[] = []
    remoteTab.onMessage((msg) => {
      received.push(msg)
    })

    setStatus({ pending: 5, syncing: true })

    await vi.waitFor(() => {
      expect(received).toHaveLength(1)
    })

    expect(received[0]).toMatchObject({
      type: 'STATUS_UPDATE',
      payload: { pending: 5, syncing: true },
    })

    remoteTab.close()
  })

  it('actualiza el estado en memoria y notifica a los suscriptores cuando otra pestaña emite un cambio', async () => {
    const remoteTab = new CrossTabChannel('offline_sync_channel', 'remote_tab_2')
    const listener = vi.fn()
    subscribe(listener)

    remoteTab.postMessage('STATUS_UPDATE', { pending: 7, lastSyncAt: '2026-09-22T10:00:00Z' })

    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalled()
    })

    expect(getStatus()).toMatchObject({
      pending: 7,
      lastSyncAt: '2026-09-22T10:00:00Z',
    })

    remoteTab.close()
  })

  it('responde con su estado actual cuando una nueva pestaña solicita REQUEST_STATUS', async () => {
    setStatus({ pending: 4, lastSyncAt: '2026-09-22T11:00:00Z' })

    const newTab = new CrossTabChannel('offline_sync_channel', 'new_tab')
    const received: unknown[] = []
    newTab.onMessage((msg) => {
      received.push(msg)
    })

    newTab.postMessage('REQUEST_STATUS')

    await vi.waitFor(() => {
      expect(received).toHaveLength(1)
    })

    expect(received[0]).toMatchObject({
      type: 'STATUS_UPDATE',
      payload: expect.objectContaining({
        pending: 4,
        lastSyncAt: '2026-09-22T11:00:00Z',
      }),
    })

    newTab.close()
  })
})
