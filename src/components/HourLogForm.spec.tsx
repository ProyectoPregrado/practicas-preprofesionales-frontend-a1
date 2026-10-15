import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
