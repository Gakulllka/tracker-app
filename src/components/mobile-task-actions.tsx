"use client";
/**
 * MobileTaskActions — action sheet для быстрых действий над задачей.
 *
 * Паттерн: Bottom Sheet с кнопками: редактирование, статус, приоритет, удаление.
 */
import React from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Pencil, Copy, Package, Trash2, ChevronRight,
} from "lucide-react";
import { STATUSES, PRIORITIES, STATUS_ORDER, type Status, type Priority } from "@/lib/types";

interface MobileTaskActionsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskNum: string;
  taskName: string;
  currentStatus: Status;
  currentPriority: Priority;
  onEdit: () => void;
  onDuplicate: () => void;
  onMoveToBacklog: () => void;
  onDelete: () => void;
  onChangeStatus: (status: Status) => void;
  onChangePriority: (priority: Priority) => void;
}

export function MobileTaskActions({
  open, onOpenChange,
  taskNum, taskName,
  currentStatus, currentPriority,
  onEdit, onDuplicate, onMoveToBacklog, onDelete,
  onChangeStatus, onChangePriority,
}: MobileTaskActionsProps) {
  const [showStatuses, setShowStatuses] = React.useState(false);
  const [showPriorities, setShowPriorities] = React.useState(false);

  const statusList = Object.values(STATUSES);
  const priorityList = Object.values(PRIORITIES);

  const handleAction = (action: () => void) => {
    action();
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl ink-pop p-0">
        <SheetHeader className="px-4 pt-4 pb-2">
          <SheetTitle className="text-[14px] font-semibold truncate" style={{ color: "#FAFAF8" }}>
            {taskNum ? `№${taskNum}` : ""} {taskName}
          </SheetTitle>
        </SheetHeader>

        <div className="px-2 pb-4 space-y-0.5">
          {/* Основные действия */}
          <button
            onClick={() => handleAction(onEdit)}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-[14px] font-medium transition-colors active:scale-[0.98]"
            style={{ color: "#FAFAF8" }}
          >
            <Pencil className="size-5 shrink-0" style={{ color: "rgba(250,250,248,0.6)" }} />
            Редактировать
          </button>

          <button
            onClick={() => handleAction(onDuplicate)}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-[14px] font-medium transition-colors active:scale-[0.98]"
            style={{ color: "#FAFAF8" }}
          >
            <Copy className="size-5 shrink-0" style={{ color: "rgba(250,250,248,0.6)" }} />
            Дублировать
          </button>

          <button
            onClick={() => handleAction(onMoveToBacklog)}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-[14px] font-medium transition-colors active:scale-[0.98]"
            style={{ color: "#FAFAF8" }}
          >
            <Package className="size-5 shrink-0" style={{ color: "rgba(250,250,248,0.6)" }} />
            Переместить в беклог
          </button>

          {/* Статус */}
          <div className="my-1 mx-2 h-px" style={{ background: "rgba(250,250,248,0.1)" }} />

          <button
            onClick={() => { setShowStatuses(!showStatuses); setShowPriorities(false); }}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-[14px] font-medium transition-colors active:scale-[0.98]"
            style={{ color: "#FAFAF8" }}
          >
            <span className="size-5 shrink-0 flex items-center justify-center rounded" style={{ background: "rgba(250,250,248,0.1)", fontSize: "10px" }}>
              S
            </span>
            <span className="flex-1 text-left">Статус</span>
            <span className="text-[12px]" style={{ color: "rgba(250,250,248,0.45)" }}>{currentStatus}</span>
            <ChevronRight className="size-4" style={{ color: "rgba(250,250,248,0.3)", transform: showStatuses ? "rotate(90deg)" : "none", transition: "transform 0.2s" }} />
          </button>

          {showStatuses && (
            <div className="px-3 pb-2 grid grid-cols-2 gap-1.5">
              {statusList.map((s) => (
                <button
                  key={s}
                  onClick={() => handleAction(() => onChangeStatus(s))}
                  className="px-3 py-2 rounded-lg text-[12px] font-medium text-left transition-colors active:scale-[0.95]"
                  style={{
                    background: s === currentStatus ? "#FAFAF8" : "rgba(250,250,248,0.06)",
                    color: s === currentStatus ? "#17181C" : "rgba(250,250,248,0.7)",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Приоритет */}
          <button
            onClick={() => { setShowPriorities(!showPriorities); setShowStatuses(false); }}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-[14px] font-medium transition-colors active:scale-[0.98]"
            style={{ color: "#FAFAF8" }}
          >
            <span className="size-5 shrink-0 flex items-center justify-center rounded" style={{ background: "rgba(250,250,248,0.1)", fontSize: "10px" }}>
              P
            </span>
            <span className="flex-1 text-left">Приоритет</span>
            <span className="text-[12px]" style={{ color: "rgba(250,250,248,0.45)" }}>{currentPriority}</span>
            <ChevronRight className="size-4" style={{ color: "rgba(250,250,248,0.3)", transform: showPriorities ? "rotate(90deg)" : "none", transition: "transform 0.2s" }} />
          </button>

          {showPriorities && (
            <div className="px-3 pb-2 grid grid-cols-2 gap-1.5">
              {priorityList.map((p) => (
                <button
                  key={p}
                  onClick={() => handleAction(() => onChangePriority(p))}
                  className="px-3 py-2 rounded-lg text-[12px] font-medium text-left transition-colors active:scale-[0.95]"
                  style={{
                    background: p === currentPriority ? "#FAFAF8" : "rgba(250,250,248,0.06)",
                    color: p === currentPriority ? "#17181C" : "rgba(250,250,248,0.7)",
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          {/* Удалить */}
          <div className="my-1 mx-2 h-px" style={{ background: "rgba(250,250,248,0.1)" }} />

          <button
            onClick={() => handleAction(onDelete)}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-[14px] font-medium transition-colors active:scale-[0.98]"
            style={{ color: "#ef4444" }}
          >
            <Trash2 className="size-5 shrink-0" />
            Удалить
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
