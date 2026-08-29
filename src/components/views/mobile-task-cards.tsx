import React from "react";
import { Check, ClipboardList, Ruler, Timer, Wallet } from "lucide-react";
import { getTaskMetrics, evalExpr } from "@/lib/metrics";
import { PCOL, scolText } from "@/lib/tokens";
import type { Task, Status } from "@/lib/types";

export interface MobileTaskCardsProps {
  /** Задачи месяца без «идей» — то, что реально показывается карточками. */
  workRows: Task[];
  /** Все строки месяца: нужны, чтобы отличить пустой месяц от пустого фильтра. */
  rows: Task[];
  month: number;
  isDark: boolean;
  totalFactMap?: Record<string, number>;
  /** Выделенные задачи. Непустое множество включает режим массового выбора. */
  selectedTaskIds: Set<string>;
  toggleTaskSelection: (id: string) => void;
  onOpenTaskDetail?: (task: Task, month: number) => void;
  onOpenNewTaskDialog: (month: number) => void;
  /** Режим только чтения. */
  clientMode?: boolean;
  isGuest?: boolean;
}

/**
 * Список задач карточками для телефона.
 *
 * На экране 375 px девять колонок таблицы нечитаемы, поэтому на мобильном
 * таблица прячется (`md:hidden` / `hidden md:block`) и вместо неё
 * показывается этот список.
 *
 * Долгое нажатие (больше 500 мс) включает режим массового выбора: дальше тап
 * переключает галочку, а не открывает карточку задачи.
 */
export function MobileTaskCards({
  workRows,
  rows,
  month,
  isDark,
  totalFactMap,
  selectedTaskIds,
  toggleTaskSelection,
  onOpenTaskDetail,
  onOpenNewTaskDialog,
  clientMode,
  isGuest,
}: MobileTaskCardsProps) {
  return (
<div className="md:hidden space-y-2 stagger">
  {rows.length === 0 ? (
    <div className="empty-state">
      <div className="empty-state-icon"><ClipboardList className="size-6" /></div>
      <p className="empty-state-title">В этом месяце пока пусто</p>
      <p className="empty-state-hint">Добавьте первую задачу кнопкой ниже — или перенесите из другого месяца</p>
    </div>
  ) : (
    workRows.map((task) => {
      const metrics = getTaskMetrics(task, totalFactMap);
      const pct = metrics.totalH > 0 && evalExpr(task.planH) > 0
        ? Math.min(100, (metrics.totalH / evalExpr(task.planH)) * 100)
        : null;
      const isOver = pct !== null && pct > 100;
      const isSelected = selectedTaskIds.has(task.id);
      const inSelectMode = selectedTaskIds.size > 0;
      return (
        <div
          key={task.id}
          onClick={() => {
            if (inSelectMode) {
              toggleTaskSelection(task.id);
            } else {
              onOpenTaskDetail?.(task, month);
            }
          }}
          onTouchStart={(e) => {
            if (clientMode || isGuest) return;
            // Долгое нажатие (>500мс) → режим выбора (bulk-операции).
            (e.currentTarget as HTMLElement & { _longPressTimer?: number })._longPressTimer =
              window.setTimeout(() => {
                if (!selectedTaskIds.has(task.id)) toggleTaskSelection(task.id);
                // Тактильная обратная связь если доступна.
                if (navigator.vibrate) navigator.vibrate(15);
              }, 500);
          }}
          onTouchEnd={(e) => {
            const el = e.currentTarget as HTMLElement & { _longPressTimer?: number };
            if (el._longPressTimer) { clearTimeout(el._longPressTimer); el._longPressTimer = undefined; }
          }}
          onTouchMove={(e) => {
            const el = e.currentTarget as HTMLElement & { _longPressTimer?: number };
            if (el._longPressTimer) { clearTimeout(el._longPressTimer); el._longPressTimer = undefined; }
          }}
          className={`mobile-task-card ${isSelected ? "selected" : ""}`}
          style={isSelected ? { borderColor: "var(--tracker-accent)", boxShadow: "0 0 0 2px color-mix(in srgb, var(--tracker-accent) 20%, transparent)" } : undefined}
        >
          {/* Чекбокс выбора в режиме bulk */}
          {inSelectMode && (
            <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center shrink-0"
              style={{
                background: isSelected ? "var(--tracker-accent)" : "transparent",
                border: `2px solid ${isSelected ? "var(--tracker-accent)" : "var(--tracker-border)"}`,
              }}>
              {isSelected && <Check className="size-3" style={{ color: "var(--tracker-accent-contrast)" }} />}
            </div>
          )}
          {/* Top row: number + priority */}
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <span className="mobile-task-num">#{task.num || "—"}</span>
              {task.approvalStatus === "pending" && (
                <span className="mobile-task-pending-badge">Ожидает БА</span>
              )}
            </div>
            <span
              className="mobile-task-priority-pill"
              style={{ color: PCOL[task.priority], background: PCOL[task.priority] + "18" }}
            >
              {task.priority}
            </span>
          </div>
          {/* Name */}
          <p className="mobile-task-name">
            {task.name || <span className="italic opacity-40">без названия</span>}
          </p>
          {/* Bottom row: status + hours */}
          <div className="flex items-center justify-between mt-2 pt-2 mobile-task-footer">
            <span
              className="mobile-task-status-pill"
              style={{
                color: scolText(task.status, isDark) || "var(--tracker-text-muted)",
                background: (scolText(task.status, isDark) || "var(--tracker-accent)") + "18",
              }}
            >
              {task.status}
            </span>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {(task.budgetAllocated ?? 0) > 0 && (
                <span className="mobile-task-budget-badge">
                  <Wallet className="size-3 inline" /> {task.budgetAllocated}ч
                </span>
              )}
              <span className="flex items-center gap-1 delta-num"><Ruler className="size-3" /> {task.planH || "0"}ч</span>
              <span className={`flex items-center gap-1 delta-num ${isOver ? "text-[var(--tracker-danger)] font-semibold" : ""}`}>
                <Timer className="size-3" /> {task.factH || "0"}ч
              </span>
            </div>
          </div>
          {/* Progress bar */}
          {pct !== null && (
            <div className="mt-2 h-1 rounded-full overflow-hidden bg-muted/60">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(pct, 100)}%`,
                  background: isOver
                    ? "var(--tracker-danger)"
                    : "var(--tracker-accent)",
                }}
              />
            </div>
          )}
        </div>
      );
    })
  )}
  {/* Mobile FAB */}
  {!clientMode && !isGuest && (
    <button
      className="mobile-fab"
      onClick={() => onOpenNewTaskDialog(month)}
      aria-label="Добавить задачу"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    </button>
  )}
</div>
  );
}
