import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/offline/db'
import { HourLogForm } from './HourLogForm'

function fillTimes(start: string, end: string) {
  fireEvent.change(screen.getByLabelText('Hora de inicio'), { target: { value: start } })
  fireEvent.change(screen.getByLabelText('Hora de fin'), { target: { value: end } })
}

const hoursInput = () => screen.getByLabelText('Horas') as HTMLInputElement

describe('HourLogForm — horas calculadas desde inicio y fin', () => {
  it('rellena Horas con la duración entre inicio y fin', () => {
    render(<HourLogForm placementId={1} />)
    fillTimes('08:00', '12:00')
    expect(hoursInput().value).toBe('4')
  })

  it('admite medias horas y minutos sueltos', () => {
    render(<HourLogForm placementId={1} />)
    fillTimes('08:00', '12:30')
    expect(hoursInput().value).toBe('4.5')
    fillTimes('08:00', '12:20')
    expect(hoursInput().value).toBe('4.33')
  })

  it('recalcula al cambiar la hora de fin', () => {
    render(<HourLogForm placementId={1} />)
    fillTimes('08:00', '12:00')
    fireEvent.change(screen.getByLabelText('Hora de fin'), { target: { value: '14:00' } })
    expect(hoursInput().value).toBe('6')
  })

  it('exactamente 8 horas es válido: no muestra aviso', () => {
    render(<HourLogForm placementId={1} />)
    fillTimes('08:00', '16:00')
    expect(hoursInput().value).toBe('8')
    expect(screen.queryByText(/No puedes registrar más de 8 horas/)).toBeNull()
  })

  it('más de 8 horas entre inicio y fin avisa en cuanto se completan los datos', () => {
    render(<HourLogForm placementId={1} />)
    fillTimes('08:00', '17:00')
    expect(hoursInput().value).toBe('9')
    expect(screen.getByText(/No puedes registrar más de 8 horas/)).toBeTruthy()
  })

  it('si el rango es inválido (fin antes que inicio) no inventa horas', () => {
    render(<HourLogForm placementId={1} />)
    fillTimes('12:00', '08:00')
    expect(hoursInput().value).toBe('')
  })
})

function localDate(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

describe('HourLogForm — sin fechas posteriores a hoy', () => {
  const dateInput = () => screen.getByLabelText('Fecha') as HTMLInputElement

  it('el selector de fecha no deja elegir días posteriores a hoy', () => {
    render(<HourLogForm placementId={1} />)
    expect(dateInput().max).toBe(localDate(0))
  })

  it('si igual llega una fecha futura, no se guarda y se explica', async () => {
    render(<HourLogForm placementId={1} />)
    fireEvent.change(dateInput(), { target: { value: localDate(1) } })
    fillTimes('08:00', '12:00')
    fireEvent.change(screen.getByLabelText('Actividad'), { target: { value: 'Prueba' } })

    fireEvent.click(screen.getByRole('button', { name: 'Guardar horas' }))

    await waitFor(() => expect(screen.getByText('La fecha no puede ser posterior a hoy')).toBeTruthy())
  })

  it('hoy y días anteriores no dan error de fecha', async () => {
    render(<HourLogForm placementId={1} />)
    fireEvent.change(dateInput(), { target: { value: localDate(-1) } })
    fillTimes('08:00', '12:00')
    fireEvent.change(screen.getByLabelText('Actividad'), { target: { value: 'Prueba' } })

    fireEvent.click(screen.getByRole('button', { name: 'Guardar horas' }))

    await waitFor(() => expect(screen.queryByText('La fecha no puede ser posterior a hoy')).toBeNull())
  })
})

describe('HourLogForm — tope diario de 8 horas (E6-01)', () => {
  beforeEach(async () => {
    await db.hourLogs.clear()
    await db.outbox.clear()
  })

  it('avisa y rechaza si las horas sumadas a las ya registradas superan 8 horas', async () => {
    const today = localDate(0)
    await db.hourLogs.add({
      id: 101,
      placementId: 1,
      date: today,
      startTime: '08:00',
      endTime: '13:00',
      hours: 5,
      activity: 'Actividad previa matutina',
      status: 'SUBMITTED',
      version: 1,
      updatedAt: new Date().toISOString(),
      syncState: 'synced',
    })

    render(<HourLogForm placementId={1} />)

    // Intenta registrar 4 horas más el mismo día (5 + 4 = 9 > 8)
    fillTimes('14:00', '18:00')
    expect(hoursInput().value).toBe('4')

    // El aviso en vivo debe advertir con el total acumulado
    await waitFor(() => {
      expect(screen.getByText(new RegExp(`ya tienes 5 registradas el ${today}`))).toBeTruthy()
    })

    // Intenta enviar el formulario
    fireEvent.change(screen.getByLabelText('Actividad'), { target: { value: 'Horas tarde' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar horas' }))

    await waitFor(() => {
      expect(screen.getByText(new RegExp(`No puedes registrar más de 8 horas en un mismo día`))).toBeTruthy()
    })

    // Verifica que NO se guardó en Dexie
    const logs = await db.hourLogs.where('placementId').equals(1).toArray()
    expect(logs).toHaveLength(1)
  })

  it('permite registrar si la suma con lo ya registrado es exactamente 8 horas', async () => {
    const today = localDate(0)
    await db.hourLogs.add({
      id: 102,
      placementId: 1,
      date: today,
      startTime: '08:00',
      endTime: '13:00',
      hours: 5,
      activity: 'Actividad mañana',
      status: 'SUBMITTED',
      version: 1,
      updatedAt: new Date().toISOString(),
      syncState: 'synced',
    })

    const onSaved = vi.fn()
    render(<HourLogForm placementId={1} onSaved={onSaved} />)

    // 3 horas más: 5 + 3 = 8 (válido)
    fillTimes('14:00', '17:00')
    expect(hoursInput().value).toBe('3')

    await waitFor(() => {
      expect(screen.queryByText(/No puedes registrar más de 8 horas/)).toBeNull()
    })

    fireEvent.change(screen.getByLabelText('Actividad'), { target: { value: 'Horas tarde' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar horas' }))

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled()
    })

    const count = await db.hourLogs.where('placementId').equals(1).count()
    expect(count).toBe(2)
  })

  it('no suma registros rechazados (REJECTED) para el tope diario', async () => {
    const today = localDate(0)
    await db.hourLogs.add({
      id: 103,
      placementId: 1,
      date: today,
      startTime: '08:00',
      endTime: '14:00',
      hours: 6,
      activity: 'Actividad rechazada por el tutor',
      status: 'REJECTED',
      version: 1,
      updatedAt: new Date().toISOString(),
      syncState: 'synced',
    })

    const onSaved = vi.fn()
    render(<HourLogForm placementId={1} onSaved={onSaved} />)

    // Intenta registrar 4 horas: como las 6 anteriores están REJECTED, el total válido es 4 <= 8
    fillTimes('14:00', '18:00')
    expect(hoursInput().value).toBe('4')

    await waitFor(() => {
      expect(screen.queryByText(/No puedes registrar más de 8 horas/)).toBeNull()
    })

    fireEvent.change(screen.getByLabelText('Actividad'), { target: { value: 'Horas nuevas' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar horas' }))

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled()
    })
  })

  it('rechaza registros con menos de 0.5 horas (MIN_HOURS_PER_LOG)', async () => {
    render(<HourLogForm placementId={1} />)

    fillTimes('08:00', '08:15') // 0.25h
    expect(hoursInput().value).toBe('0.25')

    expect(screen.getByText(/Las horas de un registro deben estar entre 0\.5 y 8/)).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Actividad'), { target: { value: 'Breve' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar horas' }))

    await waitFor(() => {
      expect(screen.getByText(/Las horas de un registro deben estar entre 0\.5 y 8/)).toBeTruthy()
    })
  })

  it('detecta registros previos con fecha ISO sincronizada del servidor (ej. 2026-10-20T00:00:00.000Z) y bloquea si la suma supera 8h', async () => {
    const today = localDate(0)
    // Registro previo sincronizado tal como lo almacena el backend
    await db.hourLogs.add({
      id: 201,
      placementId: 1,
      date: `${today}T00:00:00.000Z`,
      startTime: '08:00',
      endTime: '13:33',
      hours: 5.55,
      activity: 'sadasdas',
      status: 'SUBMITTED',
      version: 1,
      updatedAt: new Date().toISOString(),
      syncState: 'synced',
    })

    render(<HourLogForm placementId={1} />)

    // Intenta registrar 3 horas adicionales: 5.55 + 3 = 8.55 > 8
    fireEvent.change(hoursInput(), { target: { value: '3' } })
    fillTimes('14:00', '17:00')

    await waitFor(() => {
      expect(screen.getByText(new RegExp(`ya tienes 5.55 registradas el ${today}`))).toBeTruthy()
    })

    fireEvent.change(screen.getByLabelText('Actividad'), { target: { value: 'asdad' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar horas' }))

    await waitFor(() => {
      expect(screen.getByText(new RegExp(`No puedes registrar más de 8 horas en un mismo día`))).toBeTruthy()
    })

    const count = await db.hourLogs.where('placementId').equals(1).count()
    expect(count).toBe(1)
  })
})

