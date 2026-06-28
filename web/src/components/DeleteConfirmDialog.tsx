import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// ── Shared delete-confirmation dialog ──────────────────────────────────────────
//
// Used by ItensPage and AssinaturasPage (and extendable to others).
// Handles the spinner, disabled states, and standard title/footer.

interface DeleteConfirmDialogProps {
  open: boolean
  /**
   * Article + entity type, e.g. "o item" or "a assinatura".
   * Rendered as "Deseja excluir {entityLabel} {entityName}?"
   */
  entityLabel: string
  /** The specific record name to highlight in the body. */
  entityName: string | undefined
  /** Secondary sentence shown below, e.g. deactivation vs deletion note. */
  hint: string
  onConfirm: () => void
  onCancel: () => void
  isPending: boolean
}

export function DeleteConfirmDialog({
  open,
  entityLabel,
  entityName,
  hint,
  onConfirm,
  onCancel,
  isPending,
}: DeleteConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Confirmar exclusão</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Deseja excluir {entityLabel}{' '}
          <span className="font-semibold text-foreground">{entityName}</span>?{' '}
          <span className="block mt-1">{hint}</span>
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin mr-1" />
                Aguarde…
              </>
            ) : (
              'Excluir'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
