import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link } from 'react-router-dom'
import { LoaderCircle, Sparkles } from 'lucide-react'
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
import { useRegister, parseAuthError } from './useAuthMutations'

// ── Validation schema ─────────────────────────────────────────────────────────

const registerSchema = z
  .object({
    fullName: z
      .string()
      .min(2, 'Nome deve ter pelo menos 2 caracteres'),
    email: z
      .string()
      .min(1, 'E-mail é obrigatório')
      .email('Informe um e-mail válido'),
    password: z
      .string()
      .min(8, 'Senha deve ter pelo menos 8 caracteres'),
    passwordConfirmation: z.string().min(1, 'Confirmação de senha é obrigatória'),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: 'As senhas não conferem',
    path: ['passwordConfirmation'],
  })

type RegisterFormData = z.infer<typeof registerSchema>

// ── Component ─────────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const { register: registerMutation, isPending } = useRegister()

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  })

  const onSubmit = async (data: RegisterFormData) => {
    const payload = {
      fullName: data.fullName,
      email: data.email,
      password: data.password,
    }

    try {
      await registerMutation(payload)
    } catch (err) {
      const { fieldErrors, formError, isUnexpected } = parseAuthError(err)

      // Map VineJS field errors to form fields.
      // On register, any 422 email error means duplicate — show the clear message.
      if (fieldErrors.email) {
        setError('email', { message: 'Este e-mail já está em uso' })
      }
      if (fieldErrors.fullName) {
        setError('fullName', { message: fieldErrors.fullName })
      }
      if (fieldErrors.password) {
        setError('password', { message: fieldErrors.password })
      }
      if (formError) {
        if (isUnexpected) {
          toast.error(formError)
        } else {
          setError('root', { message: formError })
        }
      }
    }
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* ── Left decorative panel ── */}
      <div className="hidden md:flex md:w-1/2 bg-gradient-to-br from-primary/40 via-primary/15 to-background flex-col items-center justify-center p-12 relative overflow-hidden">
        {/* Soft blobs */}
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-72 h-72 rounded-full bg-accent/10 blur-2xl pointer-events-none" />

        <div className="relative z-10 max-w-sm space-y-8">
          {/* Wordmark */}
          <div>
            <h1 className="text-6xl font-extrabold tracking-tight text-foreground">
              Le<span className="text-primary">finance</span>
            </h1>
            <p className="mt-3 text-lg text-muted-foreground leading-relaxed">
              Crie sua conta gratuita e comece a organizar suas finanças hoje.
            </p>
          </div>

          {/* Highlight card */}
          <div className="rounded-2xl bg-surface/60 border border-primary/20 backdrop-blur-sm p-6 space-y-4 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20">
                <Sparkles className="h-4 w-4 text-primary" />
              </span>
              <span className="text-sm font-semibold text-foreground">
                Tudo que você precisa
              </span>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                Controle de lançamentos e assinaturas
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                Categorias personalizadas por workspace
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                Histórico e relatórios mensais
              </li>
            </ul>
          </div>

          {/* Accent badge */}
          <div className="inline-flex items-center gap-2 rounded-full bg-accent/30 border border-accent/40 px-4 py-1.5">
            <span className="h-2 w-2 rounded-full bg-accent" />
            <span className="text-xs font-medium text-foreground/80">
              Gratuito para começar
            </span>
          </div>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12 bg-background">
        <div className="w-full max-w-md space-y-6">
          {/* Mobile-only wordmark */}
          <div className="md:hidden text-center">
            <h1 className="text-4xl font-extrabold tracking-tight text-foreground">
              Le<span className="text-primary">finance</span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Controle de finanças familiar
            </p>
          </div>

          <Card className="rounded-2xl shadow-xl border-border/60">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-2xl font-semibold">
                Criar conta
              </CardTitle>
              <CardDescription>
                Preencha os dados abaixo para criar sua conta gratuita.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form
                onSubmit={handleSubmit(onSubmit)}
                noValidate
                className="space-y-5"
              >
                {/* Form-level error */}
                {errors.root?.message && (
                  <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3">
                    <p className="text-sm font-medium text-destructive">
                      {errors.root.message}
                    </p>
                  </div>
                )}

                {/* Nome completo */}
                <div className="space-y-1.5">
                  <Label htmlFor="fullName">Nome completo</Label>
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="Seu nome"
                    autoComplete="name"
                    aria-invalid={!!errors.fullName}
                    {...register('fullName')}
                  />
                  {errors.fullName?.message && (
                    <p className="text-xs text-destructive">
                      {errors.fullName.message}
                    </p>
                  )}
                </div>

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
                    placeholder="Mínimo 8 caracteres"
                    autoComplete="new-password"
                    aria-invalid={!!errors.password}
                    {...register('password')}
                  />
                  {errors.password?.message && (
                    <p className="text-xs text-destructive">
                      {errors.password.message}
                    </p>
                  )}
                </div>

                {/* Confirmação de senha */}
                <div className="space-y-1.5">
                  <Label htmlFor="passwordConfirmation">
                    Confirmar senha
                  </Label>
                  <Input
                    id="passwordConfirmation"
                    type="password"
                    placeholder="Repita a senha"
                    autoComplete="new-password"
                    aria-invalid={!!errors.passwordConfirmation}
                    {...register('passwordConfirmation')}
                  />
                  {errors.passwordConfirmation?.message && (
                    <p className="text-xs text-destructive">
                      {errors.passwordConfirmation.message}
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
                      Criando conta…
                    </>
                  ) : (
                    'Criar conta'
                  )}
                </Button>
              </form>

              <p className="mt-5 text-center text-sm text-muted-foreground">
                Já tem conta?{' '}
                <Link
                  to="/login"
                  className="font-medium text-primary hover:underline underline-offset-4"
                >
                  Entrar
                </Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
