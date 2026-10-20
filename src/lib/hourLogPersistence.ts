import { db, type LocalHourLog } from '@/offline/db'
import { enqueue } from '@/offline/sync/push'
import { MAX_HOURS_PER_DAY, isSameDay } from './hourRules'

export interface PersistHourLogParams {
  placementId: number
  date: string
  targetKey: string
  startTime: string
  endTime: string
  hours: number
  activity: string
}

// Persiste un registro de horas en Dexie y encola la operación en el outbox
// dentro de una única transacción atómica local, protegiendo el límite diario de 8 horas.
export async function persistHourLog(params: PersistHourLogParams): Promise<LocalHourLog> {
  const localId = -Date.now()
  const nowIso = new Date().toISOString()

  const row: LocalHourLog = {
    id: localId,
    placementId: params.placementId,
    date: params.date,
    startTime: params.startTime,
    endTime: params.endTime,
    hours: params.hours,
    activity: params.activity.trim(),
    status: 'SUBMITTED',
    reviewNote: null,
    version: 1,
    updatedAt: nowIso,
    syncState: 'local',
  }

  await db.transaction('rw', [db.hourLogs, db.outbox], async () => {
    const txExisting = await db.hourLogs
      .where('placementId')
      .equals(params.placementId)
      .and((l) => isSameDay(l.date, params.targetKey) && l.status !== 'REJECTED')
      .toArray()
    const txAlready = txExisting.reduce((acc, l) => acc + (Number(l.hours) || 0), 0)
    if (txAlready + params.hours > MAX_HOURS_PER_DAY) {
      throw new Error('DAILY_LIMIT_EXCEEDED')
    }

    await db.hourLogs.add(row)

    await enqueue({
      entity: 'hourLog',
      op: 'create',
      payload: {
        id: row.id,
        placementId: row.placementId,
        date: row.date,
        startTime: row.startTime,
        endTime: row.endTime,
        hours: row.hours,
        activity: row.activity,
        status: row.status,
        reviewNote: row.reviewNote,
        version: row.version,
        updatedAt: row.updatedAt,
      },
      baseVersion: null,
    })
  })

  return row
}
