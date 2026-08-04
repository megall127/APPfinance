import { describe, it, expect } from 'vitest'
import {
  cdiKey,
  reserveAccountsKey,
  reserveMovementsKey,
  reserveStatementKey,
  reserveSummaryKey,
} from './useReserves'

// ── Query keys ────────────────────────────────────────────────────────────────
//
// Regra: TODO parâmetro que muda o resultado da requisição precisa estar na key.
// Com a mesma key, o React Query devolve o cache e não refaz a requisição, por
// mais que as opções do hook mudem — foi assim que o botão "Carregar mais" da
// aba Movimentações ficou sem efeito.

describe('query keys de reservas', () => {
  it('o limite muda a key — senão "Carregar mais" não busca nada', () => {
    const cinquenta = reserveMovementsKey('1', undefined, 50)
    const cem = reserveMovementsKey('1', undefined, 100)
    expect(cinquenta).not.toEqual(cem)
  })

  it('conta, tipo e intervalo também entram na key', () => {
    const base = reserveMovementsKey()
    expect(reserveMovementsKey('1')).not.toEqual(base)
    expect(reserveMovementsKey(undefined, 'yield')).not.toEqual(base)
    expect(reserveMovementsKey(undefined, undefined, undefined, '2026-01-01')).not.toEqual(base)
    expect(
      reserveMovementsKey(undefined, undefined, undefined, undefined, '2026-12-31'),
    ).not.toEqual(base)
  })

  it('ausência de filtro é estável (mesma key entre chamadas)', () => {
    expect(reserveMovementsKey()).toEqual(reserveMovementsKey())
    expect(reserveMovementsKey('1', 'deposit', 50)).toEqual(
      reserveMovementsKey('1', 'deposit', 50),
    )
  })

  it('toda key começa pelo prefixo raiz, que é o que as mutations invalidam', () => {
    const keys = [
      reserveAccountsKey(),
      reserveSummaryKey(2026, 7),
      reserveStatementKey('1'),
      reserveMovementsKey(),
      cdiKey(),
    ]
    for (const key of keys) {
      expect(key[0]).toBe('reserves')
    }
  })

  it('contas arquivadas e período são dimensões próprias', () => {
    expect(reserveAccountsKey(true)).not.toEqual(reserveAccountsKey(false))
    expect(reserveSummaryKey(2026, 6)).not.toEqual(reserveSummaryKey(2026, 7))
    expect(reserveStatementKey('1', 2026)).not.toEqual(reserveStatementKey('1', 2025))
  })
})
