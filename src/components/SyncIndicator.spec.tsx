import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SyncIndicator } from './SyncIndicator'
import * as syncStatusHooks from '@/offline/hooks/useSyncStatus'
import * as onlineHooks from '@/offline/hooks/useOnline'

vi.mock('@/offline/sync/scheduler', () => ({
  syncNow: vi.fn(),
}))

describe('SyncIndicator', () => {
  it('muestra aviso de reintento cuando retrying es true', () => {
    vi.spyOn(onlineHooks, 'useOnline').mockReturnValue(true)
    vi.spyOn(syncStatusHooks, 'useSyncStatus').mockReturnValue({
      online: true,
      pending: 1,
      lastSyncAt: null,
      syncing: false,
      retrying: true,
      failed: 0,
    })

    render(<SyncIndicator />)
    expect(screen.getByText(/reintentando envío/i)).toBeInTheDocument()
  })

  it('muestra conteo de fallos permanentes cuando failed es mayor a 0', () => {
    vi.spyOn(onlineHooks, 'useOnline').mockReturnValue(true)
    vi.spyOn(syncStatusHooks, 'useSyncStatus').mockReturnValue({
      online: true,
      pending: 0,
      lastSyncAt: null,
      syncing: false,
      retrying: false,
      failed: 2,
    })

    render(<SyncIndicator />)
    expect(screen.getByText(/2 fallos permanentes/i)).toBeInTheDocument()
  })
})
