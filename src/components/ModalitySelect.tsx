import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

// Valores tal como los guarda el backend (el seed usa PRESENCIAL e HIBRIDA).
export const MODALITIES = ['PRESENCIAL', 'HIBRIDA', 'REMOTA'] as const

interface ModalitySelectProps {
  id: string
  value: string
  onChange: (value: string) => void
  invalid?: boolean
}

export function ModalitySelect({ id, value, onChange, invalid }: ModalitySelectProps) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger id={id} aria-invalid={invalid}>
        <SelectValue placeholder="Selecciona una modalidad" />
      </SelectTrigger>
      <SelectContent>
        {MODALITIES.map((modality) => (
          <SelectItem key={modality} value={modality}>
            {modality}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
