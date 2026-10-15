import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { ModalitySelect } from './ModalitySelect'

// Radix Select usa APIs que jsdom no trae.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
  Element.prototype.scrollIntoView = () => {}
})

describe('ModalitySelect', () => {
  it('ofrece solo PRESENCIAL, HIBRIDA y REMOTA', async () => {
    const user = userEvent.setup()
    render(<ModalitySelect id="m" value="" onChange={() => {}} />)

    await user.click(screen.getByRole('combobox'))

    const options = screen.getAllByRole('option').map((option) => option.textContent)
    expect(options).toEqual(['PRESENCIAL', 'HIBRIDA', 'REMOTA'])
  })

  it('al elegir una opción llama a onChange con su valor', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ModalitySelect id="m" value="" onChange={onChange} />)

    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByRole('option', { name: 'HIBRIDA' }))

    expect(onChange).toHaveBeenCalledWith('HIBRIDA')
  })

  it('muestra la modalidad elegida y el placeholder cuando no hay ninguna', () => {
    const { rerender } = render(<ModalitySelect id="m" value="" onChange={() => {}} />)
    expect(screen.getByRole('combobox').textContent).toContain('Selecciona una modalidad')

    rerender(<ModalitySelect id="m" value="REMOTA" onChange={() => {}} />)
    expect(screen.getByRole('combobox').textContent).toContain('REMOTA')
  })
})
