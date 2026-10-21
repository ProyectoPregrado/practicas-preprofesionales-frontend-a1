import { describe, expect, it } from 'vitest'
import tailwindConfig from '../../tailwind.config'
import { cn } from './utils'

describe('cn', () => {
  it('resolves conflicting tailwind classes, keeping the last one', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })

  it('drops falsy values and keeps the rest', () => {
    const hidden: string | undefined = undefined
    expect(cn('a', hidden, null, 'c')).toBe('a c')
  })

  // tailwind-merge no conoce los tamaños de texto propios (`text-14`) y los toma por un color: borraba el
  // `text-surface` de los botones y dejaba texto oscuro sobre fondo azul.
  describe('tamaños de texto propios de tailwind.config.ts', () => {
    const sizes = Object.keys(tailwindConfig.theme?.extend?.fontSize ?? {})

    it('el tamaño no borra el color del texto', () => {
      expect(cn('bg-stamp text-surface', 'h-10 text-14')).toBe('bg-stamp text-surface h-10 text-14')
    })

    it('hay tamaños propios que comprobar (si no, esta prueba no protege nada)', () => {
      expect(sizes.length).toBeGreaterThan(5)
    })

    it.each(sizes)('text-%s convive con un color de texto', (size) => {
      expect(cn('text-surface', `text-${size}`)).toBe(`text-surface text-${size}`)
    })

    it('un segundo tamaño sigue reemplazando al primero', () => {
      expect(cn('text-13', 'text-14')).toBe('text-14')
    })

    it('un segundo color sigue reemplazando al primero', () => {
      expect(cn('text-ink', 'text-surface')).toBe('text-surface')
    })
  })
})
