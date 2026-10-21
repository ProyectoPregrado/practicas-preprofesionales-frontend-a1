import Swal from 'sweetalert2'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { confirmar, error, exito } from './notify'

vi.mock('sweetalert2', () => ({ default: { fire: vi.fn() } }))

const fire = vi.mocked(Swal.fire)

// UX-1: un solo módulo para confirmaciones y avisos. Las pantallas no importan sweetalert2 directamente,
// así que cambiar de librería después cuesta un archivo.
describe('notify', () => {
  beforeEach(() => {
    fire.mockReset()
  })

  describe('confirmar', () => {
    it('resuelve true cuando la persona confirma', async () => {
      fire.mockResolvedValue({ isConfirmed: true, isDenied: false, isDismissed: false } as never)

      await expect(confirmar({ titulo: '¿Aceptar?', texto: 'No se puede deshacer.' })).resolves.toBe(true)
    })

    it.each([
      ['cancela', { isConfirmed: false, isDenied: false, isDismissed: true, dismiss: 'cancel' }],
      ['cierra con Esc', { isConfirmed: false, isDenied: false, isDismissed: true, dismiss: 'esc' }],
      ['hace clic fuera', { isConfirmed: false, isDenied: false, isDismissed: true, dismiss: 'backdrop' }],
    ])('resuelve false cuando la persona %s', async (_caso, result) => {
      fire.mockResolvedValue(result as never)

      await expect(confirmar({ titulo: '¿Aceptar?' })).resolves.toBe(false)
    })

    it('muestra un modal de pregunta con textos en español y botón de cancelar', async () => {
      fire.mockResolvedValue({ isConfirmed: false } as never)

      await confirmar({ titulo: '¿Aceptar a Ana?', texto: 'Quedan 2 cupos.' })

      expect(fire).toHaveBeenCalledTimes(1)
      expect(fire.mock.calls[0][0]).toMatchObject({
        title: '¿Aceptar a Ana?',
        text: 'Quedan 2 cupos.',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Confirmar',
        cancelButtonText: 'Cancelar',
      })
    })

    it('permite personalizar el texto del botón de confirmar', async () => {
      fire.mockResolvedValue({ isConfirmed: false } as never)

      await confirmar({ titulo: '¿Aceptar?', confirmar: 'Sí, aceptar' })

      expect(fire.mock.calls[0][0]).toMatchObject({ confirmButtonText: 'Sí, aceptar' })
    })

    it('usa los estilos del sistema de diseño en lugar de los de la librería', async () => {
      fire.mockResolvedValue({ isConfirmed: false } as never)

      await confirmar({ titulo: '¿Aceptar?' })

      const options = fire.mock.calls[0][0] as unknown as { buttonsStyling: boolean; customClass: Record<string, string> }
      expect(options.buttonsStyling).toBe(false)
      expect(options.customClass.confirmButton).toContain('bg-stamp')
      expect(options.customClass.cancelButton).toContain('border-line')
    })
  })

  describe('exito', () => {
    it('muestra un aviso breve que no bloquea y se cierra solo', async () => {
      fire.mockResolvedValue({} as never)

      await exito('Postulación aceptada')

      expect(fire.mock.calls[0][0]).toMatchObject({
        title: 'Postulación aceptada',
        icon: 'success',
        toast: true,
        showConfirmButton: false,
      })
      expect((fire.mock.calls[0][0] as unknown as { timer: number }).timer).toBeGreaterThan(0)
    })
  })

  describe('error', () => {
    it('muestra un modal de error que NO se cierra solo y pide una confirmación explícita', async () => {
      fire.mockResolvedValue({} as never)

      await error('No se pudo aceptar', 'La postulación ya fue decidida.')

      const options = fire.mock.calls[0][0] as unknown as Record<string, unknown>
      expect(options).toMatchObject({
        title: 'No se pudo aceptar',
        text: 'La postulación ya fue decidida.',
        icon: 'error',
        confirmButtonText: 'Entendido',
      })
      expect(options.timer).toBeUndefined()
    })
  })
})
