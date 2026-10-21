import { type FormEvent, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { buildFormErrors, type FormErrors } from '@/lib/hourLogErrors'
import {
  durationInHours,
  formatDateForConfirmation,
  todayAsInputValue,
} from '@/lib/hourLogHelpers'
import { persistHourLog } from '@/lib/hourLogPersistence'
import { exito } from '@/lib/notify'
import {
  MAX_HOURS_PER_DAY,
  getDailyRegisteredHours,
  isSameDay,
  normalizeDateKey,
  validateHourEntry,
} from '@/lib/hourRules'
import { db } from '@/offline/db'

export type { FormErrors }

// El registro queda en el dispositivo y en la cola de sincronización: el servidor aún no lo tiene, así que el aviso
// nunca dice «enviado», con o sin conexión.
const SAVED_NOTICE = 'Guardado en este dispositivo. Se sincronizará con el servidor en cuanto haya conexión.'

export interface UseHourLogFormOptions {
  placementId: number
  onSaved?: () => void
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
        activity,
      })
      resetForm()
      // Sin `await`: el aviso se cierra solo a los 3 s y no debe dejar el botón en «Guardando…».
      exito(SAVED_NOTICE)
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
