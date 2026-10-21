import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatusBadge } from './StatusBadge'

describe('StatusBadge', () => {
  it('maps a status from each group to its tone class', () => {
    const { rerender } = render(<StatusBadge status="APPROVED" />)
    expect(screen.getByText('APPROVED').className).toContain('text-stamp')

    rerender(<StatusBadge status="SUBMITTED" />)
    expect(screen.getByText('SUBMITTED').className).toContain('text-pending')

    rerender(<StatusBadge status="REJECTED" />)
    expect(screen.getByText('REJECTED').className).toContain('text-void')

    rerender(<StatusBadge status="WHATEVER" />)
    expect(screen.getByText('WHATEVER').className).toContain('text-inkSoft')
  })

  // REDISEÑO-5: con `domain` se lee en español; el color sigue la misma regla y sin `domain` nada cambia.
  describe('con dominio (horas y documentos)', () => {
    it('traduce el estado de una hora y conserva su tono', () => {
      const { rerender } = render(<StatusBadge status="APPROVED" domain="hour" />)
      expect(screen.getByText('Aprobada').className).toContain('text-stamp')

      rerender(<StatusBadge status="SUBMITTED" domain="hour" />)
      expect(screen.getByText('En revisión').className).toContain('text-pending')

      rerender(<StatusBadge status="REJECTED" domain="hour" />)
      expect(screen.getByText('Rechazada').className).toContain('text-void')
    })

    it('traduce el estado de un documento y conserva su tono', () => {
      const { rerender } = render(<StatusBadge status="VALIDATED" domain="document" />)
      expect(screen.getByText('Validado').className).toContain('text-stamp')

      rerender(<StatusBadge status="PENDING" domain="document" />)
      expect(screen.getByText('En revisión').className).toContain('text-pending')
    })

    it('un estado que no conoce se muestra tal cual', () => {
      render(<StatusBadge status="ARCHIVED" domain="hour" />)

      expect(screen.getByText('ARCHIVED')).toBeInTheDocument()
    })

    it('sin dominio sigue mostrando el valor del backend', () => {
      render(<StatusBadge status="APPROVED" />)

      expect(screen.getByText('APPROVED')).toBeInTheDocument()
    })
  })
})
