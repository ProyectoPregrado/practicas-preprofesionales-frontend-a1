import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _resetStatusForTesting, getStatus, setStatus } from '@/offline/sync/status'
import { useSyncStatus } from './useSyncStatus'

describe('useSyncStatus', () => {
  beforeEach(() => {
    _resetStatusForTesting()
  })

  afterEach(() => {
    _resetStatusForTesting()
  })

  it('obtiene el estado de sincronización inicial', () => {
    const { result } = renderHook(() => useSyncStatus())

    expect(result.current).toEqual(getStatus())
    expect(result.current.syncing).toBe(false)
    expect(result.current.pending).toBe(0)
    expect(result.current.failed).toBe(0)
  })

  it('actualiza el estado de forma reactiva al invocar setStatus', () => {
    const { result } = renderHook(() => useSyncStatus())

    expect(result.current.syncing).toBe(false)
    expect(result.current.pending).toBe(0)

    act(() => {
      setStatus({ syncing: true, pending: 3 })
    })

    expect(result.current.syncing).toBe(true)
    expect(result.current.pending).toBe(3)

    act(() => {
      setStatus({ syncing: false, pending: 0, lastSyncAt: '2026-04-10T15:30:00.000Z' })
    })

    expect(result.current.syncing).toBe(false)
    expect(result.current.pending).toBe(0)
    expect(result.current.lastSyncAt).toBe('2026-04-10T15:30:00.000Z')
  })

  it('refleja cambios de conectividad online/offline', () => {
    const { result } = renderHook(() => useSyncStatus())

    act(() => {
      setStatus({ online: false })
    })
    expect(result.current.online).toBe(false)

    act(() => {
      setStatus({ online: true })
    })
    expect(result.current.online).toBe(true)
  })

  it('refleja errores acumulados o reintentos', () => {
    const { result } = renderHook(() => useSyncStatus())

    act(() => {
      setStatus({ failed: 2, retrying: true })
    })

    expect(result.current.failed).toBe(2)
    expect(result.current.retrying).toBe(true)
  })

  it('se desuscribe limpiamente al desmontar el componente', () => {
    const { result, unmount } = renderHook(() => useSyncStatus())

    act(() => {
      setStatus({ pending: 1 })
    })
    expect(result.current.pending).toBe(1)

    unmount()

    // Posterior al desmontaje, no debe lanzar errores
    act(() => {
      setStatus({ pending: 5 })
    })
  })
})
