export const PULL_THRESHOLD = 70
export const PULL_MAX_OFFSET = 120
export const PULL_RESISTANCE = 0.5
export const PULL_RESTING = 56
export const MIN_REFRESH_MS = 500

export type PullStatus = 'idle' | 'pulling' | 'refreshing'

export interface PullState {
  status: PullStatus
  offset: number
  armed: boolean
}

export const initialPullState: PullState = { status: 'idle', offset: 0, armed: false }

export type PullAction =
  | { type: 'start'; atTop: boolean }
  | { type: 'move'; dy: number }
  | { type: 'end' }
  | { type: 'settle' }

/** Deslocamento com resistência, limitado ao teto. Puxão pra cima → 0. */
export function computePullOffset(dy: number): number {
  if (dy <= 0) return 0
  return Math.min(dy * PULL_RESISTANCE, PULL_MAX_OFFSET)
}

export function shouldTriggerRefresh(offset: number): boolean {
  return offset >= PULL_THRESHOLD
}

export function pullReducer(state: PullState, action: PullAction): PullState {
  switch (action.type) {
    case 'start':
      // Só arma quando o scroller está no topo.
      return { status: 'idle', offset: 0, armed: action.atTop }
    case 'move': {
      if (!state.armed) return state
      const offset = computePullOffset(action.dy)
      if (offset <= 0) return { ...state, status: 'idle', offset: 0 }
      return { ...state, status: 'pulling', offset }
    }
    case 'end':
      if (state.status !== 'pulling') return { ...initialPullState }
      return shouldTriggerRefresh(state.offset)
        ? { status: 'refreshing', offset: PULL_RESTING, armed: false }
        : { ...initialPullState }
    case 'settle':
      return { ...initialPullState }
    default:
      return state
  }
}
