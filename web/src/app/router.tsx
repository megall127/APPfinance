import { createBrowserRouter } from 'react-router-dom'
import { ProtectedRoute } from './ProtectedRoute'
import { AppLayout } from './AppLayout'

// Public pages (stubs — real forms come in Task 16)
import LoginPage from '@/features/auth/LoginPage'
import RegisterPage from '@/features/auth/RegisterPage'

// Protected pages (stubs — real pages come in Tasks 16–22)
import DashboardPage from '@/features/dashboard/DashboardPage'
import LancamentosPage from '@/features/lancamentos/LancamentosPage'
import ItensPage from '@/features/itens/ItensPage'
import CategoriasPage from '@/features/categorias/CategoriasPage'
import AssinaturasPage from '@/features/assinaturas/AssinaturasPage'
import HistoricoPage from '@/features/historico/HistoricoPage'
import ImportarPage from '@/features/importar/ImportarPage'

export const router = createBrowserRouter([
  // ── Public routes ──────────────────────────────────────────────────────────
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/register',
    element: <RegisterPage />,
  },

  // ── Protected routes (require auth → AppLayout shell) ─────────────────────
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'lancamentos', element: <LancamentosPage /> },
          { path: 'itens', element: <ItensPage /> },
          { path: 'categorias', element: <CategoriasPage /> },
          { path: 'assinaturas', element: <AssinaturasPage /> },
          { path: 'historico', element: <HistoricoPage /> },
          { path: 'importar', element: <ImportarPage /> },
        ],
      },
    ],
  },
])
