import {
  Children,
  useCallback,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { cn } from '@/lib/utils'
import { activeIndexFromScroll } from './carousel-utils'

interface CarouselProps {
  children: ReactNode
  /** Classes de grade aplicadas na faixa no desktop (ex.: "lg:grid-cols-2"). */
  gridClassName?: string
  className?: string
}

/**
 * Carrossel com snap horizontal no mobile que vira grade no `lg`.
 * Os dots ficam escondidos no desktop (`lg:hidden`), onde tudo aparece de uma vez.
 */
export function Carousel({ children, gridClassName, className }: CarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const count = Children.count(children)

  const handleScroll = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    setActive(activeIndexFromScroll(el.scrollLeft, el.scrollWidth, el.clientWidth, count))
  }, [count])

  const scrollToIndex = useCallback(
    (i: number) => {
      const el = trackRef.current
      if (!el) return
      const maxScroll = el.scrollWidth - el.clientWidth
      const step = count > 1 ? maxScroll / (count - 1) : 0
      el.scrollTo({ left: step * i, behavior: 'smooth' })
    },
    [count],
  )

  return (
    <div className={className}>
      <div
        ref={trackRef}
        onScroll={handleScroll}
        className={cn(
          'flex gap-4 overflow-x-auto snap-x snap-mandatory overscroll-x-contain scroll-smooth',
          '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden',
          'lg:grid lg:gap-6 lg:overflow-visible',
          gridClassName,
        )}
      >
        {children}
      </div>
      <CarouselDots count={count} active={active} onDotClick={scrollToIndex} className="lg:hidden" />
    </div>
  )
}

export function CarouselItem({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('snap-center shrink-0 basis-full min-w-0 lg:basis-auto', className)}>
      {children}
    </div>
  )
}

interface CarouselDotsProps {
  count: number
  active: number
  onDotClick: (index: number) => void
  className?: string
}

export function CarouselDots({ count, active, onDotClick, className }: CarouselDotsProps) {
  if (count <= 1) return null
  return (
    <div
      role="tablist"
      aria-label="Navegação do dashboard"
      className={cn('mt-4 flex items-center justify-center gap-2', className)}
    >
      {Array.from({ length: count }).map((_, i) => (
        <button
          key={i}
          type="button"
          role="tab"
          aria-label={`Ir para o painel ${i + 1}`}
          aria-selected={i === active}
          onClick={() => onDotClick(i)}
          className={cn(
            'h-2 rounded-full transition-all duration-200',
            i === active ? 'w-5 bg-primary' : 'w-2 bg-muted-foreground/30',
          )}
        />
      ))}
    </div>
  )
}
