"use client";
import React from "react";
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";

export interface ImportConfirmDialogProps {
  open: boolean;
  file: File | null;
  onConfirm: () => void;
  onClose: () => void;
}

export function ImportConfirmDialog({ open, file, onConfirm, onClose }: ImportConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Загрузить JSON?</DialogTitle>
          <DialogDescription>Текущие данные будут заменены данными из файла. Продолжить?</DialogDescription>
        </DialogHeader>
        {file && (
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <span className="font-medium">Файл:</span> {file.name}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Отмена</Button>
          <Button onClick={onConfirm}>
            <Upload className="size-4 mr-1.5" />Загрузить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
