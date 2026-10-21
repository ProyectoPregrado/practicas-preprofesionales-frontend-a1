// Helpers puros para el formulario de registro de horas (E6-04, paga D-09).

// Fecha de hoy en formato YYYY-MM-DD, tal como la espera un <input type="date">.
export function todayAsInputValue(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Convierte la fecha elegida (YYYY-MM-DD) a una etiqueta legible en español
// para que el estudiante confirme, de un vistazo, qué día está registrando
// antes de guardar.
export function formatDateForConfirmation(dateValue: string): string {
  if (!dateValue) return ''
  const [year, month, day] = dateValue.split('-').map(Number)
  if (!year || !month || !day) return ''
  const parsed = new Date(year, month - 1, day)
  if (Number.isNaN(parsed.getTime())) return ''
  return new Intl.DateTimeFormat('es-EC', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(parsed)
}

// Duración en horas entre inicio y fin ("HH:mm"), con dos decimales; null si falta un dato o el
// rango no es válido. Con ella se rellena el campo "Horas" al completar inicio y fin.
export function durationInHours(startTime: string, endTime: string): number | null {
  if (!startTime || !endTime) return null
  const [startHour, startMinute] = startTime.split(':').map(Number)
  const [endHour, endMinute] = endTime.split(':').map(Number)
  if ([startHour, startMinute, endHour, endMinute].some((value) => Number.isNaN(value))) {
    return null
  }
  const diffMinutes = endHour * 60 + endMinute - (startHour * 60 + startMinute)
  if (diffMinutes <= 0) return null
  return Math.round((diffMinutes / 60) * 100) / 100
}
