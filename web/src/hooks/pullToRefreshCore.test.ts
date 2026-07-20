import { describe, it, expect } from 'vitest'
import {
  computePullOffset,
  shouldTriggerRefresh,
  pullReducer,
  initialPullState,
  PULL_RESTING,
} from './pullToRefreshCore'

describe('computePullOffset', () => {
  it('aplica resistência (0.5)', () => {
    expect(computePullOffset(200)).toBe(100)
  })
  it('limita no máximo', () => {
    expect(computePullOffset(1000)).toBe(120)
  })
  it('ignora puxão pra cima ou zero', () => {
    expect(computePullOffset(0)).toBe(0)
    expect(computePullOffset(-50)).toBe(0)
  })
})

describe('shouldTriggerRefresh', () => {
  it('dispara no limite (70) ou acima', () => {
    expect(shouldTriggerRefresh(70)).toBe(true)
    expect(shouldTriggerRefresh(71)).toBe(true)
  })
  it('não dispara abaixo do limite', () => {
    expect(shouldTriggerRefresh(69)).toBe(false)
  })
})

describe('pullReducer', () => {
  it("'start' no topo arma o gesto", () => {
    const s = pullReducer(initialPullState, { type: 'start', atTop: true })
    expect(s.armed).toBe(true)
  })
  it("'start' fora do topo não arma", () => {
    const s = pullReducer(initialPullState, { type: 'start', atTop: false })
    expect(s.armed).toBe(false)
  })
  it("'move' armado entra em pulling com offset", () => {
    const armed = { status: 'idle' as const, offset: 0, armed: true }
    const s = pullReducer(armed, { type: 'move', dy: 200 })
    expect(s.status).toBe('pulling')
    expect(s.offset).toBe(100)
  })
  it("'move' sem armar é ignorado", () => {
    const s = pullReducer(initialPullState, { type: 'move', dy: 200 })
    expect(s.status).toBe('idle')
    expect(s.offset).toBe(0)
  })
  it("'end' acima do limite vai pra refreshing", () => {
    const pulling = { status: 'pulling' as const, offset: 100, armed: true }
    const s = pullReducer(pulling, { type: 'end' })
    expect(s.status).toBe('refreshing')
    expect(s.offset).toBe(PULL_RESTING)
  })
  it("'end' abaixo do limite volta pra idle", () => {
    const pulling = { status: 'pulling' as const, offset: 40, armed: true }
    const s = pullReducer(pulling, { type: 'end' })
    expect(s.status).toBe('idle')
    expect(s.offset).toBe(0)
  })
  it("'settle' zera o estado", () => {
    const refreshing = { status: 'refreshing' as const, offset: PULL_RESTING, armed: false }
    const s = pullReducer(refreshing, { type: 'settle' })
    expect(s).toEqual(initialPullState)
  })
})
