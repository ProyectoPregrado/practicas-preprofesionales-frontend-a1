import type { HourLogDraft } from '@/api/ai'
import { DictateDayPanel } from '@/components/ai/DictateDayPanel'
import { Button } from '@/components/ui/button'
import {
  DateField,
  TimeRangeFields,
} from '@/components/hour-log/DateTimeFields'
import {
  ActivityField,
  HoursField,
} from '@/components/hour-log/HoursActivityFields'
import { todayAsInputValue } from '@/lib/hourLogHelpers'
import { useHourLogForm } from '@/offline/hooks/useHourLogForm'

interface HourLogFormProps {
  placementId: number
  onSaved?: () => void
}

export function HourLogForm({ placementId, onSaved }: HourLogFormProps) {
  const {
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
    handleSubmit,
  } = useHourLogForm({ placementId, onSaved })

  // IA-1: el borrador solo llena lo que trae; la persona revisa y guarda como siempre (con las validaciones de siempre).
  function applyDraft(draft: HourLogDraft) {
    if (draft.date) setDate(draft.date)
    if (draft.startTime && draft.endTime) changeTimes(draft.startTime, draft.endTime)
    if (draft.activity) setActivity(draft.activity)
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <DictateDayPanel onDraft={applyDraft} />

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
