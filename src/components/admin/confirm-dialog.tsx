"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, X, Trash2 } from "lucide-react";

/** Подтверждение опасного действия в админ-панели. */

export function ConfirmDialog({ open, title, message, onConfirm, onCancel }: {
  open: boolean; title: string; message: string; onConfirm: () => void; onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div className="bg-[var(--tracker-bg-card)] rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-[color-mix(in_srgb,var(--tracker-danger)_16%,transparent)] flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-[var(--tracker-danger)]" />
          </div>
          <h3 className="text-lg font-semibold text-[var(--tracker-text-main)]">{title}</h3>
        </div>
        <p className="text-sm text-[var(--tracker-text-muted)] mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={onCancel} className="gap-2"><X className="w-4 h-4" /> Отмена</Button>
          <Button className="bg-[var(--tracker-danger)] hover:bg-[var(--tracker-danger)] text-white gap-2" onClick={onConfirm}>
            <Trash2 className="w-4 h-4" /> Подтвердить
          </Button>
        </div>
      </div>
    </div>
  );
}
