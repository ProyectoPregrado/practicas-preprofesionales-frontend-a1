import { FileDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { type CsvCell, downloadCsv } from '@/lib/csv'

interface ExportCsvButtonProps {
  filename: string
  /** Se llama al pulsar, para exportar lo que hay en ese momento (filtros incluidos). */
  rows: () => CsvCell[][]
  disabled?: boolean
  label?: string
}

/** EXP-1: descarga en CSV lo que muestra la pantalla. Funciona sin conexión: no pide nada al servidor. */
export function ExportCsvButton({ filename, rows, disabled, label = 'Exportar CSV' }: ExportCsvButtonProps) {
  return (
    <Button type="button" variant="outline" disabled={disabled} onClick={() => downloadCsv(filename, rows())}>
      <FileDown aria-hidden="true" />
      {label}
    </Button>
  )
}
