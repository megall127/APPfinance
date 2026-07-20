import { describe, it, expect } from 'vitest'
import { activeIndexFromScroll } from './carousel-utils'

describe('activeIndexFromScroll', () => {
  it('mapeia a posição de scroll para o índice do painel', () => {
    // 4 painéis, viewport 400, conteúdo 1600 => maxScroll 1200, step 400
    expect(activeIndexFromScroll(0, 1600, 400, 4)).toBe(0)
    expect(activeIndexFromScroll(400, 1600, 400, 4)).toBe(1)
    expect(activeIndexFromScroll(600, 1600, 400, 4)).toBe(2) // 1.5 arredonda p/ 2
    expect(activeIndexFromScroll(1200, 1600, 400, 4)).toBe(3)
  })
  it('trava nos limites', () => {
    expect(activeIndexFromScroll(-50, 1600, 400, 4)).toBe(0)
    expect(activeIndexFromScroll(99999, 1600, 400, 4)).toBe(3)
  })
  it('retorna 0 sem espaço de scroll ou com item único', () => {
    expect(activeIndexFromScroll(0, 400, 400, 4)).toBe(0)
    expect(activeIndexFromScroll(0, 1600, 400, 1)).toBe(0)
  })
})
