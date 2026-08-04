import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { LoaderCircle, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatBRL } from '@/lib/format'
import {
  type CloseYieldResponse,
  type ReserveSummary,
  type YieldSkipReason,
  useCloseYield,
  useReserveSummary,
} from './useReserves'

/**
 * Banner "Atualizar rendimentos" (§7.4, §6.11).
 *
 * A rotina roda sozinha ao montar a página; este banner é o caminho manual
 * visível e — principalmente — o lugar onde as caixinhas que ficaram de fora
 * (`skipped`) são EXPLICADAS. Sem isso, uma caixinha sem CDI informado somaria
 * R$ 0,00 em silêncio e o usuário não teria nenhuma pista do motivo.
 *
 * Regra de texto: nada de jargão de contabilidade na tela — o usuário fala
 * "meus rendimentos estão desatualizados", não o vocabulário do backend.
 */

// ── Vocabulário de família ────────────────────────────────────────────────────

/**
 * Mês por extenso. `MONTHS_PT` de `@/lib/format` é abreviado ("Mar") e serve a
 * gráficos e cabeçalhos; numa frase corrida a forma longa é a que soa humana.
 */
const MESES_POR_EXTENSO = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const

/** Motivos do backend (§5.4) traduzidos para o que o usuário entende. */
const MOTIVO_EM_PORTUGUES: Record<YieldSkipReason, string> = {
  base_zero: 'sem saldo no mês',
  cdi_missing: 'falta informar o CDI',
  zero_yield: 'rendimento menor que um centavo',
  before_opening: 'antes da abertura da caixinha',
}

/** "março" no ano corrente, "março de 2025" fora dele. */
function mesPorExtenso(year: number, month: number): string {
  const nome = MESES_POR_EXTENSO[month - 1] ?? String(month)
  return year === new Date().getFullYear() ? nome : `${nome} de ${year}`
}

/** '2026-03' → "março" / "março de 2025". */
function mesDoPeriodo(period: string): string {
  return mesPorExtenso(Number(period.slice(0, 4)), Number(period.slice(5, 7)))
}

/** "3 caixinhas" / "1 caixinha". */
function caixinhas(total: number): string {
  return total === 1 ? '1 caixinha' : `${total} caixinhas`
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface YieldCloseBannerProps {
  /**
   * Consolidado já carregado pela página. Quando ausente, o banner busca o mês
   * corrente por conta própria — a query key é a mesma, então não há request
   * extra se a página já estiver no mês de hoje.
   */
  summary?: ReserveSummary
}

// ── Component ─────────────────────────────────────────────────────────────────

export function YieldCloseBanner({ summary }: YieldCloseBannerProps) {
  const hoje = new Date()
  const fallback = useReserveSummary(hoje.getFullYear(), hoje.getMonth() + 1)
  const closeYield = useCloseYield()
  const [resultado, setResultado] = useState<CloseYieldResponse | null>(null)

  const data = summary ?? fallback.data
  const apuracao = data?.apuracao
  const desatualizado = apuracao?.pendente === true
  const forasteiras = resultado?.skipped ?? []

  const atualizar = useCallback(
    async (silencioso: boolean) => {
      try {
        const res = await closeYield.mutateAsync()
        setResultado(res)
        if (silencioso) return
        toast.success(
          res.totalCreditado > 0
            ? `Rendimentos atualizados · ${formatBRL(res.totalCreditado)} somados`
            : 'Tudo em dia — não havia rendimento novo para somar',
        )
      } catch {
        // No disparo automático o usuário não pediu nada: o banner continua na
        // tela com o botão manual, que é o caminho de recuperação.
        if (!silencioso) toast.error('Ocorreu um erro. Tente novamente.')
      }
    },
    [closeYield],
  )

  // Auto-atualização (§7.3): UMA vez por montagem, e daqui — este componente é o
  // único dono da mutation. Ter uma segunda instância na página fazia dois POST
  // concorrentes e deixava o botão abaixo habilitado durante o disparo automático,
  // porque cada instância enxergava só o próprio `isPending`.
  const autoDisparado = useRef(false)
  useEffect(() => {
    if (autoDisparado.current) return
    if (!desatualizado) return
    if (closeYield.isPending) return
    autoDisparado.current = true
    void atualizar(true)
  }, [desatualizado, closeYield.isPending, atualizar])

  // Nada pendente e nada a explicar: o banner some da tela.
  if (!desatualizado && forasteiras.length === 0) return null

  const titulo =
    desatualizado && apuracao?.de
      ? `Seus rendimentos estão desatualizados desde ${mesPorExtenso(apuracao.de.year, apuracao.de.month)}`
      : desatualizado
        ? 'Seus rendimentos estão desatualizados'
        : 'Rendimentos atualizados'

  const subtitulo = desatualizado
    ? apuracao?.contas
      ? `${caixinhas(apuracao.contas)} esperando o que renderam.`
      : 'Some agora o que suas caixinhas renderam.'
    : resultado && resultado.totalCreditado > 0
      ? `Somamos ${formatBRL(resultado.totalCreditado)} às suas caixinhas.`
      : 'Não havia rendimento novo para somar.'

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
      <div className="flex flex-wrap items-center gap-3">
        <Sparkles className="h-5 w-5 shrink-0 text-amber-500" />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{titulo}</p>
          <p className="text-xs text-muted-foreground">{subtitulo}</p>
        </div>

        {desatualizado && (
          <Button
            size="sm"
            onClick={() => void atualizar(false)}
            disabled={closeYield.isPending}
          >
            {closeYield.isPending && (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            )}
            Atualizar rendimentos
          </Button>
        )}
      </div>

      {forasteiras.length > 0 && (
        <div className="mt-3 border-t border-amber-200 pt-3 dark:border-amber-900">
          <p className="text-xs font-medium text-foreground">
            Estas caixinhas ficaram de fora:
          </p>
          <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
            {forasteiras.map((item) => (
              <li key={`${item.accountId}-${item.period}`}>
                <span className="font-medium text-foreground">
                  {item.accountName}
                </span>{' '}
                em {mesDoPeriodo(item.period)}:{' '}
                {MOTIVO_EM_PORTUGUES[item.reason] ?? 'não foi possível calcular'}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
