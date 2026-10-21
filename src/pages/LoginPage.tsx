import { type FormEvent, useState, useEffect } from 'react'
import { ArrowRight, BadgeCheck, CircleAlert, Eye, EyeOff, Lock, Mail, Users, WifiOff } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { useAuth, UnsyncedHoursWarningError } from '@/auth/AuthContext'
import { SESSION_EXPIRED_MESSAGE } from '@/auth/auth.constants'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const CAPABILITIES = [
  { icon: Users, title: 'Cuatro roles', detail: 'Estudiante, tutor, empresa y coordinación' },
  { icon: WifiOff, title: 'Libro de horas sin conexión', detail: 'Se sincroniza al volver la señal' },
  { icon: BadgeCheck, title: 'Acreditación por periodo', detail: 'Horas, documentos y evaluaciones' },
]

function BrandMark() {
  return (
    <span aria-hidden="true" className="flex size-[26px] flex-none items-center justify-center rounded-lg bg-stamp">
      <span className="size-2 rounded-full bg-cafeLight" />
    </span>
  )
}

/** Panel de marca de la pantalla dividida: solo se ve desde escritorio; en el móvil la marca va arriba del formulario. */
function BrandPanel() {
  return (
    <aside
      aria-label="Sobre la plataforma"
      className="relative hidden flex-col justify-between overflow-hidden bg-stamp p-12 text-surface lg:flex lg:w-1/2 xl:w-7/12 xl:p-16"
    >
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-stamp via-stamp to-scrim" />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.12)_1px,transparent_0)] bg-[length:28px_28px] opacity-40"
      />
      <div aria-hidden="true" className="pointer-events-none absolute -left-32 -top-32 size-96 rounded-full bg-[hsl(212_77%_40%/0.5)] blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -right-24 size-96 rounded-full bg-[hsl(var(--cafe-light)/0.2)] blur-3xl" />

      <div className="relative z-10 flex items-center gap-3">
        <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 backdrop-blur-md">
          <span className="size-3.5 rounded-full bg-cafeLight" />
        </span>
        <span className="font-display text-22 font-bold tracking-[-0.02em]">
          prácticas<span className="text-cafeLight">.</span>
        </span>
      </div>

      <div className="relative z-10 max-w-xl py-12">
        <span className="mb-6 inline-flex items-center gap-2.5 rounded-full border border-[hsl(var(--cafe-light)/0.3)] bg-[hsl(var(--cafe-light)/0.15)] px-3.5 py-1.5 text-12 font-semibold uppercase tracking-wider text-cafeLight">
          <span aria-hidden="true" className="size-2 rounded-full bg-cafeLight" />
          Prácticas preprofesionales
        </span>
        <h2 className="font-display text-28 font-bold leading-tight tracking-[-0.02em] xl:text-40">
          Gestiona las prácticas preprofesionales en un solo lugar
        </h2>
        <p className="mt-5 text-16 leading-relaxed text-white/75">
          Ofertas, postulaciones, libro de horas y acreditación, para estudiantes, tutores, empresas y coordinación.
        </p>

        <ul className="mt-9 grid grid-cols-3 gap-4 border-t border-white/10 pt-6">
          {CAPABILITIES.map(({ icon: Icon, title, detail }, index) => (
            <li key={title} className={index > 0 ? 'border-l border-white/10 pl-4' : undefined}>
              <Icon aria-hidden="true" className="mb-2 size-5 text-cafeLight" />
              <p className="text-14 font-semibold">{title}</p>
              <p className="mt-1 text-12 leading-snug text-white/65">{detail}</p>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}

/** Campo de contraseña con botón para mostrarla u ocultarla (el estado de visibilidad vive aquí, no en la pantalla). */
function PasswordField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="password">Contraseña</Label>
      <div className="relative">
        <Lock aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-inkMute" />
        <Input
          id="password"
          name="password"
          type={visible ? 'text' : 'password'}
          autoComplete="current-password"
          required
          className="rounded-xl pl-10 pr-11"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-inkMute transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stamp/25"
        >
          {visible ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
        </button>
      </div>
    </div>
  )
}

export function LoginPage() {
  const { login, confirmDiscard, cancelPendingLogin } = useAuth()
  const navigate = useNavigate()
  
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState<string | null>(null)
  const [pendingUnsyncedCount, setPendingUnsyncedCount] = useState<number | null>(null)

  useEffect(() => {
    if (sessionStorage.getItem('session_expired') === 'true') {
      setSessionExpiredMessage(SESSION_EXPIRED_MESSAGE)
      sessionStorage.removeItem('session_expired')
    }
  }, [])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(email, password)
      navigate('/')
    } catch (err) {
      if (err instanceof UnsyncedHoursWarningError) {
        setPendingUnsyncedCount(err.pendingCount)
        return
      }
      setError(err instanceof ApiError ? err.message : 'no se pudo iniciar sesión')
    } finally {
      setSubmitting(false)
    }
  }

  function handleCancelDiscard() {
    cancelPendingLogin?.()
    setPendingUnsyncedCount(null)
  }

  async function handleConfirmDiscard() {
    setSubmitting(true)
    setError(null)
    try {
      if (confirmDiscard) {
        await confirmDiscard()
      } else {
        await login(email, password, { forceDiscard: true })
      }
      setPendingUnsyncedCount(null)
      navigate('/')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'no se pudo iniciar sesión')
    } finally {
      setSubmitting(false)
    }
  }

  const alertText = error ?? sessionExpiredMessage
  const alertContent = alertText ? (
    <p
      role="alert"
      className="flex items-start gap-2.5 rounded-xl border border-void/20 bg-chipVoid px-3.5 py-3 text-13 font-medium text-void"
    >
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 flex-none" />
      <span>{alertText}</span>
    </p>
  ) : null

  return (
    <div className="flex min-h-screen flex-col bg-paper lg:flex-row">
      <BrandPanel />

      <main className="flex flex-1 flex-col justify-center px-6 py-10 sm:px-10 lg:px-14 xl:px-16">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <BrandMark />
            <span className="font-display text-17 font-bold tracking-[-0.02em] text-ink">prácticas.</span>
          </div>

          <span aria-hidden="true" className="mb-4 block h-1 w-10 rounded-full bg-dotPending" />
          <h1 className="font-display text-26 font-bold tracking-[-0.02em] text-ink sm:text-28">
            Entra a tu cuenta
          </h1>
          <p className="mt-2 text-14 text-inkMid">
            Con el correo institucional que te dio la unidad de vinculación.
          </p>

          <form className="mt-7 flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Correo institucional</Label>
              <div className="relative">
                <Mail aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-inkMute" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="rounded-xl pl-10"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
            </div>
            <PasswordField value={password} onChange={setPassword} />
            {alertContent}
            <Button type="submit" size="lg" disabled={submitting} className="group w-full rounded-xl">
              {submitting ? 'Entrando…' : 'Entrar'}
              {submitting ? null : <ArrowRight aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" />}
            </Button>
          </form>
        </div>
      </main>

      <Dialog
        open={pendingUnsyncedCount !== null}
        onOpenChange={(open) => {
          if (!open) handleCancelDiscard()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Horas sin sincronizar en este equipo</DialogTitle>
            <DialogDescription>
              Hay {pendingUnsyncedCount}{' '}
              {pendingUnsyncedCount === 1 ? 'registro de hora' : 'registros de horas'} pendiente
              {pendingUnsyncedCount === 1 ? '' : 's'} de sincronizar del usuario anterior.
              Si entras con otra cuenta, estas horas se descartarán definitivamente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleCancelDiscard}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmDiscard}
              disabled={submitting}
            >
              {submitting ? 'Descartando…' : 'Descartar horas y entrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
