import { useEffect, useReducer, useRef, type RefObject } from 'react'
import {
  pullReducer,
  initialPullState,
  PULL_THRESHOLD,
  MIN_REFRESH_MS,
  type PullStatus,
} from './pullToRefreshCore'

function isTouchDevice(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
  )
}

export interface UsePullToRefreshResult {
  offset: number
  status: PullStatus
  /** 0..1 rumo ao limite de disparo (para animar seta/opacidade). */
  progress: number
}

/**
 * Liga os eventos de toque de um scroller ao reducer do gesto e dispara
 * `onRefresh` quando o puxão passa do limite. Só ativa em dispositivos de toque.
 */
export function usePullToRefresh(
  scrollerRef: RefObject<HTMLElement | null>,
  onRefresh: () => Promise<unknown>,
): UsePullToRefreshResult {
  const [state, dispatch] = useReducer(pullReducer, initialPullState)

  // Refs para ler estado/onRefresh atuais dentro de listeners fixos.
  const stateRef = useRef(state)
  stateRef.current = state
  const startRef = useRef({ x: 0, y: 0 })
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh

  useEffect(() => {
    const el = scrollerRef.current
    if (!el || !isTouchDevice()) return

    function handleStart(e: TouchEvent) {
      if (stateRef.current.status === 'refreshing') return
      const t = e.touches[0]
      startRef.current = { x: t.clientX, y: t.clientY }
      dispatch({ type: 'start', atTop: (el as HTMLElement).scrollTop <= 0 })
    }

    function handleMove(e: TouchEvent) {
      const s = stateRef.current
      if (!s.armed || s.status === 'refreshing') return
      const t = e.touches[0]
      const dy = t.clientY - startRef.current.y
      const dx = t.clientX - startRef.current.x
      // Só engata num puxão pra baixo predominantemente vertical
      // (evita conflito com o swipe horizontal do carrossel).
      if (dy <= 0 || Math.abs(dy) <= Math.abs(dx)) return
      e.preventDefault() // bloqueia o pull-to-refresh nativo do Chrome Android
      dispatch({ type: 'move', dy })
    }

    function handleEnd() {
      if (stateRef.current.status === 'refreshing') return
      if (stateRef.current.status === 'pulling') dispatch({ type: 'end' })
      else dispatch({ type: 'settle' })
    }

    // touchmove precisa ser NÃO-passivo para permitir preventDefault
    // (o React registra touch como passivo por padrão).
    el.addEventListener('touchstart', handleStart, { passive: true })
    el.addEventListener('touchmove', handleMove, { passive: false })
    el.addEventListener('touchend', handleEnd, { passive: true })
    el.addEventListener('touchcancel', handleEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', handleStart)
      el.removeEventListener('touchmove', handleMove)
      el.removeEventListener('touchend', handleEnd)
      el.removeEventListener('touchcancel', handleEnd)
    }
  }, [scrollerRef])

  // Dispara o refresh ao entrar em 'refreshing'; mantém o indicador por um
  // tempo mínimo para não "piscar".
  useEffect(() => {
    if (state.status !== 'refreshing') return
    let cancelled = false
    let timeoutId: ReturnType<typeof window.setTimeout> | undefined
    const started = performance.now()
    void Promise.resolve(onRefreshRef.current())
      .catch(() => {})
      .then(() => {
        const wait = Math.max(0, MIN_REFRESH_MS - (performance.now() - started))
        timeoutId = window.setTimeout(() => {
          if (!cancelled) dispatch({ type: 'settle' })
        }, wait)
      })
    return () => {
      cancelled = true
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
    }
  }, [state.status])

  const progress = Math.min(1, state.offset / PULL_THRESHOLD)
  return { offset: state.offset, status: state.status, progress }
}
