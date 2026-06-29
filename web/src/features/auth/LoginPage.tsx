import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link } from 'react-router-dom'
import { LoaderCircle, TrendingUp, ShieldCheck, BarChart3 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useLogin, parseAuthError } from './useAuthMutations'

// ── Validation schema ─────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'E-mail é obrigatório')
    .email('Informe um e-mail válido'),
  password: z.string().min(1, 'Senha é obrigatória'),
})

type LoginFormData = z.infer<typeof loginSchema>

// ── Component ─────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const { login, isPending } = useLogin()

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginFormData) => {
    try {
      await login(data)
    } catch (err) {
      const { fieldErrors, formError, isUnexpected } = parseAuthError(err)

      if (fieldErrors.email) {
        setError('email', { message: fieldErrors.email })
      }
      if (fieldErrors.password) {
        setError('password', { message: fieldErrors.password })
      }
      if (formError) {
        if (isUnexpected) {
          toast.error(formError)
        } else {
          // 401 → show below the form inputs
          setError('root', { message: formError })
        }
      }
    }
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* ── Left decorative panel ── */}
      <div className="hidden md:flex md:w-1/2 bg-gradient-to-br from-primary/40 via-primary/15 to-background flex-col items-center justify-center p-12 relative overflow-hidden">
        {/* Soft background circle */}
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-72 h-72 rounded-full bg-accent/10 blur-2xl pointer-events-none" />

        <div className="relative z-10 max-w-sm space-y-8">
          {/* Wordmark */}
          <div>
            <img src="/logo.png" alt="Lefinance" className="w-56 h-auto" />
            <p className="mt-3 text-lg text-muted-foreground leading-relaxed">
              Controle suas finanças familiares com simplicidade e clareza.
            </p>
          </div>

          {/* Feature list */}
          <ul className="space-y-4">
            <li className="flex items-center gap-3 text-sm text-foreground/80">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20">
                <TrendingUp className="h-4 w-4 text-primary" />
              </span>
              Acompanhe lançamentos e saldos em tempo real
            </li>
            <li className="flex items-center gap-3 text-sm text-foreground/80">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20">
                <BarChart3 className="h-4 w-4 text-primary" />
              </span>
              Visualize relatórios por categoria e período
            </li>
            <li className="flex items-center gap-3 text-sm text-foreground/80">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20">
                <ShieldCheck className="h-4 w-4 text-primary" />
              </span>
              Seus dados protegidos e sempre disponíveis
            </li>
          </ul>

          {/* Decorative tags */}
          <div className="flex flex-wrap gap-2">
            <span className="text-xs bg-primary/15 text-primary-strong px-3 py-1 rounded-full font-medium border border-primary/20">
              Lançamentos
            </span>
            <span className="text-xs bg-accent/25 text-foreground/70 px-3 py-1 rounded-full font-medium border border-accent/30">
              Categorias
            </span>
            <span className="text-xs bg-primary/15 text-primary-strong px-3 py-1 rounded-full font-medium border border-primary/20">
              Assinaturas
            </span>
          </div>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12 bg-background">
        <div className="w-full max-w-md space-y-6">
          {/* Mobile-only wordmark */}
          <div className="md:hidden text-center">
            <img
              src="/logo.png"
              alt="Lefinance"
              className="h-9 w-auto mx-auto"
            />
            <p className="mt-1 text-sm text-muted-foreground">
              Controle de finanças familiar
            </p>
          </div>

          <Card className="rounded-2xl shadow-xl border-border/60">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-2xl font-semibold">
                Entrar na sua conta
              </CardTitle>
              <CardDescription>
                Insira seu e-mail e senha para continuar.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form
                onSubmit={handleSubmit(onSubmit)}
                noValidate
                className="space-y-5"
              >
                {/* Form-level error (401) */}
                {errors.root?.message && (
                  <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3">
                    <p className="text-sm font-medium text-destructive">
                      {errors.root.message}
                    </p>
                  </div>
                )}

                {/* E-mail */}
                <div className="space-y-1.5">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="voce@exemplo.com"
                    autoComplete="email"
                    aria-invalid={!!errors.email}
                    {...register('email')}
                  />
                  {errors.email?.message && (
                    <p className="text-xs text-destructive">
                      {errors.email.message}
                    </p>
                  )}
                </div>

                {/* Senha */}
                <div className="space-y-1.5">
                  <Label htmlFor="password">Senha</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    aria-invalid={!!errors.password}
                    {...register('password')}
                  />
                  {errors.password?.message && (
                    <p className="text-xs text-destructive">
                      {errors.password.message}
                    </p>
                  )}
                </div>

                {/* Submit */}
                <Button
                  type="submit"
                  className="w-full font-semibold"
                  disabled={isPending}
                >
                  {isPending ? (
                    <>
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      Entrando…
                    </>
                  ) : (
                    'Entrar'
                  )}
                </Button>
              </form>

              <p className="mt-5 text-center text-sm text-muted-foreground">
                Não tem conta?{' '}
                <Link
                  to="/register"
                  className="font-medium text-primary hover:underline underline-offset-4"
                >
                  Criar conta
                </Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
