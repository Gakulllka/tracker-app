import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface DeleteTaskDialogProps {
  open: boolean;
  /** Название задачи — показывается в тексте предупреждения. */
  taskName: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Подтверждение удаления задачи.
 *
 * Удаление в трекере мягкое: задача помечается `_deleted` и уходит в корзину,
 * а физически исчезает через 60 дней. Но для пользователя это конец истории,
 * поэтому формулировка предупреждения жёсткая.
 */
export function DeleteTaskDialog({
  open,
  taskName,
  onCancel,
  onConfirm,
}: DeleteTaskDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center sm:text-left">
          <div className="flex flex-col items-center sm:items-start gap-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-red-50">
              <AlertTriangle className="size-5 text-red-500" />
            </div>
            <div>
              <DialogTitle className="text-lg">Удалить задачу?</DialogTitle>
              <DialogDescription className="mt-0.5">
                Задача <strong>{taskName}</strong> будет удалена безвозвратно.
                Это действие нельзя отменить.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogFooter className="flex flex-row gap-2 sm:justify-end">
          <Button variant="outline" onClick={onCancel}>
            Отмена
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Удалить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
