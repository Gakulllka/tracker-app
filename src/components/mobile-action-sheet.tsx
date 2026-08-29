"use client";
/**
 * MobileActionSheet — нижний action sheet для быстрого доступа к инструментам.
 *
 * Паттерн: Bottom Sheet с кнопками действий.
 * Используется для: undo/redo, смена домена, настройки, тема, экспорт/импорт.
 */
import React from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Undo2, Redo2, RefreshCw, Settings, Sun, Moon, Download, Upload, Share2 } from "lucide-react";

interface MobileActionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSwitchDomain: () => void;
  onSettings: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
  onExport?: () => void;
  onImport?: () => void;
  onShare?: () => void;
}

export function MobileActionSheet({
  open, onOpenChange,
  canUndo, canRedo, onUndo, onRedo,
  onSwitchDomain, onSettings,
  isDark, onToggleTheme,
  onExport, onImport, onShare,
}: MobileActionSheetProps) {
  const actions = [
    { icon: Undo2, label: "Отменить", onClick: onUndo, disabled: !canUndo },
    { icon: Redo2, label: "Повторить", onClick: onRedo, disabled: !canRedo },
    { divider: true },
    { icon: RefreshCw, label: "Сменить домен", onClick: () => { onSwitchDomain(); onOpenChange(false); } },
    { icon: Settings, label: "Настройки", onClick: () => { onSettings(); onOpenChange(false); } },
    { icon: isDark ? Sun : Moon, label: isDark ? "Светлая тема" : "Тёмная тема", onClick: () => { onToggleTheme(); onOpenChange(false); } },
    ...(onShare ? [{ divider: true }, { icon: Share2, label: "Поделиться", onClick: () => { onShare(); onOpenChange(false); } }] : []),
    ...(onExport ? [{ icon: Download, label: "Экспорт", onClick: () => { onExport(); onOpenChange(false); } }] : []),
    ...(onImport ? [{ icon: Upload, label: "Импорт", onClick: () => { onImport(); onOpenChange(false); } }] : []),
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl ink-pop p-0">
        <SheetHeader className="px-4 pt-4 pb-2">
          <SheetTitle className="text-[15px] font-semibold" style={{ color: "var(--tracker-bg-main)" }}>
            Инструменты
          </SheetTitle>
        </SheetHeader>
        <div className="px-2 pb-4 space-y-0.5">
          {actions.map((action, i) => {
            if ("divider" in action && action.divider) {
              return <div key={`d-${i}`} className="my-1 mx-2 h-px" style={{ background: "rgba(250,250,248,0.1)" }} />;
            }
            const a = action as { icon: React.ElementType; label: string; onClick: () => void; disabled?: boolean };
            const Icon = a.icon;
            return (
              <button
                key={a.label}
                onClick={a.onClick}
                disabled={a.disabled}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-[14px] font-medium transition-colors active:scale-[0.98] disabled:opacity-40"
                style={{ color: "var(--tracker-bg-main)" }}
              >
                <Icon className="size-5 shrink-0" style={{ color: "rgba(250,250,248,0.6)" }} />
                {a.label}
              </button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
