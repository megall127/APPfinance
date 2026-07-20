/**
 * Converte a posição de scroll horizontal no índice do painel ativo, assumindo
 * painéis de largura igual (full-width) com snap. Trava entre 0 e count-1.
 */
export function activeIndexFromScroll(
  scrollLeft: number,
  scrollWidth: number,
  clientWidth: number,
  count: number,
): number {
  if (count <= 1) return 0
  const maxScroll = scrollWidth - clientWidth
  if (maxScroll <= 0) return 0
  const step = maxScroll / (count - 1)
  const idx = Math.round(scrollLeft / step)
  return Math.min(count - 1, Math.max(0, idx))
}
