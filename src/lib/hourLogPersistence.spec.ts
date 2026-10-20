import { beforeEach, describe, expect, it } from 'vitest'
import { db, type LocalHourLog } from '@/offline/db'
import { persistHourLog } from './hourLogPersistence'

describe('hourLogPersistence (E6-04)', () => {
  const placementId = 99

  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('guarda el registro localmente y encola en outbox de forma atómica', async () => {
    const row = await persistHourLog({
      placementId,
      date: '2026-10-20',
      targetKey: '2026-10-20',
      startTime: '09:00',
      endTime: '13:00',
      hours: 4,
      activity: 'Persistencia separada',
    })

    expect(row.id).toBeLessThan(0)
    expect(row.syncState).toBe('local')

    const dbRows = await db.hourLogs.where('placementId').equals(placementId).toArray()
    expect(dbRows).toHaveLength(1)
    expect(dbRows[0].hours).toBe(4)

    const outboxRows = await db.outbox.toArray()
    expect(outboxRows).toHaveLength(1)
    expect(outboxRows[0].entity).toBe('hourLog')
  })

  it('lanza DAILY_LIMIT_EXCEEDED y no guarda nada si se supera el tope diario en la transacción', async () => {
    const prior: LocalHourLog = {
      id: 10,
      placementId,
      date: '2026-10-20',
      startTime: '08:00',
      endTime: '15:00',
      hours: 7,
      activity: 'Turno mañana',
      status: 'SUBMITTED',
      syncState: 'synced',
      version: 1,
      updatedAt: '2026-10-20T15:00:00.000Z',
    }
    await db.hourLogs.add(prior)

    await expect(
      persistHourLog({
        placementId,
        date: '2026-10-20',
        targetKey: '2026-10-20',
        startTime: '15:00',
        endTime: '17:00',
        hours: 2, // 7 + 2 = 9 > 8
        activity: 'Turno tarde',
      }),
    ).rejects.toThrow('DAILY_LIMIT_EXCEEDED')

    const dbRows = await db.hourLogs.where('placementId').equals(placementId).toArray()
    expect(dbRows).toHaveLength(1) // Solo la previa

    const outboxRows = await db.outbox.toArray()
    expect(outboxRows).toHaveLength(0) // Nada encolado
  })
})
