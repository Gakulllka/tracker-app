"use client";
import React from "react";
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { MONTHS, type Status } from "@/lib/types";
import { scolText } from "@/lib/tokens";
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
      <DialogContent className="sm:max-w-lg" style={{ background: "var(--tracker-bg-card)", color: "var(--tracker-text-main)", border: "1px solid var(--tracker-border)" }}>
        <DialogHeader className="gap-0.5">
          <span style={{ fontSize: "12px", color: "var(--tracker-text-muted)" }}>Задача #{taskNum}</span>
          <DialogTitle className="text-base leading-tight" style={{ color: "var(--tracker-text-main)" }}>
            {taskName || "Задача"}
          </DialogTitle>
          <DialogDescription>Разбивка часов по месяцам для задачи</DialogDescription>
        </DialogHeader>

        {rows.length === 0 ? (
          <p style={{ fontSize: "14px", color: "var(--tracker-text-muted)", padding: "16px 0", textAlign: "center" }}>
            Нет данных по часам для этой задачи.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {/* Bar chart */}
            <div>
              <div className="hours-chart">
                {rows.map((r) => {
                  const maxVal = Math.max(...rows.map(x => Math.max(x.planH, x.cumulative)), 1);
                  const planPx = Math.max((r.planH / maxVal) * 100, 2);
                  const cumPx  = Math.max((r.cumulative / maxVal) * 100, 2);
                  const over   = r.cumulative > r.planH && r.planH > 0;
                  return (
                    <div key={r.month} className="hours-chart-col">
                      <div className="hours-chart-bars">
                        <div
                          className="hours-chart-bar hours-chart-bar--plan"
                          style={{ height: `${planPx}%` }}
                          title={`План: ${fmt2(r.planH)} ч`}
                        />
                        <div
                          className="hours-chart-bar hours-chart-bar--fact"
                          style={{ height: `${cumPx}%`, background: over ? "var(--tracker-danger)" : "var(--tracker-accent)" }}
                          title={`Итого: ${fmt2(r.cumulative)} ч`}
                        />
                      </div>
                      <span className="hours-chart-label">
                        {MONTHS[r.month].substring(0, 3).toLowerCase()}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="hours-chart-legend" style={{ justifyContent: "center", marginTop: 8 }}>
                <span><i className="hours-chart-key hours-chart-key--plan" />План</span>
                <span><i className="hours-chart-key hours-chart-key--fact" />Итого</span>
                <span><i className="hours-chart-key hours-chart-key--over" />Перерасход</span>
              </div>
            </div>

            {/* Table */}
            <div style={{ borderRadius: "8px", border: "1px solid var(--tracker-border)", overflow: "hidden" }}>
              <table style={{ width: "100%", fontSize: "14px", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--tracker-accent-bg)", fontSize: "10px", color: "var(--tracker-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {["Месяц", "План", "Факт", "Итого", "Статус"].map((h, i) => (
                      <th key={h} style={{ textAlign: i === 0 ? "left" : i === 4 ? "center" : "right", padding: "6px 10px", fontWeight: 500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const over = r.cumulative > r.planH && r.planH > 0;
                    return (
                      <tr key={r.month} style={{ borderTop: "1px solid var(--tracker-accent-bg)" }}>
                        <td style={{ padding: "6px 10px", fontWeight: 500, fontSize: "12px" }}>{MONTHS[r.month]}</td>
                        <td style={{ textAlign: "right", padding: "6px 10px", fontSize: "12px", color: "var(--tracker-text-muted)" }}>{fmt2(r.planH)} ч</td>
                        <td style={{ textAlign: "right", padding: "6px 10px", fontSize: "12px" }}>{fmt2(r.factH)} ч</td>
                        <td style={{ textAlign: "right", padding: "6px 10px", fontSize: "12px", fontWeight: 600, color: over ? "var(--tracker-danger)" : "var(--tracker-text-main)" }}>{fmt2(r.cumulative)} ч</td>
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
                      <tr style={{ borderTop: "2px solid var(--tracker-accent)", background: "var(--tracker-accent-bg)", fontWeight: 700 }}>
                        <td style={{ padding: "6px 10px", fontSize: "12px" }}>Итого</td>
                        <td style={{ textAlign: "right", padding: "6px 10px", fontSize: "12px", color: "var(--tracker-text-muted)" }}>{fmt2(maxPlan)} ч</td>
                        <td style={{ textAlign: "right", padding: "6px 10px", fontSize: "12px" }}>{fmt2(sumFact)} ч</td>
                        <td style={{ textAlign: "right", padding: "6px 10px", fontSize: "12px", fontWeight: 700, color: inPlan ? "var(--tracker-text-main)" : "var(--tracker-danger)" }}>{fmt2(maxCum)} ч</td>
                        <td style={{ textAlign: "center", padding: "6px 10px", fontSize: "10px", color: "var(--tracker-text-muted)" }}>{rows.length} мес.</td>
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
