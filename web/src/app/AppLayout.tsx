import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard,
  ScrollText,
  Package,
  Tag,
  RefreshCw,
  History,
  Upload,
  LogOut,
  Menu,
  X,
  User,
  type LucideProps,
} from 'lucide-react'
import type { ForwardRefExoticComponent, RefAttributes } from 'react'
import { Button } from '@/components/ui/button'
import { useSession } from '@/features/auth/session'

// ── Nav items ─────────────────────────────────────────────────────────────────

type NavItem = {
  to: string
  label: string
  icon: ForwardRefExoticComponent<Omit<LucideProps, 'ref'> & RefAttributes<SVGSVGElement>>
  end?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/lancamentos', label: 'Lançamentos', icon: ScrollText },
  { to: '/itens', label: 'Itens', icon: Package },
  { to: '/categorias', label: 'Categorias', icon: Tag },
  { to: '/assinaturas', label: 'Assinaturas', icon: RefreshCw },
  { to: '/historico', label: 'Histórico', icon: History },
  { to: '/importar', label: 'Importar', icon: Upload },
]

// ── NavLink active style helper ───────────────────────────────────────────────

function navLinkClass({ isActive }: { isActive: boolean }) {
  const base =
    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors'
  return isActive
    ? `${base} bg-primary text-primary-foreground`
    : `${base} text-muted-foreground hover:bg-muted hover:text-foreground`
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function Sidebar({ onClose }: { onClose?: () => void }) {
  return (
    <aside className="flex h-full flex-col bg-card border-r border-border">
      {/* Wordmark */}
      <div className="flex items-center justify-between px-5 py-5">
        <span className="text-xl font-bold tracking-tight text-foreground">
          Le<span className="text-primary">finance</span>
        </span>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:text-foreground lg:hidden"
            aria-label="Fechar menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={navLinkClass}
            onClick={onClose}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}

// ── Topbar ────────────────────────────────────────────────────────────────────

function Topbar({ onMenuToggle }: { onMenuToggle: () => void }) {
  const { user, logout } = useSession()

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4 lg:px-6">
      {/* Mobile menu button */}
      <button
        onClick={onMenuToggle}
        className="rounded p-1.5 text-muted-foreground hover:text-foreground lg:hidden"
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Empty space on desktop to right-align user area */}
      <div className="hidden lg:flex flex-1" />

      {/* User + logout */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-foreground">
          <User className="h-4 w-4 text-muted-foreground" />
          <span className="hidden sm:inline font-medium">
            {user?.name ?? user?.email ?? 'Usuário'}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void logout()}
          className="text-muted-foreground hover:text-foreground gap-1.5"
          aria-label="Sair"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Sair</span>
        </Button>
      </div>
    </header>
  )
}

// ── AppLayout ─────────────────────────────────────────────────────────────────

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* ── Desktop sidebar (always visible ≥ lg) ── */}
      <div className="hidden lg:flex lg:w-56 lg:flex-col lg:shrink-0">
        <Sidebar />
      </div>

      {/* ── Mobile sidebar overlay ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          aria-hidden="true"
          onClick={() => setSidebarOpen(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" />
        </div>
      )}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-56 transition-transform duration-200 lg:hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* ── Main column: topbar + content ── */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <Topbar onMenuToggle={() => setSidebarOpen((v) => !v)} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
