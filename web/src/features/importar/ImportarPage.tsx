import { useRef, useState, useCallback } from 'react'
import { Upload, FileSpreadsheet, CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { usePreview, useCommit, type YearPreview } from './useImport'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isXlsx(file: File): boolean {
  return (
    file.name.toLowerCase().endsWith('.xlsx') ||
    file.type ===
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface DropzoneProps {
  onFile: (file: File) => void
  disabled?: boolean
}

function Dropzone({ onFile, disabled }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  function handleFile(file: File) {
    setValidationError(null)
    if (!isXlsx(file)) {
      setValidationError('Apenas arquivos .xlsx são aceitos.')
      return
    }
    onFile(file)
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFile(file)
      // Reset input so the same file can be re-selected after a reset
      e.target.value = ''
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'w-full rounded-2xl border-2 border-dashed p-10 flex flex-col items-center justify-center gap-3 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          dragOver
            ? 'border-primary bg-primary/5'
            : 'border-border bg-muted/30 hover:border-primary/60 hover:bg-muted/50',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        <Upload className="h-8 w-8 text-muted-foreground" />
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">
            Arraste o arquivo aqui ou{' '}
            <span className="text-primary underline underline-offset-2">
              clique para selecionar
            </span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Apenas arquivos .xlsx
          </p>
        </div>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="sr-only"
        onChange={handleInputChange}
        disabled={disabled}
      />
      {validationError && (
        <p className="text-sm text-destructive">{validationError}</p>
      )}
    </div>
  )
}

interface SelectedFileCardProps {
  file: File
  onClear: () => void
}

function SelectedFileCard({ file, onClear }: SelectedFileCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
      <FileSpreadsheet className="h-5 w-5 text-primary shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {file.name}
        </p>
        <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onClear}
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        Remover
      </Button>
    </div>
  )
}

interface PreviewTableProps {
  years: YearPreview[]
  isLoading: boolean
}

function PreviewTable({ years, isLoading }: PreviewTableProps) {
  const totalItems = years.reduce((s, y) => s + y.itemCount, 0)
  const totalEntries = years.reduce((s, y) => s + y.entryCount, 0)

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="pb-2 pt-4 px-6">
        <CardTitle className="text-sm font-semibold text-foreground">
          Prévia da importação
        </CardTitle>
      </CardHeader>
      <CardContent className="px-6 pb-4">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-9 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ano</TableHead>
                <TableHead className="text-right">Itens</TableHead>
                <TableHead className="text-right">Lançamentos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {years.map((y) => (
                <TableRow key={y.year}>
                  <TableCell className="font-medium">{y.year}</TableCell>
                  <TableCell className="text-right">{y.itemCount}</TableCell>
                  <TableCell className="text-right">{y.entryCount}</TableCell>
                </TableRow>
              ))}
              {/* Totals row */}
              <TableRow className="border-t-2 font-semibold bg-muted/30">
                <TableCell>Total</TableCell>
                <TableCell className="text-right">{totalItems}</TableCell>
                <TableCell className="text-right">{totalEntries}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function SuccessBanner() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
      <CheckCircle2 className="h-14 w-14 text-green-500" />
      <div>
        <p className="text-lg font-semibold text-foreground">
          Planilha importada!
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          Os dados foram processados com sucesso. Selecione um novo arquivo
          para importar novamente.
        </p>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ImportarPage() {
  const [file, setFile] = useState<File | null>(null)
  const [committed, setCommitted] = useState(false)

  const preview = usePreview()
  const commit = useCommit()

  function handleFile(f: File) {
    setFile(f)
    setCommitted(false)
    preview.reset()
    commit.reset()
    preview.mutate(f)
  }

  function handleClear() {
    setFile(null)
    setCommitted(false)
    preview.reset()
    commit.reset()
  }

  function handleCommit() {
    if (!file) return
    commit.mutate(file, {
      onSuccess: () => {
        setCommitted(true)
        setFile(null)
        preview.reset()
      },
    })
  }

  const canCommit = preview.isSuccess && !commit.isPending && !committed

  return (
    <div className="space-y-6 max-w-2xl">
      {/* ── Page header ── */}
      <div className="flex items-center gap-3">
        <FileSpreadsheet className="h-6 w-6 text-primary shrink-0" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Importar planilha
          </h1>
          <p className="text-sm text-muted-foreground">
            Carregue um arquivo .xlsx para criar itens e lançamentos mensais
          </p>
        </div>
      </div>

      {/* ── Explainer ── */}
      <Card className="rounded-2xl shadow-sm border-border/60 bg-muted/20">
        <CardContent className="px-6 py-4 text-sm text-muted-foreground space-y-1">
          <p>
            <span className="font-medium text-foreground">O que acontece:</span>{' '}
            a planilha cria ou atualiza <strong>itens</strong> (despesas,
            receitas, assinaturas) e gera <strong>lançamentos mensais</strong>{' '}
            para cada ano presente no arquivo.
          </p>
          <p>
            A operação e <span className="font-medium text-foreground">idempotente</span> — pode
            ser executada mais de uma vez com segurança sem duplicar dados.
          </p>
          <p>
            Receitas recorrentes e assinaturas de cartao sao preenchidas
            automaticamente para o ano mais recente.
          </p>
        </CardContent>
      </Card>

      {/* ── Success banner after commit ── */}
      {committed && <SuccessBanner />}

      {/* ── Dropzone ── */}
      {!committed && (
        <Dropzone onFile={handleFile} disabled={commit.isPending} />
      )}

      {/* ── Selected file ── */}
      {file && !committed && (
        <SelectedFileCard file={file} onClear={handleClear} />
      )}

      {/* ── Preview table (loading or data) ── */}
      {(preview.isPending || preview.isSuccess) && !committed && (
        <PreviewTable
          years={preview.data?.years ?? []}
          isLoading={preview.isPending}
        />
      )}

      {/* ── Preview error ── */}
      {preview.isError && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Erro ao gerar prévia:{' '}
          {preview.error?.message ?? 'Tente novamente.'}
        </div>
      )}

      {/* ── Commit error ── */}
      {commit.isError && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Erro ao importar:{' '}
          {commit.error?.message ?? 'Tente novamente.'}
        </div>
      )}

      {/* ── Confirm button ── */}
      {preview.isSuccess && !committed && (
        <div className="flex justify-end">
          <Button
            onClick={handleCommit}
            disabled={!canCommit}
            className="min-w-[180px]"
          >
            {commit.isPending ? 'Importando…' : 'Confirmar importação'}
          </Button>
        </div>
      )}
    </div>
  )
}
