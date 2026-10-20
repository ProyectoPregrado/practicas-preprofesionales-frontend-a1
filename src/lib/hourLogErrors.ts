import { todayAsInputValue } from './hourLogHelpers'
import { validateHourEntry } from './hourRules'

export interface FormErrors {
  date?: string
  startTime?: string
  endTime?: string
  hours?: string
  activity?: string
}

// Construye y valida los errores del formulario de horas de forma pura.
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
