"use client";

/**
 * BudgetSignalsSheet — Sheet справа для каждой задачи.
 * Показывается при нажатии кнопки "💰" в строке таблицы.
 *
 * Секция А: Сигналы от руководителя + подтверждение (двухфазный коммит)
 * Секция Б: Управление бюджетом задачи (ролловер)
 */

import React, { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Task } from "@/lib/types";
import { calcRollover, R2, MONTH_CAPACITY } from "@/lib/metrics";

// ─── Helpers ────────────────────────────────────────────────────────────────

const FLAG_LABELS: Record<string, string> = {
  escalate: "⚡ Эскалировать",
  pause: "⏸ Поставить на паузу",
  cancel: "✖ Отменить",
  request_status: "❓ Запросить статус",
};

const FLAG_COLORS: Record<string, string> = {
  escalate: "#E24B4A",
  pause: "#BA7517",
  cancel: "#6B7280",
  request_status: "#1D9E75",
};

// ─── Component ───────────────────────────────────────────────────────────────

interface BudgetSignalsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task;
  /** Часы уже зарезервированные другими задачами в текущем месяце */
  usedHoursInMonth: number;
  /** Лимит месяца (дефолт 240) */
  monthCapacity?: number;
  /** Сохранить изменения задачи */
  onSave: (updates: Partial<Task>) => void;
}

export function BudgetSignalsSheet({
  open,
  onOpenChange,
  task,
  usedHoursInMonth,
  monthCapacity = MONTH_CAPACITY,
  onSave,
}: BudgetSignalsSheetProps) {
  const planHNum = parseFloat(task.planH) || 0;

  // Локальный стейт для редактирования
  const [budgetInput, setBudgetInput] = useState<string>(
    String(task.totalBudgetRequested ?? (planHNum >= 100 ? planHNum : "")),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // При открытии обновляем инпут
  useEffect(() => {
    if (open) {
      setBudgetInput(
        String(task.totalBudgetRequested ?? (planHNum >= 100 ? planHNum : "")),
      );
    }
  }, [open, task.totalBudgetRequested, planHNum]);

  // Превью ролловера
  const budgetNum = parseFloat(budgetInput) || 0;
  // При расчёте вычитаем текущий budgetAllocated этой задачи из usedHours
  const usedExcludingSelf = Math.max(
    0,
    usedHoursInMonth - (task.budgetAllocated ?? 0),
  );
  const { budgetAllocated: previewAllocated, budgetRollover: previewRollover } =
    calcRollover(budgetNum, usedExcludingSelf, monthCapacity);
  const freeHours = Math.max(0, monthCapacity - usedExcludingSelf);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleAccept = () => {
    onSave({ approvalStatus: "approved", executiveFlag: undefined });
    flash();
  };

  const handleReject = () => {
    onSave({
      approvalStatus: "rejected",
      budgetAllocated: 0,
      totalBudgetRequested: 0,
      executiveFlag: undefined,
    });
    flash();
  };

  const handleSaveBudget = () => {
    setIsSaving(true);
    const total = parseFloat(budgetInput) || 0;
    const { budgetAllocated, budgetRollover } = calcRollover(
      total,
      usedExcludingSelf,
      monthCapacity,
    );
    onSave({ totalBudgetRequested: total, budgetAllocated, budgetRollover });
    setTimeout(() => {
      setIsSaving(false);
      flash();
    }, 300);
  };

  const flash = () => {
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };

  // ── UI ───────────────────────────────────────────────────────────────────────

  const isPending = task.approvalStatus === "pending";
  const isRejected = task.approvalStatus === "rejected";
  const hasFlag = !!task.executiveFlag;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[420px] sm:w-[480px] overflow-y-auto"
        style={{
          background: "var(--tracker-bg, var(--background))",
          borderLeft: "1px solid var(--tracker-border, var(--border))",
        }}
      >
        <SheetHeader className="pb-4">
          <SheetTitle
            className="text-base font-semibold truncate"
            style={{ color: "var(--tracker-accent-fg-dark, var(--foreground))" }}
          >
            💰 Бюджет и сигналы
          </SheetTitle>
          <SheetDescription className="text-xs truncate" style={{ color: "var(--tracker-text-muted, var(--muted-foreground))" }}>
            {task.num ? `#${task.num} · ` : ""}{task.name || "Без названия"}
          </SheetDescription>
        </SheetHeader>

        {/* Flash feedback */}
        {savedFlash && (
          <div
            className="mb-4 px-3 py-2 rounded-lg text-xs font-medium text-center"
            style={{ background: "rgba(29,158,117,0.12)", color: "#1D9E75" }}
          >
            ✓ Сохранено
          </div>
        )}

        {/* ─── СЕКЦИЯ А: Сигналы от руководителя ─── */}
        <section className="mb-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-3"
            style={{ color: "var(--tracker-text-muted, var(--muted-foreground))" }}>
            А / Сигналы от руководителя
          </h3>

          {/* Статус подтверждения */}
          {isPending && (
            <div
              className="rounded-xl p-4 mb-4 border"
              style={{
                background: "rgba(251,191,36,0.07)",
                borderColor: "rgba(251,191,36,0.3)",
              }}
            >
              <div className="flex items-start gap-3">
                <span className="text-xl">⏳</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold mb-1" style={{ color: "#854F0B" }}>
                    Руководство хочет взять задачу в план
                  </p>
                  <p className="text-xs mb-3" style={{ color: "var(--tracker-text-muted, var(--muted-foreground))" }}>
                    Задача ожидает подтверждения от БА. Пока она полупрозрачна на дашборде руководителя.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="h-8 text-xs"
                      style={{ background: "#1D9E75", color: "#fff" }}
                      onClick={handleAccept}
                    >
                      ✅ Принять в план
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      style={{ borderColor: "#E24B4A", color: "#E24B4A" }}
                      onClick={handleReject}
                    >
                      ❌ Отклонить
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {isRejected && (
            <div
              className="rounded-xl p-3 mb-4 border text-xs"
              style={{
                background: "rgba(226,75,74,0.06)",
                borderColor: "rgba(226,75,74,0.2)",
                color: "#A32D2D",
              }}
            >
              ✖ Задача была отклонена БА. Бюджет обнулён.
            </div>
          )}

          {!isPending && !isRejected && (
            <div
              className="rounded-xl p-3 mb-4 border text-xs"
              style={{
                background: "rgba(29,158,117,0.06)",
                borderColor: "rgba(29,158,117,0.2)",
                color: "#1D9E75",
              }}
            >
              ✓ Задача подтверждена БА
            </div>
          )}

          {/* Флаги от руководителя */}
          {hasFlag && task.executiveFlag && (
            <div className="mt-2">
              <p className="text-xs mb-2" style={{ color: "var(--tracker-text-muted, var(--muted-foreground))" }}>
                Руководитель установил флаг:
              </p>
              <Badge
                className="text-xs px-3 py-1 rounded-full border"
                style={{
                  background: FLAG_COLORS[task.executiveFlag] + "18",
                  color: FLAG_COLORS[task.executiveFlag],
                  borderColor: FLAG_COLORS[task.executiveFlag] + "40",
                }}
              >
                {FLAG_LABELS[task.executiveFlag] ?? task.executiveFlag}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs mt-2 block"
                style={{ color: "var(--tracker-text-muted, var(--muted-foreground))" }}
                onClick={() => onSave({ executiveFlag: undefined })}
              >
                Снять флаг
              </Button>
            </div>
          )}

          {!hasFlag && (
            <p className="text-xs" style={{ color: "var(--tracker-text-muted, var(--muted-foreground))" }}>
              Нет активных сигналов от руководства
            </p>
          )}
        </section>

        <Separator className="mb-6" />

        {/* ─── СЕКЦИЯ Б: Управление бюджетом ─── */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-3"
            style={{ color: "var(--tracker-text-muted, var(--muted-foreground))" }}>
            Б / Управление бюджетом
          </h3>

          {/* Инфо: свободные часы */}
          <div
            className="rounded-xl p-3 mb-4 grid grid-cols-3 gap-2 text-center"
            style={{
              background: "var(--tracker-accent-bg, rgba(29,158,117,0.06))",
              border: "1px solid var(--tracker-border, var(--border))",
            }}
          >
            <div>
              <p className="text-[10px] mb-0.5" style={{ color: "var(--tracker-text-muted, var(--muted-foreground))" }}>Лимит месяца</p>
              <p className="text-sm font-bold" style={{ color: "var(--tracker-accent-fg-dark, var(--foreground))" }}>
                {monthCapacity}ч
              </p>
            </div>
            <div>
              <p className="text-[10px] mb-0.5" style={{ color: "var(--tracker-text-muted, var(--muted-foreground))" }}>Занято</p>
              <p className="text-sm font-bold" style={{ color: "var(--tracker-text-main, var(--foreground))" }}>
                {R2(usedExcludingSelf)}ч
              </p>
            </div>
            <div>
              <p className="text-[10px] mb-0.5" style={{ color: "var(--tracker-text-muted, var(--muted-foreground))" }}>Свободно</p>
              <p className="text-sm font-bold" style={{ color: freeHours > 0 ? "#1D9E75" : "#E24B4A" }}>
                {freeHours}ч
              </p>
            </div>
          </div>

          {/* Поле ввода totalBudgetRequested */}
          <div className="mb-4">
            <label className="block text-xs font-medium mb-1.5"
              style={{ color: "var(--tracker-text-main, var(--foreground))" }}>
              Всего часов для задачи
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                step={1}
                className="flex-1 h-9 rounded-lg border px-3 text-sm outline-none focus:ring-2 tabular-nums"
                style={{
                  background: "var(--tracker-bg, var(--background))",
                  borderColor: "var(--tracker-border, var(--border))",
                  color: "var(--tracker-text-main, var(--foreground))",
                }}
                value={budgetInput}
                onChange={(e) => {
                  // Автоподстановка если planH >= 100 и поле было пустым
                  setBudgetInput(e.target.value);
                }}
                placeholder={planHNum >= 100 ? String(planHNum) : "0"}
              />
              <span className="text-sm" style={{ color: "var(--tracker-text-muted, var(--muted-foreground))" }}>ч</span>
            </div>
            {planHNum >= 100 && !task.totalBudgetRequested && (
              <p className="text-[11px] mt-1" style={{ color: "var(--tracker-accent-fg-dark, var(--foreground))" }}>
                💡 Оценка &ge;100ч — рекомендуем зарезервировать {planHNum}ч
              </p>
            )}
          </div>

          {/* Превью ролловера */}
          {budgetNum > 0 && (
            <div
              className="rounded-xl p-3 mb-4 space-y-2"
              style={{
                background: "var(--tracker-bg, var(--background))",
                border: "1px solid var(--tracker-border, var(--border))",
              }}
            >
              <p className="text-[11px] font-semibold mb-2"
                style={{ color: "var(--tracker-text-muted, var(--muted-foreground))" }}>
                Предпросмотр ролловера
              </p>

              <div className="flex items-center justify-between text-xs">
                <span style={{ color: "var(--tracker-text-main, var(--foreground))" }}>
                  В этом месяце
                </span>
                <span className="font-bold tabular-nums" style={{ color: "#1D9E75" }}>
                  {previewAllocated}ч
                </span>
              </div>

              {previewRollover > 0 && (
                <>
                  <div className="flex items-center justify-between text-xs">
                    <span style={{ color: "var(--tracker-text-muted, var(--muted-foreground))" }}>
                      Перенос в следующие месяцы
                    </span>
                    <span className="font-bold tabular-nums" style={{ color: "#BA7517" }}>
                      {previewRollover}ч
                    </span>
                  </div>

                  {/* Визуализация ролловера по месяцам */}
                  <div className="mt-2">
                    {(() => {
                      const months: { month: string; hours: number }[] = [];
                      let remaining = previewRollover;
                      const now = new Date();
                      let m = now.getMonth() + 1; // next month (0-indexed)
                      let y = now.getFullYear();
                      const MONTH_NAMES = ["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"];
                      while (remaining > 0 && months.length < 6) {
                        m++;
                        if (m > 11) { m = 0; y++; }
                        const alloc = Math.min(remaining, monthCapacity);
                        months.push({ month: `${MONTH_NAMES[m]} ${y}`, hours: alloc });
                        remaining = R2(remaining - alloc);
                      }
                      return (
                        <div className="space-y-1">
                          {months.map((mo, i) => (
                            <div key={i} className="flex items-center gap-2 text-[11px]">
                              <span className="w-16 shrink-0" style={{ color: "var(--tracker-text-muted, var(--muted-foreground))" }}>
                                {mo.month}
                              </span>
                              <div className="flex-1 h-1 rounded-full overflow-hidden"
                                style={{ background: "var(--tracker-border, var(--border))" }}>
                                <div className="h-full rounded-full"
                                  style={{
                                    width: `${(mo.hours / monthCapacity) * 100}%`,
                                    background: "rgba(186,117,23,0.6)",
                                  }} />
                              </div>
                              <span className="tabular-nums w-12 text-right"
                                style={{ color: "var(--tracker-text-main, var(--foreground))" }}>
                                {mo.hours}ч
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </>
              )}

              {previewRollover === 0 && budgetNum > 0 && (
                <p className="text-[11px]" style={{ color: "#1D9E75" }}>
                  ✓ Весь бюджет умещается в текущий месяц
                </p>
              )}
            </div>
          )}

          {/* Флаг "первая на отсечение" */}
          <div className="flex items-center gap-3 mb-4">
            <button
              type="button"
              role="checkbox"
              aria-checked={!!task.isFirstToCut}
              className="h-4 w-4 rounded border flex items-center justify-center transition-colors shrink-0"
              style={{
                background: task.isFirstToCut ? "#E24B4A" : "transparent",
                borderColor: task.isFirstToCut ? "#E24B4A" : "var(--tracker-border, var(--border))",
              }}
              onClick={() => onSave({ isFirstToCut: !task.isFirstToCut })}
            >
              {task.isFirstToCut && (
                <span className="text-white text-[10px] leading-none">✓</span>
              )}
            </button>
            <label
              className="text-xs cursor-pointer"
              style={{ color: "var(--tracker-text-main, var(--foreground))" }}
              onClick={() => onSave({ isFirstToCut: !task.isFirstToCut })}
            >
              ⚡ Первая на отсечение при нехватке бюджета
            </label>
          </div>

          {/* Кнопка сохранить */}
          <Button
            className="w-full h-9 text-sm"
            style={{ background: "var(--tracker-accent, #1D9E75)", color: "#fff" }}
            disabled={isSaving || budgetNum <= 0}
            onClick={handleSaveBudget}
          >
            {isSaving ? "Сохраняем…" : "Сохранить бюджет"}
          </Button>

          {/* Текущее состояние */}
          {(task.budgetAllocated !== undefined || task.totalBudgetRequested !== undefined) && (
            <div className="mt-3 pt-3 border-t space-y-1"
              style={{ borderColor: "var(--tracker-border, var(--border))" }}>
              <p className="text-[11px]" style={{ color: "var(--tracker-text-muted, var(--muted-foreground))" }}>
                Текущие значения:
              </p>
              <div className="flex justify-between text-xs">
                <span style={{ color: "var(--tracker-text-main, var(--foreground))" }}>Запрошено всего</span>
                <span className="tabular-nums font-medium">{task.totalBudgetRequested ?? 0}ч</span>
              </div>
              <div className="flex justify-between text-xs">
                <span style={{ color: "var(--tracker-text-main, var(--foreground))" }}>Выделено в месяце</span>
                <span className="tabular-nums font-medium" style={{ color: "#1D9E75" }}>
                  {task.budgetAllocated ?? 0}ч
                </span>
              </div>
              {(task.budgetRollover ?? 0) > 0 && (
                <div className="flex justify-between text-xs">
                  <span style={{ color: "var(--tracker-text-main, var(--foreground))" }}>Перенос</span>
                  <span className="tabular-nums font-medium" style={{ color: "#BA7517" }}>
                    {task.budgetRollover}ч
                  </span>
                </div>
              )}
            </div>
          )}
        </section>
      </SheetContent>
    </Sheet>
  );
}
