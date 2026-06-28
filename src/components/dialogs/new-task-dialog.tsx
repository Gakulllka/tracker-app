"use client";
import React, { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import {
  STATUSES, PRIORITIES, MONTHS, PCOL, scolText,
  type Status, type Priority, type Task,
} from "@/lib/types";
import { useTaskStore } from "@/lib/store";

export interface NewTaskDialogProps {
  open: boolean;
  month: number;
  year: number;
  onClose: () => void;
}

const DEFAULT_DRAFT = {
  num: "", name: "", planH: "",
  priority: PRIORITIES.MEDIUM as Priority,
  status: STATUSES.NEW as Status,
};

export function NewTaskDialog({ open, month, year, onClose }: NewTaskDialogProps) {
  const [draft, setDraft] = useState(DEFAULT_DRAFT);

  const reset = () => setDraft(DEFAULT_DRAFT);

  const handleClose = () => { reset(); onClose(); };

  const handleCreate = () => {
    if (!draft.name.trim()) return;
    const task: Task = {
      id: crypto.randomUUID(),
      num: draft.num,
      name: draft.name,
      planH: draft.planH || "0",
      factH: "0",
      priority: draft.priority,
      status: draft.status,
      comment: "",
      commentLog: [],
      _ts: Date.now(),
      statusChangedAt: new Date().toISOString(),
      daysInStatus: 0,
      approvalStatus: "approved",
    };
    useTaskStore.getState().addTasksToMonth(month, [task]);
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-md" style={{ background: "var(--tracker-bg-card, var(--card))", border: "1px solid var(--tracker-border, var(--border))" }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center text-sm" style={{ background: "var(--tracker-accent-bg)", color: "var(--tracker-accent-fg-dark)" }}>＋</span>
            Новая задача
          </DialogTitle>
          <DialogDescription className="text-xs">{MONTHS[month]} {year}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 pt-1">
          <div className="grid grid-cols-[80px_1fr] gap-2">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: "var(--tracker-text-muted)" }}>№</label>
              <Input value={draft.num} onChange={e => setDraft(d => ({ ...d, num: e.target.value }))}
                placeholder="—" className="h-9 text-sm"
                style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-bg, var(--background))" }} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: "var(--tracker-text-muted)" }}>Наименование *</label>
              <Input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                placeholder="Название задачи" className="h-9 text-sm" autoFocus
                style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-bg, var(--background))" }}
                onKeyDown={e => { if (e.key === "Enter") handleCreate(); }} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: "var(--tracker-text-muted)" }}>План, ч</label>
              <Input value={draft.planH} onChange={e => setDraft(d => ({ ...d, planH: e.target.value }))}
                placeholder="0" className="h-9 text-sm"
                style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-bg, var(--background))" }} />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: "var(--tracker-text-muted)" }}>Приоритет</label>
              <Select value={draft.priority} onValueChange={v => setDraft(d => ({ ...d, priority: v as Priority }))}>
                <SelectTrigger className="h-9 text-xs" style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-bg, var(--background))" }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(PRIORITIES).map(p => (
                    <SelectItem key={p} value={p} className="text-xs">
                      <span style={{ color: PCOL[p] }}>{p}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: "var(--tracker-text-muted)" }}>Статус</label>
              <Select value={draft.status} onValueChange={v => setDraft(d => ({ ...d, status: v as Status }))}>
                <SelectTrigger className="h-9 text-xs" style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-bg, var(--background))" }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(STATUSES).map(s => (
                    <SelectItem key={s} value={s} className="text-xs">
                      <span style={{ color: scolText(s, false) || "#888" }}>{s}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 mt-2">
          <Button variant="outline" size="sm" onClick={handleClose}>Отмена</Button>
          <Button size="sm" disabled={!draft.name.trim()} onClick={handleCreate}
            className="gap-1.5" style={{ background: "var(--tracker-accent)", color: "#fff" }}>
            <Plus className="size-3.5" />Создать задачу
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
