import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, type LocalHourLog } from '@/offline/db'
import { useHourLogs } from './useHourLogs'

describe('useHourLogs', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('retorna undefined al iniciar y luego un arreglo vacío si no hay registros', async () => {
    const { result } = renderHook(() => useHourLogs(1))

    // Al montar puede ser undefined mientras Dexie ejecuta la consulta viva
    await waitFor(() => {
      expect(result.current).toEqual([])
    })
  })

  it('obtiene los registros del placementId ordenados por fecha', async () => {
    const log1: LocalHourLog = {
      id: 1,
      placementId: 10,
      date: '2026-04-10',
      startTime: '09:00',
      endTime: '13:00',
      hours: 4,
      activity: 'Actividad B',
      status: 'SUBMITTED',
      syncState: 'synced',
      version: 1,
      updatedAt: '2026-04-10T13:00:00.000Z',
    }

    const log2: LocalHourLog = {
      id: 2,
      placementId: 10,
      date: '2026-04-05',
      startTime: '08:00',
      endTime: '12:00',
      hours: 4,
      activity: 'Actividad A',
      status: 'APPROVED',
      syncState: 'synced',
      version: 1,
      updatedAt: '2026-04-05T12:00:00.000Z',
    }

    await db.hourLogs.bulkPut([log1, log2])

    const { result } = renderHook(() => useHourLogs(10))

    await waitFor(() => {
      expect(result.current).toHaveLength(2)
      // Debe estar ordenado por fecha ascendente: log2 (2026-04-05) antes de log1 (2026-04-10)
      expect(result.current?.[0].id).toBe(2)
      expect(result.current?.[1].id).toBe(1)
    })
  })

  it('no incluye registros que pertenecen a otros placements', async () => {
    await db.hourLogs.bulkPut([
      {
        id: 101,
        placementId: 1,
        date: '2026-04-01',
        startTime: '08:00',
        endTime: '12:00',
        hours: 4,
        activity: 'Placement 1',
        status: 'SUBMITTED',
        syncState: 'synced',
        version: 1,
        updatedAt: '2026-04-01T12:00:00.000Z',
      },
      {
        id: 201,
        placementId: 2,
        date: '2026-04-02',
        startTime: '08:00',
        endTime: '12:00',
        hours: 4,
        activity: 'Placement 2',
        status: 'SUBMITTED',
        syncState: 'synced',
        version: 1,
        updatedAt: '2026-04-02T12:00:00.000Z',
      },
    ])

    const { result } = renderHook(() => useHourLogs(1))

    await waitFor(() => {
      expect(result.current).toHaveLength(1)
      expect(result.current?.[0].id).toBe(101)
      expect(result.current?.[0].activity).toBe('Placement 1')
    })
  })

  it('reacciona en vivo cuando se agregan nuevos registros a Dexie', async () => {
    const { result } = renderHook(() => useHourLogs(5))

    await waitFor(() => {
      expect(result.current).toEqual([])
    })

    // Agregamos un registro a Dexie mientras el hook está montado
    await act(async () => {
      await db.hourLogs.put({
        id: 501,
        placementId: 5,
        date: '2026-04-03',
        startTime: '08:00',
        endTime: '12:00',
        hours: 4,
        activity: 'Nueva actividad en vivo',
        status: 'SUBMITTED',
        syncState: 'queued',
        version: 1,
        updatedAt: '2026-04-03T12:00:00.000Z',
      })
    })

    await waitFor(() => {
      expect(result.current).toHaveLength(1)
      expect(result.current?.[0].id).toBe(501)
      expect(result.current?.[0].syncState).toBe('queued')
    })
  })

  it('reacciona en vivo ante eliminaciones o modificaciones de registros', async () => {
    await db.hourLogs.put({
      id: 601,
      placementId: 6,
      date: '2026-04-04',
      startTime: '08:00',
      endTime: '12:00',
      hours: 4,
      activity: 'Actividad editable',
      status: 'SUBMITTED',
      syncState: 'queued',
      version: 1,
      updatedAt: '2026-04-04T12:00:00.000Z',
    })

    const { result } = renderHook(() => useHourLogs(6))

    await waitFor(() => {
      expect(result.current).toHaveLength(1)
      expect(result.current?.[0].status).toBe('SUBMITTED')
    })

    // Actualizamos el estado a APPROVED
    await act(async () => {
      await db.hourLogs.update(601, { status: 'APPROVED', syncState: 'synced' })
    })

    await waitFor(() => {
      expect(result.current?.[0].status).toBe('APPROVED')
      expect(result.current?.[0].syncState).toBe('synced')
    })

    // Eliminamos el registro
    await act(async () => {
      await db.hourLogs.delete(601)
    })

    await waitFor(() => {
      expect(result.current).toEqual([])
    })
  })
})
