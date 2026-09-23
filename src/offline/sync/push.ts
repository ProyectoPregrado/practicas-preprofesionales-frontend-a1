import { api } from '@/api/client'
import { db, type OutboxEntry } from '@/offline/db'
import { applyResults, type SyncOperationResult } from './conflict'
import { setStatus } from './status'
import { DEFAULT_RETRY_CONFIG, type RetryConfig } from './backoff'

export async function enqueue(
  op: Omit<OutboxEntry, 'id' | 'clientOpId' | 'createdAt' | 'attempts' | 'lastError'>,
): Promise<void> {
  const entry: OutboxEntry = {
    ...op,
    clientOpId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
  }

  await db.transaction('rw', [db.outbox, db.hourLogs], async () => {
    await db.outbox.add(entry)
    const rowId = entry.payload.id
    if (typeof rowId === 'number') {
      await db.hourLogs.update(rowId, { syncState: 'queued' })
    }
  })

  // Sin esto, el contador "N pendientes" solo se recalcula tras un push
  // exitoso y jamás refleja lo que se acaba de encolar mientras no hay conexión.
  setStatus({ pending: await db.outbox.count() })
}

async function markPermanentFailure(
  entry: OutboxEntry,
  attempts: number,
  errorMessage: string,
): Promise<void> {
  const localId = Number(entry.payload.id)
  if (!Number.isNaN(localId)) {
    await db.hourLogs.update(localId, {
      syncState: 'failed',
      reviewNote: `Fallo permanente tras ${attempts} intentos: ${errorMessage}`,
    })
  }
  if (entry.id != null) {
    await db.outbox.delete(entry.id)
  }
}

async function purgeExceededEntries(
  entries: OutboxEntry[],
  maxAttempts: number,
): Promise<{ toSend: OutboxEntry[]; purgedCount: number }> {
  const toSend: OutboxEntry[] = []
  let purgedCount = 0

  for (const entry of entries) {
    if (entry.attempts >= maxAttempts) {
      purgedCount += 1
      await markPermanentFailure(
        entry,
        entry.attempts,
        entry.lastError ?? 'Límite máximo de reintentos alcanzado',
      )
    } else {
      toSend.push(entry)
    }
  }

  return { toSend, purgedCount }
}

async function handlePushSuccess(
  toSend: OutboxEntry[],
  results: SyncOperationResult[],
  localIds: Map<string, number>,
): Promise<{ applied: number; failed: number }> {
  const processedIds: number[] = []
  for (const res of results) {
    const entry = toSend.find((e) => e.clientOpId === res.clientOpId)
    if (entry?.id != null) {
      processedIds.push(entry.id)
    }
  }
  if (processedIds.length > 0) {
    await db.outbox.bulkDelete(processedIds)
  }

  await applyResults(results, localIds)
  return {
    applied: results.filter((r) => r.status === 'applied').length,
    failed: results.filter((r) => r.status !== 'applied').length,
  }
}

async function handlePushError(
  entries: OutboxEntry[],
  err: unknown,
  maxAttempts: number,
): Promise<never> {
  const errorMessage = err instanceof Error ? err.message : String(err)

  for (const entry of entries) {
    if (entry.id == null) continue
    const nextAttempts = entry.attempts + 1

    if (nextAttempts >= maxAttempts) {
      await markPermanentFailure(entry, nextAttempts, errorMessage)
    } else {
      await db.outbox.update(entry.id, {
        attempts: nextAttempts,
        lastError: errorMessage,
      })
    }
  }

  throw err
}

export async function pushOutbox(
  config?: Partial<RetryConfig>,
): Promise<{ applied: number; failed: number }> {
  const entries = await db.outbox.orderBy('createdAt').limit(500).toArray()
  if (entries.length === 0) return { applied: 0, failed: 0 }

  const maxAttempts = config?.maxAttempts ?? DEFAULT_RETRY_CONFIG.maxAttempts
  const { toSend, purgedCount } = await purgeExceededEntries(entries, maxAttempts)
  if (toSend.length === 0) return { applied: 0, failed: purgedCount }

  const ops = toSend.map((e) => ({
    clientOpId: e.clientOpId,
    entity: e.entity,
    op: e.op,
    baseVersion: e.baseVersion,
    payload: e.payload,
  }))

  const localIds = new Map(toSend.map((e) => [e.clientOpId, Number(e.payload.id)]))

  try {
    const { results } = await api<{ results: SyncOperationResult[] }>('/sync/push', {
      method: 'POST',
      body: JSON.stringify({ ops }),
    })

    const summary = await handlePushSuccess(toSend, results, localIds)
    return {
      applied: summary.applied,
      failed: summary.failed + purgedCount,
    }
  } catch (err) {
    return handlePushError(toSend, err, maxAttempts)
  }
}
