import type { ReactNode } from 'react'

/** Tarjeta destacada de un panel: superficie blanca con dos manchas de color difuminadas detrás del contenido. */
export function HeroSurface({ children }: { children: ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-2xl bg-surface p-6 shadow-[0_4px_24px_hsl(var(--scrim)/0.07)] lg:p-7">
      <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-20 size-80 rounded-full bg-[hsl(var(--cafe-light)/0.2)] blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 left-1/3 size-72 rounded-full bg-hero blur-3xl" />
      <div className="relative z-10 flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">{children}</div>
    </section>
  )
}
