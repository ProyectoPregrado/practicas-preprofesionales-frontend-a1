import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CrossTabChannel, resetCrossTabForTesting } from '@/offline/sync/crossTab'
import { _resetStatusForTesting } from '@/offline/sync/status'
import { SyncIndicator } from './SyncIndicator'

describe('SyncIndicator cross-tab reactivity', () => {
  beforeEach(() => {
    localStorage.clear()
    resetCrossTabForTesting()
    _resetStatusForTesting()
  })

  afterEach(() => {
    resetCrossTabForTesting()
    _resetStatusForTesting()
    localStorage.clear()
  })

  it('refresca el indicador de la pestaña actual en tiempo real al recibir actualización desde otra pestaña sin recarga', async () => {
    // Renderizamos SyncIndicator simulando la Pestaña B
    render(<SyncIndicator />)

    // Estado inicial: 0 pendientes
    expect(screen.getByText(/0 pendientes/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sincronizar ahora/i })).toBeEnabled()

    // Simulamos que la Pestaña A emite que hay 3 pendientes y comenzó a sincronizar
    const tabA = new CrossTabChannel('offline_sync_channel', 'tab_a')
    tabA.postMessage('STATUS_UPDATE', { pending: 3, syncing: true })

    // Pestaña B debe actualizarse reactivamente
    expect(await screen.findByText(/3 pendientes/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sincronizando…/i })).toBeDisabled()

    // Simulamos que la Pestaña A termina la sincronización
    tabA.postMessage('STATUS_UPDATE', {
      pending: 0,
      syncing: false,
      lastSyncAt: '2026-09-22T14:30:00.000Z',
    })

    expect(await screen.findByText(/0 pendientes/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sincronizar ahora/i })).toBeEnabled()

    tabA.close()
  })
})
