import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/api/client'
import { db } from '@/offline/db'
import { enqueue, pushOutbox } from './push'

vi.mock('@/api/client', () => ({ api: vi.fn() }))

const mockedApi = vi.mocked(api)

beforeEach(async () => {
  await db.delete()
  await db.open()
  mockedApi.mockReset()
})

describe('enqueue', () => {
  it('adds an outbox entry and marks the local hour log as queued', async () => {
    await db.hourLogs.put({
      id: 9,
      placementId: 1,
      date: '2026-04-01',
      startTime: '08:00',
      endTime: '12:00',
      hours: 4,
      activity: 'Soporte',
      status: 'SUBMITTED',
      version: 1,
      updatedAt: '2026-04-01T00:00:00.000Z',
      syncState: 'local',
    })

    await enqueue({
      entity: 'hourLog',
      op: 'create',
      payload: { id: 9, hours: 4 },
      baseVersion: null,
    })

    await expect(db.outbox.count()).resolves.toBe(1)
    await expect(db.hourLogs.get(9)).resolves.toMatchObject({ syncState: 'queued' })
  })
})

describe('pushOutbox', () => {
  it('no llama a la red cuando el outbox está vacío', async () => {
    const result = await pushOutbox()

    expect(result).toEqual({ applied: 0, failed: 0 })
    expect(api).not.toHaveBeenCalled()
  })

  it('envía las operaciones en cola, vacía el outbox y aplica los resultados', async () => {
    await db.hourLogs.put({
      id: 10,
      placementId: 1,
      date: '2026-04-01',
      startTime: '08:00',
      endTime: '12:00',
      hours: 4,
      activity: 'Soporte',
      status: 'SUBMITTED',
      version: 1,
      updatedAt: '2026-04-01T00:00:00.000Z',
      syncState: 'local',
    })
    await enqueue({
      entity: 'hourLog',
      op: 'create',
      payload: { id: 10, hours: 4 },
      baseVersion: null,
    })
    const [entry] = await db.outbox.toArray()

    mockedApi.mockResolvedValue({
      results: [{ clientOpId: entry.clientOpId, status: 'applied', server: { id: 10, version: 2 }, reason: null }],
    })

    const result = await pushOutbox()

    expect(result).toEqual({ applied: 1, failed: 0 })
    await expect(db.outbox.count()).resolves.toBe(0)
    await expect(db.hourLogs.get(10)).resolves.toMatchObject({ syncState: 'synced', version: 2 })
  })

  it('persiste contador de intentos y último error en campos nativos de Dexie tras fallo de red', async () => {
    await db.hourLogs.put({
      id: 11,
      placementId: 1,
      date: '2026-04-01',
      startTime: '08:00',
      endTime: '12:00',
      hours: 4,
      activity: 'Soporte',
      status: 'SUBMITTED',
      version: 1,
      updatedAt: '2026-04-01T00:00:00.000Z',
      syncState: 'local',
    })
    await enqueue({
      entity: 'hourLog',
      op: 'create',
      payload: { id: 11, hours: 4 },
      baseVersion: null,
    })

    mockedApi.mockRejectedValue(new Error('Fallo de conexión'))

    await expect(pushOutbox()).rejects.toThrow('Fallo de conexión')

    // El registro no se borra de la cola: conserva attempts=1 y lastError
    const [entry] = await db.outbox.toArray()
    expect(entry).toMatchObject({
      attempts: 1,
      lastError: 'Fallo de conexión',
    })

    // La hora local sigue en cola para reintentos
    await expect(db.hourLogs.get(11)).resolves.toMatchObject({ syncState: 'queued' })
  })

  it('marca fallo permanente en UI cuando se supera el límite máximo de intentos parametrizable', async () => {
    await db.hourLogs.put({
      id: 12,
      placementId: 1,
      date: '2026-04-01',
      startTime: '08:00',
      endTime: '12:00',
      hours: 4,
      activity: 'Soporte',
      status: 'SUBMITTED',
      version: 1,
      updatedAt: '2026-04-01T00:00:00.000Z',
      syncState: 'local',
    })
    await enqueue({
      entity: 'hourLog',
      op: 'create',
      payload: { id: 12, hours: 4 },
      baseVersion: null,
    })

    // Simulamos que ya tenía 2 intentos y el máximo parametrizable es 3
    const [entry] = await db.outbox.toArray()
    await db.outbox.update(entry.id!, { attempts: 2 })

    mockedApi.mockRejectedValue(new Error('Servidor inalcanzable'))

    // Al llegar a 3 intentos (con maxAttempts: 3), debe fallar definitivamente
    await expect(pushOutbox({ maxAttempts: 3 })).rejects.toThrow('Servidor inalcanzable')

    // Se retira de la cola para no agotar batería en reintentos infinitos
    await expect(db.outbox.count()).resolves.toBe(0)

    // Se marca como fallo permanente en Dexie hourLogs con el mensaje del error
    const localLog = await db.hourLogs.get(12)
    expect(localLog?.syncState).toBe('failed')
    expect(localLog?.reviewNote).toContain('Servidor inalcanzable')
  })
})
