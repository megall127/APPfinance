import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatBRL, formatPercentBR, MONTHS_PT } from '@/lib/format'
import { cn } from '@/lib/utils'
import { parseAmountInput } from '@/features/lancamentos/math'
import { Target } from 'lucide-react'
import {
  effectiveMonthlyRate,
  monthsToGoal,
  projectMonths,
  toCents,
} from './interest'
import type { ProjectionPoint } from './interest'
import { ProjectionChart } from './ProjectionChart'
import {
  useReserveAccounts,
  useReserveSummary,
  type RateKind,
  type ReserveAccount,
  type ReserveSummary,
} from './useReserves'

/**
 * Simulador de projeção (§5.8 e §7.4) — 100% client-side.
 *
 * `useMemo` + `useDeferredValue`: nenhuma tecla dispara request, e a curva de
 * 120 meses só recalcula depois que a digitação assenta.
 *
 * O **dia do aporte** é um campo VISÍVEL de propósito: assumir dia 1 em silêncio
 * infla uma projeção de 120 meses em centenas de reais (R$ 201.819,30 no dia 1
 * contra R$ 201.338,72 no dia 10).
 *
 * O badge de meta e o gráfico saem da MESMA recorrência (`monthsToGoal` e
 * `projectMonths` de `./interest`), portanto nunca se contradizem.
 */

// ── Presets de prazo (não existe primitivo slider no repo) ────────────────────

const PRAZO_PRESETS = [12, 24, 60, 120] as const

const RATE_KIND_LABELS: Record<RateKind, string> = {
  monthly: '% ao mês',
  yearly: '% ao ano',
  cdi: '% do CDI',
}

// ── Form (um único objeto: identidade estável para o useDeferredValue) ────────

interface SimulatorForm {
  saldoInicial: string
  aporte: string
  /** 1..31 — parte do contrato, nunca uma premissa escondida. */
  diaDoAporte: string
  rateKind: RateKind
  rateValue: string
  /** PERCENTUAL anual do CDI; só é lido quando `rateKind === 'cdi'`. */
  cdiAnual: string
  meses: string
  meta: string
}

const EMPTY_FORM: SimulatorForm = {
  saldoInicial: '',
  aporte: '',
  diaDoAporte: '1',
  rateKind: 'monthly',
  rateValue: '',
  cdiAnual: '',
  meses: '60',
  meta: '',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Reais (número) → texto pt-BR pré-preenchido, como no `ItemFormDialog`. */
function moneyToInput(v: number): string {
  return v.toFixed(2).replace('.', ',')
}

/** "102.000000" → "102"; "0.850000" → "0,85". */
function rateToInput(v: string): string {
  const parsed = Number(v)
  if (!Number.isFinite(parsed)) return ''
  return String(parsed).replace('.', ',')
}

/** Inteiro do campo, truncado ao intervalo; `fallback` quando não dá para ler. */
function parseIntField(raw: string, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(raw.trim(), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(parsed, min), max)
}

/** N meses a partir de hoje → "set/2029". */
function periodoLabel(meses: number): string {
  const hoje = new Date()
  const alvo = new Date(hoje.getFullYear(), hoje.getMonth() + meses, 1)
  return `${MONTHS_PT[alvo.getMonth()].toLowerCase()}/${alvo.getFullYear()}`
}

/** "39 meses" / "1 mês". */
function mesesLabel(meses: number): string {
  return meses === 1 ? '1 mês' : `${meses} meses`
}

// ── Resultado do cálculo ──────────────────────────────────────────────────────

interface SimulationResult {
  points: ProjectionPoint[]
  /** saldo inicial + Σ aportes, em CENTAVOS */
  totalAportadoCents: number
  rendimentoCents: number
  valorFinalCents: number
  /** fração 0..1; 0 quando a taxa não é resolvível */
  i: number
  /** meses até a meta pela MESMA recorrência da curva; null sem meta ou inalcançável */
  metaMeses: number | null
  metaInformada: boolean
  /** `kind='cdi'` sem CDI anual digitado */
  cdiFaltando: boolean
}

function simulate(form: SimulatorForm): SimulationResult {
  const saldoInicialCents = toCents(parseAmountInput(form.saldoInicial) ?? 0)
  const aporteCents = toCents(parseAmountInput(form.aporte) ?? 0)
  const diaDoAporte = parseIntField(form.diaDoAporte, 1, 1, 31)
  const meses = parseIntField(form.meses, 0, 0, 600)

  const rateValue = parseAmountInput(form.rateValue) ?? 0
  const cdiAnual = parseAmountInput(form.cdiAnual)
  const cdiFaltando = form.rateKind === 'cdi' && cdiAnual === null
  const i = effectiveMonthlyRate(form.rateKind, rateValue, cdiAnual) ?? 0

  const points = projectMonths({
    saldoInicialCents,
    aporteCents,
    i,
    meses,
    diaDoAporte,
  })
  const ultimo = points[points.length - 1]

  const metaValor = parseAmountInput(form.meta)
  const metaInformada = metaValor !== null && metaValor > 0
  const metaMeses = metaInformada
    ? monthsToGoal({
        saldoInicialCents,
        aporteCents,
        i,
        metaCents: toCents(metaValor),
        diaDoAporte,
      })
    : null

  return {
    points,
    totalAportadoCents: ultimo?.aportadoCents ?? saldoInicialCents,
    rendimentoCents: ultimo?.rendimentoCents ?? 0,
    valorFinalCents: ultimo?.saldoCents ?? saldoInicialCents,
    i,
    metaMeses,
    metaInformada,
    cdiFaltando,
  }
}

// ── Main component ────────────────────────────────────────────────────────────

interface ProjectionSimulatorProps {
  /** Consolidado já carregado pela página; quando ausente, o simulador busca. */
  summary?: ReserveSummary
  /** Contas já carregadas pela página; quando ausentes, o simulador busca. */
  accounts?: ReserveAccount[]
}

export function ProjectionSimulator({
  summary: summaryProp,
  accounts: accountsProp,
}: ProjectionSimulatorProps = {}) {
  const hoje = new Date()
  const summaryQuery = useReserveSummary(hoje.getFullYear(), hoje.getMonth() + 1)
  const accountsQuery = useReserveAccounts()

  const summary = summaryProp ?? summaryQuery.data
  const accounts = accountsProp ?? accountsQuery.data

  const [form, setForm] = useState<SimulatorForm>(EMPTY_FORM)

  function setField<K extends keyof SimulatorForm>(key: K, value: SimulatorForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // Pré-preenchimento uma única vez: depois disso o que o usuário digitou manda.
  const prefilled = useRef(false)
  useEffect(() => {
    if (prefilled.current) return
    if (!summary && !accounts) return
    prefilled.current = true
    // Taxa da MAIOR caixinha — é a que melhor representa o dinheiro do usuário.
    const maior = [...(accounts ?? [])].sort((a, b) => b.saldo - a.saldo)[0]
    setForm((prev) => ({
      ...prev,
      saldoInicial:
        summary != null ? moneyToInput(summary.totalGuardado) : prev.saldoInicial,
      // A API devolve `metaTotal: 0` (não `null`) quando nenhuma caixinha tem
      // meta; pré-preencher "0,00" mostraria uma meta que o usuário nunca definiu.
      meta:
        summary?.metaTotal != null && summary.metaTotal > 0
          ? moneyToInput(summary.metaTotal)
          : prev.meta,
      rateKind: maior?.rate.kind ?? prev.rateKind,
      rateValue: maior ? rateToInput(maior.rate.value) : prev.rateValue,
      cdiAnual:
        maior?.cdiAnnual != null ? String(maior.cdiAnnual).replace('.', ',') : prev.cdiAnual,
    }))
  }, [summary, accounts])

  // Zero request por tecla: tudo sai de `./interest`, e a curva de 120 meses
  // recalcula sobre o valor adiado, não sobre cada keystroke.
  const deferredForm = useDeferredValue(form)
  const result = useMemo(() => simulate(deferredForm), [deferredForm])

  const mesesPrazo = parseIntField(deferredForm.meses, 0, 0, 600)

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          Simulador de projeção
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Quanto o seu dinheiro vira com aportes mensais — e quando você chega na
          meta. Nada é salvo: é só uma simulação.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Entradas */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="sim-saldo-inicial">Saldo inicial</Label>
            <Input
              id="sim-saldo-inicial"
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={form.saldoInicial}
              onChange={(e) => setField('saldoInicial', e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sim-aporte">Aporte mensal</Label>
            <Input
              id="sim-aporte"
              type="text"
              inputMode="decimal"
              placeholder="1.000,00"
              value={form.aporte}
              onChange={(e) => setField('aporte', e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sim-dia">Dia do aporte</Label>
            <Input
              id="sim-dia"
              type="number"
              min={1}
              max={31}
              value={form.diaDoAporte}
              onChange={(e) => setField('diaDoAporte', e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              O dinheiro rende a partir do dia em que entra.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Tipo de taxa</Label>
            <Select
              value={form.rateKind}
              onValueChange={(v) => setField('rateKind', v as RateKind)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['monthly', 'yearly', 'cdi'] as RateKind[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {RATE_KIND_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sim-taxa">Valor da taxa</Label>
            <div className="relative">
              <Input
                id="sim-taxa"
                type="text"
                inputMode="decimal"
                placeholder="0,85"
                className="pr-24"
                value={form.rateValue}
                onChange={(e) => setField('rateValue', e.target.value)}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                {RATE_KIND_LABELS[form.rateKind]}
              </span>
            </div>
          </div>

          {form.rateKind === 'cdi' && (
            <div className="space-y-1.5">
              <Label htmlFor="sim-cdi">CDI anual</Label>
              <div className="relative">
                <Input
                  id="sim-cdi"
                  type="text"
                  inputMode="decimal"
                  placeholder="14,9"
                  className="pr-16"
                  value={form.cdiAnual}
                  onChange={(e) => setField('cdiAnual', e.target.value)}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  % a.a.
                </span>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="sim-meta">Meta (opcional)</Label>
            <Input
              id="sim-meta"
              type="text"
              inputMode="decimal"
              placeholder="30.000,00"
              value={form.meta}
              onChange={(e) => setField('meta', e.target.value)}
            />
          </div>
        </div>

        {/* Prazo: presets + campo numérico */}
        <div className="space-y-1.5">
          <Label htmlFor="sim-meses">Prazo (meses)</Label>
          <div className="flex flex-wrap items-center gap-2">
            {PRAZO_PRESETS.map((preset) => (
              <Button
                key={preset}
                type="button"
                size="sm"
                variant={mesesPrazo === preset ? 'default' : 'outline'}
                onClick={() => setField('meses', String(preset))}
              >
                {preset} meses
              </Button>
            ))}
            <Input
              id="sim-meses"
              type="number"
              min={1}
              max={600}
              className="w-24"
              value={form.meses}
              onChange={(e) => setField('meses', e.target.value)}
            />
          </div>
        </div>

        {/* Saídas */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">Total aportado</p>
            <p className="mt-1 truncate text-lg font-semibold text-foreground tabular-nums">
              {formatBRL(result.totalAportadoCents / 100)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              saldo inicial + aportes
            </p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">Rendimento no período</p>
            <p className="mt-1 truncate text-lg font-semibold text-primary-strong tabular-nums">
              {formatBRL(result.rendimentoCents / 100)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {result.i > 0
                ? `${formatPercentBR(result.i)} ao mês`
                : 'Informe a taxa para ver o rendimento'}
            </p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">Valor final</p>
            <p className="mt-1 truncate text-lg font-semibold text-foreground tabular-nums">
              {formatBRL(result.valorFinalCents / 100)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              em {mesesLabel(mesesPrazo)}
            </p>
          </div>
        </div>

        {result.cdiFaltando && (
          <p className="text-xs text-muted-foreground">
            Informe o CDI anual para simular uma taxa em % do CDI.
          </p>
        )}

        {/* Badge de meta — MESMA função que alimenta a curva */}
        {result.metaInformada && (
          <div
            className={cn(
              'flex items-center gap-2 rounded-xl px-4 py-3 text-sm',
              result.metaMeses === null
                ? 'bg-muted text-muted-foreground'
                : 'bg-primary/10 text-primary-strong',
            )}
          >
            <Target className="h-4 w-4 shrink-0" />
            <span>
              {result.metaMeses === null
                ? 'Nesse ritmo, a meta não é alcançada nos próximos 50 anos.'
                : result.metaMeses === 0
                  ? 'Você já atingiu a meta.'
                  : `Você atinge sua meta em ${periodoLabel(result.metaMeses)} (${mesesLabel(result.metaMeses)})`}
            </span>
          </div>
        )}

        <ProjectionChart points={result.points} />
      </CardContent>
    </Card>
  )
}
