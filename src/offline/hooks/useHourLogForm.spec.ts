import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, type LocalHourLog } from '@/offline/db'
import { useHourLogForm } from './useHourLogForm'

describe('useHourLogForm (E6-04)', () => {
  const placementId = 42

  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('inicializa con valores por defecto', () => {
    const { result } = renderHook(() => useHourLogForm({ placementId }))

    expect(result.current.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(result.current.startTime).toBe('')
    expect(result.current.endTime).toBe('')
    expect(result.current.hours).toBe('')
    expect(result.current.activity).toBe('')
    expect(result.current.errors).toEqual({})
    expect(result.current.submitting).toBe(false)
    expect(result.current.submitError).toBeNull()
  })

  it('calcula y auto-rellena las horas al cambiar tiempos de inicio y fin', () => {
    const { result } = renderHook(() => useHourLogForm({ placementId }))

    act(() => {
      result.current.changeTimes('08:00', '12:30')
    })

    expect(result.current.startTime).toBe('08:00')
    expect(result.current.endTime).toBe('12:30')
    expect(result.current.hours).toBe('4.5')
  })

  it('valida campos obligatorios al enviar formulario vacío', async () => {
    const { result } = renderHook(() => useHourLogForm({ placementId }))

    const fakeEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent<HTMLFormElement>

    await act(async () => {
      await result.current.handleSubmit(fakeEvent)
    })

    expect(result.current.errors.startTime).toBe('La hora de inicio es obligatoria')
    expect(result.current.errors.endTime).toBe('La hora de fin es obligatoria')
    expect(result.current.errors.activity).toBe('Describe la actividad realizada')
  })

  it('guarda el registro en Dexie y encola en el outbox cuando es válido', async () => {
    const onSaved = vi.fn()
    const { result } = renderHook(() => useHourLogForm({ placementId, onSaved }))

    act(() => {
      result.current.setDate('2026-10-20')
      result.current.changeTimes('08:00', '12:00')
      result.current.setActivity('Desarrollo frontend offline')
    })

    const fakeEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent<HTMLFormElement>

    await act(async () => {
      await result.current.handleSubmit(fakeEvent)
    })

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled()
    })
    expect(result.current.submitError).toBeNull()

    const saved = await db.hourLogs.where('placementId').equals(placementId).toArray()
    expect(saved).toHaveLength(1)
    expect(saved[0].hours).toBe(4)
    expect(saved[0].activity).toBe('Desarrollo frontend offline')

    const outbox = await db.outbox.toArray()
    expect(outbox).toHaveLength(1)
    expect(outbox[0].entity).toBe('hourLog')
    expect(outbox[0].op).toBe('create')
  })

  it('rechaza el guardado si supera el límite de 8 horas acumuladas en el día', async () => {
    const existing: LocalHourLog = {
      id: 1,
      placementId,
      date: '2026-10-20',
      startTime: '08:00',
      endTime: '14:00',
      hours: 6,
      activity: 'Horas previas',
      status: 'SUBMITTED',
      syncState: 'synced',
      version: 1,
      updatedAt: '2026-10-20T14:00:00.000Z',
    }
    await db.hourLogs.add(existing)

    const onSaved = vi.fn()
    const { result } = renderHook(() => useHourLogForm({ placementId, onSaved }))

    await waitFor(() => {
      expect(result.current.date).toBeDefined()
    })

    act(() => {
      result.current.setDate('2026-10-20')
      result.current.changeTimes('14:00', '17:00') // 3 horas + 6 horas existentes = 9 horas (> 8)
      result.current.setActivity('Superando límite')
    })

    const fakeEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent<HTMLFormElement>

    await act(async () => {
      await result.current.handleSubmit(fakeEvent)
    })

    expect(onSaved).not.toHaveBeenCalled()
    expect(result.current.errors.hours).toContain('No puedes registrar más de 8 horas en un mismo día')
  })
})
