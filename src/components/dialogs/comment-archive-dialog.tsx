"use client";
import React from "react";
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { scolText, type Status } from "@/lib/types";

export interface CommentLog {
  date: string; week: string; text: string;
  planH: string; factH: string; status: string;
}

export interface CommentArchiveDialogProps {
  open: boolean;
  taskName: string;
  logs: CommentLog[];
  isDark: boolean;
  onClose: () => void;
}

export function CommentArchiveDialog({ open, taskName, logs, isDark, onClose }: CommentArchiveDialogProps) {
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="gap-0.5">
          <DialogTitle className="text-base leading-tight">📜 Архив комментариев</DialogTitle>
          <span className="text-xs" style={{ color: "var(--tracker-text-muted)" }}>{taskName}</span>
          <DialogDescription>История комментариев и статусов задачи по неделям</DialogDescription>
        </DialogHeader>

        {logs.length === 0 ? (
          <p className="text-sm text-center py-4" style={{ color: "var(--tracker-text-muted)" }}>
            Архив комментариев пуст.
          </p>
        ) : (
          <div style={{ maxHeight: "400px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
            {logs.map((log, idx) => (
              <div key={idx} style={{ background: "var(--tracker-accent-bg)", border: "1px solid var(--tracker-border)", borderRadius: "8px", padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                  <span style={{ fontSize: "11px", color: "var(--tracker-text-muted)", fontWeight: 600 }}>
                    {log.date} · Неделя {log.week}
                  </span>
                  <span style={{ fontSize: "10px", fontWeight: 500, color: scolText(log.status as Status, isDark) }}>
                    {log.status}
                  </span>
                </div>
                <p style={{ fontSize: "13px", color: "var(--tracker-text-main)", lineHeight: "1.5", margin: "0 0 6px 0", whiteSpace: "pre-wrap" }}>
                  {log.text}
                </p>
                <div style={{ display: "flex", gap: "12px", fontSize: "11px", color: "var(--tracker-text-muted)" }}>
                  <span>План: {log.planH} ч</span>
                  <span>Факт: {log.factH} ч</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
