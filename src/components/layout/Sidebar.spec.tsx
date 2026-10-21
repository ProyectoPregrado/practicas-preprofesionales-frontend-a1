import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { Role } from '@/auth/AuthContext'
import { Sidebar } from './Sidebar'

vi.mock('@/components/SyncIndicator', () => ({
  SyncIndicator: () => <div data-testid="sync-indicator">SyncIndicator</div>,
}))

function renderSidebar(role: Role | null, path = '/mi-practica') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar role={role} />
    </MemoryRouter>,
  )
}

const linksOf = (nav: HTMLElement) =>
  within(nav)
    .getAllByRole('link')
    .map((link) => [link.textContent, link.getAttribute('href')])

// REDISEÑO-2: la barra lateral del portal. Los destinos no cambian: solo la presentación.
describe('Sidebar', () => {
  it('el estudiante ve sus dos grupos de navegación con sus destinos', () => {
    renderSidebar('STUDENT')

    const nav = screen.getByRole('navigation', { name: 'Navegación principal' })
    expect(within(nav).getByText('Mi práctica')).toBeInTheDocument()
    expect(within(nav).getByText('Buscar práctica')).toBeInTheDocument()
    expect(linksOf(nav)).toEqual([
      ['Inicio', '/mi-practica'],
      ['Mis horas', '/horas'],
      ['Documentos', '/documentos'],
      ['Ofertas', '/ofertas'],
      ['Mis postulaciones', '/postulaciones'],
    ])
  })

  it.each([
    ['TUTOR', [['Mis practicantes', '/practicantes']]],
    ['COMPANY', [['Mis ofertas', '/ofertas-empresa']]],
    ['COORDINATOR', [['Acreditación', '/acreditacion']]],
  ] as const)('%s ve solo su navegación', (role, expected) => {
    renderSidebar(role)

    const nav = screen.getByRole('navigation', { name: 'Navegación principal' })
    expect(linksOf(nav)).toEqual(expected)
  })

  it('sin rol no hay enlaces de navegación', () => {
    renderSidebar(null)

    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeEmptyDOMElement()
  })

  it('marca como actual solo la página donde estás', () => {
    renderSidebar('STUDENT', '/horas')

    expect(screen.getByRole('link', { name: 'Mis horas' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Inicio' })).not.toHaveAttribute('aria-current')
  })

  it('ofrece «Registrar horas» al estudiante, hacia el libro de horas', () => {
    renderSidebar('STUDENT')

    expect(screen.getByRole('link', { name: 'Registrar horas' })).toHaveAttribute('href', '/horas')
  })

  it.each(['TUTOR', 'COMPANY', 'COORDINATOR'] as const)('%s no ve «Registrar horas»', (role) => {
    renderSidebar(role)

    expect(screen.queryByRole('link', { name: 'Registrar horas' })).toBeNull()
  })

  it('incluye el indicador de sincronización', () => {
    renderSidebar('STUDENT')

    expect(screen.getByTestId('sync-indicator')).toBeInTheDocument()
  })
})
