"use client";
import React from "react";
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowRight } from "lucide-react";
import { MONTHS } from "@/lib/types";

export interface TransferDialogProps {
  open: boolean;
  currentMonth: number;
  transferTarget: number;
  onTargetChange: (month: number) => void;
  onTransfer: () => void;
  onClose: () => void;
}

export function TransferDialog({
  open, currentMonth, transferTarget,
  onTargetChange, onTransfer, onClose,
}: TransferDialogProps) {
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm" style={{ background: "var(--tracker-bg-card, var(--card))", border: "1px solid var(--tracker-border, var(--border))" }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "var(--tracker-accent-bg)", color: "var(--tracker-accent)" }}><ArrowRight className="size-4" /></span>
            Перенос задач
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            Незавершённые задачи будут скопированы в выбранный месяц с обнулением факта.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="flex items-center gap-2 rounded-xl px-4 py-3" style={{ background: "var(--tracker-accent-bg)", border: "1px solid var(--tracker-border)" }}>
            <div className="flex-1 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "var(--tracker-text-muted)" }}>Из</p>
              <p className="text-sm font-bold" style={{ color: "var(--tracker-accent-fg-dark)" }}>{MONTHS[currentMonth]}</p>
            </div>
            <span className="text-lg opacity-50">→</span>
            <div className="flex-1 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "var(--tracker-text-muted)" }}>В</p>
              <p className="text-sm font-bold" style={{ color: transferTarget >= 0 ? "var(--tracker-accent-fg-dark)" : "var(--tracker-text-muted)" }}>
                {transferTarget >= 0 ? MONTHS[transferTarget] : "не выбран"}
              </p>
            </div>
          </div>

          <Select value={transferTarget >= 0 ? String(transferTarget) : undefined} onValueChange={v => onTargetChange(Number(v))}>
            <SelectTrigger style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-bg, var(--background))" }}>
              <SelectValue placeholder="Выберите целевой месяц…" />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => i !== currentMonth ? <SelectItem key={m} value={String(i)}>{m}</SelectItem> : null)}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Отмена</Button>
          <Button size="sm" onClick={onTransfer} disabled={transferTarget < 0}
            style={{ background: "var(--tracker-accent)", color: "#fff" }} className="gap-1.5">
            <ArrowRight className="size-3.5" />Перенести
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
