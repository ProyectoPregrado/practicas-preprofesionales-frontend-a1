import { describe, expect, it } from 'vitest'
import type { LocalDocument } from '@/offline/db'
import { summarizeHours } from './hours'
import { placementRequirements } from './placementRequirements'

let nextId = 0

const doc = (kind: string, status: string, updatedAt = '2026-03-01T00:00:00.000Z'): LocalDocument => ({
  id: ++nextId,
  placementId: 1,
  kind,
  filename: `${kind}.pdf`,
  status,
  version: 1,
  updatedAt,
})

const hours = (approved: number, submitted: number, required = 240) =>
  summarizeHours(
    [
      ...(approved > 0 ? [{ status: 'APPROVED', hours: approved }] : []),
      ...(submitted > 0 ? [{ status: 'SUBMITTED', hours: submitted }] : []),
    ] as never,
    required,
  )

const byKey = (items: ReturnType<typeof placementRequirements>) => Object.fromEntries(items.map((item) => [item.key, item]))

// REDISEÑO-3: la lista de lo que falta para acreditar, calculada solo con datos que la aplicación ya tiene.
describe('placementRequirements', () => {
  it('devuelve los cuatro requisitos en orden: convenio, seguro, horas e informe final', () => {
    const items = placementRequirements({ documents: [], hours: hours(0, 0) })

    expect(items.map((item) => item.key)).toEqual(['agreement', 'insurance', 'hours', 'report'])
  })

  it('sin nada subido, los documentos faltan y las horas no han empezado', () => {
    const items = byKey(placementRequirements({ documents: [], hours: hours(0, 0) }))

    expect(items.agreement).toMatchObject({ state: 'todo', detail: 'Falta subirlo' })
    expect(items.insurance).toMatchObject({ state: 'todo', detail: 'Falta subirlo' })
    expect(items.report).toMatchObject({ state: 'todo', detail: 'Falta subirlo' })
    expect(items.hours).toMatchObject({ state: 'todo' })
  })

  it('un documento validado cuenta como hecho', () => {
    const items = byKey(placementRequirements({ documents: [doc('AGREEMENT', 'VALIDATED')], hours: hours(0, 0) }))

    expect(items.agreement).toMatchObject({ state: 'done', detail: 'Validado' })
  })

  it('un documento pendiente está en curso: lo está revisando la coordinación', () => {
    const items = byKey(placementRequirements({ documents: [doc('INSURANCE', 'PENDING')], hours: hours(0, 0) }))

    expect(items.insurance).toMatchObject({ state: 'progress', detail: 'En revisión' })
  })

  it('un documento rechazado vuelve a faltar y pide subir otro', () => {
    const items = byKey(placementRequirements({ documents: [doc('AGREEMENT', 'REJECTED')], hours: hours(0, 0) }))

    expect(items.agreement).toMatchObject({ state: 'todo', detail: 'Rechazado: sube uno nuevo' })
  })

  it('de varios documentos del mismo tipo cuenta el más reciente', () => {
    const items = byKey(
      placementRequirements({
        documents: [doc('AGREEMENT', 'REJECTED', '2026-03-01T00:00:00.000Z'), doc('AGREEMENT', 'VALIDATED', '2026-03-05T00:00:00.000Z')],
        hours: hours(0, 0),
      }),
    )

    expect(items.agreement.state).toBe('done')
  })

  it('el informe final se evalúa igual que los otros documentos', () => {
    const items = byKey(placementRequirements({ documents: [doc('REPORT', 'VALIDATED')], hours: hours(0, 0) }))

    expect(items.report).toMatchObject({ state: 'done', detail: 'Validado' })
  })

  it('un documento de otro tipo (evidencia) no cuenta para ningún requisito', () => {
    const items = placementRequirements({ documents: [doc('EVIDENCE', 'VALIDATED')], hours: hours(0, 0) })

    expect(items.filter((item) => item.state === 'done')).toHaveLength(0)
  })

  it('con horas aprobadas y sin revisar, las horas están en curso y el detalle dice cuántas', () => {
    const items = byKey(placementRequirements({ documents: [], hours: hours(60, 20) }))

    expect(items.hours).toMatchObject({
      state: 'progress',
      detail: 'Llevas 60.0 aprobadas y 20.0 sin revisar, de 240',
    })
  })

  it('con solo horas sin revisar también están en curso', () => {
    const items = byKey(placementRequirements({ documents: [], hours: hours(0, 8) }))

    expect(items.hours.state).toBe('progress')
  })

  it('al llegar a las horas requeridas, están hechas', () => {
    const items = byKey(placementRequirements({ documents: [], hours: hours(240, 0) }))

    expect(items.hours).toMatchObject({ state: 'done', detail: '240.0 de 240 aprobadas' })
  })

  it('con 0 horas requeridas el requisito de horas ya está cumplido (E5-01b)', () => {
    const items = byKey(placementRequirements({ documents: [], hours: hours(0, 0, 0) }))

    expect(items.hours.state).toBe('done')
  })

  it('mientras los documentos cargan (undefined) los trata como ausentes', () => {
    const items = byKey(placementRequirements({ documents: undefined, hours: hours(0, 0) }))

    expect(items.agreement.state).toBe('todo')
  })
})
