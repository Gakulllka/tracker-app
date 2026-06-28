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

interface TaskContextMenuProps {
  task: Task;
  month: number;
  isDark: boolean;
  updateTask: (month: number, taskId: string, key: keyof Task, value: unknown) => void;
  deleteTask: (month: number, taskId: string) => void;
  moveToBacklog: (month: number, taskId: string) => void;
  duplicateTask: (month: number, taskId: string) => void;
  children: React.ReactNode;
}

export function TaskContextMenu({
  task, month, isDark, updateTask, deleteTask, moveToBacklog, duplicateTask, children,
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

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <span className="mr-2">🏷️</span> Статус
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="max-h-72 overflow-y-auto">
            {Object.values(STATUSES).map(s => (
              <ContextMenuItem
                key={s}
                onClick={() => handleStatusChange(s)}
                className="text-xs gap-2"
              >
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: scolText(s, isDark) || "#888" }}
                />
                {s}
                {task.status === s && <span className="ml-auto text-muted-foreground">✓</span>}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <span className="mr-2">⚡</span> Приоритет
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {Object.values(PRIORITIES).map(p => (
              <ContextMenuItem
                key={p}
                onClick={() => handlePriorityChange(p)}
                className="text-xs gap-2"
              >
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: PCOL[p] }}
                />
                {p}
                {task.priority === p && <span className="ml-auto text-muted-foreground">✓</span>}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <span className="mr-2">📅</span> Перенести в месяц
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="max-h-72 overflow-y-auto">
            {MONTHS.map((m, i) => (
              <ContextMenuItem
                key={m}
                onClick={() => handleMoveToMonth(i)}
                disabled={i === month}
                className="text-xs"
              >
                {m}
                {i === month && <span className="ml-auto text-muted-foreground">←</span>}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSeparator />

        <ContextMenuItem onClick={() => moveToBacklog(month, task.id)} className="text-xs gap-2">
          <span>📦</span> В беклог
        </ContextMenuItem>

        <ContextMenuItem onClick={() => duplicateTask(month, task.id)} className="text-xs gap-2">
          <span>📋</span> Дублировать
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem
          onClick={() => deleteTask(month, task.id)}
          className="text-xs gap-2 text-destructive focus:text-destructive"
        >
          <span>🗑</span> Удалить
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
