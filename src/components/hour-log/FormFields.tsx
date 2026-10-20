import type { ChangeEvent } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface DateFieldProps {
  value: string
  maxValue: string
  confirmationLabel: string
  error?: string
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
}

export function DateField({
  value,
  maxValue,
  confirmationLabel,
  error,
  onChange,
}: DateFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="hourlog-date">Fecha</Label>
      <Input
        id="hourlog-date"
        type="date"
        max={maxValue}
        value={value}
        onChange={onChange}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? 'hourlog-date-error' : undefined}
        className="font-data"
      />
      {confirmationLabel ? (
        <p className="font-data text-12 text-inkSoft">{confirmationLabel}</p>
      ) : null}
      {error ? (
        <p id="hourlog-date-error" role="alert" className="text-12 text-void">
          {error}
        </p>
      ) : null}
    </div>
  )
}

interface TimeRangeFieldsProps {
  startTime: string
  endTime: string
  startError?: string
  endError?: string
  onStartChange: (val: string) => void
  onEndChange: (val: string) => void
}

export function TimeRangeFields({
  startTime,
  endTime,
  startError,
  endError,
  onStartChange,
  onEndChange,
}: TimeRangeFieldsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="hourlog-start">Hora de inicio</Label>
        <Input
          id="hourlog-start"
          type="time"
          value={startTime}
          onChange={(e) => onStartChange(e.target.value)}
          aria-invalid={Boolean(startError)}
          aria-describedby={startError ? 'hourlog-start-error' : undefined}
          className="font-data"
        />
        {startError ? (
          <p id="hourlog-start-error" role="alert" className="text-12 text-void">
            {startError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="hourlog-end">Hora de fin</Label>
        <Input
          id="hourlog-end"
          type="time"
          value={endTime}
          onChange={(e) => onEndChange(e.target.value)}
          aria-invalid={Boolean(endError)}
          aria-describedby={endError ? 'hourlog-end-error' : undefined}
          className="font-data"
        />
        {endError ? (
          <p id="hourlog-end-error" role="alert" className="text-12 text-void">
            {endError}
          </p>
        ) : null}
      </div>
    </div>
  )
}

interface HoursFieldProps {
  value: string
  liveWarning: string | null
  error?: string
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
}

export function HoursField({
  value,
  liveWarning,
  error,
  onChange,
}: HoursFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="hourlog-hours">Horas</Label>
      <Input
        id="hourlog-hours"
        type="number"
        inputMode="decimal"
        step="any"
        value={value}
        onChange={onChange}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? 'hourlog-hours-error' : undefined}
        className="font-data tabular-nums"
      />
      {liveWarning && !error ? (
        <p className="text-12 text-pending">{liveWarning}</p>
      ) : null}
      {error ? (
        <p id="hourlog-hours-error" role="alert" className="text-12 text-void">
          {error}
        </p>
      ) : null}
    </div>
  )
}

interface ActivityFieldProps {
  value: string
  error?: string
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void
}

export function ActivityField({
  value,
  error,
  onChange,
}: ActivityFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="hourlog-activity">Actividad</Label>
      <Textarea
        id="hourlog-activity"
        value={value}
        onChange={onChange}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? 'hourlog-activity-error' : undefined}
        rows={3}
        placeholder="Qué hiciste durante este bloque de horas"
      />
      {error ? (
        <p id="hourlog-activity-error" role="alert" className="text-12 text-void">
          {error}
        </p>
      ) : null}
    </div>
  )
}
