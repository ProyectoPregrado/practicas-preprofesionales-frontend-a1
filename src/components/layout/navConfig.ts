import {
  BadgeCheck,
  Briefcase,
  ClipboardCheck,
  Clock,
  FolderOpen,
  LayoutDashboard,
  Store,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from '@/auth/AuthContext'

export interface NavItem {
  path: string
  label: string
  icon: LucideIcon
}

export interface NavGroup {
  title: string
  items: NavItem[]
}

export const ROLE_LABEL: Record<Role, string> = {
  STUDENT: 'Estudiante',
  TUTOR: 'Tutor',
  COMPANY: 'Empresa',
  COORDINATOR: 'Coordinador',
}

export const PORTAL_LABEL: Record<Role, string> = {
  STUDENT: 'Portal del estudiante',
  TUTOR: 'Portal del tutor',
  COMPANY: 'Portal de la empresa',
  COORDINATOR: 'Portal de coordinación',
}

export const NAV_BY_ROLE: Record<Role, NavGroup[]> = {
  STUDENT: [
    {
      title: 'Mi práctica',
      items: [
        { path: '/mi-practica', label: 'Inicio', icon: LayoutDashboard },
        { path: '/horas', label: 'Mis horas', icon: Clock },
        { path: '/documentos', label: 'Documentos', icon: FolderOpen },
      ],
    },
    {
      title: 'Buscar práctica',
      items: [
        { path: '/ofertas', label: 'Ofertas', icon: Briefcase },
        { path: '/postulaciones', label: 'Mis postulaciones', icon: ClipboardCheck },
      ],
    },
  ],
  TUTOR: [{ title: 'Prácticas', items: [{ path: '/practicantes', label: 'Mis practicantes', icon: Users }] }],
  COMPANY: [{ title: 'Reclutamiento', items: [{ path: '/ofertas-empresa', label: 'Mis ofertas', icon: Store }] }],
  COORDINATOR: [{ title: 'Cierre', items: [{ path: '/acreditacion', label: 'Acreditación', icon: BadgeCheck }] }],
}
