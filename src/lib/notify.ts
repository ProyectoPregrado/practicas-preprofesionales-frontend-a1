import type { SweetAlertOptions } from 'sweetalert2'
import { buttonVariants } from '@/components/ui/button'

// UX-1: único punto de entrada para confirmaciones y avisos. Las pantallas llaman a estas funciones y no
// importan sweetalert2, así que cambiar de librería cuesta un archivo. Los textos van en español con tuteo.
//
// Cuándo usar cada una:
// - confirmar: acciones irreversibles o con consecuencias (consumir un cupo, cerrar una oferta).
// - exito: aviso breve que no bloquea; se cierra solo.
// - error: problema que la persona debe leer; no se cierra solo.
// Los errores de un campo del formulario NO van aquí: se muestran en línea junto al campo.

const SUCCESS_TIMEOUT_MS = 3000

// sweetalert2 pesa ~22 kB gzip: se descarga al primer aviso, no con la app. El service worker precachea el
// fragmento, así que también está disponible sin conexión.
async function fire(options: SweetAlertOptions) {
  const { default: Swal } = await import('sweetalert2')
  return Swal.fire(options)
}

// Los botones usan las clases del sistema de diseño en lugar de los estilos de la librería.
const customClass = {
  popup: 'rounded-lg font-body',
  title: 'font-display text-ink',
  htmlContainer: 'text-14 text-inkBody',
  actions: 'gap-2',
  confirmButton: buttonVariants({ size: 'default' }),
  cancelButton: buttonVariants({ variant: 'outline', size: 'default' }),
}

export interface ConfirmarOptions {
  titulo: string
  texto?: string
  // Texto del botón de confirmar; por defecto «Confirmar».
  confirmar?: string
  // Texto del botón de cancelar; por defecto «Cancelar».
  cancelar?: string
}

export async function confirmar({ titulo, texto, confirmar = 'Confirmar', cancelar = 'Cancelar' }: ConfirmarOptions): Promise<boolean> {
  const result = await fire({
    title: titulo,
    text: texto,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: confirmar,
    cancelButtonText: cancelar,
    reverseButtons: true,
    buttonsStyling: false,
    customClass,
  })
  return result.isConfirmed === true
}

export async function exito(mensaje: string): Promise<void> {
  await fire({
    title: mensaje,
    icon: 'success',
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: SUCCESS_TIMEOUT_MS,
    timerProgressBar: true,
    customClass: { popup: 'rounded-lg font-body', title: 'font-display text-14 text-ink' },
  })
}

export async function error(titulo: string, texto?: string): Promise<void> {
  await fire({
    title: titulo,
    text: texto,
    icon: 'error',
    confirmButtonText: 'Entendido',
    buttonsStyling: false,
    customClass,
  })
}
