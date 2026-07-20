import { render, fireEvent, screen } from '@testing-library/react'
import { useRef } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usePullToRefresh } from './usePullToRefresh'

function Harness({ onRefresh }: { onRefresh: () => Promise<unknown> }) {
  const ref = useRef<HTMLDivElement>(null)
  const { status } = usePullToRefresh(ref, onRefresh)
  return (
    <div>
      <div data-testid="scroller" ref={ref} style={{ height: 100, overflow: 'auto' }}>
        conteúdo
      </div>
      <span data-testid="status">{status}</span>
    </div>
  )
}

function setScrollTop(el: HTMLElement, value: number) {
  Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => value })
}

beforeEach(() => {
  // jsdom não implementa matchMedia; simulamos um dispositivo de toque.
  window.matchMedia = vi.fn().mockReturnValue({
    matches: true,
    media: '(pointer: coarse)',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia
})

describe('usePullToRefresh', () => {
  it('chama onRefresh ao puxar além do limite a partir do topo', () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    render(<Harness onRefresh={onRefresh} />)
    const scroller = screen.getByTestId('scroller')
    setScrollTop(scroller, 0)

    fireEvent.touchStart(scroller, { touches: [{ clientX: 0, clientY: 0 }] })
    fireEvent.touchMove(scroller, { touches: [{ clientX: 0, clientY: 200 }] })
    fireEvent.touchEnd(scroller, { changedTouches: [{ clientX: 0, clientY: 200 }] })

    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('status').textContent).toBe('refreshing')
  })

  it('não dispara quando o scroll não está no topo', () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    render(<Harness onRefresh={onRefresh} />)
    const scroller = screen.getByTestId('scroller')
    setScrollTop(scroller, 120)

    fireEvent.touchStart(scroller, { touches: [{ clientX: 0, clientY: 0 }] })
    fireEvent.touchMove(scroller, { touches: [{ clientX: 0, clientY: 200 }] })
    fireEvent.touchEnd(scroller, { changedTouches: [{ clientX: 0, clientY: 200 }] })

    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('não dispara em dispositivo sem toque', () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      media: '(pointer: coarse)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as unknown as typeof window.matchMedia
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    render(<Harness onRefresh={onRefresh} />)
    const scroller = screen.getByTestId('scroller')
    setScrollTop(scroller, 0)

    fireEvent.touchStart(scroller, { touches: [{ clientX: 0, clientY: 0 }] })
    fireEvent.touchMove(scroller, { touches: [{ clientX: 0, clientY: 200 }] })
    fireEvent.touchEnd(scroller, { changedTouches: [{ clientX: 0, clientY: 200 }] })

    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('não cancela o refresh se um toque acidental acontecer durante a atualização', () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined)
    render(<Harness onRefresh={onRefresh} />)
    const scroller = screen.getByTestId('scroller')
    setScrollTop(scroller, 0)

    // dispara o refresh
    fireEvent.touchStart(scroller, { touches: [{ clientX: 0, clientY: 0 }] })
    fireEvent.touchMove(scroller, { touches: [{ clientX: 0, clientY: 200 }] })
    fireEvent.touchEnd(scroller, { changedTouches: [{ clientX: 0, clientY: 200 }] })
    expect(screen.getByTestId('status').textContent).toBe('refreshing')

    // um toque acidental durante o refresh NÃO deve voltar pra idle
    fireEvent.touchStart(scroller, { touches: [{ clientX: 0, clientY: 0 }] })
    fireEvent.touchEnd(scroller, { changedTouches: [{ clientX: 0, clientY: 0 }] })
    expect(screen.getByTestId('status').textContent).toBe('refreshing')

    expect(onRefresh).toHaveBeenCalledTimes(1)
  })
})
