import { useLiveQuery } from 'dexie-react-hooks'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { EmptyState, LoadingState } from '@/components/Panel'
import { Button } from '@/components/ui/button'
import { db, type LocalPlacement } from '@/offline/db'

function BackToList() {
  return (
    <Button asChild size="sm">
      <Link to="/practicantes">Volver a la lista</Link>
    </Button>
  )
}

interface TutorPlacementGateProps {
  placementId: number
  /** Qué no puede hacer con una práctica ajena: «revisar sus horas», «ver sus documentos». */
  forbiddenAction: string
  children: (placement: LocalPlacement) => ReactNode
}

/**
 * Carga de Dexie la práctica de la URL y solo muestra la pantalla si es de este tutor: resuelve los estados de
 * cargando, no encontrada y asignada a otro tutor, que cada pantalla del practicante repetía.
 */
export function TutorPlacementGate({ placementId, forbiddenAction, children }: TutorPlacementGateProps) {
  const { user } = useAuth()
  const placement = useLiveQuery<LocalPlacement | null | undefined>(async () => {
    const found = await db.placements.get(placementId)
    return found ?? null
  }, [placementId])

  if (placement === undefined) return <LoadingState>Cargando practicante…</LoadingState>
  if (placement === null) {
    return (
      <EmptyState
        title="No se encontró este practicante"
        description="El practicante no existe o no está registrado en tu lista."
        action={<BackToList />}
      />
    )
  }
  if (user?.role === 'TUTOR' && placement.tutorId !== user.id) {
    return (
      <EmptyState
        title="Práctica no asignada"
        description={`Esta práctica está asignada a otro tutor. No tienes permisos para ${forbiddenAction}.`}
        action={<BackToList />}
      />
    )
  }
  return <>{children(placement)}</>
}
