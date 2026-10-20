import { type FormEvent, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button } from '@/components/ui/button'
import {
  ActivityField,
  DateField,
  HoursField,
  TimeRangeFields,
} from '@/components/hour-log/FormFields'
import {
  durationInHours,
  formatDateForConfirmation,
  todayAsInputValue,
} from '@/lib/hourLogHelpers'
import {
  MAX_HOURS_PER_DAY,
  getDailyRegisteredHours,
  isSameDay,
  normalizeDateKey,
  validateHourEntry,
} from '@/lib/hourRules'
import { db, type LocalHourLog } from '@/offline/db'
import { enqueue } from '@/offline/sync/push'

interface HourLogFormProps {
  placementId: number
  onSaved?: () => void
}

interface FormErrors {
  date?: string
  startTime?: string
  endTime?: string
  hours?: string
  activity?: string
}

function buildErrors(
  date: string,
  startTime: string,
  endTime: string,
  hours: string,
  activity: string,
  currentAlready: number,
): FormErrors {
  const nextErrors: FormErrors = {}

  if (!date) {
    nextErrors.date = 'La fecha es obligatoria'
  } else if (date > todayAsInputValue()) {
    nextErrors.date = 'La fecha no puede ser posterior a hoy'
  }
  if (!startTime) {
    nextErrors.startTime = 'La hora de inicio es obligatoria'
  }
  if (!endTime) {
    nextErrors.endTime = 'La hora de fin es obligatoria'
  }
  if (!activity.trim()) {
    nextErrors.activity = 'Describe la actividad realizada'
  }

  const hoursMessage = validateHourEntry(hours, startTime, endTime, currentAlready, date)
  if (hoursMessage) {
    nextErrors.hours = hoursMessage
  }

  return nextErrors
}

async function persistHourLog(
  placementId: number,
  date: string,
  targetKey: string,
  startTime: string,
  endTime: string,
  hours: string,
  activity: string,
): Promise<void> {
  const localId = -Date.now()
  const nowIso = new Date().toISOString()
  const hoursValue = Number(hours)
  const trimmedActivity = activity.trim()

  const row: LocalHourLog = {
    id: localId,
    placementId,
    date,
    startTime,
    endTime,
    hours: hoursValue,
    activity: trimmedActivity,
    status: 'SUBMITTED',
    reviewNote: null,
    version: 1,
    updatedAt: nowIso,
    syncState: 'local',
  }

  await db.transaction('rw', [db.hourLogs, db.outbox], async () => {
    const txExisting = await db.hourLogs
      .where('placementId')
      .equals(placementId)
      .and((l) => isSameDay(l.date, targetKey) && l.status !== 'REJECTED')
      .toArray()
    const txAlready = txExisting.reduce((acc, l) => acc + (Number(l.hours) || 0), 0)
    if (txAlready + hoursValue > MAX_HOURS_PER_DAY) {
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
}

export function HourLogForm({ placementId, onSaved }: HourLogFormProps) {
  const [date, setDate] = useState(todayAsInputValue())
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [hours, setHours] = useState('')
  const [activity, setActivity] = useState('')
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const targetKey = normalizeDateKey(date)
  const existingLogs = useLiveQuery(
    () =>
      targetKey
        ? db.hourLogs
            .where('placementId')
            .equals(placementId)
            .and((log) => isSameDay(log.date, targetKey) && log.status !== 'REJECTED')
            .toArray()
        : [],
    [placementId, targetKey],
  )
  const alreadyHours = (existingLogs ?? []).reduce((sum, log) => sum + (Number(log.hours) || 0), 0)

  const confirmationLabel = formatDateForConfirmation(date)
  const liveHoursWarning = hours ? validateHourEntry(hours, startTime, endTime, alreadyHours, date) : null

  function changeTimes(nextStart: string, nextEnd: string) {
    setStartTime(nextStart)
    setEndTime(nextEnd)
    const duration = durationInHours(nextStart, nextEnd)
    if (duration !== null) setHours(String(duration))
  }

  function resetForm() {
    setDate(todayAsInputValue())
    setStartTime('')
    setEndTime('')
    setHours('')
    setActivity('')
    setErrors({})
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitError(null)

    const currentAlready = await getDailyRegisteredHours(placementId, date)
    const nextErrors = buildErrors(date, startTime, endTime, hours, activity, currentAlready)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      return
    }

    setSubmitting(true)
    try {
      await persistHourLog(placementId, date, targetKey, startTime, endTime, hours, activity)
      resetForm()
      onSaved?.()
    } catch (err) {
      if (err instanceof Error && err.message === 'DAILY_LIMIT_EXCEEDED') {
        setSubmitError(`No se puede guardar: superaría el límite de ${MAX_HOURS_PER_DAY} horas por día.`)
      } else {
        setSubmitError('No se pudo guardar el registro en este dispositivo. Intenta de nuevo.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <DateField
        value={date}
        maxValue={todayAsInputValue()}
        confirmationLabel={confirmationLabel}
        error={errors.date}
        onChange={(e) => setDate(e.target.value)}
      />

      <TimeRangeFields
        startTime={startTime}
        endTime={endTime}
        startError={errors.startTime}
        endError={errors.endTime}
        onStartChange={(start) => changeTimes(start, endTime)}
        onEndChange={(end) => changeTimes(startTime, end)}
      />

      <HoursField
        value={hours}
        liveWarning={liveHoursWarning}
        error={errors.hours}
        onChange={(e) => setHours(e.target.value)}
      />

      <ActivityField
        value={activity}
        error={errors.activity}
        onChange={(e) => setActivity(e.target.value)}
      />

      {submitError ? (
        <p role="alert" className="text-14 text-void">
          {submitError}
        </p>
      ) : null}

      <p className="text-12 text-inkSoft">
        Se guarda en este dispositivo aunque no tengas conexión. Se sincroniza solo cuando vuelvas a estar en línea
      </p>

      <Button type="submit" disabled={submitting}>
        {submitting ? 'Guardando…' : 'Guardar horas'}
      </Button>
    </form>
  )
}
