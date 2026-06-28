import { Navigate, Outlet } from 'react-router-dom'
import { useSession } from '@/features/auth/session'

/**
 * Renders child routes only when the user is authenticated.
 * Redirects to /login (replacing history entry) otherwise.
 */
export function ProtectedRoute() {
  const { isAuthenticated } = useSession()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
