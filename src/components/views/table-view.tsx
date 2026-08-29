"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { DeleteTaskDialog } from "@/components/dialogs/delete-task-dialog";
import { MobileTaskCards } from "@/components/views/mobile-task-cards";
import { IdeasPanel } from "@/components/views/ideas-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { AutoResizeTextarea } from "@/components/auto-resize-textarea";
import { EmptyState } from "@/components/empty-state";
import { TaskContextMenu } from "@/components/task-context-menu";
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
  Filter, X, ClipboardList, AlertTriangle, History,
  FileSpreadsheet, Upload, ArrowRight, Check,
  ArrowUpDown, Save, FolderOpen, FileText,
  Package, MessageSquare, Wallet,
  ExternalLink, LayoutGrid, ChevronDown, Lightbulb, Play,
  Rows3, AlignJustify,
} from "lucide-react";
import { MONTHS, STATUSES, PRIORITIES, type Status, type Priority, type Task, STATUS_ORDER, PRIO_START, getPhaseForStatus } from "@/lib/types";
import { PCOL, scolText } from "@/lib/tokens";
import {
  evalExpr, fmt2, progColor,
  getTaskMetrics, CLOSED_STATUSES,
} from "@/lib/metrics";
import { useTaskStore } from "@/lib/store";

import type { EditingCell } from "@/app/page";
import { INK } from "@/lib/tokens";

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
    logs: Array<{ date: string; week: string; text: string; planH: string; factH: string; status: string; author?: string }>;
    open: boolean;
  }) => void;
  selectedRowId: string | null;
  setSelectedRowId: (id: string | null) => void;
  isDark: boolean;
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
  /* ---- Drag & Drop state ---- */
  const [dragRowId, setDragRowId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropGroupKey, setDropGroupKey] = useState<string | null>(null);
  const [groupingMode, setGroupingMode] = useState<"status" | "priority" | "none">("priority");
  // Режим интерфейса: simple (по умолчанию) или detailed.
  const uiMode = useTaskStore((s) => s.uiMode);
  const setUiMode = useTaskStore((s) => s.setUiMode);
  const isDetailed = uiMode === "detailed";
  const [hideEmptyGroups, setHideEmptyGroups] = useState(() => {
    try { return window.localStorage.getItem("tracker-hide-empty-groups") === "true"; } catch { return false; }
  });
  // В simple режиме пустые группы скрыты по умолчанию (если пользователь не задал явное предпочтение).
  const effectiveHideEmpty = isDetailed ? hideEmptyGroups : (hideEmptyGroups || true);
  const toggleHideEmptyGroups = useCallback(() => {
    setHideEmptyGroups((prev) => {
      const next = !prev;
      window.localStorage.setItem("tracker-hide-empty-groups", String(next));
      return next;
    });
  }, []);
  const [ideasOpen, setIdeasOpen] = useState(false);
  const ideaRows = useMemo(() => {
    const seenIds = new Set<string>();
    const seenNums = new Set<string>();
    const result: Array<{ task: Task; sourceMonth: number }> = [];
    Object.entries(allData).forEach(([monthIndex, monthTasks]) => {
      monthTasks.forEach((task) => {
        if (task._deleted || task.status !== STATUSES.IDEA) return;
        // Дедупликация и по id, и по num (чтобы не показывать две записи с одним номером)
        if (seenIds.has(task.id)) return;
        const numKey = (task.num || "").trim();
        if (numKey && seenNums.has(numKey)) return;
        seenIds.add(task.id);
        if (numKey) seenNums.add(numKey);
        result.push({ task, sourceMonth: Number(monthIndex) });
      });
    });
    return result.sort((a, b) => (b.task._ts || 0) - (a.task._ts || 0));
  }, [allData]);
  const workRows = useMemo(() => rows.filter((task) => task.status !== STATUSES.IDEA), [rows]);

  // Порядковая нумерация (бейдж 1,2,3 на карточке) строится относительно
  // выбранной группировки: «По статусу» — по порядку статусов (STATUS_ORDER),
  // «По приоритету» / «Без групп» — по приоритетам (PRIO_START, как раньше).
  const localQMap = useMemo(() => {
    const sorted = [...workRows].sort((a, b) => {
      if (groupingMode === "status") {
        return (STATUS_ORDER[a.status] ?? 999) - (STATUS_ORDER[b.status] ?? 999);
      }
      return (PRIO_START[a.priority] ?? 999) - (PRIO_START[b.priority] ?? 999);
    });
    const map: Record<string, number> = {};
    sorted.forEach((t, i) => { map[t.id] = i + 1; });
    return map;
  }, [workRows, groupingMode]);

  useEffect(() => setIdeasOpen(false), [month]);
  const promoteIdea = useCallback((sourceMonth: number, task: Task) => {
    useTaskStore.getState().snapshot();
    const state = useTaskStore.getState();
    const source = (state.allData[sourceMonth] || []).filter((row) => row.id !== task.id);
    // Также удаляем из target на случай, если sourceMonth === month
    const target = (state.allData[month] || []).filter((row) => row.id !== task.id);
    const promoted = { ...task, status: STATUSES.NEW, _ts: Date.now() };
    state.setAllData({ ...state.allData, [sourceMonth]: source, [month]: [...target, promoted] });
  }, [month]);
  useEffect(() => {
    const saved = window.localStorage.getItem("tracker-task-grouping");
    if (saved === "status" || saved === "priority" || saved === "none") {
      setGroupingMode(saved);
    }
  }, []);
  const applyGroupingMode = useCallback((mode: "status" | "priority" | "none") => {
    setGroupingMode(mode);
    window.localStorage.setItem("tracker-task-grouping", mode);
  }, []);

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
    setDropGroupKey(null);
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
    setDropGroupKey(null);
  }, [month, reorderTask]);

  const handleGroupDragOver = useCallback((e: React.DragEvent, groupKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDropGroupKey(groupKey);
    setDropTargetId(null);
  }, []);

  const handleGroupDrop = useCallback((e: React.DragEvent, groupKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    const fromId = e.dataTransfer.getData("application/task-row");
    const task = rows.find(t => t.id === fromId);
    if (task && groupingMode !== "none") {
      const field = groupingMode === "status" ? "status" : "priority";
      if (task[field] !== groupKey) {
        useTaskStore.getState().snapshot();
        updateTask(month, fromId, field, groupKey);
      }
    }
    setDragRowId(null);
    setDropTargetId(null);
    setDropGroupKey(null);
  }, [groupingMode, month, rows, updateTask]);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    e.stopPropagation();
    setDragRowId(null);
    setDropTargetId(null);
    setDropGroupKey(null);
  }, []);

  return (
    <div className="space-y-3">
      {/* ---- TOOLBAR ---- */}
      {!clientMode && (() => {
        const totalFilters = filterStatuses.size + filterPriorities.size + (searchQuery ? 1 : 0);
        const btnClass = "hidden md:inline-flex h-8 gap-1.5 border-[2px] border-[var(--tracker-accent)] text-[var(--tracker-text-main)] font-medium hover:bg-[var(--tracker-accent-soft)]";
        return (
          <div className="flex flex-wrap items-center gap-2">

            {/* ── ПОИСК — в строке тулбара (оба режима) ── */}
            <div className="relative flex-1 min-w-[150px] max-w-[360px] hidden md:block">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Поиск задач..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-[34px] pl-8 pr-8 text-[13px] bg-[var(--tracker-bg-card)] border-2 border-[var(--tracker-accent)]"
              />
              {searchQuery && (
                <button
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setSearchQuery("")}
                >
                  <X className="size-3" />
                </button>
              )}
            </div>

            {/* ── ФИЛЬТР (только detailed) ─────────────────────────── */}
            {isDetailed && (
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
                    { label: "Новая", items: [STATUSES.IDEA, STATUSES.NEW] },
                    { label: "В работе", items: [STATUSES.ANALYSIS, STATUSES.APPROVAL, STATUSES.QUEUE_DEV, STATUSES.DEV, STATUSES.TEST, STATUSES.RELEASE, STATUSES.DOCS] },
                    { label: "Завершена", items: [STATUSES.COMPLETED, STATUSES.PROD_CHECK, STATUSES.DONE] },
                    { label: "Отмена", items: [STATUSES.POSTPONED, STATUSES.CANCEL] },
                  ]).map((group) => (
                    <div key={group.label} className="mb-1.5">
                      <div className="text-[8px] uppercase tracking-wider font-semibold mb-0.5 px-1" style={{ color: "var(--tracker-text-muted)" }}>{group.label}</div>
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
            )}

            {/* Сортировка удалена: при группировке задачи автоматически
                упорядочиваются по нумерации внутри группы. */}

            <div className="flex-1" />

            {/* ── ДОБАВИТЬ ЗАДАЧУ ───────────────────────────────────── */}
            {!isGuest && (
              <Button
                size="sm"
                className="h-8 gap-1.5 bg-[var(--tracker-accent)] text-[var(--tracker-accent-contrast)] hover:bg-[var(--tracker-accent-hover)]"
                style={{ boxShadow: "var(--shadow-card)" }}
                onClick={() => onOpenNewTaskDialog(month)}
              >
                <Plus className="size-3.5" />
                Добавить задачу
              </Button>
            )}

            {/* ── ЗАГРУЗИТЬ (Excel-импорт — отдельная кнопка) ──────── */}
            {!clientMode && (
              <Button
                variant="outline"
                size="sm"
                className="hidden md:inline-flex h-8 gap-1.5 border-[2px] border-[var(--tracker-accent)] text-[var(--tracker-text-main)] font-medium hover:bg-[var(--tracker-accent-soft)] bg-[var(--tracker-bg-card)]"
                onClick={onImportXLSX}
              >
                <Upload className="size-3.5" />
                Загрузить
              </Button>
            )}

            {/* ── ПЕРЕНЕСТИ (только detailed) ─────────────────────── */}
            {isDetailed && (
              <Button variant="outline" size="sm" className={btnClass} onClick={onOpenTransfer}>
                <ArrowRight className="size-3.5" />
                Перенести
              </Button>
            )}

            {/* ── ФАЙЛЫ (только detailed) ─────────────────────────── */}
            {isDetailed && (
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
              </DropdownMenuContent>
            </DropdownMenu>
            )}

            {/* ── ГРУППИРОВКА (только detailed) — компактный контрол ── */}
            {isDetailed && (
              <div className="hidden md:inline-flex items-center gap-1 h-8 rounded-md border border-[2px] border-[var(--tracker-accent)] bg-[var(--tracker-bg-card)] px-1">
                <LayoutGrid className="size-3.5 mx-0.5 shrink-0" style={{ color: "var(--tracker-text-muted)" }} />
                {([
                  ["status", "Статус"],
                  ["priority", "Приоритет"],
                  ["none", "Без"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => applyGroupingMode(value)}
                    className="rounded px-2 py-0.5 text-[11px] font-medium transition-colors"
                    style={{
                      background: groupingMode === value ? "var(--tracker-accent-bg)" : "transparent",
                      color: groupingMode === value ? "var(--tracker-accent-fg-dark)" : "var(--tracker-text-muted)",
                    }}
                  >
                    {label}
                  </button>
                ))}
                {groupingMode !== "none" && (
                  <button
                    type="button"
                    onClick={toggleHideEmptyGroups}
                    className="rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors border ml-1"
                    style={{
                      background: hideEmptyGroups ? "var(--tracker-accent-bg)" : "transparent",
                      color: hideEmptyGroups ? "var(--tracker-accent-fg-dark)" : "var(--tracker-text-muted)",
                      borderColor: "var(--tracker-accent)",
                    }}
                    title={hideEmptyGroups ? "Показать пустые категории" : "Скрыть пустые категории"}
                  >
                    Пустые
                  </button>
                )}
              </div>
            )}

            {/* «Ещё» удалено из simple — экспорт/перенос/JSON доступны
                в подробном режиме через «Файлы» и «Перенести». */}

            {/* ── ПЕРЕКЛЮЧАТЕЛЬ РЕЖИМА ────────────────────────────── */}
            <Button
              variant="ghost"
              size="sm"
              className="hidden md:inline-flex h-8 gap-1.5 text-[var(--tracker-text-muted)] hover:text-[var(--tracker-text-main)]"
              onClick={() => setUiMode(isDetailed ? "simple" : "detailed")}
              title={isDetailed ? "Компактный режим" : "Подробный режим"}
            >
              {isDetailed ? <Rows3 className="size-3.5" /> : <AlignJustify className="size-3.5" />}
            </Button>

          </div>
        );
      })()}


      {/* ---- MOBILE TOOLBAR (md:hidden) ---- */}
      <div className="md:hidden space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5" style={{ color: "var(--tracker-text-muted)" }} />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск задач..."
            className="w-full h-9 pl-9 pr-8 text-sm rounded-xl border bg-[var(--tracker-bg-card)] outline-none focus:ring-1 focus:ring-[var(--tracker-accent)]"
            style={{ borderColor: "var(--tracker-accent)", borderWidth: 2, color: "var(--tracker-text-main)" }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--tracker-text-muted)]">
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {(Object.keys(STATUS_ORDER) as Status[]).map((st) => {
            const active = filterStatuses.has(st);
            return (
              <button key={st}
                onClick={() => toggleStatusFilter(st)}
                className="shrink-0 text-[10px] font-medium px-2.5 py-1 rounded-full border transition-colors"
                style={{
                  borderColor: active ? "var(--tracker-accent)" : "var(--tracker-border)",
                  background: active ? "var(--tracker-accent-bg)" : "transparent",
                  color: active ? "var(--tracker-accent-fg-dark)" : "var(--tracker-text-muted)",
                }}>
                {st}
              </button>
            );
          })}
          {Object.values(PRIORITIES).map((p) => {
            const active = filterPriorities.has(p);
            return (
              <button key={p}
                onClick={() => togglePriorityFilter(p)}
                className="shrink-0 text-[10px] font-medium px-2.5 py-1 rounded-full border transition-colors"
                style={{
                  borderColor: active ? PCOL[p] : "var(--tracker-border)",
                  background: active ? PCOL[p] + "18" : "transparent",
                  color: active ? PCOL[p] : "var(--tracker-text-muted)",
                }}>
                {p}
              </button>
            );
          })}
          {(filterStatuses.size > 0 || filterPriorities.size > 0) && (
            <button onClick={clearFilters}
              className="shrink-0 text-[10px] font-medium px-2.5 py-1 rounded-full border border-red-200 text-[var(--tracker-danger)]">
              Сбросить
            </button>
          )}
        </div>
      </div>

      <MobileTaskCards
        workRows={workRows}
        rows={rows}
        month={month}
        isDark={isDark}
        totalFactMap={totalFactMap}
        selectedTaskIds={selectedTaskIds}
        toggleTaskSelection={toggleTaskSelection}
        onOpenTaskDetail={onOpenTaskDetail}
        onOpenNewTaskDialog={onOpenNewTaskDialog}
        clientMode={clientMode}
        isGuest={isGuest}
      />

      <IdeasPanel
        ideaRows={ideaRows}
        isDark={isDark}
        totalFactMap={totalFactMap}
        updateTask={updateTask}
        deleteTask={deleteTask}
        moveToBacklog={moveToBacklog}
        duplicateTask={duplicateTask}
        onOpenTaskDetail={onOpenTaskDetail}
        promoteIdea={promoteIdea}
        isGuest={isGuest}
        isExecutive={isExecutive}
      />

      {/* Панель настроек группировки удалена — заменена компактным
          контролом в тулбаре (detailed). */}

      {/* ---- DESKTOP CARD LIST ---- */}
      {/* Bulk actions bar: фиксированный снизу на мобиле, в потоке на десктопе. */}
      {!isExecutive && !isGuest && selectedTaskIds.size > 0 && (() => {
        const snapshot = useTaskStore.getState().snapshot;
        return (
          <div className="md:relative fixed bottom-[57px] left-0 right-0 z-40 md:z-auto flex flex-wrap items-center gap-2 p-2 rounded-t-xl md:rounded-lg border bg-[var(--tracker-bg-card)] md:bg-[var(--tracker-accent-bg)]/60 border-[var(--tracker-accent)] md:border-[var(--tracker-accent)]/30 md:m-0"
            style={{ boxShadow: "0 -4px 16px rgba(0,0,0,0.12)" }}>
            <span className="text-sm font-medium text-[var(--tracker-accent-fg)]">
              ✓ Выбрано: {selectedTaskIds.size}
            </span>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs border-[var(--tracker-accent)]/30">
                  Статус
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[280px] p-2" align="start" side="bottom">
                <div className="flex flex-col gap-1.5">
                  {([
                    { label: "Новая", items: [STATUSES.IDEA, STATUSES.NEW] },
                    { label: "В работе", items: [STATUSES.ANALYSIS, STATUSES.APPROVAL, STATUSES.QUEUE_DEV, STATUSES.DEV, STATUSES.TEST, STATUSES.RELEASE, STATUSES.DOCS] },
                    { label: "Завершена", items: [STATUSES.COMPLETED, STATUSES.PROD_CHECK, STATUSES.DONE] },
                    { label: "Отмена", items: [STATUSES.POSTPONED, STATUSES.CANCEL] },
                  ]).map((group) => (
                    <div key={group.label}>
                      <div className="text-[8px] uppercase tracking-wider font-semibold mb-0.5 px-0.5" style={{ color: "var(--tracker-text-muted)" }}>{group.label}</div>
                      <div className="flex flex-wrap gap-1">
                        {group.items.map((s) => (
                          <button
                            key={s}
                            onClick={() => {
                              const ids = Array.from(selectedTaskIds);
                              snapshot();
                              ids.forEach(id => bulkUpdateTasks(month, [id], "status", s));
                              clearSelection();
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
                  Приоритет
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {Object.values(PRIORITIES).map(p => (
                  <DropdownMenuItem key={p} className="text-xs gap-2" onClick={() => {
                    const ids = Array.from(selectedTaskIds);
                    snapshot();
                    ids.forEach(id => bulkUpdateTasks(month, [id], "priority", p));
                    clearSelection();
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
              }}
            >
              В беклог
            </Button>

            <Button
              variant="outline" size="sm"
              className="h-7 text-xs border-destructive/50 text-destructive hover:bg-destructive/10"
              onClick={() => {
                const ids = Array.from(selectedTaskIds);
                snapshot();
                ids.forEach(id => deleteTask(month, id));
                clearSelection();
              }}
            >
              Удалить
            </Button>

            <div className="flex-1" />
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearSelection}>
              Сбросить
            </Button>
          </div>
        );
      })()}

      {/* Большой summary-бар удалён — метрики встроены в тулбар (inline),
          компактная версия осталась на мобиле ниже. */}

      {/* Mobile compact summary bar — ключевая метрика продукта на мобиле */}
      {workRows.length > 0 && (
        <div
          className="md:hidden sticky top-12 z-20 flex items-center gap-3 px-3 py-2 mx-1 rounded-xl border bg-[var(--tracker-bg-card)]/95 backdrop-blur"
          style={{ borderColor: "var(--tracker-accent)", borderWidth: 2 }}
        >
          <div className="flex flex-col leading-tight">
            <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--tracker-text-muted)" }}>План</span>
            <span className="delta-num text-[13px] font-semibold" style={{ color: "var(--tracker-text-main)" }}>{fmt2(rowsMetrics.totPlan)}ч</span>
          </div>
          <div className="w-px h-7 shrink-0" style={{ background: "var(--tracker-border)" }} />
          <div className="flex flex-col leading-tight">
            <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--tracker-text-muted)" }}>Факт</span>
            <span className="delta-num text-[13px] font-semibold" style={{ color: "var(--tracker-text-main)" }}>{fmt2(rowsMetrics.totFact)}ч</span>
          </div>
          <div className="w-px h-7 shrink-0" style={{ background: "var(--tracker-border)" }} />
          <div className="flex flex-col leading-tight">
            <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "var(--tracker-text-muted)" }}>Итого</span>
            <span className="delta-num text-[13px] font-semibold" style={{ color: "var(--tracker-accent)" }}>{fmt2(rowsMetrics.totTotalH)}ч</span>
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            <div className="h-1.5 w-12 rounded-full overflow-hidden" style={{ background: "color-mix(in srgb, var(--tracker-text-muted, #8a8378) 16%, transparent)" }}>
              <div className="h-full rounded-full" style={{ width: `${rowsMetrics.avgProg}%`, backgroundColor: "var(--tracker-accent)" }} />
            </div>
            <span className="delta-num text-[12px] font-semibold" style={{ color: "var(--tracker-text-main)" }}>{rowsMetrics.avgProg}%</span>
          </div>
        </div>
      )}

      <div className="hidden md:block">
        {workRows.length === 0 ? (
          <EmptyState
            type={totalRows.length === 0 ? "table" : "filter"}
            onAction={totalRows.length === 0 ? () => onOpenNewTaskDialog(month) : undefined}
          />
        ) : (
          <div className="space-y-1 stagger">
            {(() => {
              const priorityOrder: Priority[] = ["Наивысший", "Высокий", "Средний", "Низкий", "Очередь"];
              const statusOrder = Object.values(STATUSES).sort((a, b) => STATUS_ORDER[a] - STATUS_ORDER[b]);
              const grouped = groupingMode === "status"
                ? statusOrder.map(status => ({
                    key: status,
                    label: status,
                    color: scolText(status, isDark) || "var(--tracker-text-main)",
                    tasks: workRows.filter(t => t.status === status),
                  }))
                : groupingMode === "priority"
                  ? priorityOrder.map(priority => ({
                      key: priority,
                      label: priority,
                      color: PCOL[priority],
                      tasks: workRows.filter(t => t.priority === priority),
                    }))
                  : [{ key: "all", label: "Все задачи", color: INK, tasks: workRows }];

              const visibleGroups = effectiveHideEmpty
                ? grouped.filter((g) => g.tasks.length > 0)
                : grouped;

              return visibleGroups.map((group) => (
                <div key={group.key} className="priority-group">
                  {groupingMode !== "none" && (
                    <div
                      className={`priority-group-header transition-all duration-200 ${dropGroupKey === group.key ? "ring-2 ring-offset-1" : ""}`}
                      style={{
                        color: group.color,
                        ...(dropGroupKey === group.key ? { borderColor: group.color } : {}),
                      }}
                      onDragOver={(e) => handleGroupDragOver(e, group.key)}
                      onDrop={(e) => handleGroupDrop(e, group.key)}
                    >
                      <span style={{ width: 3, height: 16, borderRadius: 2, background: group.color, flexShrink: 0 }} />
                      <span>{group.label}</span>
                      <span className="priority-group-count">{group.tasks.length} {group.tasks.length === 1 ? "задача" : group.tasks.length < 5 ? "задачи" : "задач"}</span>
                    </div>
                  )}
                  <div
                    className={`task-card-grid ${group.tasks.length === 0 && dropGroupKey === group.key ? "min-h-[48px]" : ""}`}
                    onDragOver={groupingMode !== "none" && group.tasks.length === 0 ? (e) => handleGroupDragOver(e, group.key) : undefined}
                    onDrop={groupingMode !== "none" && group.tasks.length === 0 ? (e) => handleGroupDrop(e, group.key) : undefined}
                  >
                    {groupingMode !== "none" && group.tasks.length === 0 && (
                      <div
                        className={`flex items-center justify-center rounded-lg border-2 border-dashed py-3 text-[10px] transition-all duration-200 ${dropGroupKey === group.key ? "opacity-100" : "opacity-30"}`}
                        style={{ borderColor: group.color, color: group.color, gridColumn: "1 / -1" }}
                      >
                        {dropGroupKey === group.key ? "Отпустите здесь" : "Перетащите задачу сюда"}
                      </div>
                    )}
                    {group.tasks.map((task) => {
                      const metrics = getTaskMetrics(task, totalFactMap);
                      const pct = metrics.totalH > 0 && evalExpr(task.planH) > 0
                        ? Math.min(100, (metrics.totalH / evalExpr(task.planH)) * 100)
                        : null;
                      const isOver = pct !== null && pct > 100;
                      const accentColor = "var(--tracker-accent)";
                      const queueNum = localQMap[task.id];
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
                                    style={{ background: "var(--tracker-accent)" }}
                                  >
                                    {queueNum}
                                  </span>
                                )}
                                {task.approvalStatus === "pending" && (
                                  <span className="inline-flex items-center text-[9px] font-bold px-1 py-0.5 rounded bg-[color-mix(in_srgb,var(--tracker-warning)_16%,transparent)] text-[var(--tracker-warning)] border border-dashed border-amber-300" title="Ожидает согласования">БА</span>
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
                              {/* Статус показывается всегда, независимо от группировки */}
                              {(isExecutive || isGuest ? (
                                /* Executive: status badge is read-only */
                                <span
                                  className="h-5 w-auto min-w-[70px] text-[0.6rem] font-semibold rounded-full px-1.5 inline-flex items-center justify-center"
                                  style={{ color: "var(--tracker-text-main)", background: "var(--tracker-bg-card)", border: "1px solid var(--tracker-accent)" }}
                                >
                                  {task.status}
                                </span>
                              ) : (
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button
                                      className="h-5 w-auto min-w-[70px] text-[0.6rem] font-semibold rounded-full px-1.5 border-none cursor-pointer hover:opacity-80 transition-opacity"
                                      style={{ color: "var(--tracker-text-main)", background: "var(--tracker-bg-card)", border: "1px solid var(--tracker-accent)" }}
                                    >
                                      {task.status}
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-[280px] p-2" align="end" side="bottom">
                                    <div className="flex flex-col gap-1.5">
                                      {([
                                        { label: "Новая", items: [STATUSES.IDEA, STATUSES.NEW] },
                                        { label: "В работе", items: [STATUSES.ANALYSIS, STATUSES.APPROVAL, STATUSES.QUEUE_DEV, STATUSES.DEV, STATUSES.TEST, STATUSES.RELEASE, STATUSES.DOCS] },
                                        { label: "Завершена", items: [STATUSES.COMPLETED, STATUSES.PROD_CHECK, STATUSES.DONE] },
                                        { label: "Отмена", items: [STATUSES.POSTPONED, STATUSES.CANCEL] },
                                      ]).map((group) => (
                                        <div key={group.label}>
                                          <div className="text-[8px] uppercase tracking-wider font-semibold mb-0.5 px-0.5" style={{ color: "var(--tracker-text-muted)" }}>{group.label}</div>
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
                              ))}
                              {/* Приоритет показывается всегда, независимо от группировки */}
                              {(!isExecutive && !isGuest ? (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button
                                      className="h-5 text-[0.6rem] font-semibold rounded-full px-1.5 border-none cursor-pointer hover:opacity-80 transition-opacity flex items-center gap-1"
                                      style={{ color: "var(--tracker-text-main)", background: "var(--tracker-bg-card)", border: "1px solid var(--tracker-accent)" }}
                                    >
                                      {task.priority}
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent>
                                    {Object.values(PRIORITIES).map(p => (
                                      <DropdownMenuItem key={p} className="text-xs gap-2 cursor-pointer" onClick={() => {
                                        useTaskStore.getState().snapshot();
                                        updateTask(month, task.id, "priority", p);
                                      }}>
                                        <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PCOL[p] }} />
                                        {p}
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              ) : (
                                <span
                                  className="h-5 text-[0.6rem] font-semibold rounded-full px-1.5 inline-flex items-center gap-1"
                                  style={{ color: "var(--tracker-text-main)", background: "var(--tracker-bg-card)", border: "1px solid var(--tracker-accent)" }}
                                >
                                  {task.priority}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Часы. Итого крупно: именно по нему считается прогресс
                              и срабатывает отсечение при перерасходе. План и факт
                              рядом мелкой строкой — редактируются по клику. */}
                          <div className="task-card-hours">
                            {task.num ? (
                              <button
                                className="task-card-total"
                                style={metrics.over ? { color: "var(--tracker-danger)" } : undefined}
                                onClick={(e) => { e.stopPropagation(); setTotalHDialog({ taskNum: task.num, open: true }); }}
                                title="Разбивка по месяцам"
                              >
                                {fmt2(metrics.totalH)}
                              </button>
                            ) : (
                              <span className="task-card-total" style={metrics.over ? { color: "var(--tracker-danger)" } : undefined}>
                                {fmt2(metrics.totalH)}
                              </span>
                            )}
                            <span className="task-card-total-label" style={metrics.over ? { color: "var(--tracker-danger)" } : undefined}>итого</span>

                            <span className="task-card-hours-detail">
                              <span
                                className="task-card-hours-edit"
                                onClick={(e) => { e.stopPropagation(); startEditing(task.id, "planH"); }}
                                title="План"
                              >
                                план {isEditing(task.id, "planH") ? (
                                  <input
                                    ref={inputEditRef}
                                    className="w-10 text-right font-semibold bg-transparent border-b-2 border-[var(--tracker-accent)] outline-none"
                                    value={task.planH}
                                    onChange={(e) => updateTask(month, task.id, "planH", e.target.value)}
                                    onBlur={stopEditing}
                                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") stopEditing(); }}
                                    onClick={(e) => e.stopPropagation()}
                                    autoFocus
                                  />
                                ) : fmt2(metrics.plan)}
                              </span>
                              <span className="task-card-hours-sep">·</span>
                              <span
                                className="task-card-hours-edit"
                                onClick={(e) => { e.stopPropagation(); startEditing(task.id, "factH"); }}
                                title="Факт за месяц"
                              >
                                факт {isEditing(task.id, "factH") ? (
                                  <input
                                    ref={inputEditRef}
                                    className="w-10 text-right font-semibold bg-transparent border-b-2 border-[var(--tracker-accent)] outline-none"
                                    value={task.factH}
                                    onChange={(e) => updateTask(month, task.id, "factH", e.target.value)}
                                    onBlur={stopEditing}
                                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") stopEditing(); }}
                                    onClick={(e) => e.stopPropagation()}
                                    autoFocus
                                  />
                                ) : fmt2(metrics.fact)}
                              </span>
                              {(task.budgetAllocated ?? 0) > 0 && (
                                <button
                                  className="task-card-budget"
                                  onClick={(e) => { e.stopPropagation(); onOpenBudgetSheet?.(task, month); }}
                                  title="Бюджет задачи"
                                >
                                  <Wallet className="size-3 inline" /> {task.budgetAllocated}ч
                                </button>
                              )}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 mt-2">
                            <div className="task-card-progress flex-1">
                              <div
                                className="task-card-progress-fill"
                                style={{
                                  width: `${Math.min(metrics.prog, 100)}%`,
                                  backgroundColor: metrics.over ? "var(--tracker-danger)" : "var(--tracker-accent)",
                                }}
                              />
                            </div>
                            <span className="text-[11px] tabular-nums shrink-0" style={{ color: metrics.over ? "var(--tracker-danger)" : "var(--tracker-text-muted)" }}>
                              {metrics.prog}%
                            </span>
                          </div>

                          {!clientMode && !isGuest && (
                            <div className="flex items-center gap-0.5 shrink-0 mt-1.5 ml-5" onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toggleHidden(task.id)} title={task._hidden ? "Показать" : "Скрыть"}>
                                {task._hidden ? <EyeOff className="size-3 text-muted-foreground" /> : <Eye className="size-3" />}
                              </Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onOpenTaskDetail?.(task, month)} title="Бюджет и комментарии">
                                <MessageSquare className="size-3" />
                              </Button>
                              {task.num && (
                                <Button variant="ghost" size="icon" className="h-6 w-6" asChild title="Открыть в PlanFix">
                                  <a href={`https://emk.planfix.ru/task/${task.num}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                                    <ExternalLink className="size-3" />
                                  </a>
                                </Button>
                              )}
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
                              <span className="truncate">{task.comment}</span>
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
                                        author: entry.author,
                                      })),
                                      open: true,
                                    });
                                  }}
                                  title="Архив комментариев"
                                >
                                  <History className="size-3" />
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

      <DeleteTaskDialog
        open={deleteConfirm.open}
        taskName={deleteConfirm.taskName}
        onCancel={() => setDeleteConfirm({ open: false, taskId: "", taskName: "" })}
        onConfirm={() => {
          deleteTask(month, deleteConfirm.taskId);
          setDeleteConfirm({ open: false, taskId: "", taskName: "" });
        }}
      />
    </div>
  );
}

