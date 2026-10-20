import type { ChangeEvent } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

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
