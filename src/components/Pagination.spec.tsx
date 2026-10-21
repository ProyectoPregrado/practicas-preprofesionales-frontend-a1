import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Pagination } from './Pagination'

const props = {
  page: 1,
  pageCount: 3,
  onPageChange: vi.fn(),
  pageSize: 10,
  onPageSizeChange: vi.fn(),
  totalCount: 25,
}

// REDISEÑO-5: cada tabla deja elegir cuántas filas ve la persona por página.
describe('Pagination — filas por página', () => {
  it('ofrece de 5 en 5 hasta 30 y marca la que está en uso', () => {
    render(<Pagination {...props} pageSize={15} />)

    const select = screen.getByRole('combobox', { name: 'Filas por página' }) as HTMLSelectElement
    expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual(['5', '10', '15', '20', '25', '30'])
    expect(select.value).toBe('15')
  })

  it('al elegir otro tamaño avisa con un número', async () => {
    const user = userEvent.setup()
    const onPageSizeChange = vi.fn()
    render(<Pagination {...props} onPageSizeChange={onPageSizeChange} />)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Filas por página' }), '25')

    expect(onPageSizeChange).toHaveBeenCalledWith(25)
  })

  it('no aparece si todos los registros caben en la menor opción (5 o menos): no habría nada que elegir', () => {
    render(<Pagination {...props} pageCount={1} totalCount={5} />)

    expect(screen.queryByRole('combobox', { name: 'Filas por página' })).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Paginación' })).toBeNull()
  })

  it('con 6 registros sí aparece, aunque quepan en una sola página: se puede bajar a 5', () => {
    render(<Pagination {...props} pageCount={1} totalCount={6} />)

    expect(screen.getByRole('combobox', { name: 'Filas por página' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Siguiente' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Anterior' })).toBeNull()
  })

  it('con varias páginas conserva Anterior, Siguiente y el «Página x de y»', async () => {
    const user = userEvent.setup()
    const onPageChange = vi.fn()
    render(<Pagination {...props} page={2} onPageChange={onPageChange} />)

    expect(screen.getByText('Página 2 de 3')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Siguiente' }))
    await user.click(screen.getByRole('button', { name: 'Anterior' }))

    expect(onPageChange).toHaveBeenNthCalledWith(1, 3)
    expect(onPageChange).toHaveBeenNthCalledWith(2, 1)
  })

  it('en la primera página no se puede retroceder y en la última no se puede avanzar', () => {
    const { rerender } = render(<Pagination {...props} page={1} />)
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()

    rerender(<Pagination {...props} page={3} />)
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled()
  })

  it('sin el control de tamaño (uso antiguo) se comporta como antes', () => {
    render(<Pagination page={1} pageCount={2} onPageChange={vi.fn()} />)

    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument()
  })
})
