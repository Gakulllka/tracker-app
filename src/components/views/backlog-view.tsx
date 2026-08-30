"use client";
import React, { useState, useCallback, useRef , useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AutoResizeTextarea } from "@/components/auto-resize-textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/empty-state";
import { Trash2, Plus, ClipboardList, CalendarPlus } from "lucide-react";
import { MONTHS, STATUSES, PRIORITIES, type Status, type Priority, type Task } from "@/lib/types";
import { PCOL, scolText } from "@/lib/tokens";
import { evalExpr, fmt2, createNewTask, R2 } from "@/lib/metrics";
import { useTaskStore } from "@/lib/store";
import { buildBacklogQueue } from "@/lib/backlog-queue";

export interface BacklogViewProps {
  backlog: Task[];
  currentMonth: number;
  updateBacklogTask: (taskId: string, key: keyof Task, value: unknown) => void;
  deleteBacklogTask: (taskId: string) => void;
  reorderBacklog: (fromId: string, toId: string) => void;
  setCommentArchiveDialog: (v: { taskId: string; taskName: string; logs: Array<{ date: string; week: string; text: string; planH: string; factH: string; status: string; author?: string }>; open: boolean }) => void;
  isDark: boolean;
  isGuest?: boolean;
  /** Свободный остаток бюджета месяца: бюджет − отработанное. */
  freeHours: number;
}

interface BacklogDialogState {
  open: boolean;
  taskId: string;
  num: string;
  name: string;
  planH: string;
  factH: string;
  month: number;
  priority: Priority;
  status: Status;
}

export function BacklogView({
  backlog,
  currentMonth,
  updateBacklogTask,
  deleteBacklogTask,
  reorderBacklog,
  setCommentArchiveDialog,
  isDark,
  isGuest,
  freeHours,
}: BacklogViewProps) {
  const [dragRowId, setDragRowId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ id: string; col: string } | null>(null);
  const [commentDialogId, setCommentDialogId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /* ---- Drag & Drop ---- */
  const handleDragStart = useCallback((e: React.DragEvent, rowId: string) => {
    e.stopPropagation();
    e.dataTransfer.setData("application/backlog-row", rowId);
    e.dataTransfer.effectAllowed = "move";
    setDragRowId(rowId);
  }, []);
  const handleDragOver = useCallback((e: React.DragEvent, rowId: string) => {
    e.preventDefault(); e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDropTargetId(rowId);
  }, []);
  const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault(); e.stopPropagation();
    const fromId = e.dataTransfer.getData("application/backlog-row");
    if (fromId && fromId !== targetId && reorderBacklog) reorderBacklog(fromId, targetId);
    setDragRowId(null); setDropTargetId(null);
  }, [reorderBacklog]);
  const handleDragEnd = useCallback(() => { setDragRowId(null); setDropTargetId(null); }, []);

  /* ---- Inline editing ---- */
  const startEdit = useCallback((id: string, col: string) => {
    setEditingCell({ id, col });
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
      textareaRef.current?.focus();
    }, 30);
  }, []);
  const stopEdit = useCallback(() => setEditingCell(null), []);
  const isEdit = (id: string, col: string) => editingCell?.id === id && editingCell?.col === col;

  /* ---- Queue reorder by number input ---- */
  const handleQueueChange = useCallback((taskId: string, newPos: string) => {
    const n = parseInt(newPos, 10);
    if (isNaN(n) || n < 1 || n > backlog.length) return;
    const fromIdx = backlog.findIndex(t => t.id === taskId);
    const toIdx = Math.min(n - 1, backlog.length - 1);
    if (fromIdx === toIdx) return;
    // Find the target task id at desired index
    const targetTask = backlog[toIdx];
    if (targetTask) reorderBacklog(taskId, targetTask.id);
  }, [backlog, reorderBacklog]);

  /* ---- Add task ---- */
  const handleAdd = useCallback(() => {
    const newTask = createNewTask();
    useTaskStore.setState({ backlog: [...useTaskStore.getState().backlog, newTask] });
  }, []);

  /* ---- Open comment archive ---- */
  const openArchive = useCallback((task: Task) => {
    setCommentArchiveDialog({
      taskId: task.id,
      taskName: task.name || "Без названия",
      open: true,
      logs: [...(task.commentLog || [])].reverse().map(e => ({
        date: e.date, week: e.week, text: e.text, planH: e.planH, factH: e.factH, status: e.status,
        author: e.author,
      })),
    });
  }, [setCommentArchiveDialog]);

  /* ---- Save inline comment ---- */
  const handleCommentSave = useCallback((task: Task, newComment: string) => {
    if (newComment === task.comment) { stopEdit(); return; }
    updateBacklogTask(task.id, "comment", newComment);
    stopEdit();
  }, [updateBacklogTask, stopEdit]);

  /* ---- Return to table dialog ---- */
  const [dialog, setDialog] = useState<BacklogDialogState>({
    open: false, taskId: "", num: "", name: "", planH: "0", factH: "0",
    month: currentMonth, priority: PRIORITIES.QUEUE, status: STATUSES.IDEA,
  });
  const openReturnDialog = useCallback((task: Task) => {
    setDialog({
      open: true, taskId: task.id, num: task.num, name: task.name,
      planH: fmt2(evalExpr(task.planH || "0")), factH: fmt2(evalExpr(task.factH || "0")),
      month: currentMonth, priority: task.priority, status: task.status,
    });
  }, [currentMonth]);
  const closeDialog = useCallback(() => setDialog(prev => ({ ...prev, open: false })), []);
  const handleReturnToTable = useCallback(() => {
    useTaskStore.getState().returnFromBacklogWithEdits(dialog.taskId, dialog.month, {
      num: dialog.num, name: dialog.name, planH: dialog.planH, factH: dialog.factH,
      priority: dialog.priority, status: dialog.status,
    });
    closeDialog();
  }, [dialog, closeDialog]);

  const statusValues = Object.values(STATUSES);
  const priorityValues = Object.values(PRIORITIES);

  /* ---- Queue urgency styling ---- */
  const getQueueStyle = (idx: number, total: number): React.CSSProperties => {
    const rank = idx + 1;
    if (rank === 1) return { background: "color-mix(in srgb, var(--tracker-danger) 4%, transparent)" };
    if (rank === 2) return { background: "color-mix(in srgb, var(--tracker-warning) 3%, transparent)" };
    if (rank === 3) return { background: "color-mix(in srgb, var(--tracker-warning) 2%, transparent)" };
    return { background: "transparent" };
  };

  const getQueueBadgeStyle = (idx: number): React.CSSProperties => {
    const rank = idx + 1;
    if (rank === 1) return { background: "var(--tracker-danger)", color: "#fff", fontWeight: 700 };
    if (rank === 2) return { background: "var(--tracker-warning)", color: "#fff", fontWeight: 700 };
    if (rank === 3) return { background: "var(--tracker-warning)", color: "#fff", fontWeight: 600 };
    if (rank <= 5) return { background: "var(--tracker-accent-bg)", color: "var(--tracker-accent-fg-dark)", fontWeight: 600 };
    return { background: "transparent", color: "var(--tracker-text-muted)", fontWeight: 500, border: "1px solid var(--tracker-border)" };
  };

  const { rows, thresholdAfter } = useMemo(
    () => buildBacklogQueue(backlog, freeHours),
    [backlog, freeHours],
  );

  return (
    <div className="space-y-4">
      {backlog.length === 0 ? (
        <EmptyState type="backlog" onAction={handleAdd} />
      ) : (
        <div className="ink-window overflow-hidden">
          <div className="backlog-head">
            <span className="backlog-rank">№</span>
            <span className="backlog-num">Номер</span>
            <span className="backlog-name">Задача</span>
            <span className="backlog-col">План</span>
            <span className="backlog-col">Факт</span>
            <span className="backlog-col">Остаток</span>
            <span className="backlog-col">Накоплено</span>
            <span className="backlog-actions" />
          </div>

          {rows.map(({ task, idx, plan, fact, left, running, fitsInMonth }) => {
            const isDragging = dragRowId === task.id;
            const isDropTarget = dropTargetId === task.id && dragRowId !== task.id;
            const showThreshold = thresholdAfter === idx;

            return (
              <React.Fragment key={task.id}>
                <div
                  draggable={!isGuest}
                  onDragStart={(e) => handleDragStart(e, task.id)}
                  onDragOver={(e) => handleDragOver(e, task.id)}
                  onDrop={(e) => handleDrop(e, task.id)}
                  onDragEnd={handleDragEnd}
                  className={`backlog-row ${isDragging ? "opacity-30" : ""} ${isDropTarget ? "backlog-row--drop" : ""} ${fitsInMonth ? "" : "backlog-row--over"}`}
                >
                  <span className="backlog-rank delta-num">{idx + 1}</span>

                  <span className="backlog-num delta-num">{task.num || "—"}</span>

                  <button
                    className="backlog-name"
                    onClick={() => openReturnDialog(task)}
                    title="Вернуть в месяц"
                  >
                    {task.name || "Без названия"}
                    
                  </button>

                  <span className="backlog-col delta-num">{plan > 0 ? fmt2(plan) : "—"}</span>

                  {/* Отработанные часы: задача могла прийти из месяца, где на
                      неё уже потратили время. Эти часы зафиксированы и
                      вернутся в месяц вместе с задачей. */}
                  <span
                    className="backlog-col delta-num"
                    style={fact === 0 ? { color: "var(--tracker-text-muted)" } : undefined}
                    title={fact > 0 ? "Уже отработано до попадания в беклог" : undefined}
                  >
                    {fact > 0 ? fmt2(fact) : "—"}
                  </span>

                  <span className="backlog-col delta-num backlog-col--left">{fmt2(left)}</span>

                  <span className="backlog-col delta-num">{fmt2(running)}</span>

                  <span className="backlog-actions">
                    <button onClick={() => openReturnDialog(task)} title="Вернуть в месяц">
                      <CalendarPlus className="size-4" />
                    </button>
                    <button
                      onClick={() => setCommentArchiveDialog({
                        taskId: task.id,
                        taskName: task.name,
                        logs: task.commentLog || [],
                        open: true,
                      })}
                      title="Комментарии"
                    >
                      <ClipboardList className="size-4" />
                    </button>
                    {!isGuest && (
                      <button
                        className="backlog-del"
                        onClick={() => deleteBacklogTask(task.id)}
                        title="Удалить"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </span>
                </div>

                {/* Порог: до этой черты задачи умещаются в свободный остаток
                    месяца, ниже — уже нет. Считается по остатку работы,
                    а не по полному плану: часть часов могла быть отработана. */}
                {showThreshold && (
                  <div className="backlog-threshold">
                    <span>Дальше бюджет {MONTHS[currentMonth].toLowerCase()} исчерпан</span>
                    <span className="delta-num">{fmt2(freeHours)} ч свободно</span>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}

      {!isGuest && (
        <Button
          size="sm"
          className="gap-1.5 bg-[var(--tracker-accent)] text-[var(--tracker-accent-contrast)] hover:bg-[var(--tracker-accent-hover)] shadow-md"
          style={{ boxShadow: "0 2px 12px color-mix(in srgb, var(--tracker-accent, #17181C) 35%, transparent)" }}
          onClick={handleAdd}
        >
          <Plus className="size-3.5" />
          Создать задачу
        </Button>
      )}

      {/* ---- RETURN FROM BACKLOG DIALOG ---- */}
      <Dialog open={dialog.open} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-center sm:text-left">
            <div className="flex flex-col items-center sm:items-start gap-2">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--tracker-accent-soft)]">
                <ClipboardList className="size-5 text-[var(--tracker-accent-fg)]" />
              </div>
              <div>
                <DialogTitle className="text-lg">Создать задачу из беклога</DialogTitle>
                <DialogDescription className="mt-0.5">Заполните параметры новой задачи</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="grid grid-cols-[100px_1fr] gap-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">№ Задачи</label>
                <Input value={dialog.num} onChange={(e) => setDialog(prev => ({ ...prev, num: e.target.value }))} placeholder="Номер..." className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Наименование</label>
                <Input value={dialog.name} onChange={(e) => setDialog(prev => ({ ...prev, name: e.target.value }))} placeholder="Название задачи..." className="h-9 text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">План, ч</label>
                <Input value={dialog.planH} onChange={(e) => setDialog(prev => ({ ...prev, planH: e.target.value }))} placeholder="0" className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Факт, ч</label>
                <Input value={dialog.factH} onChange={(e) => setDialog(prev => ({ ...prev, factH: e.target.value }))} placeholder="0" className="h-9 text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Месяц</label>
                <Select value={String(dialog.month)} onValueChange={(v) => setDialog(prev => ({ ...prev, month: Number(v) }))}>
                  <SelectTrigger className="h-9 text-sm w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={m} value={String(i)} className="text-sm">{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Приоритет</label>
                <Select value={dialog.priority} onValueChange={(v) => setDialog(prev => ({ ...prev, priority: v as Priority }))}>
                  <SelectTrigger className="h-9 text-sm w-full" style={{ color: PCOL[dialog.priority] || undefined }}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {priorityValues.map((p) => (
                      <SelectItem key={p} value={p} className="text-sm"><span style={{ color: PCOL[p] }}>{p}</span></SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Статус</label>
                <Select value={dialog.status} onValueChange={(v) => setDialog(prev => ({ ...prev, status: v as Status }))}>
                  <SelectTrigger className="h-9 text-sm w-full" style={{ color: scolText(dialog.status, isDark) || undefined }}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {statusValues.map((s) => (
                      <SelectItem key={s} value={s} className="text-sm">
                        <span style={{ color: scolText(s, isDark) || "#888" }}>{s}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:flex-row sm:justify-stretch">
            <Button onClick={handleReturnToTable} className="flex-1 bg-[var(--tracker-accent)] text-[var(--tracker-accent-contrast)] hover:bg-[var(--tracker-accent-hover)]">
              Перенести в таблицу
            </Button>
            <Button variant="destructive" onClick={closeDialog} className="flex-1">
              Отмена
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

