"use client";
import React, { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { AutoResizeTextarea } from "@/components/auto-resize-textarea";
import { EmptyState } from "@/components/empty-state";
import { TaskContextMenu } from "@/components/task-context-menu";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem,
  DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Plus, Trash2, Search, Eye, EyeOff,
  Filter, X,
  FileSpreadsheet, Upload, ArrowRight, Check,
  ArrowUpDown, Save, FolderOpen, FileText,
  Package, MessageSquare, Ruler, Timer, Wallet,
} from "lucide-react";
import {
  MONTHS, STATUSES, PRIORITIES, PCOL, scolText,
  type Status, type Priority, type Task, STATUS_ORDER, PRIO_START,
  PHASE_COLORS, getPhaseForStatus,
} from "@/lib/types";
import {
  evalExpr, fmt2, progColor,
  getTaskMetrics, CLOSED_STATUSES,
} from "@/lib/metrics";
import { useTaskStore } from "@/lib/store";

import type { EditingCell } from "@/app/page";

export interface TableViewProps {
  rows: Task[];
  totalRows: Task[];
  allData: Record<number, Task[]>;
  backlog: Task[];
  qMap: Record<string, number>;
  totalFactMap: Record<string, number>;
  rowsMetrics: {
    totPlan: number;
    totFact: number;
    totTotalH: number;
    avgProg: number;
  };
  month: number;
  clientMode: boolean;
  editingCell: EditingCell | null;
  editRef: React.RefObject<
    HTMLTextAreaElement | HTMLInputElement | null
  >;
  inputEditRef: React.RefObject<HTMLInputElement | null>;
  isEditing: (rowId: string, col: string) => boolean;
  startEditing: (rowId: string, col: string) => void;
  stopEditing: () => void;
  /** Phase 7.3: коммит формул @факт/@план в комментарии при выходе из ячейки. */
  commitCommentFormulas: (month: number, taskId: string) => void;
  updateTask: (
    month: number,
    taskId: string,
    key: keyof Task,
    value: unknown
  ) => void;
  deleteTask: (month: number, taskId: string) => void;
  reorderTask: (month: number, fromId: string, toId: string) => void;
  sortMonthTasks: (month: number, key: "priority" | "status") => void;
  moveToBacklog: (month: number, taskId: string) => void;
  toggleHidden: (taskId: string) => void;
  handleSort: (key: string) => void;
  sortKey: string;
  sortDir: number;
  filterStatuses: Set<Status>;
  filterPriorities: Set<Priority>;
  searchQuery: string;
  toggleStatusFilter: (s: Status) => void;
  togglePriorityFilter: (p: Priority) => void;
  setSearchQuery: (q: string) => void;
  clearFilters: () => void;
  onCreatePresentation: () => void;
  onOpenTransfer: () => void;
  onOpenNewTaskDialog: (month: number) => void;
  setTotalHDialog: (v: {
    taskNum: string;
    open: boolean;
  }) => void;
  setCommentArchiveDialog: (v: {
    taskId: string;
    taskName: string;
    logs: Array<{ date: string; week: string; text: string; planH: string; factH: string; status: string }>;
    open: boolean;
  }) => void;
  selectedRowId: string | null;
  setSelectedRowId: (id: string | null) => void;
  isDark: boolean;
  accentHex: string;
  onExportJSON: () => void;
  onExportMonthXLSX: () => void;
  onExportAllXLSX: () => void;
  onExportPDF: () => void;
  onImportJSON: () => void;
  onImportXLSX: () => void;
  /** Delta: открыть Sheet бюджета и сигналов для задачи */
  onOpenBudgetSheet?: (task: Task, month: number) => void;
  /** Открыть детальный попап задачи */
  onOpenTaskDetail?: (task: Task, month: number) => void;
  // Multi-select for bulk operations
  selectedTaskIds: Set<string>;
  toggleTaskSelection: (id: string) => void;
  selectAllTasks: (ids: string[]) => void;
  clearSelection: () => void;
  bulkUpdateTasks: (month: number, ids: string[], key: keyof Task, value: unknown) => void;
  duplicateTask: (month: number, taskId: string) => void;
  /** Руководитель — видит назначенные домены, может комментировать, но не менять статусы. */
  isExecutive?: boolean;
  /** Гость — только просмотр, без возможности редактирования. */
  isGuest?: boolean;
}

export function TableView({
  isDark,
  rows,
  totalRows,
  allData,
  backlog,
  qMap,
  totalFactMap,
  rowsMetrics,
  month,
  clientMode,
  editingCell,
  editRef,
  inputEditRef,
  isEditing,
  startEditing,
  stopEditing,
  commitCommentFormulas,
  updateTask,
  deleteTask,
  reorderTask,
  sortMonthTasks,
  moveToBacklog,
  toggleHidden,
  handleSort,
  sortKey,
  sortDir,
  filterStatuses,
  filterPriorities,
  searchQuery,
  toggleStatusFilter,
  togglePriorityFilter,
  setSearchQuery,
  clearFilters,
  onCreatePresentation,
  onOpenTransfer,
  setTotalHDialog,
  setCommentArchiveDialog,
  selectedRowId,
  setSelectedRowId,
  accentHex,
  onExportJSON,
  onExportMonthXLSX,
  onExportAllXLSX,
  onExportPDF,
  onImportJSON,
  onImportXLSX,
  onOpenNewTaskDialog,
  onOpenBudgetSheet,
  onOpenTaskDetail,
  selectedTaskIds,
  toggleTaskSelection,
  selectAllTasks,
  clearSelection,
  bulkUpdateTasks,
  duplicateTask,
  isExecutive,
  isGuest,
}: TableViewProps) {
  const { toast } = useToast();
  /* ---- Drag & Drop state ---- */
  const [dragRowId, setDragRowId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropGroupPriority, setDropGroupPriority] = useState<Priority | null>(null);

  /* ---- Delete confirmation ---- */
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; taskId: string; taskName: string }>({ open: false, taskId: "", taskName: "" });

  const handleDragStart = useCallback((e: React.DragEvent, rowId: string) => {
    e.stopPropagation();
    e.dataTransfer.setData("application/task-row", rowId);
    e.dataTransfer.effectAllowed = "move";
    setDragRowId(rowId);
  }, []);

  const handleRowDragOver = useCallback((e: React.DragEvent, rowId: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDropTargetId(rowId);
    setDropGroupPriority(null);
  }, []);

  const handleRowDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const fromId = e.dataTransfer.getData("application/task-row");
    if (fromId && fromId !== targetId) {
      reorderTask(month, fromId, targetId);
    }
    setDragRowId(null);
    setDropTargetId(null);
    setDropGroupPriority(null);
  }, [month, reorderTask]);

  const handleGroupDragOver = useCallback((e: React.DragEvent, priority: Priority) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDropGroupPriority(priority);
    setDropTargetId(null);
  }, []);

  const handleGroupDrop = useCallback((e: React.DragEvent, targetPriority: Priority) => {
    e.preventDefault();
    e.stopPropagation();
    const fromId = e.dataTransfer.getData("application/task-row");
    if (fromId) {
      const task = rows.find(t => t.id === fromId);
      if (task && task.priority !== targetPriority) {
        useTaskStore.getState().snapshot();
        updateTask(month, fromId, "priority", targetPriority);
        const prioNum = PRIO_START[targetPriority] ?? 50;
        const fromPrioNum = PRIO_START[task.priority] ?? 50;
        const movingDown = prioNum > fromPrioNum;
        const allIds = rows.map(t => t.id);
        const targetIds = allIds.filter(id => id !== fromId);
        const targetTasks = rows.filter(t => t.id !== fromId);
        if (movingDown) {
          const firstInGroup = targetTasks.findIndex(t => t.priority === targetPriority);
          if (firstInGroup >= 0) {
            const anchorId = targetTasks[firstInGroup].id;
            setTimeout(() => reorderTask(month, fromId, anchorId), 0);
          }
        } else {
          const lastInGroup = [...targetTasks].reverse().findIndex(t => t.priority === targetPriority);
          if (lastInGroup >= 0) {
            const idx = targetTasks.length - 1 - lastInGroup;
            const nextTask = targetTasks[idx + 1];
            if (nextTask) {
              setTimeout(() => reorderTask(month, fromId, nextTask.id), 0);
            }
          }
        }
      }
    }
    setDragRowId(null);
    setDropTargetId(null);
    setDropGroupPriority(null);
  }, [month, rows, updateTask, reorderTask]);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    e.stopPropagation();
    setDragRowId(null);
    setDropTargetId(null);
    setDropGroupPriority(null);
  }, []);

  return (
    <div className="space-y-3">
      {/* ---- SEARCH BAR ---- */}
      <div className="relative hidden md:block">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Поиск задач по номеру, названию, статусу..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-9 pl-9 pr-4 text-sm bg-[var(--tracker-bg-card)] border-[var(--tracker-border)]"
        />
        {searchQuery && (
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setSearchQuery("")}
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* ---- TOOLBAR ---- */}
      {!clientMode && (() => {
        const totalFilters = filterStatuses.size + filterPriorities.size + (searchQuery ? 1 : 0);
        const btnClass = "hidden md:inline-flex h-8 gap-1.5 border-[var(--tracker-accent)]/30 text-[var(--tracker-accent-fg)] hover:bg-[var(--tracker-accent-soft)]";
        return (
          <div className="flex flex-wrap items-center gap-2">

            {/* ── ФИЛЬТР ───────────────────────────────────────────── */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className={btnClass + " !flex"}>
                  <Filter className="size-3.5" />
                  Фильтр
                  {totalFilters > 0 && (
                    <Badge variant="secondary" className="ml-0.5 h-5 px-1.5 text-xs">{totalFilters}</Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-80 p-2">
                {/* Search */}
                <div className="relative mb-2" onKeyDown={e => e.stopPropagation()}>
                  <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Поиск задач..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="h-8 pl-8 text-sm"
                  />
                </div>

                {/* Global search results */}
                {searchQuery.trim().length >= 2 && (() => {
                  const q = searchQuery.trim().toLowerCase();
                  const globalMatches: { label: string; num: string; name: string; monthIdx: number | null }[] = [];
                  for (let m = 0; m < 12; m++) {
                    const monthRows = (allData[m] || []);
                    for (const r of monthRows) {
                      if ((r.num || "").toLowerCase().includes(q) || (r.name || "").toLowerCase().includes(q)) {
                        globalMatches.push({ label: MONTHS[m], num: r.num, name: r.name, monthIdx: m });
                        if (globalMatches.length >= 8) break;
                      }
                    }
                    if (globalMatches.length >= 8) break;
                  }
                  // Search backlog too
                  if (globalMatches.length < 8) {
                    for (const r of (backlog || [])) {
                      if ((r.num || "").toLowerCase().includes(q) || (r.name || "").toLowerCase().includes(q)) {
                        globalMatches.push({ label: "Беклог", num: r.num, name: r.name, monthIdx: null });
                        if (globalMatches.length >= 8) break;
                      }
                    }
                  }
                  if (globalMatches.length === 0) return null;
                  return (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-xs text-muted-foreground">Найдено в домене</DropdownMenuLabel>
                      <div className="max-h-48 overflow-y-auto space-y-0.5">
                        {globalMatches.map((m, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between px-2 py-1 rounded text-xs hover:bg-[var(--tracker-accent-bg)] cursor-pointer"
                            onClick={() => {
                              if (m.monthIdx !== null) {
                                useTaskStore.getState().setCurrentMonth(m.monthIdx);
                                useTaskStore.getState().setView("table");
                              } else {
                                useTaskStore.getState().setView("backlog");
                              }
                            }}
                          >
                            <span className="truncate text-[var(--tracker-text-main)] font-medium mr-2">
                              {m.num ? `#${m.num} ` : ""}{m.name || "—"}
                            </span>
                            <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--tracker-accent-bg)] text-[var(--tracker-accent-fg-dark)]">
                              {m.label}
                            </span>
                          </div>
                        ))}
                      </div>
                      <DropdownMenuSeparator />
                    </>
                  );
                })()}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs">Статус</DropdownMenuLabel>
                <div className="px-1 py-0.5">
                  {([
                    { label: "Новая", items: [STATUSES.IDEA, STATUSES.NEW], color: PHASE_COLORS.new },
                    { label: "В работе", items: [STATUSES.ANALYSIS, STATUSES.APPROVAL, STATUSES.QUEUE_DEV, STATUSES.DEV, STATUSES.TEST, STATUSES.RELEASE, STATUSES.DOCS], color: PHASE_COLORS.in_progress },
                    { label: "Завершена", items: [STATUSES.COMPLETED, STATUSES.PROD_CHECK, STATUSES.DONE], color: PHASE_COLORS.done },
                    { label: "Отмена", items: [STATUSES.POSTPONED, STATUSES.CANCEL], color: PHASE_COLORS.cancel },
                  ]).map((group) => (
                    <div key={group.label} className="mb-1.5">
                      <div className="text-[8px] uppercase tracking-wider font-semibold mb-0.5 px-1" style={{ color: group.color }}>{group.label}</div>
                      <div className="flex flex-wrap gap-1 px-1">
                        {group.items.map((s) => (
                          <button
                            key={s}
                            onClick={(e) => { e.stopPropagation(); toggleStatusFilter(s); }}
                            className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full transition-all ${filterStatuses.has(s) ? "ring-1 ring-offset-1" : "opacity-70 hover:opacity-100"}`}
                            style={{
                              color: scolText(s, isDark) || "#888",
                              background: (scolText(s, isDark) || "#888") + "20",
                              ...(filterStatuses.has(s) ? { ringColor: scolText(s, isDark) || "#888", outlineColor: scolText(s, isDark) || "#888" } : {}),
                            }}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs">Приоритет</DropdownMenuLabel>
                <div className="flex flex-wrap gap-1 px-1 py-0.5">
                  {Object.values(PRIORITIES).map(p => (
                    <button
                      key={p}
                      onClick={(e) => { e.stopPropagation(); togglePriorityFilter(p); }}
                      className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full transition-all ${filterPriorities.has(p) ? "ring-1 ring-offset-1" : "opacity-70 hover:opacity-100"}`}
                      style={{
                        color: PCOL[p],
                        background: PCOL[p] + "20",
                        ...(filterPriorities.has(p) ? { ringColor: PCOL[p], outlineColor: PCOL[p] } : {}),
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                {totalFilters > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={clearFilters} className="text-xs gap-1.5 text-muted-foreground cursor-pointer">
                      <X className="size-3.5" />
                      Сбросить фильтры
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* ── СОРТИРОВКА ───────────────────────────────────────── */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className={btnClass + " !flex"}>
                  <ArrowUpDown className="size-3.5" />
                  Сортировка
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel className="text-xs">Переставить задачи</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => sortMonthTasks(month, "priority")} className="gap-2 cursor-pointer text-xs">
                  <ArrowUpDown className="size-3.5" />
                  По приоритету
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => sortMonthTasks(month, "status")} className="gap-2 cursor-pointer text-xs">
                  <ArrowUpDown className="size-3.5" />
                  По статусу
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="flex-1" />

            {/* ── ДОБАВИТЬ ЗАДАЧУ ───────────────────────────────────── */}
            {!isGuest && (
              <Button
                size="sm"
                className="h-8 gap-1.5 bg-[var(--tracker-accent)] text-white hover:bg-[var(--tracker-accent-hover)] shadow-md"
                style={{ boxShadow: "0 2px 12px color-mix(in srgb, var(--tracker-accent, #9B72CF) 35%, transparent)" }}
                onClick={() => onOpenNewTaskDialog(month)}
              >
                <Plus className="size-3.5" />
                Добавить задачу
              </Button>
            )}

            {/* ── ПЕРЕНЕСТИ ────────────────────────────────────────── */}
            <Button variant="outline" size="sm" className={btnClass} onClick={onOpenTransfer}>
              <ArrowRight className="size-3.5" />
              Перенести
            </Button>

            {/* ── ФАЙЛЫ (Сохранить + Загрузить) ────────────────────── */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className={btnClass}>
                  <FolderOpen className="size-3.5" />
                  Файлы
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="text-xs">Сохранить</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onExportMonthXLSX} className="gap-2 cursor-pointer text-xs">
                  <FileSpreadsheet className="size-3.5" />
                  Excel (месяц)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onExportAllXLSX} className="gap-2 cursor-pointer text-xs">
                  <FileSpreadsheet className="size-3.5" />
                  Excel (все)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onExportJSON} className="gap-2 cursor-pointer text-xs">
                  <Save className="size-3.5" />
                  JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onExportPDF} className="gap-2 cursor-pointer text-xs">
                  <FileText className="size-3.5" />
                  PDF (печать)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs">Загрузить</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onImportJSON} className="gap-2 cursor-pointer text-xs">
                  <Upload className="size-3.5" />
                  JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onImportXLSX} className="gap-2 cursor-pointer text-xs">
                  <Upload className="size-3.5" />
                  Excel (месяц)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

          </div>
        );
      })()}


      {/* ---- MOBILE TASK CARDS (md:hidden) ---- */}
      <div className="md:hidden space-y-2">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <span className="text-4xl mb-3">📋</span>
            <p className="text-sm font-medium">Нет задач</p>
            <p className="text-xs mt-1 opacity-60">Добавьте первую задачу</p>
          </div>
        ) : (
          rows.map((task) => {
            const metrics = getTaskMetrics(task, totalFactMap);
            const pct = metrics.totalH > 0 && evalExpr(task.planH) > 0
              ? Math.min(100, (metrics.totalH / evalExpr(task.planH)) * 100)
              : null;
            const isOver = pct !== null && pct > 100;
            return (
              <div
                key={task.id}
                onClick={() => onOpenTaskDetail?.(task, month)}
                className="mobile-task-card"
              >
                {/* Top row: number + priority */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="mobile-task-num">#{task.num || "—"}</span>
                    {task.approvalStatus === "pending" && (
                      <span className="mobile-task-pending-badge">⏳ Ожидает БА</span>
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
                    <span className="flex items-center gap-1"><Ruler className="size-3" /> {task.planH || "0"}ч</span>
                    <span className={`flex items-center gap-1 ${isOver ? "text-red-500 font-semibold" : ""}`}>
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

      {/* ---- DESKTOP CARD LIST ---- */}
      {/* Bulk actions bar (hidden for executives and guests — can't change statuses) */}
      {!isExecutive && !isGuest && selectedTaskIds.size > 0 && (() => {
        const snapshot = useTaskStore.getState().snapshot;
        return (
          <div className="flex items-center gap-2 p-2 rounded-lg border bg-[var(--tracker-accent-bg)]/60 border-[var(--tracker-accent)]/30">
            <span className="text-sm font-medium text-[var(--tracker-accent-fg)]">
              ✓ Выбрано: {selectedTaskIds.size}
            </span>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs border-[var(--tracker-accent)]/30">
                  🏷️ Статус
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[280px] p-2" align="start" side="bottom">
                <div className="flex flex-col gap-1.5">
                  {([
                    { label: "Новая", items: [STATUSES.IDEA, STATUSES.NEW], color: PHASE_COLORS.new },
                    { label: "В работе", items: [STATUSES.ANALYSIS, STATUSES.APPROVAL, STATUSES.QUEUE_DEV, STATUSES.DEV, STATUSES.TEST, STATUSES.RELEASE, STATUSES.DOCS], color: PHASE_COLORS.in_progress },
                    { label: "Завершена", items: [STATUSES.COMPLETED, STATUSES.PROD_CHECK, STATUSES.DONE], color: PHASE_COLORS.done },
                    { label: "Отмена", items: [STATUSES.POSTPONED, STATUSES.CANCEL], color: PHASE_COLORS.cancel },
                  ]).map((group) => (
                    <div key={group.label}>
                      <div className="text-[8px] uppercase tracking-wider font-semibold mb-0.5 px-0.5" style={{ color: group.color }}>{group.label}</div>
                      <div className="flex flex-wrap gap-1">
                        {group.items.map((s) => (
                          <button
                            key={s}
                            onClick={() => {
                              const ids = Array.from(selectedTaskIds);
                              snapshot();
                              ids.forEach(id => bulkUpdateTasks(month, [id], "status", s));
                              clearSelection();
                              toast({ title: "🏷️ Статус", description: `${ids.length} задач → ${s}` });
                            }}
                            className="text-[9px] font-medium px-1.5 py-0.5 rounded-full transition-all opacity-70 hover:opacity-100"
                            style={{
                              color: scolText(s, isDark) || "#888",
                              background: (scolText(s, isDark) || "#888") + "20",
                            }}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs border-[var(--tracker-accent)]/30">
                  ⚡ Приоритет
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {Object.values(PRIORITIES).map(p => (
                  <DropdownMenuItem key={p} className="text-xs gap-2" onClick={() => {
                    const ids = Array.from(selectedTaskIds);
                    snapshot();
                    ids.forEach(id => bulkUpdateTasks(month, [id], "priority", p));
                    clearSelection();
                    toast({ title: "⚡ Приоритет", description: `${ids.length} задач → ${p}` });
                  }}>
                    <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PCOL[p] }} />
                    {p}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="outline" size="sm"
              className="h-7 text-xs border-[var(--tracker-accent)]/30"
              onClick={() => {
                const ids = Array.from(selectedTaskIds);
                snapshot();
                ids.forEach(id => moveToBacklog(month, id));
                clearSelection();
                toast({ title: "📦 Беклог", description: `${ids.length} задач перемещено в беклог` });
              }}
            >
              📦 В беклог
            </Button>

            <Button
              variant="outline" size="sm"
              className="h-7 text-xs border-destructive/50 text-destructive hover:bg-destructive/10"
              onClick={() => {
                const ids = Array.from(selectedTaskIds);
                snapshot();
                ids.forEach(id => deleteTask(month, id));
                clearSelection();
                toast({ title: "🗑 Удалено", description: `${ids.length} задач удалено` });
              }}
            >
              🗑 Удалить
            </Button>

            <div className="flex-1" />
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearSelection}>
              Сбросить
            </Button>
          </div>
        );
      })()}

      {/* Summary bar */}
      {rows.length > 0 && (
        <div className="hidden md:flex items-center gap-4 px-4 py-2.5 rounded-xl text-xs font-medium" style={{ background: "color-mix(in srgb, var(--tracker-accent, #9B72CF) 6%, var(--tracker-bg-card, #fff))" }}>
          <span className="text-[var(--tracker-accent-fg)] font-bold tracking-wide">ИТОГО</span>
          <span className="text-[var(--tracker-text-muted)]">План: <span className="text-[var(--tracker-text-main)] font-semibold">{fmt2(rowsMetrics.totPlan)}ч</span></span>
          <span className="text-[var(--tracker-text-muted)]">Факт: <span className={rowsMetrics.totFact > rowsMetrics.totPlan ? "text-[var(--tracker-danger)] font-semibold" : "text-[var(--tracker-text-main)] font-semibold"}>{fmt2(rowsMetrics.totFact)}ч</span></span>
          <span className="text-[var(--tracker-accent-fg)] font-bold">Итого: {fmt2(rowsMetrics.totTotalH)}ч</span>
          <div className="flex items-center gap-1.5 ml-auto">
            <div className="h-2 w-24 rounded-full overflow-hidden" style={{ background: "color-mix(in srgb, var(--tracker-accent, #9B72CF) 12%, transparent)" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${rowsMetrics.avgProg}%`, backgroundColor: progColor(rowsMetrics.avgProg) }} />
            </div>
            <span className="text-[var(--tracker-accent-fg)] font-bold">{rowsMetrics.avgProg}%</span>
          </div>
        </div>
      )}

      <div className="hidden md:block">
        {rows.length === 0 ? (
          <EmptyState
            type={totalRows.length === 0 ? "table" : "filter"}
            onAction={totalRows.length === 0 ? () => onOpenNewTaskDialog(month) : undefined}
          />
        ) : (
          <div className="space-y-1">
            {(() => {
              const priorityOrder: Priority[] = ["Наивысший", "Высокий", "Средний", "Низкий", "Очередь"];
              const grouped = priorityOrder.map(p => ({
                priority: p,
                color: PCOL[p],
                tasks: rows.filter(t => t.priority === p),
              }));

              return grouped.map((group) => (
                <div key={group.priority} className="priority-group">
                  <div
                    className={`priority-group-header transition-all duration-200 ${dropGroupPriority === group.priority ? "ring-2 ring-offset-1" : ""}`}
                    style={{
                      background: group.color + "18",
                      color: group.color,
                      ...(dropGroupPriority === group.priority ? { ringColor: group.color, borderColor: group.color } : {}),
                    }}
                    onDragOver={(e) => handleGroupDragOver(e, group.priority)}
                    onDrop={(e) => handleGroupDrop(e, group.priority)}
                  >
                    <span style={{ width: 3, height: 16, borderRadius: 2, background: group.color, flexShrink: 0 }} />
                    <span>{group.priority}</span>
                    <span className="priority-group-count">{group.tasks.length} {group.tasks.length === 1 ? "задача" : group.tasks.length < 5 ? "задачи" : "задач"}</span>
                  </div>
                  <div
                    className={`task-card-grid ${group.tasks.length === 0 && dropGroupPriority === group.priority ? "min-h-[48px]" : ""}`}
                    onDragOver={group.tasks.length === 0 ? (e) => handleGroupDragOver(e, group.priority) : undefined}
                    onDrop={group.tasks.length === 0 ? (e) => handleGroupDrop(e, group.priority) : undefined}
                  >
                    {group.tasks.length === 0 && (
                      <div
                        className={`flex items-center justify-center rounded-lg border-2 border-dashed py-3 text-[10px] transition-all duration-200 ${dropGroupPriority === group.priority ? "opacity-100" : "opacity-30"}`}
                        style={{ borderColor: group.color, color: group.color, gridColumn: "1 / -1" }}
                      >
                        {dropGroupPriority === group.priority ? "Отпустите здесь" : "Перетащите задачу сюда"}
                      </div>
                    )}
                    {group.tasks.map((task) => {
                      const metrics = getTaskMetrics(task, totalFactMap);
                      const pct = metrics.totalH > 0 && evalExpr(task.planH) > 0
                        ? Math.min(100, (metrics.totalH / evalExpr(task.planH)) * 100)
                        : null;
                      const isOver = pct !== null && pct > 100;
                      const accentColor = PHASE_COLORS[getPhaseForStatus(task.status)] || "var(--tracker-accent)";
                      const queueNum = qMap[task.id];
                      const phase = getPhaseForStatus(task.status);
                      return (
                        <TaskContextMenu
                          key={task.id}
                          task={task}
                          month={month}
                          isDark={isDark}
                          updateTask={updateTask}
                          deleteTask={deleteTask}
                          moveToBacklog={moveToBacklog}
                          duplicateTask={duplicateTask}
                          isGuest={isGuest}
                        >
                        <div
                          className={`task-card ${dragRowId === task.id ? "opacity-40" : ""} ${dropTargetId === task.id && dragRowId !== task.id ? "drag-over" : ""}`}
                          style={{ "--card-accent-color": accentColor } as React.CSSProperties}
                          draggable={!clientMode}
                          onDragStart={(e) => {
                            const tag = (e.target as HTMLElement)?.tagName;
                            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON" || tag === "SELECT") return;
                            if ((e.target as HTMLElement)?.closest("button, select, input, textarea, [role='combobox']")) return;
                            handleDragStart(e, task.id);
                          }}
                          onDragEnd={handleDragEnd}
                          onClick={(e) => {
                            const tag = (e.target as HTMLElement)?.tagName;
                            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON" || tag === "SELECT") return;
                            if ((e.target as HTMLElement)?.closest("button, select, input, textarea, [role='combobox']")) return;
                            onOpenTaskDetail?.(task, month);
                          }}
                          onDragOver={(e) => handleRowDragOver(e, task.id)}
                          onDrop={(e) => handleRowDrop(e, task.id)}
                        >
                          <div className="flex items-start gap-2">
                            {!clientMode && (
                              <div
                                className="shrink-0 mt-0.5" onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={selectedTaskIds.has(task.id)}
                                  onCheckedChange={() => toggleTaskSelection(task.id)}
                                />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                {isEditing(task.id, "num") ? (
                                  <input
                                    ref={inputEditRef}
                                    className="w-16 text-[0.65rem] font-mono font-semibold px-1 py-0.5 rounded border border-[var(--tracker-accent)] bg-transparent outline-none"
                                    value={task.num}
                                    onChange={(e) => updateTask(month, task.id, "num", e.target.value)}
                                    onBlur={stopEditing}
                                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") stopEditing(); }}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                ) : (
                                  <span
                                    className="task-card-num cursor-pointer hover:text-[var(--tracker-accent)] transition-colors"
                                    onClick={(e) => { e.stopPropagation(); startEditing(task.id, "num"); }}
                                  >
                                    #{task.num || "—"}
                                  </span>
                                )}
                                {queueNum !== undefined && (
                                  <span
                                    className="inline-flex items-center justify-center text-[9px] font-bold w-5 h-5 rounded-full text-white"
                                    style={{ background: accentColor, boxShadow: `0 1px 4px ${accentColor}55` }}
                                  >
                                    {queueNum}
                                  </span>
                                )}
                                {task.approvalStatus === "pending" && (
                                  <span className="inline-flex items-center text-[9px] font-bold px-1 py-0.5 rounded bg-amber-100 text-amber-700 border border-dashed border-amber-300">⏳</span>
                                )}
                                {task._hidden && (
                                  <span className="inline-flex items-center text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground">скрыта</span>
                                )}
                              </div>
                              {isEditing(task.id, "name") ? (
                                <textarea
                                  ref={editRef as React.RefObject<HTMLTextAreaElement>}
                                  className="w-full text-sm font-medium p-1 rounded border border-[var(--tracker-accent)] bg-transparent outline-none resize-none leading-snug"
                                  style={{ boxShadow: "0 0 0 3px rgba(155,114,207,0.15)", minHeight: "28px" }}
                                  value={task.name}
                                  onChange={(e) => updateTask(month, task.id, "name", e.target.value)}
                                  onBlur={stopEditing}
                                  onKeyDown={(e) => { if (e.key === "Escape") stopEditing(); }}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              ) : (
                                <p
                                  className="task-card-name cursor-pointer hover:text-[var(--tracker-accent)] transition-colors"
                                  onClick={(e) => { e.stopPropagation(); startEditing(task.id, "name"); }}
                                >
                                  {task.name || <span className="italic opacity-40">без названия</span>}
                                </p>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                              {isExecutive || isGuest ? (
                                /* Executive: status badge is read-only */
                                <span
                                  className="h-5 w-auto min-w-[70px] text-[0.6rem] font-semibold rounded-full px-1.5 inline-flex items-center justify-center"
                                  style={{
                                    color: scolText(task.status, isDark) || "var(--tracker-text-muted)",
                                    background: (scolText(task.status, isDark) || "var(--tracker-accent)") + "18",
                                  }}
                                >
                                  {task.status}
                                </span>
                              ) : (
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button
                                      className="h-5 w-auto min-w-[70px] text-[0.6rem] font-semibold rounded-full px-1.5 border-none cursor-pointer hover:opacity-80 transition-opacity"
                                      style={{
                                        color: scolText(task.status, isDark) || "var(--tracker-text-muted)",
                                        background: (scolText(task.status, isDark) || "var(--tracker-accent)") + "18",
                                      }}
                                    >
                                      {task.status}
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-[280px] p-2" align="end" side="bottom">
                                    <div className="flex flex-col gap-1.5">
                                      {([
                                        { label: "Новая", items: [STATUSES.IDEA, STATUSES.NEW], color: PHASE_COLORS.new },
                                        { label: "В работе", items: [STATUSES.ANALYSIS, STATUSES.APPROVAL, STATUSES.QUEUE_DEV, STATUSES.DEV, STATUSES.TEST, STATUSES.RELEASE, STATUSES.DOCS], color: PHASE_COLORS.in_progress },
                                        { label: "Завершена", items: [STATUSES.COMPLETED, STATUSES.PROD_CHECK, STATUSES.DONE], color: PHASE_COLORS.done },
                                        { label: "Отмена", items: [STATUSES.POSTPONED, STATUSES.CANCEL], color: PHASE_COLORS.cancel },
                                      ]).map((group) => (
                                        <div key={group.label}>
                                          <div className="text-[8px] uppercase tracking-wider font-semibold mb-0.5 px-0.5" style={{ color: group.color }}>{group.label}</div>
                                          <div className="flex flex-wrap gap-1">
                                            {group.items.map((s) => (
                                              <button
                                                key={s}
                                                onClick={() => { useTaskStore.getState().snapshot(); updateTask(month, task.id, "status", s); }}
                                                className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full transition-all ${task.status === s ? "ring-1 ring-offset-1" : "opacity-70 hover:opacity-100"}`}
                                                style={{
                                                  color: scolText(s, isDark) || "#888",
                                                  background: (scolText(s, isDark) || "#888") + "20",
                                                  ...(task.status === s ? { ringColor: scolText(s, isDark) || "#888", outlineColor: scolText(s, isDark) || "#888" } : {}),
                                                }}
                                              >
                                                {s}
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 mt-2 pl-5 text-xs text-[var(--tracker-text-muted)]">
                            <span
                              className="cursor-pointer hover:text-[var(--tracker-text-main)] transition-colors rounded px-0.5 hover:bg-[var(--tracker-accent-soft)] flex items-center gap-1"
                              onClick={(e) => { e.stopPropagation(); startEditing(task.id, "planH"); }}
                            >
                              <Ruler className="size-3" /> {isEditing(task.id, "planH") ? (
                                <input
                                  ref={inputEditRef}
                                  className="w-10 text-right font-medium bg-transparent border-b border-[var(--tracker-accent)] outline-none"
                                  value={task.planH}
                                  onChange={(e) => updateTask(month, task.id, "planH", e.target.value)}
                                  onBlur={stopEditing}
                                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") stopEditing(); }}
                                  onClick={(e) => e.stopPropagation()}
                                  autoFocus
                                />
                              ) : fmt2(metrics.plan)}ч
                            </span>
                            <span
                              className={`cursor-pointer hover:text-[var(--tracker-text-main)] transition-colors rounded px-0.5 hover:bg-[var(--tracker-accent-soft)] flex items-center gap-1 ${metrics.fact > metrics.plan && metrics.plan > 0 ? "text-[var(--tracker-danger)] font-semibold" : ""}`}
                              onClick={(e) => { e.stopPropagation(); startEditing(task.id, "factH"); }}
                            >
                              <Timer className="size-3" /> {isEditing(task.id, "factH") ? (
                                <input
                                  ref={inputEditRef}
                                  className="w-10 text-right font-medium bg-transparent border-b border-[var(--tracker-accent)] outline-none"
                                  value={task.factH}
                                  onChange={(e) => updateTask(month, task.id, "factH", e.target.value)}
                                  onBlur={stopEditing}
                                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") stopEditing(); }}
                                  onClick={(e) => e.stopPropagation()}
                                  autoFocus
                                />
                              ) : fmt2(metrics.fact)}ч
                            </span>
                            {task.num && (
                              <button
                                className={`font-medium hover:underline ${metrics.totalH > 0 ? "text-[var(--tracker-accent-fg)]" : ""}`}
                                onClick={(e) => { e.stopPropagation(); setTotalHDialog({ taskNum: task.num, open: true }); }}
                              >
                                Σ {fmt2(metrics.totalH)}ч
                              </button>
                            )}
                            {(task.budgetAllocated ?? 0) > 0 && (
                              <button
                                className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-0.5 rounded bg-[var(--tracker-accent-bg)] text-[var(--tracker-accent-fg-dark)] hover:opacity-80 transition-opacity"
                                onClick={(e) => { e.stopPropagation(); onOpenBudgetSheet?.(task, month); }}
                                title="Бюджет задачи"
                              >
                                <Wallet className="size-3 inline" /> {task.budgetAllocated}ч
                              </button>
                            )}
                            <div className="flex-1 flex items-center gap-1.5 ml-auto">
                              <div className="task-card-progress flex-1">
                                <div
                                  className="task-card-progress-fill"
                                  style={{
                                    width: `${Math.min(metrics.prog, 100)}%`,
                                    backgroundColor: progColor(metrics.prog, CLOSED_STATUSES.has(task.status as Status), metrics.over),
                                  }}
                                />
                              </div>
                              <span className="text-[10px] font-semibold tabular-nums shrink-0" style={{ color: progColor(metrics.prog, CLOSED_STATUSES.has(task.status as Status), metrics.over) }}>
                                {metrics.prog}%
                              </span>
                            </div>
                          </div>

                          {!clientMode && !isGuest && (
                            <div className="flex items-center gap-0.5 shrink-0 mt-1.5 ml-5" onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toggleHidden(task.id)} title={task._hidden ? "Показать" : "Скрыть"}>
                                {task._hidden ? <EyeOff className="size-3 text-muted-foreground" /> : <Eye className="size-3" />}
                              </Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onOpenTaskDetail?.(task, month)} title="Бюджет и комментарии">
                                <MessageSquare className="size-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveToBacklog(month, task.id)} title="В беклог">
                                <Package className="size-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => setDeleteConfirm({ open: true, taskId: task.id, taskName: task.name || task.num || "Задача" })} title="Удалить">
                                <Trash2 className="size-3" />
                              </Button>
                            </div>
                          )}

                          {task.comment && !isEditing(task.id, "comment") && (
                            <div
                              className={`mt-1.5 pl-5 flex items-center gap-1 text-[11px] text-[var(--tracker-text-muted)] truncate ${isGuest ? 'cursor-default' : 'cursor-pointer hover:text-[var(--tracker-text-main)] transition-colors'}`}
                              onClick={(e) => { if (!isGuest) { e.stopPropagation(); startEditing(task.id, "comment"); } }}
                            >
                              <span className="truncate">💬 {task.comment}</span>
                              {task.commentLog && task.commentLog.length > 0 && (
                                <button
                                  className="shrink-0 opacity-50 hover:opacity-100 transition-opacity ml-1"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCommentArchiveDialog({
                                      taskId: task.id,
                                      taskName: task.name || task.num || "Задача",
                                      logs: [...(task.commentLog || [])].reverse().map(entry => ({
                                        date: entry.date, week: entry.week, text: entry.text,
                                        planH: entry.planH, factH: entry.factH, status: entry.status,
                                      })),
                                      open: true,
                                    });
                                  }}
                                  title="Архив комментариев"
                                >
                                  📜
                                </button>
                              )}
                            </div>
                          )}

                          {isEditing(task.id, "comment") && (
                            <div className="mt-1.5 pl-5" onClick={(e) => e.stopPropagation()}>
                              <div className="flex flex-col gap-1">
                                <AutoResizeTextarea
                                  ref={editRef as React.RefObject<HTMLTextAreaElement>}
                                  className="text-xs"
                                  value={task.comment}
                                  onChange={(e) => updateTask(month, task.id, "comment", e.target.value)}
                                  onBlur={() => { commitCommentFormulas(month, task.id); stopEditing(); }}
                                  onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === "Escape") stopEditing(); }}
                                />
                                <div className="flex items-center gap-1">
                                  <Button variant="outline" size="sm" className="h-5 px-1.5 text-[10px] border-[var(--tracker-accent)]/30 text-[var(--tracker-accent-fg)] hover:bg-[var(--tracker-accent-soft)]"
                                    onMouseDown={e => {
                                      e.preventDefault();
                                      const el = (editRef as React.RefObject<HTMLTextAreaElement>).current;
                                      const tag = `@факт`;
                                      if (!el) { updateTask(month, task.id, "comment", (task.comment || "") + tag); return; }
                                      const s = el.selectionStart ?? task.comment.length;
                                      const e2 = el.selectionEnd ?? s;
                                      const next = task.comment.slice(0, s) + tag + task.comment.slice(e2);
                                      updateTask(month, task.id, "comment", next);
                                      setTimeout(() => { el.focus(); el.setSelectionRange(s + tag.length, s + tag.length); }, 0);
                                    }}
                                  >@факт</Button>
                                  <Button variant="outline" size="sm" className="h-5 px-1.5 text-[10px] border-[var(--tracker-accent)]/30 text-[var(--tracker-accent-fg)] hover:bg-[var(--tracker-accent-soft)]"
                                    onMouseDown={e => {
                                      e.preventDefault();
                                      const el = (editRef as React.RefObject<HTMLTextAreaElement>).current;
                                      const tag = `@план`;
                                      if (!el) { updateTask(month, task.id, "comment", (task.comment || "") + tag); return; }
                                      const s = el.selectionStart ?? task.comment.length;
                                      const e2 = el.selectionEnd ?? s;
                                      const next = task.comment.slice(0, s) + tag + task.comment.slice(e2);
                                      updateTask(month, task.id, "comment", next);
                                      setTimeout(() => { el.focus(); el.setSelectionRange(s + tag.length, s + tag.length); }, 0);
                                    }}
                                  >@план</Button>
                                  {task.comment && (
                                    <Button variant="outline" size="sm" className="h-5 px-1.5 text-[10px] border-[var(--tracker-accent)]/30 text-[var(--tracker-accent-fg)] hover:bg-[var(--tracker-accent-soft)] ml-auto"
                                      onMouseDown={e => { e.preventDefault(); useTaskStore.getState().archiveComment(month, task.id); stopEditing(); }}
                                    >Архив</Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                        </TaskContextMenu>
                      );
                    })}
                  </div>
                </div>
              ));
            })()}
          </div>
        )}
      </div>

      {/* ---- DELETE CONFIRMATION DIALOG ---- */}
      <Dialog open={deleteConfirm.open} onOpenChange={(open) => { if (!open) setDeleteConfirm({ open: false, taskId: "", taskName: "" }); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-center sm:text-left">
            <div className="flex flex-col items-center sm:items-start gap-2">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-red-50">
                <span className="text-lg">⚠️</span>
              </div>
              <div>
                <DialogTitle className="text-lg">Удалить задачу?</DialogTitle>
                <DialogDescription className="mt-0.5">
                  Задача <strong>{deleteConfirm.taskName}</strong> будет удалена безвозвратно. Это действие нельзя отменить.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <DialogFooter className="flex flex-row gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setDeleteConfirm({ open: false, taskId: "", taskName: "" })}>Отмена</Button>
            <Button
              variant="destructive"
              onClick={() => {
                deleteTask(month, deleteConfirm.taskId);
                setDeleteConfirm({ open: false, taskId: "", taskName: "" });
                toast({ title: "🗑 Удалено", description: `Задача удалена` });
              }}
            >
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

