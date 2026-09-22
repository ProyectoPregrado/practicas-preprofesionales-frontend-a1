import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/offline/db'
import { CrossTabChannel, getCrossTabLock, resetCrossTabForTesting } from './crossTab'
import { pullChanges } from './pull'
import { pushOutbox } from './push'
import { startSync, syncNow } from './scheduler'
import { _resetStatusForTesting, getStatus } from './status'

vi.mock('./pull', () => ({ pullChanges: vi.fn() }))
vi.mock('./push', () => ({ pushOutbox: vi.fn() }))

const mockedPull = vi.mocked(pullChanges)
const mockedPush = vi.mocked(pushOutbox)

beforeEach(async () => {
  await db.delete()
  await db.open()
  localStorage.clear()
  resetCrossTabForTesting()
  _resetStatusForTesting()
  mockedPull.mockReset()
  mockedPush.mockReset()
})

afterEach(() => {
  resetCrossTabForTesting()
  _resetStatusForTesting()
  localStorage.clear()
})

describe('syncNow', () => {
  it('no sincroniza sin sesión activa', async () => {
    await syncNow()

    expect(mockedPull).not.toHaveBeenCalled()
    expect(mockedPush).not.toHaveBeenCalled()
  })

  it('hace pull hasta agotar hasMore y luego push cuando hay sesión', async () => {
    localStorage.setItem('access_token', 'tok')
    mockedPull
      .mockResolvedValueOnce({ applied: 1, hasMore: true })
      .mockResolvedValueOnce({ applied: 0, hasMore: false })
    mockedPush.mockResolvedValue({ applied: 0, failed: 0 })

    await syncNow()

    expect(mockedPull).toHaveBeenCalledTimes(2)
    expect(mockedPush).toHaveBeenCalledTimes(1)
    expect(getStatus().syncing).toBe(false)
  })

  it('reutiliza la corrida en curso si ya hay una sincronización en vuelo en la misma pestaña', async () => {
    localStorage.setItem('access_token', 'tok')
    mockedPull.mockResolvedValue({ applied: 0, hasMore: false })
    mockedPush.mockResolvedValue({ applied: 0, failed: 0 })

    await Promise.all([syncNow(), syncNow()])

    expect(mockedPush).toHaveBeenCalledTimes(1)
  })

  it('atrapa errores de red y deja de sincronizar sin propagar la excepción', async () => {
    localStorage.setItem('access_token', 'tok')
    mockedPull.mockRejectedValue(new Error('sin conexión'))

    await expect(syncNow()).resolves.toBeUndefined()
    expect(getStatus().syncing).toBe(false)
  })

  it('evita ciclos concurrentes duplicados sobre Dexie cuando otra pestaña ya está sincronizando', async () => {
    localStorage.setItem('access_token', 'tok')
    mockedPull.mockResolvedValue({ applied: 0, hasMore: false })
    mockedPush.mockResolvedValue({ applied: 0, failed: 0 })

    // Simulamos que la Pestaña A adquirió el bloqueo entre pestañas
    const lock = getCrossTabLock()
    localStorage.setItem(
      lock.lockKey,
      JSON.stringify({ owner: 'tab_a', acquiredAt: Date.now() }),
    )

    // Simulamos que la Pestaña B intenta syncNow() mientras Pestaña A tiene el lock
    let syncFinished = false
    const syncPromise = syncNow().then(() => {
      syncFinished = true
    })

    // syncNow de la Pestaña B no debió ejecutar pull ni push
    expect(mockedPull).not.toHaveBeenCalled()
    expect(mockedPush).not.toHaveBeenCalled()
    expect(syncFinished).toBe(false)

    // Simulamos que la Pestaña A termina y emite SYNC_END
    const channelTabA = new CrossTabChannel('offline_sync_channel', 'tab_a')
    channelTabA.postMessage('SYNC_END')

    await syncPromise
    expect(syncFinished).toBe(true)

    // Se confirma que nunca se duplicó la ejecución sobre la cola local
    expect(mockedPull).not.toHaveBeenCalled()
    expect(mockedPush).not.toHaveBeenCalled()

    channelTabA.close()
  })

  it('libera el bloqueo al terminar o al fallar para permitir futuras sincronizaciones', async () => {
    localStorage.setItem('access_token', 'tok')
    mockedPull.mockResolvedValue({ applied: 0, hasMore: false })
    mockedPush.mockResolvedValue({ applied: 0, failed: 0 })

    await syncNow()

    const lock = getCrossTabLock()
    expect(lock.isLocked()).toBe(false)
  })
})

describe('startSync', () => {
  it('registra los listeners de online/offline y los retira al desmontar', () => {
    mockedPull.mockResolvedValue({ applied: 0, hasMore: false })
    mockedPush.mockResolvedValue({ applied: 0, failed: 0 })

    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')

    const stop = startSync()
    expect(addSpy).toHaveBeenCalledWith('online', expect.any(Function))
    expect(addSpy).toHaveBeenCalledWith('offline', expect.any(Function))

    stop()
    expect(removeSpy).toHaveBeenCalledWith('online', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('offline', expect.any(Function))
  })
})
