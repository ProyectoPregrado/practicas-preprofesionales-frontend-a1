import { type FormEvent, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  durationInHours,
  formatDateForConfirmation,
  todayAsInputValue,
} from '@/lib/hourLogHelpers'
import { persistHourLog } from '@/lib/hourLogPersistence'
import {
  MAX_HOURS_PER_DAY,
  getDailyRegisteredHours,
  isSameDay,
  normalizeDateKey,
  validateHourEntry,
} from '@/lib/hourRules'
import { db } from '@/offline/db'

export interface FormErrors {
  date?: string
  startTime?: string
  endTime?: string
  hours?: string
  activity?: string
}

export interface UseHourLogFormOptions {
  placementId: number
  onSaved?: () => void
}

export function buildFormErrors(
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

export function useHourLogForm({ placementId, onSaved }: UseHourLogFormOptions) {
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
    const nextErrors = buildFormErrors(date, startTime, endTime, hours, activity, currentAlready)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      return
    }

    setSubmitting(true)
    try {
      await persistHourLog({
        placementId,
        date,
        targetKey,
        startTime,
        endTime,
        hours: Number(hours),
        activity: activity.trim(),
      })
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

  return {
    date,
    setDate,
    startTime,
    endTime,
    hours,
    setHours,
    activity,
    setActivity,
    errors,
    submitting,
    submitError,
    confirmationLabel,
    liveHoursWarning,
    changeTimes,
    resetForm,
    handleSubmit,
  }
}
