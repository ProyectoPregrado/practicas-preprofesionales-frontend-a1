import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, onUnauthorized } from '@/api/client'
import { db } from '@/offline/db'
import { getCrossTabChannel } from '@/offline/sync/crossTab'
import { startSync, stopSync } from '@/offline/sync/scheduler'

export type Role = 'STUDENT' | 'TUTOR' | 'COMPANY' | 'COORDINATOR'

export interface AuthUser {
  id: number
  email: string
  fullName: string
  role: Role
  // Solo relevante para Role.COMPANY (ver User.companyId en el backend); el
  // resto de roles lo trae null. CompanyOffersPage lo usa para armar
  // CreateOfferDto sin tener que adivinar o listar todas las empresas.
  companyId: number | null
}

export class UnsyncedHoursWarningError extends Error {
  constructor(readonly pendingCount: number) {
    super(
      `Hay ${pendingCount} ${
        pendingCount === 1 ? 'registro de hora' : 'registros de horas'
      } pendiente${pendingCount === 1 ? '' : 's'} de sincronizar del usuario anterior.`,
    )
    this.name = 'UnsyncedHoursWarningError'
  }
}

export interface LoginOptions {
  forceDiscard?: boolean
}

interface LoginResponse {
  accessToken: string
  refreshToken?: string
  user: AuthUser
}

interface PendingAuth {
  accessToken: string
  refreshToken?: string
  loggedUser: AuthUser
}

interface AuthContextValue {
  user: AuthUser | null
  role: Role | null
  login: (email: string, password: string, options?: LoginOptions) => Promise<void>
  confirmDiscard?: () => Promise<void>
  logout: (options?: LoginOptions) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function readStoredUser(): AuthUser | null {
  const raw = localStorage.getItem('user')
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => readStoredUser())
  const navigate = useNavigate()
  const isHandling401Ref = useRef(false)
  const pendingAuthRef = useRef<PendingAuth | null>(null)

  const clearSessionOnly = useCallback(() => {
    stopSync()
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')
    setUser(null)
  }, [])

  const performCleanup = useCallback(async (options?: LoginOptions) => {
    await db.transaction('rw', db.tables, async () => {
      const pendingCount = await db.outbox.count()
      if (pendingCount > 0 && !options?.forceDiscard) {
        // Cancelar el aviso deja la sesión abierta: el sync se detiene solo si el cierre procede.
        throw new UnsyncedHoursWarningError(pendingCount)
      }
      stopSync()
      await Promise.all(db.tables.map((table) => table.clear()))
    })
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')
    localStorage.removeItem('last_user_id')
    setUser(null)
  }, [])

  useEffect(() => {
    const channel = getCrossTabChannel()
    const unsubscribe = channel.onMessage((msg) => {
      if (msg.type === 'LOGOUT') {
        const payload = msg.payload as { reason?: string } | undefined
        if (payload?.reason === 'EXPIRED') {
          sessionStorage.setItem('session_expired', 'true')
        }
        clearSessionOnly()
        navigate('/login')
      }
    })
    return unsubscribe
  }, [clearSessionOnly, navigate])

  useEffect(() => {
    const unsubUnauthorized = onUnauthorized(() => {
      if (isHandling401Ref.current) return
      isHandling401Ref.current = true

      sessionStorage.setItem('session_expired', 'true')
      clearSessionOnly()
      getCrossTabChannel().postMessage('LOGOUT', { reason: 'EXPIRED' })
      navigate('/login')
    })
    return unsubUnauthorized
  }, [clearSessionOnly, navigate])

  async function login(email: string, password: string, options?: LoginOptions) {
    let authData: PendingAuth
    if (options?.forceDiscard && pendingAuthRef.current && (pendingAuthRef.current.loggedUser.email === email || !email)) {
      // Reutiliza la respuesta del primer login para evitar generar un refresh token huérfano
      authData = pendingAuthRef.current
      pendingAuthRef.current = null
    } else {
      pendingAuthRef.current = null
      const response = await api<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      authData = {
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
        loggedUser: response.user,
      }
    }

    const { accessToken, refreshToken, loggedUser } = authData

    const lastUserId = localStorage.getItem('last_user_id')
    if (lastUserId && Number(lastUserId) !== loggedUser.id) {
      // S-1 y T-3: Limpiar Dexie en una sola transacción atómica 'rw'.
      // El conteo y el borrado ocurren dentro de la misma transacción para evitar carreras "leer y luego escribir".
      await db.transaction('rw', db.tables, async () => {
        const pendingCount = await db.outbox.count()
        if (pendingCount > 0 && !options?.forceDiscard) {
          // Guardar credenciales validadas para reutilizarlas sin reintentar /auth/login
          pendingAuthRef.current = authData
          throw new UnsyncedHoursWarningError(pendingCount)
        }
        await Promise.all(db.tables.map((table) => table.clear()))
      })
    }

    localStorage.setItem('last_user_id', String(loggedUser.id))
    localStorage.setItem('access_token', accessToken)
    if (refreshToken) {
      localStorage.setItem('refresh_token', refreshToken)
    }
    localStorage.setItem('user', JSON.stringify(loggedUser))
    // AuthProvider sigue montado al volver a /login: sin este reset, el segundo
    // vencimiento de la misma pestaña se ignoraría.
    isHandling401Ref.current = false
    setUser(loggedUser)
    startSync()
  }

  async function confirmDiscard(): Promise<void> {
    if (!pendingAuthRef.current) {
      throw new Error('No hay inicio de sesión pendiente')
    }
    const { email } = pendingAuthRef.current.loggedUser
    await login(email, '', { forceDiscard: true })
  }

  // Una máquina de laboratorio compartida es el caso normal de este dominio:
  // si no se borra Dexie en un logout explícito, el checkpoint de sync y los
  // datos del estudiante anterior sobreviven a esta sesión y contaminan la del siguiente.
  async function logout(options?: LoginOptions) {
    isHandling401Ref.current = false
    const refreshToken = localStorage.getItem('refresh_token')
    await performCleanup(options)
    if (refreshToken) {
      try {
        await api('/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken }),
        })
      } catch {
        // En caso de fallo de red o del servidor, se continúa con el logout
      }
    }
    getCrossTabChannel().postMessage('LOGOUT', { reason: 'USER_LOGOUT' })
    navigate('/login')
  }

  return (
    <AuthContext.Provider value={{ user, role: user?.role ?? null, login, confirmDiscard, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
