/** Marca de la plataforma: cuadro azul con el punto café y el nombre. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={className}>
      <span aria-hidden="true" className="flex size-7 flex-none items-center justify-center rounded-lg bg-stamp">
        <span className="size-2 rounded-full bg-cafeLight" />
      </span>
      <span className="font-display text-17 font-bold tracking-[-0.02em] text-stamp">
        prácticas<span className="text-dotPending">.</span>
      </span>
    </span>
  )
}
