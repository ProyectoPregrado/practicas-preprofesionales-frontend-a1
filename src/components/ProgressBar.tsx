import { cn } from '@/lib/utils'

interface ProgressBarProps {
  /** Porcentaje resuelto: se pinta en el color primario. */
  value: number
  /** Porcentaje en trámite: se pinta detrás del anterior, en ámbar. */
  pendingValue?: number
  label: string
  /** `sm` es la barra que va dentro de una fila de tabla; `lg`, la de la tarjeta de progreso. */
  size?: 'sm' | 'md' | 'lg'
  /** Sobre fondos teñidos el canal tiene que ser blanco para verse. */
  onTint?: boolean
  className?: string
}

const SIZE_CLASSES = { sm: 'h-[5px]', md: 'h-2', lg: 'h-3.5' } as const

export function ProgressBar({
  value,
  pendingValue = 0,
  label,
  size = 'md',
  onTint = false,
  className,
}: ProgressBarProps) {
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn(
        'flex w-full overflow-hidden rounded-full',
        SIZE_CLASSES[size],
        onTint ? 'bg-surface' : 'bg-paperRule',
        className,
      )}
    >
      <span className="block h-full bg-stamp" style={{ width: `${value}%` }} />
      <span className="block h-full bg-dotPending" style={{ width: `${pendingValue}%` }} />
    </div>
  )
}
