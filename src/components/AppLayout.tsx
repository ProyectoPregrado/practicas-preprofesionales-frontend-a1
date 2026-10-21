import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth, UnsyncedHoursWarningError } from '@/auth/AuthContext'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { SyncIndicator } from '@/components/SyncIndicator'
import { confirmar } from '@/lib/notify'
import { startSync } from '@/offline/sync/scheduler'

function pendingHoursText(count: number): string {
  if (count === 1) return 'Hay 1 registro de hora pendiente de sincronizar.'
  return `Hay ${count} registros de horas pendientes de sincronizar.`
}

export function AppLayout() {
  const { user, role, logout } = useAuth()
  const [leaving, setLeaving] = useState(false)

  // Reactiva sync cuando hay una sesión autenticada activa
  useEffect(() => {
    if (user) {
      return startSync()
    }
  }, [user])

  // `leaving` deshabilita Salir también mientras la pregunta está abierta: un segundo clic no abre otra.
  async function handleLogout() {
    setLeaving(true)
    try {
      await logout()
    } catch (err) {
      if (!(err instanceof UnsyncedHoursWarningError)) throw err
      const discard = await confirmar({
        titulo: 'Horas sin sincronizar en este equipo',
        texto: `${pendingHoursText(err.pendingCount)} Si cierras sesión en este equipo compartido, se descartarán definitivamente.`,
        confirmar: 'Descartar horas y salir',
      })
      if (discard) await logout({ forceDiscard: true })
    } finally {
      setLeaving(false)
    }
  }

  return (
    <div className="grid min-h-screen grid-cols-[minmax(0,1fr)] grid-rows-[auto_auto_1fr_auto] bg-paper lg:h-screen lg:grid-cols-[theme(width.sidebar)_minmax(0,1fr)] lg:grid-rows-[theme(height.topbar)_minmax(0,1fr)] lg:overflow-hidden">
      <Topbar user={user} role={role} onLogout={handleLogout} leaving={leaving} />
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
    </div>
  )
}
