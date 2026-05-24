"use client";
import React, { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AutoResizeTextarea } from "@/components/auto-resize-textarea";
import {
  Card, CardContent,
} from "@/components/ui/card";
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
import {
  Table, TableHeader, TableBody,
  TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { Trash2, GripVertical, Archive, ArrowRight, Plus, ChevronDown, Save, FolderOpen, Presentation, FileText } from "lucide-react";
import {
  MONTHS, STATUSES, PRIORITIES, PCOL, scolText,
  type Status, type Priority, type Task,
} from "@/lib/types";
import { evalExpr, progColor, fmt2, createNewTask } from "@/lib/metrics";
import { useTaskStore } from "@/lib/store";

export interface BacklogViewProps {
  backlog: Task[];
  currentMonth: number;
  updateBacklogTask: (taskId: string, key: keyof Task, value: unknown) => void;
  deleteBacklogTask: (taskId: string) => void;
  reorderBacklog: (fromId: string, toId: string) => void;
  setCommentArchiveDialog: (v: { taskId: string; taskName: string; logs: Array<{ date: string; week: string; text: string; planH: string; factH: string; status: string }>; open: boolean }) => void;
  isDark: boolean;
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
    if (rank === 1) return { borderLeft: "3px solid var(--tracker-danger)", background: "color-mix(in srgb, var(--tracker-danger) 5%, transparent)" };
    if (rank === 2) return { borderLeft: "3px solid #f97316", background: "color-mix(in srgb, #f97316 4%, transparent)" };
    if (rank === 3) return { borderLeft: "3px solid #eab308", background: "color-mix(in srgb, #eab308 3%, transparent)" };
    if (rank <= 5) return { borderLeft: "3px solid var(--tracker-border)", background: "transparent" };
    return { borderLeft: "3px solid transparent", background: "transparent" };
  };

  const getQueueBadgeStyle = (idx: number): React.CSSProperties => {
    const rank = idx + 1;
    if (rank === 1) return { background: "var(--tracker-danger)", color: "#fff", fontWeight: 700 };
    if (rank === 2) return { background: "#f97316", color: "#fff", fontWeight: 700 };
    if (rank === 3) return { background: "#eab308", color: "#fff", fontWeight: 600 };
    if (rank <= 5) return { background: "var(--tracker-accent-bg)", color: "var(--tracker-accent-fg-dark)", fontWeight: 600 };
    return { background: "transparent", color: "var(--tracker-text-muted)", fontWeight: 500, border: "1px solid var(--tracker-border)" };
  };

  return (
    <div className="space-y-3">
      <Card className="max-h-[70vh] overflow-auto py-0">
        <Table className="border-collapse sticky-table-header">
          <TableHeader className="bg-[var(--tracker-accent-bg,#f3f0fb)]">
            <TableRow className="[&_th]:text-[var(--tracker-accent-fg-dark,#3d2264)]">
              <TableHead className="w-12 text-center">Очередь</TableHead>
              <TableHead className="min-w-[260px]">Наименование</TableHead>
              <TableHead className="w-28 text-right">План, ч</TableHead>
              <TableHead className="min-w-[220px]">Комментарий</TableHead>
              <TableHead className="w-24 text-center">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {backlog.map((task, idx) => {
              const qStyle = getQueueStyle(idx, backlog.length);
              const qBadge = getQueueBadgeStyle(idx);
              const isDragging = dragRowId === task.id;
              const isDropTarget = dropTargetId === task.id && dragRowId !== task.id;
              return (
                <TableRow
                  key={task.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, task.id)}
                  onDragOver={(e) => handleDragOver(e, task.id)}
                  onDrop={(e) => handleDrop(e, task.id)}
                  onDragEnd={handleDragEnd}
                  style={qStyle}
                  className={`cursor-move transition-opacity ${isDragging ? "opacity-30" : ""} ${isDropTarget ? "!border-t-2 !border-b-2 !border-[var(--tracker-accent)] !bg-[var(--tracker-accent)]/[0.06]" : ""}`}
                >
                  {/* Queue number */}
                  <TableCell className="text-center px-2">
                    {isEdit(task.id, "queue") ? (
                      <input
                        ref={inputRef}
                        type="number"
                        min={1}
                        max={backlog.length}
                        defaultValue={idx + 1}
                        className="w-12 text-center text-sm font-bold rounded border border-[var(--tracker-border)] bg-transparent outline-none focus:ring-1 focus:ring-[var(--tracker-accent)] p-0.5"
                        onBlur={(e) => { handleQueueChange(task.id, e.target.value); stopEdit(); }}
                        onKeyDown={(e) => { if (e.key === "Enter") { handleQueueChange(task.id, (e.target as HTMLInputElement).value); stopEdit(); } if (e.key === "Escape") stopEdit(); }}
                      />
                    ) : (
                      <span
                        onClick={() => startEdit(task.id, "queue")}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs cursor-pointer hover:scale-110 transition-transform"
                        style={qBadge}
                        title="Нажмите, чтобы изменить позицию"
                      >
                        {idx + 1}
                      </span>
                    )}
                  </TableCell>

                  {/* Name */}
                  <TableCell className="max-w-[320px]">
                    {isEdit(task.id, "name") ? (
                      <AutoResizeTextarea
                        ref={textareaRef}
                        className="text-sm w-full"
                        value={task.name}
                        onChange={(e) => updateBacklogTask(task.id, "name", e.target.value)}
                        onBlur={stopEdit}
                        onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === "Escape") stopEdit(); }}
                      />
                    ) : (
                      <span
                        onClick={() => startEdit(task.id, "name")}
                        className="cursor-pointer flex items-center gap-1 text-sm rounded px-1 py-0.5 hover:bg-muted/50"
                        title={task.name}
                      >
                        {task.num && (
                          <span className="text-[11px] shrink-0" style={{ color: "var(--tracker-text-muted)" }}>
                            #{task.num}
                          </span>
                        )}
                        <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                          {task.name || <span className="italic text-muted-foreground opacity-50">введите название...</span>}
                        </span>
                      </span>
                    )}
                  </TableCell>

                  {/* Plan hours */}
                  <TableCell className="text-right">
                    {isEdit(task.id, "planH") ? (
                      <input
                        ref={inputRef}
                        type="text"
                        defaultValue={task.planH}
                        className="w-20 text-right text-sm rounded border border-[var(--tracker-border)] bg-transparent outline-none focus:ring-1 focus:ring-[var(--tracker-accent)] p-0.5 ml-auto block"
                        onBlur={(e) => { updateBacklogTask(task.id, "planH", e.target.value); stopEdit(); }}
                        onKeyDown={(e) => { if (e.key === "Enter") { updateBacklogTask(task.id, "planH", (e.target as HTMLInputElement).value); stopEdit(); } if (e.key === "Escape") stopEdit(); }}
                      />
                    ) : (
                      <span
                        onClick={() => startEdit(task.id, "planH")}
                        className="cursor-pointer rounded px-1 py-0.5 text-sm font-medium hover:bg-muted/50 inline-block"
                        style={{ color: "var(--tracker-accent-fg-dark)" }}
                      >
                        {task.planH || "—"}
                      </span>
                    )}
                  </TableCell>

                  {/* Comment */}
                  <TableCell className="max-w-[260px]">
                    <div className="flex items-start gap-1 w-full">
                      {isEdit(task.id, "comment") ? (
                        <AutoResizeTextarea
                          ref={textareaRef}
                          className="text-sm flex-1"
                          value={task.comment}
                          onChange={(e) => updateBacklogTask(task.id, "comment", e.target.value)}
                          onBlur={(e) => handleCommentSave(task, e.target.value)}
                          onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === "Escape") { handleCommentSave(task, task.comment); } }}
                        />
                      ) : (
                        <span
                          onClick={() => startEdit(task.id, "comment")}
                          className="cursor-pointer block text-sm rounded px-1 py-0.5 hover:bg-muted/50 overflow-hidden text-ellipsis whitespace-nowrap flex-1 text-muted-foreground"
                          title={task.comment}
                        >
                          {task.comment || <span className="italic opacity-40">комментарий...</span>}
                        </span>
                      )}
                      {task.commentLog && task.commentLog.length > 0 && (
                        <button
                          onClick={() => openArchive(task)}
                          className="shrink-0 flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full transition-colors hover:bg-[var(--tracker-accent-bg)]"
                          style={{ color: "var(--tracker-accent-fg-dark)", whiteSpace: "nowrap" }}
                          title="Архив комментариев"
                        >
                          <span>📜</span>
                          <span>{task.commentLog.length}</span>
                        </button>
                      )}
                    </div>
                  </TableCell>

                  {/* Actions */}
                  <TableCell>
                    <div className="flex items-center justify-center gap-0.5">
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => openReturnDialog(task)}
                        title="Вернуть в таблицу"
                      >
                        <span className="text-sm">📋</span>
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => deleteBacklogTask(task.id)}
                        title="Удалить"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {backlog.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>
                  <EmptyState
                    type="backlog"
                    onAction={handleAdd}
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Button
        size="sm"
        className="gap-1.5 bg-[var(--tracker-accent)] text-white hover:bg-[var(--tracker-accent-hover)]"
        onClick={handleAdd}
      >
        <Plus className="size-3.5" />
        Создать задачу
      </Button>

      {/* ---- RETURN FROM BACKLOG DIALOG ---- */}
      <Dialog open={dialog.open} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-center sm:text-left">
            <div className="flex flex-col items-center sm:items-start gap-2">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--tracker-accent-soft)]">
                <span className="text-lg">📦</span>
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
            <Button onClick={handleReturnToTable} className="flex-1 bg-[var(--tracker-accent)] text-white hover:bg-[var(--tracker-accent-hover)]">
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

