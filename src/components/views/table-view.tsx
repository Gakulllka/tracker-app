"use client";
import React, { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { AutoResizeTextarea } from "@/components/auto-resize-textarea";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableHeader, TableBody, TableFooter,
  TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem,
  DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus, Trash2, Archive, Search, Eye, EyeOff,
  ChevronUp, ChevronDown, GripVertical, Filter, X,
  FileSpreadsheet, Download, Upload, ArrowRight, Settings, Check,
  ArrowUpDown, Maximize2, Save, FolderOpen, Presentation, FileText,
} from "lucide-react";
import {
  COLS, MONTHS, STATUSES, PRIORITIES, PCOL, SCOL, scolText,
  type Status, type Priority, type Task, STATUS_ORDER, PRIO_START,
} from "@/lib/types";
import {
  evalExpr, fmt2, R2, progColor, sortVal, calcQueueMap,
  getTaskMetrics, CLOSED_STATUSES,
} from "@/lib/metrics";
import { useTaskStore } from "@/lib/store";
import { TaskLink } from "@/lib/planfix";
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
}: TableViewProps) {
  /* ---- Drag & Drop state ---- */
  const [dragRowId, setDragRowId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

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
  }, [month, reorderTask]);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    e.stopPropagation();
    setDragRowId(null);
    setDropTargetId(null);
  }, []);

  return (
    <div className="space-y-3">
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
              <DropdownMenuContent align="start" className="w-64 p-2">
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
                <div className="max-h-40 overflow-y-auto">
                  {Object.values(STATUSES).map(s => (
                    <DropdownMenuCheckboxItem
                      key={s}
                      checked={filterStatuses.has(s)}
                      onCheckedChange={() => toggleStatusFilter(s)}
                      onSelect={e => e.preventDefault()}
                      className="text-xs"
                    >
                      <span style={{ color: scolText(s, isDark) || "#888" }}>{s}</span>
                    </DropdownMenuCheckboxItem>
                  ))}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs">Приоритет</DropdownMenuLabel>
                {Object.values(PRIORITIES).map(p => (
                  <DropdownMenuCheckboxItem
                    key={p}
                    checked={filterPriorities.has(p)}
                    onCheckedChange={() => togglePriorityFilter(p)}
                    onSelect={e => e.preventDefault()}
                    className="text-xs"
                  >
                    <span style={{ color: PCOL[p] }}>{p}</span>
                  </DropdownMenuCheckboxItem>
                ))}
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
            <Button
              size="sm"
              className="h-8 gap-1.5 bg-[var(--tracker-accent)] text-white hover:bg-[var(--tracker-accent-hover)]"
              onClick={() => onOpenNewTaskDialog(month)}
            >
              <Plus className="size-3.5" />
              Добавить задачу
            </Button>

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
            const isSelected = selectedRowId === task.id;
            const metrics = getTaskMetrics(task, totalFactMap);
            const pct = metrics.totalH > 0 && evalExpr(task.planH) > 0
              ? Math.min(100, (metrics.totalH / evalExpr(task.planH)) * 100)
              : null;
            const isOver = pct !== null && pct > 100;
            return (
              <div
                key={task.id}
                onClick={() => setSelectedRowId(task.id)}
                className={`mobile-task-card ${isSelected ? "selected" : ""}`}
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
                        💰 {task.budgetAllocated}ч
                      </span>
                    )}
                    <span>📐 {task.planH || "0"}ч</span>
                    <span className={isOver ? "text-red-500 font-semibold" : ""}>
                      ⏱ {task.factH || "0"}ч
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
        {!clientMode && (
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

      {/* ---- DESKTOP TABLE (hidden on mobile) ---- */}
      {/* ---- DESKTOP TABLE ---- */}
      <Card className="hidden md:block max-h-[1000px] overflow-auto py-0">
        <Table className="border-collapse sticky-table-header w-full">
          <TableHeader className="bg-[var(--tracker-accent-bg,#f3f0fb)]">
            <TableRow className="[&_th]:text-[var(--tracker-accent-fg-dark,#3d2264)]">
              {!clientMode && (
                <TableHead className="w-8 text-center px-1">
                  <span className="sr-only">Перетащить</span>
                </TableHead>
              )}
              <TableHead className="w-14 text-center">
                №
              </TableHead>
              {COLS.map((col) => (
                <TableHead
                  key={col.key}
                  className="cursor-pointer select-none hover:bg-[var(--tracker-accent)]/8"
                  style={{ minWidth: col.minW }}
                  onClick={() =>
                    col.sortable && handleSort(col.key)
                  }
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable && sortKey === col.key && (
                      sortDir === 1 ? (
                        <ChevronUp className="size-3.5 text-[var(--tracker-accent-fg-dark)] opacity-60" />
                      ) : (
                        <ChevronDown className="size-3.5 text-[var(--tracker-accent-fg-dark)] opacity-60" />
                      )
                    )}
                  </span>
                </TableHead>
              ))}
              {!clientMode && (
                <TableHead className="w-28 text-center">
                  Действия
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((task, idx) => {
              const metrics = getTaskMetrics(
                task,
                totalFactMap
              );
              return (
                <TableRow
                  key={task.id}
                  className={`cursor-pointer ${selectedRowId === task.id ? "row-selected" : ""} ${dragRowId === task.id ? "opacity-40" : ""} ${dropTargetId === task.id && dragRowId !== task.id ? "border-t-[1.5px] border-b-[1.5px] border-[var(--tracker-accent)]/40 !bg-[var(--tracker-accent)]/[0.06]" : ""}`}
                  onClick={() => setSelectedRowId(task.id)}
                  onDragOver={(e) => handleRowDragOver(e, task.id)}
                  onDrop={(e) => handleRowDrop(e, task.id)}
                >
                  {/* Drag handle */}
                  {!clientMode && (
                    <TableCell className="w-8 text-center px-1">
                      <div
                        className="flex items-center justify-center cursor-grab active:cursor-grabbing"
                        draggable
                        onDragStart={(e) => handleDragStart(e, task.id)}
                        onDragEnd={handleDragEnd}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <GripVertical className="size-4 text-muted-foreground/50 hover:text-muted-foreground transition-colors" />
                      </div>
                    </TableCell>
                  )}
                  {/* Task number (editable) */}
                  <TableCell className="text-center">
                    {isEditing(task.id, "num") ? (
                      <Input
                        ref={inputEditRef}
                        className="h-7 w-16 text-center text-xs"
                        value={task.num}
                        onChange={(e) =>
                          updateTask(
                            month,
                            task.id,
                            "num",
                            e.target.value
                          )
                        }
                        onBlur={stopEditing}
                        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                          if (e.key === "Enter") stopEditing();
                          if (e.key === "Escape")
                            stopEditing();
                        }}
                      />
                    ) : (
                      <span className="inline-flex items-center">
                        <span
                          className="cursor-pointer rounded px-1 py-0.5 text-xs font-mono hover:bg-muted/60"
                          onClick={() =>
                            startEditing(task.id, "num")
                          }
                        >
                          {task.num || "—"}
                        </span>
                        <TaskLink num={task.num} />
                      </span>
                    )}
                  </TableCell>

                  {/* Name */}
                  <TableCell
                    className="max-w-[300px]"
                    style={{ minWidth: 260 }}
                  >
                    {isEditing(task.id, "name") ? (
                      <AutoResizeTextarea
                        ref={editRef as React.RefObject<HTMLTextAreaElement>}
                        className="text-sm"
                        value={task.name}
                        onChange={(e) =>
                          updateTask(
                            month,
                            task.id,
                            "name",
                            e.target.value
                          )
                        }
                        onBlur={stopEditing}
                        onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                          if (e.key === "Escape")
                            stopEditing();
                        }}
                      />
                    ) : (
                      <span
                        className="cursor-pointer rounded px-1 py-0.5 hover:bg-muted/60 block overflow-hidden text-ellipsis whitespace-nowrap"
                        onClick={() =>
                          startEditing(task.id, "name")
                        }
                      >
                        {task.name || (
                          <span className="italic text-muted-foreground">
                            введите название...
                          </span>
                        )}
                      </span>
                    )}
                  </TableCell>

                  {/* Plan H */}
                  <TableCell className="w-[90px]">
                    {isEditing(task.id, "planH") ? (
                      <Input
                        ref={inputEditRef}
                        className="h-7 w-20 text-right text-sm"
                        value={task.planH}
                        onChange={(e) =>
                          updateTask(
                            month,
                            task.id,
                            "planH",
                            e.target.value
                          )
                        }
                        onBlur={stopEditing}
                        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                          if (e.key === "Enter") stopEditing();
                          if (e.key === "Escape")
                            stopEditing();
                        }}
                      />
                    ) : (
                      <span
                        className="cursor-pointer rounded px-1 py-0.5 text-right hover:bg-muted/60"
                        onClick={() =>
                          startEditing(task.id, "planH")
                        }
                      >
                        {fmt2(metrics.plan)} ч
                      </span>
                    )}
                  </TableCell>

                  {/* Fact H */}
                  <TableCell className="w-[90px]">
                    {isEditing(task.id, "factH") ? (
                      <Input
                        ref={inputEditRef}
                        className="h-7 w-20 text-right text-sm"
                        value={task.factH}
                        onChange={(e) =>
                          updateTask(
                            month,
                            task.id,
                            "factH",
                            e.target.value
                          )
                        }
                        onBlur={stopEditing}
                        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                          if (e.key === "Enter") stopEditing();
                          if (e.key === "Escape")
                            stopEditing();
                        }}
                      />
                    ) : (
                      <span
                        className="cursor-pointer rounded px-1 py-0.5 text-right hover:bg-muted/60"
                        onClick={() =>
                          startEditing(task.id, "factH")
                        }
                      >
                        {fmt2(metrics.fact)} ч
                      </span>
                    )}
                  </TableCell>

                  {/* Total H */}
                  <TableCell className="w-[85px]">
                    {task.num ? (
                      <button
                        className={`cursor-pointer rounded px-1 py-0.5 text-right text-sm font-medium hover:bg-[var(--tracker-accent-soft)] ${metrics.totalH > 0 ? "text-[var(--tracker-accent-fg)]" : "text-muted-foreground"}`}
                        onClick={() =>
                          setTotalHDialog({
                            taskNum: task.num,
                            open: true,
                          })
                        }
                      >
                        {fmt2(metrics.totalH)} ч
                      </button>
                    ) : (
                      <span className="text-right text-muted-foreground text-sm px-1 py-0.5">
                        —
                      </span>
                    )}
                  </TableCell>

                  {/* Priority */}
                  <TableCell className="w-[141px]">
                    <Select
                      value={task.priority}
                      onValueChange={(v) => {
                        useTaskStore.getState().snapshot();
                        updateTask(
                          month,
                          task.id,
                          "priority",
                          v as Priority
                        );
                      }}
                    >
                      <SelectTrigger
                        className="h-7 w-full text-xs"
                        size="sm"
                        style={{ color: PCOL[task.priority] }}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(PRIORITIES).map((p) => (
                          <SelectItem
                            key={p}
                            value={p}
                            className="text-xs"
                            style={{ color: PCOL[p] }}
                          >
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>

                  {/* Queue */}
                  <TableCell className="w-[76px] text-center">
                    <Badge
                      variant="outline"
                      className="font-mono text-xs"
                      style={{ borderColor: PCOL[task.priority] || undefined, color: PCOL[task.priority] || undefined }}
                    >
                      {qMap[task.id] ?? "—"}
                    </Badge>
                  </TableCell>

                  {/* Status */}
                  <TableCell className="w-[220px]">
                    <Select
                      value={task.status}
                      onValueChange={(v) => {
                        useTaskStore.getState().snapshot();
                        updateTask(
                          month,
                          task.id,
                          "status",
                          v as Status
                        );
                      }}
                    >
                      <SelectTrigger
                        className="h-7 w-full text-xs"
                        size="sm"
                        style={{ color: scolText(task.status, isDark) || "#888" }}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-64 overflow-y-auto">
                        {Object.values(STATUSES).map((s) => (
                          <SelectItem
                            key={s}
                            value={s}
                            className="text-xs"
                            style={{ color: scolText(s, isDark) || "#888" }}
                          >
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>

                  {/* Progress */}
                  <TableCell className="w-[170px]">
                    <div className="flex items-center gap-2">
                      <div className="h-3 flex-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(metrics.prog, 100)}%`,
                            backgroundColor: progColor(metrics.prog, CLOSED_STATUSES.has(task.status as Status), metrics.over),
                          }}
                        />
                      </div>
                      <span
                        className="w-8 text-right text-xs font-medium tabular-nums"
                        style={{
                          color: progColor(metrics.prog, CLOSED_STATUSES.has(task.status as Status), metrics.over),
                        }}
                      >
                        {metrics.prog}%
                      </span>
                    </div>
                  </TableCell>

                  {/* Comment */}
                  <TableCell
                    className="max-w-[300px]"
                    style={{ minWidth: 200 }}
                  >
                    {isEditing(task.id, "comment") ? (
                      <div className="flex flex-col gap-1">
                        <AutoResizeTextarea
                          ref={
                            editRef as React.RefObject<HTMLTextAreaElement>
                          }
                          className="text-sm"
                          value={task.comment}
                          onChange={(e) =>
                            updateTask(
                              month,
                              task.id,
                              "comment",
                              e.target.value
                            )
                          }
                          onBlur={() => {
                            commitCommentFormulas(month, task.id);
                            stopEditing();
                          }}
                          onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                            if (e.key === "Escape")
                              stopEditing();
                          }}
                        />
                        {/* @-buttons row */}
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-xs border-[var(--tracker-accent)]/30 text-[var(--tracker-accent-fg)] hover:bg-[var(--tracker-accent-soft)]"
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
                          >
                            @факт
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 text-xs border-[var(--tracker-accent)]/30 text-[var(--tracker-accent-fg)] hover:bg-[var(--tracker-accent-soft)]"
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
                          >
                            @план
                          </Button>
                          {task.comment && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-xs border-[var(--tracker-accent)]/30 text-[var(--tracker-accent-fg)] hover:bg-[var(--tracker-accent-soft)] ml-auto"
                              onMouseDown={e => {
                                e.preventDefault();
                                useTaskStore.getState().archiveComment(month, task.id);
                                stopEditing();
                              }}
                            >
                              Архив
                            </Button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-0.5">
                        <span
                          className="flex-1 cursor-pointer rounded px-1 py-0.5 text-sm text-muted-foreground hover:bg-muted/60 block overflow-hidden text-ellipsis whitespace-nowrap"
                          onClick={() =>
                            startEditing(task.id, "comment")
                          }
                        >
                          {task.comment || (
                            <span className="italic">
                              добавить...
                            </span>
                          )}
                        </span>
                        {/* RIGHT: archive emoji — only if has archived entries */}
                        {task.commentLog && task.commentLog.length > 0 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0 opacity-50 hover:opacity-100"
                            onClick={() => setCommentArchiveDialog({
                              taskId: task.id,
                              taskName: task.name || task.num || "Задача",
                              logs: [...(task.commentLog || [])].reverse().map(e => ({
                                date: e.date,
                                week: e.week,
                                text: e.text,
                                planH: e.planH,
                                factH: e.factH,
                                status: e.status,
                              })),
                              open: true,
                            })}
                            title="Архив комментариев"
                          >
                            <span className="text-xs">📜</span>
                          </Button>
                        )}
                      </div>
                    )}
                  </TableCell>

                  {/* Actions */}
                  {!clientMode && (
                    <TableCell className="w-[120px]">
                      <div className="flex items-center justify-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() =>
                            toggleHidden(task.id)
                          }
                          title={
                            task._hidden
                              ? "Показать"
                              : "Скрыть"
                          }
                        >
                          {task._hidden ? (
                            <EyeOff className="size-3.5 text-muted-foreground" />
                          ) : (
                            <Eye className="size-3.5" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() =>
                            moveToBacklog(month, task.id)
                          }
                          title="В беклог"
                        >
                          <span className="text-sm">📦</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() =>
                            deleteTask(month, task.id)
                          }
                          title="Удалить"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
            {rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={
                    COLS.length + 2 + (clientMode ? 0 : 2)
                  }
                >
                  <EmptyState
                    type={totalRows.length === 0 ? "table" : "filter"}
                    onAction={
                      totalRows.length === 0
                        ? () => onOpenNewTaskDialog(month)
                        : undefined
                    }
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>

          {/* Footer totals */}
          {rows.length > 0 && (
            <TableFooter className="sticky bottom-0">
              <TableRow className="font-semibold bg-[var(--tracker-accent-bg)] border-t-[1.5px] border-[var(--tracker-border)]">
                {/* drag (!clientMode) — здесь надпись ИТОГО */}
                {!clientMode && (
                  <TableCell className="border-t border-[var(--tracker-accent)]/20 font-bold text-[var(--tracker-accent-fg)]">
                    ИТОГО
                  </TableCell>
                )}
                {/* № */}
                <TableCell className={`border-t border-[var(--tracker-accent)]/20${clientMode ? " font-bold text-[var(--tracker-accent-fg)]" : ""}`}>
                  {clientMode ? "ИТОГО" : ""}
                </TableCell>
                {/* Наименование */}
                <TableCell className="border-t border-[var(--tracker-accent)]/20" />
                {/* План, ч */}
                <TableCell className="text-left border-t border-[var(--tracker-accent)]/20">
                  {fmt2(rowsMetrics.totPlan)} ч
                </TableCell>
                {/* Факт, ч */}
                <TableCell className={`text-left border-t border-[var(--tracker-accent)]/20 ${rowsMetrics.totFact > rowsMetrics.totPlan ? "text-[var(--tracker-danger)]" : rowsMetrics.totFact === rowsMetrics.totPlan && rowsMetrics.totFact > 0 ? "text-green-600 dark:text-green-400" : ""}`}>
                  {fmt2(rowsMetrics.totFact)} ч
                </TableCell>
                {/* Итого, ч */}
                <TableCell className="text-left font-bold text-[var(--tracker-accent-fg)] border-t border-[var(--tracker-accent)]/20">
                  {fmt2(rowsMetrics.totTotalH)} ч
                </TableCell>
                {/* Приоритет */}
                <TableCell className="border-t border-[var(--tracker-accent)]/20" />
                {/* Очередь */}
                <TableCell className="border-t border-[var(--tracker-accent)]/20" />
                {/* Статус */}
                <TableCell className="border-t border-[var(--tracker-accent)]/20" />
                {/* Прогресс — здесь bar */}
                <TableCell className="border-t border-[var(--tracker-accent)]/20 px-3">
                  <div className="flex items-center gap-2 w-full">
                    <div className="h-2 flex-1 rounded-full bg-[var(--tracker-accent)]/10 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${rowsMetrics.avgProg}%`,
                          backgroundColor: progColor(
                            rowsMetrics.avgProg
                          ),
                        }}
                      />
                    </div>
                    <span className="text-xs text-[var(--tracker-accent-fg)] font-semibold shrink-0">
                      {rowsMetrics.avgProg}%
                    </span>
                  </div>
                </TableCell>
                {/* Комментарий */}
                <TableCell className="border-t border-[var(--tracker-accent)]/20" />
                {/* Действия (!clientMode) */}
                {!clientMode && <TableCell className="border-t border-[var(--tracker-accent)]/20" />}
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </Card>
    </div>
  );
}

