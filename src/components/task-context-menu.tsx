"use client";
import React, { useCallback } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { STATUSES, PRIORITIES, MONTHS, type Status, type Priority, type Task } from "@/lib/types";
import { scolText, PCOL } from "@/lib/types";
import { useTaskStore } from "@/lib/store";
import { Tag, Flag, Calendar, Copy, Package, Trash2 } from "lucide-react";

interface TaskContextMenuProps {
  task: Task;
  month: number;
  isDark: boolean;
  updateTask: (month: number, taskId: string, key: keyof Task, value: unknown) => void;
  deleteTask: (month: number, taskId: string) => void;
  moveToBacklog: (month: number, taskId: string) => void;
  duplicateTask: (month: number, taskId: string) => void;
  isGuest?: boolean;
  children: React.ReactNode;
}

export function TaskContextMenu({
  task, month, isDark, updateTask, deleteTask, moveToBacklog, duplicateTask, isGuest, children,
}: TaskContextMenuProps) {
  const moveTasks = useTaskStore(s => s.moveTasks);
  const snapshot = useTaskStore(s => s.snapshot);

  const handleStatusChange = useCallback((status: Status) => {
    snapshot();
    updateTask(month, task.id, "status", status);
  }, [month, task.id, snapshot, updateTask]);

  const handlePriorityChange = useCallback((priority: Priority) => {
    snapshot();
    updateTask(month, task.id, "priority", priority);
  }, [month, task.id, snapshot, updateTask]);

  const handleMoveToMonth = useCallback((toMonth: number) => {
    snapshot();
    moveTasks(task.id, month, toMonth);
  }, [task.id, month, snapshot, moveTasks]);

  // Гость — только просмотр, без контекстного меню
  if (isGuest) {
    return <>{children}</>;
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56 ink-ctx">
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Tag className="mr-2 size-3.5" /> Статус
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="max-h-72 overflow-y-auto ink-ctx">
            {Object.values(STATUSES).map(s => (
              <ContextMenuItem
                key={s}
                onClick={() => handleStatusChange(s)}
                className="text-xs gap-2"
              >
                <span
                  className="ctx-dot inline-block w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: scolText(s, isDark) || "#888" }}
                />
                {s}
                {task.status === s && <span className="ml-auto ctx-check">✓</span>}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Flag className="mr-2 size-3.5" /> Приоритет
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="ink-ctx">
            {Object.values(PRIORITIES).map(p => (
              <ContextMenuItem
                key={p}
                onClick={() => handlePriorityChange(p)}
                className="text-xs gap-2"
              >
                <span
                  className="ctx-dot inline-block w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: PCOL[p] }}
                />
                {p}
                {task.priority === p && <span className="ml-auto ctx-check">✓</span>}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Calendar className="mr-2 size-3.5" /> Перенести в месяц
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="max-h-72 overflow-y-auto ink-ctx">
            {MONTHS.map((m, i) => (
              <ContextMenuItem
                key={m}
                onClick={() => handleMoveToMonth(i)}
                disabled={i === month}
                className="text-xs"
              >
                {m}
                {i === month && <span className="ml-auto" style={{ color: "rgba(250,250,248,0.45)" }}>←</span>}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSeparator />

        <ContextMenuItem onClick={() => moveToBacklog(month, task.id)} className="text-xs gap-2">
          <Package className="size-3.5" /> В беклог
        </ContextMenuItem>

        <ContextMenuItem onClick={() => duplicateTask(month, task.id)} className="text-xs gap-2">
          <Copy className="size-3.5" /> Дублировать
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem
          onClick={() => deleteTask(month, task.id)}
          className="text-xs gap-2 text-[#FF4444] focus:text-[#FF4444]"
        >
          <Trash2 className="size-3.5" /> Удалить
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
