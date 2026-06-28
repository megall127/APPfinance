import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { toast } from 'sonner'
import api from '@/lib/api'
import { useSession } from '@/features/auth/session'

// ── API response shape ────────────────────────────────────────────────────────

interface AuthResponse {
  user: { id: string; name: string; email: string }
  token: { type: string; value: string }
  workspace: { id: string; name: string }
}

// ── VineJS error shape ────────────────────────────────────────────────────────

interface VineError {
  field: string
  message: string
  rule: string
}

// ── Parsed error types ────────────────────────────────────────────────────────

export interface FieldErrors {
  [field: string]: string
}

export interface ParsedAuthError {
  fieldErrors: FieldErrors
  formError: string | null
  isUnexpected: boolean
}

// ── Error parser ──────────────────────────────────────────────────────────────

export function parseAuthError(error: unknown): ParsedAuthError {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status
    const data = error.response?.data as { errors?: VineError[] } | undefined

    // VineJS validation errors (duplicate email, field validation, etc.)
    if (status === 422 && Array.isArray(data?.errors)) {
      const fieldErrors: FieldErrors = {}
      for (const e of data.errors as VineError[]) {
        if (!fieldErrors[e.field]) {
          fieldErrors[e.field] = e.message
        }
      }
      return { fieldErrors, formError: null, isUnexpected: false }
    }

    // Wrong credentials
    if (status === 401) {
      return {
        fieldErrors: {},
        formError: 'E-mail ou senha inválidos',
        isUnexpected: false,
      }
    }
  }

  // Network error or unexpected server error
  return {
    fieldErrors: {},
    formError: 'Ocorreu um erro inesperado. Tente novamente.',
    isUnexpected: true,
  }
}

// ── Input types ───────────────────────────────────────────────────────────────

export interface LoginInput {
  email: string
  password: string
}

export interface RegisterInput {
  fullName: string
  email: string
  password: string
}

// ── useLogin ──────────────────────────────────────────────────────────────────

export function useLogin() {
  const navigate = useNavigate()
  const session = useSession()

  const mutation = useMutation({
    mutationFn: async (data: LoginInput) => {
      const res = await api.post<AuthResponse>('/auth/login', data)
      return res.data
    },
    onSuccess: (data) => {
      session.login({
        token: data.token.value,
        user: data.user,
        workspace: data.workspace,
      })
      toast.success('Bem-vindo!')
      navigate('/')
    },
  })

  return {
    login: mutation.mutateAsync,
    isPending: mutation.isPending,
  }
}

// ── useRegister ───────────────────────────────────────────────────────────────

export function useRegister() {
  const navigate = useNavigate()
  const session = useSession()

  const mutation = useMutation({
    mutationFn: async (data: RegisterInput) => {
      const res = await api.post<AuthResponse>('/auth/register', data)
      return res.data
    },
    onSuccess: (data) => {
      session.login({
        token: data.token.value,
        user: data.user,
        workspace: data.workspace,
      })
      toast.success('Conta criada com sucesso!')
      navigate('/')
    },
  })

  return {
    register: mutation.mutateAsync,
    isPending: mutation.isPending,
  }
}
