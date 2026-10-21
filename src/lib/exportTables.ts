import type { AccreditationRow } from '@/api/accreditation'
import type { CsvCell } from '@/lib/csv'
import { statusLabel } from '@/lib/statusLabels'
import type { StudentProgress } from '@/lib/tutorQueue'
import type { LocalHourLog } from '@/offline/db'

// Las horas se escriben con punto decimal (4.5): es lo que entienden Sheets, LibreOffice y Excel con
// configuración regional de punto. Con coma decimal, Excel las abre como texto; ver «Límites» del PR EXP-1.

const day = (date: string): string => date.split('T')[0]

const round1 = (value: number): number => Math.round(value * 10) / 10

/** Libro de horas: una fila por registro y una fila final con el total aprobado y el total en revisión. */
export function hourLogTable(logs: LocalHourLog[]): CsvCell[][] {
  const rows: CsvCell[][] = [['Fecha', 'Inicio', 'Fin', 'Horas', 'Actividad', 'Estado', 'Nota de revisión']]
  let approved = 0
  let submitted = 0
  for (const log of logs) {
    if (log.status === 'APPROVED') approved += log.hours
    if (log.status === 'SUBMITTED') submitted += log.hours
    rows.push([day(log.date), log.startTime, log.endTime, log.hours, log.activity, statusLabel(log.status, 'hour'), log.reviewNote ?? ''])
  }
  rows.push([])
  rows.push(['Total aprobado', '', '', round1(approved)])
  rows.push(['Total en revisión', '', '', round1(submitted)])
  return rows
}

/** Cola del tutor: una fila por practicante, en el mismo orden que la pantalla. */
export function studentQueueTable(rows: StudentProgress[]): CsvCell[][] {
  return [
    ['Estudiante', 'Empresa', 'Horas aprobadas', 'Horas requeridas', 'Avance (%)', 'Horas sin revisar', 'Registros devueltos', 'Último registro'],
    ...rows.map((row) => [
      `Estudiante #${row.placement.studentId}`,
      `Empresa #${row.placement.companyId}`,
      round1(row.approvedHours),
      row.placement.requiredHours,
      Math.round(row.approvedPct),
      round1(row.submittedHours),
      row.rejectedLogs,
      row.lastLogDate ?? '',
    ]),
  ]
}

const LEVEL_LABEL: Record<string, string> = {
  ACREDITADO: 'Acreditado',
  ACREDITADO_CON_OBSERVACIONES: 'Acreditado con observaciones',
  PENDIENTE: 'Pendiente',
  NO_ACREDITADO: 'No acreditado',
}

/** Acta de acreditación del periodo, con las razones separadas por punto y coma en una sola celda. */
export function accreditationTable(rows: AccreditationRow[], period: string): CsvCell[][] {
  return [
    ['Periodo', 'Estudiante', 'Nivel', 'Avance (%)', 'Razones'],
    ...rows.map((row) => [period, row.studentName, LEVEL_LABEL[row.level] ?? row.level, row.completionPercentage, row.reasons.join('; ')]),
  ]
}
