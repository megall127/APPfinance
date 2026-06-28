import { createContext, useContext, useState, type ReactNode } from 'react'
import api from '@/lib/api'
import { TOKEN_KEY, USER_KEY, WORKSPACE_KEY, clearSession } from '@/lib/constants'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SessionUser {
  id: string
  name: string
  email: string
}

export interface SessionWorkspace {
  id: string
  name: string
}

export interface LoginPayload {
  token: string
  user: SessionUser
  workspace: SessionWorkspace
}

interface SessionState {
  token: string | null
  user: SessionUser | null
  workspace: SessionWorkspace | null
}

interface SessionContextValue extends SessionState {
  isAuthenticated: boolean
  login: (data: LoginPayload) => void
  logout: () => Promise<void>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

// ── Context ───────────────────────────────────────────────────────────────────

const SessionContext = createContext<SessionContextValue | null>(null)

// ── Provider ──────────────────────────────────────────────────────────────────

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>(() => ({
    token: localStorage.getItem(TOKEN_KEY),
    user: readJSON<SessionUser>(USER_KEY),
    workspace: readJSON<SessionWorkspace>(WORKSPACE_KEY),
  }))

  const login = ({ token, user, workspace }: LoginPayload) => {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspace))
    setState({ token, user, workspace })
  }

  const logout = async () => {
    try {
      await api.post('/auth/logout')
    } catch {
      // best-effort — ignore errors (e.g. network down, already expired)
    }
    clearSession()
    setState({ token: null, user: null, workspace: null })
    // Full navigation to clear all React state; consistent with api.ts 401 handler.
    window.location.href = '/login'
  }

  const value: SessionContextValue = {
    ...state,
    isAuthenticated: Boolean(state.token),
    login,
    logout,
  }

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) {
    throw new Error('useSession must be called inside <SessionProvider>')
  }
  return ctx
}
