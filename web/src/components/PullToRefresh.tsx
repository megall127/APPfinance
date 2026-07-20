import { useRef, type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'

interface PullToRefreshProps {
  onRefresh: () => Promise<unknown>
  className?: string
  children: ReactNode
}

/**
 * Container de scroll principal (`<main>`) com puxar-pra-atualizar por toque.
 * No desktop (sem toque) se comporta como um `<main>` de scroll comum.
 */
export function PullToRefresh({ onRefresh, className, children }: PullToRefreshProps) {
  const scrollerRef = useRef<HTMLElement>(null)
  const { offset, status, progress } = usePullToRefresh(scrollerRef, onRefresh)
  const active = status !== 'idle' || offset > 0

  return (
    <main ref={scrollerRef} className={cn('relative overscroll-y-contain', className)}>
      {/* Indicador de refresh (sobreposto no topo) */}
      <div
        aria-hidden={!active}
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center"
        style={{
          transform: `translateY(${Math.max(offset - 44, -44)}px)`,
          opacity: active ? (status === 'refreshing' ? 1 : Math.min(1, progress + 0.2)) : 0,
          transition: status === 'idle' ? 'transform .2s ease, opacity .2s ease' : 'none',
        }}
      >
        <div className="mt-3 rounded-full border border-border bg-card p-2 shadow-md">
          <RefreshCw
            className={cn(
              'h-5 w-5 text-primary',
              status === 'refreshing' && 'animate-spin motion-reduce:animate-none',
            )}
            style={
              status === 'refreshing' ? undefined : { transform: `rotate(${progress * 270}deg)` }
            }
          />
        </div>
      </div>

      {/* Conteúdo acompanha o puxão */}
      <div
        style={{
          transform: offset > 0 ? `translateY(${offset}px)` : undefined,
          transition: status === 'idle' ? 'transform .2s ease' : 'none',
        }}
      >
        {children}
      </div>
    </main>
  )
}
