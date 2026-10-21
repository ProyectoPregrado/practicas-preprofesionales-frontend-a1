import type { Role } from '@/auth/AuthContext'
import { Button } from '@/components/ui/button'
import { BrandMark } from './BrandMark'
import { PORTAL_LABEL, ROLE_LABEL } from './navConfig'

function initialsOf(fullName: string | undefined): string {
  if (!fullName) return '··'
  const parts = fullName.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const second = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : ''
  return (first + second).toUpperCase() || '··'
}

interface TopbarProps {
  user: { fullName: string } | null
  role: Role | null
  onLogout: () => void
  /** Mientras se cierra la sesión, el botón no admite otro clic. */
  leaving: boolean
}

/** Barra superior: en qué portal estás y quién eres. En móvil lleva también la marca, que el panel lateral oculta. */
export function Topbar({ user, role, onLogout, leaving }: TopbarProps) {
  return (
    <header className="flex h-topbar items-center justify-between gap-4 bg-surface/80 px-4 shadow-[0_1px_8px_hsl(var(--scrim)/0.05)] backdrop-blur-xl lg:col-start-2 lg:row-start-1 lg:px-7">
      <div className="flex min-w-0 items-center gap-3">
        <BrandMark className="flex items-center gap-2.5 lg:hidden" />
        {role ? <span className="hidden text-13 font-semibold text-inkSoft lg:block">{PORTAL_LABEL[role]}</span> : null}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <span className="hidden text-right leading-tight sm:block">
            <span className="block text-13 font-semibold text-ink">{user?.fullName}</span>
            <span className="block text-11 font-medium text-pending">{role ? ROLE_LABEL[role] : ''}</span>
          </span>
          <span
            aria-hidden="true"
            className="flex size-8 flex-none items-center justify-center rounded-full bg-stamp text-12 font-semibold text-surface ring-2 ring-[hsl(var(--cafe-light)/0.5)]"
          >
            {initialsOf(user?.fullName)}
          </span>
        </div>
        <span aria-hidden="true" className="h-6 w-px bg-line" />
        <Button type="button" variant="outline" size="sm" onClick={onLogout} disabled={leaving}>
          Salir
        </Button>
      </div>
    </header>
  )
}
