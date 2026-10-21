import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth, UnsyncedHoursWarningError } from '@/auth/AuthContext'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { SyncIndicator } from '@/components/SyncIndicator'
import { startSync } from '@/offline/sync/scheduler'

export function AppLayout() {
  const { user, role, logout } = useAuth()
  const [pendingUnsyncedCount, setPendingUnsyncedCount] = useState<number | null>(null)
  const [submittingLogout, setSubmittingLogout] = useState(false)

  // Reactiva sync cuando hay una sesión autenticada activa
  useEffect(() => {
    if (user) {
      return startSync()
    }
  }, [user])

  async function handleLogout() {
    try {
      await logout()
    } catch (err) {
      if (err instanceof UnsyncedHoursWarningError) {
        setPendingUnsyncedCount(err.pendingCount)
      } else {
        throw err
      }
    }
  }

  async function handleConfirmDiscardLogout() {
    setSubmittingLogout(true)
    try {
      await logout({ forceDiscard: true })
      setPendingUnsyncedCount(null)
    } finally {
      setSubmittingLogout(false)
    }
  }

  return (
    <div className="grid min-h-screen grid-cols-[minmax(0,1fr)] grid-rows-[auto_auto_1fr_auto] bg-paper lg:h-screen lg:grid-cols-[theme(width.sidebar)_minmax(0,1fr)] lg:grid-rows-[theme(height.topbar)_minmax(0,1fr)] lg:overflow-hidden">
      <Topbar user={user} role={role} onLogout={handleLogout} leaving={submittingLogout} />
      <Sidebar role={role} />

      <main className="min-h-0 min-w-0 px-4 pb-6 lg:col-start-2 lg:row-start-2 lg:overflow-y-auto lg:px-7">
        <div className="flex flex-col gap-4 pt-3.5 lg:pt-5">
          <Outlet />
        </div>
      </main>

      {/* En pantallas chicas la sincronización va aquí; desde `lg:` vive en la barra lateral. */}
      <div className="px-4 pb-6 lg:hidden">
        <SyncIndicator />
      </div>

      <Dialog
        open={pendingUnsyncedCount !== null}
        onOpenChange={(open) => {
          if (!open) setPendingUnsyncedCount(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Horas sin sincronizar en este equipo</DialogTitle>
            <DialogDescription>
              Hay {pendingUnsyncedCount}{' '}
              {pendingUnsyncedCount === 1 ? 'registro de hora' : 'registros de horas'} pendiente
              {pendingUnsyncedCount === 1 ? '' : 's'} de sincronizar.
              Si cierras sesión en este equipo compartido, se descartarán definitivamente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingUnsyncedCount(null)}
              disabled={submittingLogout}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmDiscardLogout}
              disabled={submittingLogout}
            >
              {submittingLogout ? 'Descartando…' : 'Descartar horas y salir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
