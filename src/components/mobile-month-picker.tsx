"use client";
/**
 * MobileMonthPicker — выбор месяца через Bottom Sheet.
 *
 * Паттерн: 4x3 сетка месяцев с подсветкой текущего.
 */
import React from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { MONTHS, MONTHS_SHORT } from "@/lib/types";

interface MobileMonthPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentMonth: number;
  currentYear: number;
  onSelectMonth: (month: number) => void;
  monthHasData: (month: number) => boolean;
}

export function MobileMonthPicker({
  open, onOpenChange,
  currentMonth, currentYear,
  onSelectMonth, monthHasData,
}: MobileMonthPickerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl ink-pop p-0">
        <SheetHeader className="px-4 pt-4 pb-2">
          <SheetTitle className="text-[15px] font-semibold" style={{ color: "var(--tracker-bg-main)" }}>
            {currentYear} · Выберите месяц
          </SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-6 grid grid-cols-4 gap-2">
          {MONTHS.map((m, i) => {
            const isActive = i === currentMonth;
            const hasData = monthHasData(i);
            return (
              <button
                key={m}
                onClick={() => { onSelectMonth(i); onOpenChange(false); }}
                className="relative flex flex-col items-center justify-center rounded-xl py-3 px-2 text-[13px] font-medium transition-all active:scale-[0.95]"
                style={{
                  background: isActive ? "var(--tracker-bg-main)" : "rgba(250,250,248,0.06)",
                  color: isActive ? "var(--tracker-accent)" : "rgba(250,250,248,0.7)",
                }}
              >
                <span>{MONTHS_SHORT[i]}</span>
                {hasData && (
                  <span
                    className="mt-1 size-1.5 rounded-full"
                    style={{ background: isActive ? "var(--tracker-accent)" : "var(--tracker-bg-main)", opacity: 0.6 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
