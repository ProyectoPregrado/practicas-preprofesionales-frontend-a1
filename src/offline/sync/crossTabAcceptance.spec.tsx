import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SyncIndicator } from '@/components/SyncIndicator'
import { db } from '@/offline/db'
import { CrossTabChannel, getCrossTabLock, resetCrossTabForTesting } from './crossTab'
import { pullChanges } from './pull'
import { enqueue, pushOutbox } from './push'
import { syncNow } from './scheduler'
import { _resetStatusForTesting, getStatus, setStatus } from './status'

vi.mock('./pull', () => ({ pullChanges: vi.fn() }))
vi.mock('./push', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./push')>()
  return {
    ...actual,
    pushOutbox: vi.fn(),
  }
})

const mockedPull = vi.mocked(pullChanges)
const mockedPush = vi.mocked(pushOutbox)

describe('E1-08: Aceptación e integración - sincronización coherente entre pestañas', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    localStorage.clear()
    resetCrossTabForTesting()
    _resetStatusForTesting()
    mockedPull.mockReset()
    mockedPush.mockReset()
  })

  afterEach(async () => {
    resetCrossTabForTesting()
    _resetStatusForTesting()
    localStorage.clear()
    await db.delete()
  })

  it('Criterio 1 y 2: Sincroniza estado en memoria y refresca el indicador de la otra pestaña sin recarga forzada', async () => {
    // Pestaña B está abierta y montó el SyncIndicator
    render(<SyncIndicator />)
    expect(screen.getByText(/0 pendientes/i)).toBeInTheDocument()

    // Estudiante registra horas en la Pestaña A (enqueue en outbox)
    await act(async () => {
      await enqueue({
        entity: 'hourLog',
        op: 'create',
        baseVersion: 0,
        payload: { id: 1, hours: 4, date: '2026-09-22' },
      })
    })

    // La Pestaña B actualiza su contador a 1 pendiente automáticamente en pantalla sin recarga
    expect(await screen.findByText(/1 pendiente/i)).toBeInTheDocument()

    // Pestaña A inicia sincronización
    act(() => {
      setStatus({ syncing: true })
    })
    expect(await screen.findByRole('button', { name: /sincronizando…/i })).toBeDisabled()

    // Pestaña A culmina con éxito
    act(() => {
      setStatus({
        syncing: false,
        pending: 0,
        lastSyncAt: '2026-09-22T15:00:00.000Z',
      })
    })

    expect(await screen.findByText(/0 pendientes/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sincronizar ahora/i })).toBeEnabled()
  })

  it('Criterio 3: Evita ciclos concurrentes duplicados sobre Dexie desde pestañas simultáneas', async () => {
    localStorage.setItem('access_token', 'token-estudiante')

    mockedPull.mockResolvedValue({ applied: 0, hasMore: false })
    mockedPush.mockResolvedValue({ applied: 1, failed: 0 })

    // Agregamos una entrada a outbox
    await db.outbox.add({
      clientOpId: 'op-1',
      entity: 'hourLog',
      op: 'create',
      baseVersion: 0,
      payload: { id: 10 },
      createdAt: new Date().toISOString(),
      attempts: 0,
      lastError: null,
    })

    // Simulamos que la Pestaña A adquirió el bloqueo entre pestañas
    const lock = getCrossTabLock()
    localStorage.setItem(
      lock.lockKey,
      JSON.stringify({ owner: 'tab_a_externa', acquiredAt: Date.now() }),
    )

    // Simulamos que la Pestaña B ejecuta syncNow() mientras Pestaña A tiene el lock
    let tabBSyncResolved = false
    const tabBSync = syncNow().then(() => {
      tabBSyncResolved = true
    })

    // Mientras el lock está ocupado por Pestaña A, Pestaña B no ejecutó pull ni push
    expect(mockedPull).not.toHaveBeenCalled()
    expect(mockedPush).not.toHaveBeenCalled()
    expect(tabBSyncResolved).toBe(false)

    // Pestaña A completa su ciclo y libera el bloqueo emitiendo SYNC_END
    localStorage.removeItem(lock.lockKey)
    const channelA = new CrossTabChannel('offline_sync_channel', 'tab_a_externa')
    channelA.postMessage('SYNC_END')

    await tabBSync
    expect(tabBSyncResolved).toBe(true)

    // Verificamos que push y pull NUNCA se duplicaron desde Pestaña B
    expect(mockedPull).not.toHaveBeenCalled()
    expect(mockedPush).not.toHaveBeenCalled()

    channelA.close()
  })

  it('Coherencia de estado tras reconexión y sincronización completa', async () => {
    localStorage.setItem('access_token', 'token-estudiante')
    mockedPull.mockResolvedValue({ applied: 0, hasMore: false })
    mockedPush.mockResolvedValue({ applied: 0, failed: 0 })

    render(<SyncIndicator />)

    // Simulamos evento offline del navegador
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(await screen.findByText(/sin conexión/i)).toBeInTheDocument()

    // Reconexión
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(await screen.findByText(/en línea/i)).toBeInTheDocument()

    await act(async () => {
      await syncNow()
    })
    expect(getStatus().syncing).toBe(false)
  })
})
