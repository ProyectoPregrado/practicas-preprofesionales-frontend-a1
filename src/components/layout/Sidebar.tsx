import { PlusCircle } from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'
import type { Role } from '@/auth/AuthContext'
import { SyncIndicator } from '@/components/SyncIndicator'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { BrandMark } from './BrandMark'
import { NAV_BY_ROLE } from './navConfig'

/**
 * Barra lateral del portal. Desde `lg:` es una columna fija. En pantallas chicas es solo una fila de enlaces que se
 * desliza, para que el contenido quede a la vista: la marca va en la barra superior, «Registrar horas» ya está en la
 * página de inicio y la sincronización pasa al final de la pantalla (ver `AppLayout`).
 */
export function Sidebar({ role }: { role: Role | null }) {
  const groups = role ? NAV_BY_ROLE[role] : []

  return (
    <aside className="flex min-w-0 flex-col gap-4 bg-surface px-4 py-2 shadow-[0_1px_8px_hsl(var(--scrim)/0.06)] lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:min-h-0 lg:overflow-y-auto lg:py-5">
      <BrandMark className="hidden items-center gap-2.5 px-2 lg:flex" />

      {role === 'STUDENT' ? (
        <Button asChild className="hidden w-full rounded-xl shadow-[0_4px_16px_hsl(var(--stamp)/0.25)] lg:inline-flex">
          <Link to="/horas">
            <PlusCircle aria-hidden="true" />
            Registrar horas
          </Link>
        </Button>
      ) : null}

      <nav aria-label="Navegación principal" className="flex gap-2 overflow-x-auto lg:flex-1 lg:flex-col lg:gap-4 lg:overflow-visible">
        {groups.map((group) => (
          <div key={group.title} className="flex flex-none items-center gap-1 lg:block">
            <div className="hidden px-2.5 pb-1.5 text-11 font-bold uppercase tracking-[0.07em] text-inkMute lg:block">{group.title}</div>
            <div className="flex gap-1 lg:flex-col">
              {group.items.map(({ path, label, icon: Icon }) => (
                <NavLink
                  key={path}
                  to={path}
                  className={({ isActive }) =>
                    cn(
                      'flex h-10 flex-none items-center gap-2.5 whitespace-nowrap rounded-xl px-3 text-14 transition-colors',
                      isActive
                        ? 'bg-stamp font-semibold text-surface shadow-[0_2px_8px_hsl(var(--stamp)/0.25)]'
                        : 'text-inkBody hover:bg-navHover hover:text-ink',
                    )
                  }
                >
                  <Icon aria-hidden="true" className="size-[18px] flex-none" />
                  {label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="hidden lg:block">
        <SyncIndicator />
      </div>
    </aside>
  )
}
