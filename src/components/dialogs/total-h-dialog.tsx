"use client";
import React from "react";
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { MONTHS, scolText, type Status } from "@/lib/types";
import { fmt2 } from "@/lib/metrics";

interface MonthRow {
  month: number; planH: number; factH: number;
  cumulative: number; status: string;
}

export interface TotalHDialogProps {
  open: boolean;
  taskNum: string;
  taskName: string;
  rows: MonthRow[];
  isDark: boolean;
  onClose: () => void;
}

export function TotalHDialog({ open, taskNum, taskName, rows, isDark, onClose }: TotalHDialogProps) {
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg" style={{ background: "#ffffff", color: "#1a1a2e", border: "1px solid #e2e8f0" }}>
        <DialogHeader className="gap-0.5">
          <span style={{ fontSize: "12px", color: "#94a3b8" }}>Задача #{taskNum}</span>
          <DialogTitle className="text-base leading-tight" style={{ color: "#1a1a2e" }}>
            {taskName || "Задача"}
          </DialogTitle>
          <DialogDescription>Разбивка часов по месяцам для задачи</DialogDescription>
        </DialogHeader>

        {rows.length === 0 ? (
          <p style={{ fontSize: "14px", color: "#94a3b8", padding: "16px 0", textAlign: "center" }}>
            Нет данных по часам для этой задачи.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {/* Bar chart */}
            <div>
              <div style={{ display: "flex", alignItems: "flex-end", height: "100px", gap: "6px" }}>
                {rows.map((r) => {
                  const maxVal = Math.max(...rows.map(x => Math.max(x.planH, x.cumulative)), 1);
                  const planPx = Math.max((r.planH / maxVal) * 100, 2);
                  const cumPx  = Math.max((r.cumulative / maxVal) * 100, 2);
                  const over   = r.cumulative > r.planH && r.planH > 0;
                  return (
                    <div key={r.month} style={{ flex: "1", display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0, background: "#f1f5f9", borderRadius: "4px 4px 0 0", padding: "0 2px 4px 2px" }}>
                      <span style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px", lineHeight: "1", fontWeight: 600 }}>
                        {MONTHS[r.month].substring(0, 3).toLowerCase()}
                      </span>
                      <div style={{ width: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center", gap: "1px", height: "72px" }}>
                        <div style={{ flex: "1", borderRadius: "2px 2px 0 0", height: `${planPx}%`, background: "#94a3b8", minHeight: "2px" }} title={`План: ${fmt2(r.planH)} ч`} />
                        <div style={{ flex: "1", borderRadius: "2px 2px 0 0", height: `${cumPx}%`, background: over ? "#ef4444" : "#22c55e", minHeight: "2px" }} title={`Итого: ${fmt2(r.cumulative)} ч`} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", fontSize: "10px", color: "#94a3b8", marginTop: "6px" }}>
                {[["#94a3b8", "План"], ["#22c55e", "Итого"], ["#ef4444", "Превышение"]].map(([bg, label]) => (
                  <span key={label} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "2px", background: bg }} />{label}
                  </span>
                ))}
              </div>
            </div>

            {/* Table */}
            <div style={{ borderRadius: "8px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
              <table style={{ width: "100%", fontSize: "14px", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f1f5f9", fontSize: "10px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {["Месяц", "План", "Факт", "Итого", "Статус"].map((h, i) => (
                      <th key={h} style={{ textAlign: i === 0 ? "left" : i === 4 ? "center" : "right", padding: "6px 10px", fontWeight: 500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const over = r.cumulative > r.planH && r.planH > 0;
                    return (
                      <tr key={r.month} style={{ borderTop: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "6px 10px", fontWeight: 500, fontSize: "12px" }}>{MONTHS[r.month]}</td>
                        <td style={{ textAlign: "right", padding: "6px 10px", fontSize: "12px", color: "#94a3b8" }}>{fmt2(r.planH)} ч</td>
                        <td style={{ textAlign: "right", padding: "6px 10px", fontSize: "12px" }}>{fmt2(r.factH)} ч</td>
                        <td style={{ textAlign: "right", padding: "6px 10px", fontSize: "12px", fontWeight: 600, color: over ? "#ef4444" : "#22c55e" }}>{fmt2(r.cumulative)} ч</td>
                        <td style={{ textAlign: "center", padding: "6px 10px" }}>
                          <span style={{ fontSize: "10px", fontWeight: 500, color: scolText(r.status as Status, isDark) }}>{r.status}</span>
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length > 0 && (() => {
                    const maxPlan = Math.max(...rows.map(r => r.planH));
                    const sumFact = rows.reduce((s, r) => s + r.factH, 0);
                    const maxCum  = Math.max(...rows.map(r => r.cumulative));
                    const inPlan  = maxCum <= maxPlan;
                    return (
                      <tr style={{ borderTop: "2px solid #e2e8f0", background: "#f8fafc", fontWeight: 700 }}>
                        <td style={{ padding: "6px 10px", fontSize: "12px" }}>Итого</td>
                        <td style={{ textAlign: "right", padding: "6px 10px", fontSize: "12px", color: "#94a3b8" }}>{fmt2(maxPlan)} ч</td>
                        <td style={{ textAlign: "right", padding: "6px 10px", fontSize: "12px" }}>{fmt2(sumFact)} ч</td>
                        <td style={{ textAlign: "right", padding: "6px 10px", fontSize: "12px", fontWeight: 700, color: inPlan ? "#22c55e" : "#ef4444" }}>{fmt2(maxCum)} ч</td>
                        <td style={{ textAlign: "center", padding: "6px 10px", fontSize: "10px", color: "#94a3b8" }}>{rows.length} мес.</td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
