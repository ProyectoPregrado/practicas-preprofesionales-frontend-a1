import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// Tamaños de texto propios de tailwind.config.ts (`fontSize`). tailwind-merge no los conoce y tomaba `text-14` por un
// color: al fusionar, borraba el `text-surface` de los botones y el texto quedaba oscuro sobre fondo azul. Si se añade
// un tamaño a la config, hay que añadirlo aquí; `utils.spec.ts` lo comprueba.
const CUSTOM_FONT_SIZES = ["11", "12", "13", "14", "15", "16", "17", "19", "20", "22", "26", "28", "40"]

const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: CUSTOM_FONT_SIZES }] } },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Concuerda un sustantivo con su cantidad: `plural(1, 'oferta', 'ofertas')`
 * devuelve `"1 oferta"`. Vive acá para que las pantallas no repitan el mismo
 * ternario en cada contador.
 */
export function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}
