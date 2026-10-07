import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, onUnauthorized } from '@/api/client'
import { db } from '@/offline/db'
import { getCrossTabChannel } from '@/offline/sync/crossTab'

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

interface LoginResponse {
  accessToken: string
  user: AuthUser
}

type LogoutReason = 'SESSION_EXPIRED' | 'EXPLICIT_LOGOUT'

interface LogoutPayload {
  reason: LogoutReason
}

const SESSION_EXPIRED_KEY = 'session_expired'

interface AuthContextValue {
  user: AuthUser | null
  role: Role | null
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
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

  const clearSessionOnly = useCallback(() => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('user')
    setUser(null)
  }, [])

  const clearLocalData = useCallback(async () => {
    await db.delete()
    await db.open()
    localStorage.removeItem('last_user_id')
  }, [])

  const publishLogout = useCallback((reason: LogoutReason) => {
    getCrossTabChannel().postMessage('LOGOUT', { reason })
  }, [])

  async function login(email: string, password: string) {
    const { accessToken, user: loggedUser } = await api<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })

    const lastUserId = localStorage.getItem('last_user_id')
    if (lastUserId && Number(lastUserId) !== loggedUser.id) {
      await clearLocalData()
    }

    localStorage.setItem('last_user_id', String(loggedUser.id))
    localStorage.setItem('access_token', accessToken)
    localStorage.setItem('user', JSON.stringify(loggedUser))
    isHandling401Ref.current = false
    setUser(loggedUser)
  }

  // Una máquina de laboratorio compartida es el caso normal de este dominio:
  // si no se borra Dexie, el checkpoint de sync y los datos del estudiante
  // anterior sobreviven a esta sesión y contaminan la del siguiente.
  async function logout() {
    await clearLocalData()
    clearSessionOnly()
    publishLogout('EXPLICIT_LOGOUT')
    navigate('/login')
  }

  useEffect(() => {
    return onUnauthorized(() => {
      if (isHandling401Ref.current) return
      isHandling401Ref.current = true
      sessionStorage.setItem(SESSION_EXPIRED_KEY, 'true')
      clearSessionOnly()
      publishLogout('SESSION_EXPIRED')
      navigate('/login')
    })
  }, [clearSessionOnly, navigate, publishLogout])

  useEffect(() => {
    const channel = getCrossTabChannel()
    return channel.onMessage(async (msg) => {
      if (msg.type !== 'LOGOUT') return

      const reason = (msg.payload as LogoutPayload | undefined)?.reason
      if (reason === 'EXPLICIT_LOGOUT') {
        await clearLocalData()
      } else if (reason === 'SESSION_EXPIRED') {
        sessionStorage.setItem(SESSION_EXPIRED_KEY, 'true')
      }
      clearSessionOnly()
      navigate('/login')
    })
  }, [clearLocalData, clearSessionOnly, navigate])

  return (
    <AuthContext.Provider value={{ user, role: user?.role ?? null, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
