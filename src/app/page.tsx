"use client";

import React, {
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { AuthGate } from "@/app/auth-gate";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { RAIL } from "@/lib/tokens";
import { useInsightSync } from "@/hooks/useInsightSync";
import { useDomains } from "@/hooks/useDomains";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { mergeImportedTasks, type ImportPayload } from "@/lib/task-import";
import { filterTasks, sortTasks, buildMonthBreakdown } from "@/lib/task-filters";
import { useTaskStore, PresBgSettings, DEFAULT_PRES_BG, undoStore } from "@/lib/store";
import { useServerSync } from "@/hooks/useServerSync";
import { useAuth } from "@/hooks/useAuth";
import type { AuthData } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useQuestions } from "@/hooks/useQuestions";
import { useExport } from "@/hooks/useExport";
import { usePresentation } from "@/hooks/usePresentation";
import { useProtocols } from "@/hooks/useProtocols";
import {
  fetchInsight,
  hashTasks,
} from "@/lib/ai-insights-client";
import {
  MONTHS,
  MONTHS_SHORT,
  STATUSES,
  type Status,
  type Priority,
  type Task,
  STATUS_ORDER,
  PRIO_START,
} from "@/lib/types";
import { applyCommentFormulas } from "@/lib/comment-formulas";

import {
  getRowsMetrics, fmt2,
  calcQueueMap,
  buildTotalFactMap,
  evalExpr,
  R2,
  sortVal,
} from "@/lib/metrics";
import { Button } from "@/components/ui/button";
import { ExcelImportModal } from "@/components/excel-import-modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarSeparator,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar";
import {
  Undo2,
  Redo2,
  Eye,
  EyeOff,
  Presentation,
  Upload,
  Settings,
  MessageSquare,
  Loader2,
  LogOut,
  Shield,
  Sun,
  Moon,
  LayoutGrid,
  Package,
  HelpCircle,
  BarChart3,
  Share2,
  Users,
  FileText,
  Check,
} from "lucide-react";
import AuthScreen from "@/components/auth-screen";
import { TaskDetailDialog } from "@/components/dialogs/task-detail-dialog";
import { ExecSignalsPanel } from "@/components/exec-signals-panel";
import { QuestionsView } from "@/components/views/questions-view";
import { ChatView } from "@/components/views/chat-view";
import { TableView } from "@/components/views/table-view";
import { BacklogView } from "@/components/views/backlog-view";
import { SlidesView } from "@/components/views/slides-view";
import { ProtocolsView } from "@/components/views/protocols-view";
import { TotalHDialog } from "@/components/dialogs/total-h-dialog";
import { CommentArchiveDialog } from "@/components/dialogs/comment-archive-dialog";
import { TransferDialog } from "@/components/dialogs/transfer-dialog";
import { ImportConfirmDialog } from "@/components/dialogs/import-confirm-dialog";
import { NewTaskDialog } from "@/components/dialogs/new-task-dialog";
import { SettingsDialog } from "@/components/dialogs/settings-dialog";
import { DomainAccessDialog } from "@/components/dialogs/domain-access-dialog";
import { PresenceAvatars } from "@/components/presence-avatars";
import { CommandPalette } from "@/components/command-palette";
import { AppSidebar } from "@/components/app-sidebar";
import { BrandSplash } from "@/components/brand-splash";
import { DomainPickerScreen } from "@/components/domain-picker";
import { MobileActionSheet } from "@/components/mobile-action-sheet";
import { MobileMonthPicker } from "@/components/mobile-month-picker";
import { MobileDomainPicker } from "@/components/mobile-domain-picker";
import type { SidebarTab } from "@/components/app-sidebar";
import { calcMonthBudgetUsed } from "@/lib/metrics";
import { computeFirstToCut } from "@/lib/cut-algorithm";

export interface EditingCell {
  rowId: string;
  col: string;
}

export default function TaskTrackerPage() {
  return (
    <React.Suspense
      fallback={
        <div className="flex h-screen items-center justify-center text-muted-foreground">
          Загрузка...
        </div>
      }
    >
      <AuthGate>{(props) => <TaskTrackerInner {...props} />}</AuthGate>
    </React.Suspense>
  );
}

function TaskTrackerInner({ authData, onLogout, switchWorkspace, refreshAuth }: { authData: AuthData; onLogout: () => void; switchWorkspace: (id: string) => void; refreshAuth: () => Promise<void> | void }) {
  /* ---- Auth-provided workspace ---- */
  const workspaceId = authData.workspaceId;
  const [isOnline, setIsOnline] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const isSyncingRef = useRef(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  /* ---- Legacy key cleanup ----
   * With workspace-scoped localStorage, the old shared key `task-tracker-store`
   * may still exist from a previous version. Clean it up once per session. */
  useEffect(() => {
    if (!workspaceId) return;
    try {
      const legacy = localStorage.getItem("task-tracker-store");
      if (legacy) {
        // Legacy key exists — the workspace-scoped storage adapter handles
        // migration (copies legacy data to the workspace-specific key on read).
        // Remove the legacy key after a short delay to allow the migration.
        setTimeout(() => {
          try { localStorage.removeItem("task-tracker-store"); } catch { /* ignore */ }
        }, 2000);
      }
    } catch { /* ignore */ }
  }, [workspaceId]);

  /* ---- Store selectors ---- */
  const allData = useTaskStore((s) => s.allData);
  const _rawBacklog = useTaskStore((s) => s.backlog);
  const backlog = useMemo(() => _rawBacklog.filter((t) => !t._deleted), [_rawBacklog]);
  const domains = useTaskStore((s) => s.domains);
  const activeDomainId = useTaskStore((s) => s.activeDomainId);
  const currentMonth = useTaskStore((s) => s.currentMonth);
  const currentYear = useTaskStore((s) => s.currentYear);
  const setCurrentYearStore = useTaskStore((s) => s.setCurrentYear);
  const getAvailableYears = useTaskStore((s) => s.getAvailableYears);
  const view = useTaskStore((s) => s.view);
  const clientMode = useTaskStore((s) => s.clientMode);
  const darkMode = useTaskStore((s) => s.darkMode);
  const storeSetDarkMode = useTaskStore((s) => s.setDarkMode);
  const presBg = useTaskStore((s) => s.presBg);
  const storeSetPresBg = useTaskStore((s) => s.setPresBg);
  const presSubTab = useTaskStore((s) => s.presSubTab);
  const setPresSubTab = useTaskStore((s) => s.setPresSubTab);
  const setCurrentUsernameStore = useTaskStore((s) => s.setCurrentUsername);
  // Фиксируем username в сторе — для подписи комментариев (CommentEntry.author).
  useEffect(() => {
    if (authData?.user?.username) setCurrentUsernameStore(authData.user.username);
  }, [authData?.user?.username, setCurrentUsernameStore]);
  /* Phase 7.2: monthBudget удалён, заменён на monthlyPlanByYearMonth per-domain.
   * Подписываемся на текущий домен и подсчитываем план для текущего месяца+года. */
  const setMonthlyPlan = useTaskStore((s) => s.setMonthlyPlan);
  const activeDomainData = useTaskStore((s) => s.domainData[s.activeDomainId]);
  const monthlyPlanByYearMonth = activeDomainData?.monthlyPlanByYearMonth;
  const currentMonthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;
  const monthlyPlan = monthlyPlanByYearMonth?.[currentMonthKey] ?? 80;
  const filterStatuses = useTaskStore((s) => s.filterStatuses);
  const filterPriorities = useTaskStore((s) => s.filterPriorities);
  const sortKey = useTaskStore((s) => s.sortKey);
  const sortDir = useTaskStore((s) => s.sortDir);
  const searchQuery = useTaskStore((s) => s.searchQuery);

  const setCurrentMonth = useTaskStore((s) => s.setCurrentMonth);
  const setView = useTaskStore((s) => s.setView);
  const updateTask = useTaskStore((s) => s.updateTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const reorderTask = useTaskStore((s) => s.reorderTask);
  const sortMonthTasks = useTaskStore((s) => s.sortMonthTasks);
  const moveToBacklog = useTaskStore((s) => s.moveToBacklog);
  const deleteBacklogTask = useTaskStore((s) => s.deleteBacklogTask);
  const reorderBacklog = useTaskStore((s) => s.reorderBacklog);
  const updateBacklogTask = useTaskStore(
    (s) => s.updateBacklogTask
  );
  const toggleStatusFilter = useTaskStore(
    (s) => s.toggleStatusFilter
  );
  const togglePriorityFilter = useTaskStore(
    (s) => s.togglePriorityFilter
  );
  const setSortKey = useTaskStore((s) => s.setSortKey);
  const setSearchQuery = useTaskStore((s) => s.setSearchQuery);
  const clearFilters = useTaskStore((s) => s.clearFilters);
  const toggleClientMode = useTaskStore(
    (s) => s.toggleClientMode
  );
  const storeSetAllData = useTaskStore((s) => s.setAllData);
  const storeSetBacklog = useTaskStore((s) => s.setBacklog);
  const storeSetDomains = useTaskStore((s) => s.setDomains);
  const storeSetActiveDomainId = useTaskStore((s) => s.setActiveDomainId);
  const storeAddTasksToMonth = useTaskStore((s) => s.addTasksToMonth);
  const storeTransferIncomplete = useTaskStore((s) => s.transferIncompleteTasks);
  const storeUndo = useTaskStore((s) => s.undo);
  const storeRedo = useTaskStore((s) => s.redo);
  const undoVersion = useTaskStore((s) => s.undoVersion);
  const storeSetActiveDomain = useTaskStore((s) => s.setActiveDomain);

  /* ---- Inline-ошибки действий (замена toast) ---- */
  const [actionError, setActionError] = useState<string | null>(null);
  // Автосброс через 8с, чтобы баннер не висел бесконечно.
  useEffect(() => {
    if (!actionError) return;
    const t = setTimeout(() => setActionError(null), 8000);
    return () => clearTimeout(t);
  }, [actionError]);

  /* ---- Local state ---- */
  const [editingCell, setEditingCell] = useState<EditingCell | null>(
    null
  );

  // ── Multi-select for bulk operations ────────────────────────────────────────
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const toggleTaskSelection = useCallback((id: string) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const selectAllTasks = useCallback((ids: string[]) => {
    setSelectedTaskIds(prev => prev.size === ids.length ? new Set() : new Set(ids));
  }, []);
  const clearSelection = useCallback(() => setSelectedTaskIds(new Set()), []);
  const bulkUpdateTasks = useTaskStore(s => s.bulkUpdateTasks);
  const duplicateTask = useTaskStore(s => s.duplicateTask);

  // ── Delta: Budget & Signals ───────────────────────────────────────────────
  const [signalsFilterActive, setSignalsFilterActive] = useState(false);
  const [taskDetailTask, setTaskDetailTask] = useState<{ task: Task; month: number } | null>(null);

  // ── Диалог создания новой задачи ─────────────────────────────────────────
  const [newTaskDialog, setNewTaskDialog] = useState<{ open: boolean; month: number }>({ open: false, month: 0 });

  /* ---- Questions (вынесено в хук) ---- */
  const currentUsername = authData.user.displayName || authData.user.username;
  const {
    questions, setQuestions,
    newQuestionText, setNewQuestionText,
    addQuestion, addQuestionDirect, addLinkedQuestion,
    removeQuestion, answerQuestion, deleteAnswer,
    archiveQuestion, restoreQuestion,
  } = useQuestions(currentUsername, activeDomainId);

  /* ---- Протоколы встреч ---- */
  const protocolsHook = useProtocols(activeDomainId, authData);

  const [totalHDialog, setTotalHDialog] = useState<{
    taskNum: string;
    open: boolean;
  }>({ taskNum: "", open: false });

  // Comment archive dialog
  const [commentArchiveDialog, setCommentArchiveDialog] = useState<{
    taskId: string;
    taskName: string;
    logs: Array<{ date: string; week: string; text: string; planH: string; factH: string; status: string; author?: string }>;
    open: boolean;
  }>({ taskId: "", taskName: "", logs: [], open: false });

  // Transfer dialog
  const [transferDialog, setTransferDialog] = useState(false);
  const [transferTarget, setTransferTarget] = useState<number>(-1);

  // Подтверждение импорта (JSON; для XLSX работает ExcelImportModal со сверкой).
  // Логика слияния — в lib/task-import.ts, здесь только применение результата.
  const handleSyncApply = useCallback((payload: ImportPayload) => {
    useTaskStore.getState().snapshot();

    const { rows } = mergeImportedTasks(allData[currentMonth] || [], payload);
    storeSetAllData({ ...allData, [currentMonth]: rows });

    setIsImportOpen(false);
    setPendingXlsxFile(null);
  }, [allData, currentMonth, storeSetAllData]);

  // Slide data — Phase 3: больше не state, а useMemo от данных.
  // Кнопка «Создать презентацию» убрана. Слайды всегда есть, если есть задачи.
  /* Phase 4: aiConclusion теперь — серверный объект (с dataHash, source,
   * updatedAt). Загружается при смене (workspaceId, activeDomainId,
  /** Phase 7.3: ошибка последней AI-генерации (для красного баннера в Презентации). */
  /* Phase 4: текущий хеш задач месяца — для детекции stale-инсайтов. */

  // Drag overlay

  // Settings dialog
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<string | undefined>(undefined);
  /** Открыть настройки (опционально — сразу на нужной вкладке). */
  const openSettings = useCallback((v: boolean, tab?: string) => {
    setSettingsTab(tab);
    setSettingsOpen(v);
  }, []);

  // Share dialog
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  // Mobile sheets
  const [mobileActionSheetOpen, setMobileActionSheetOpen] = useState(false);
  const [mobileMonthPickerOpen, setMobileMonthPickerOpen] = useState(false);
  const [mobileDomainPickerOpen, setMobileDomainPickerOpen] = useState(false);


  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  // Chat state
  const apiKeyRef = useRef<string>("");
  /** Phase 7.3: реактивный флаг наличия ключа — для индикатора в SlidesView. */
  const [hasApiKey, setHasApiKey] = useState(false);
  const [chatModel, setChatModel] = useState("gemini-2.5-flash");
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);

  const editRef = useRef<HTMLTextAreaElement>(null);
  const inputEditRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const xlsxInputRef = useRef<HTMLInputElement>(null);

  /* ---- Тёмная тема ----
   * Значения токенов лежат в globals.css (:root и .dark). Здесь только
   * переключение класса. Раньше все переменные выставлялись рантаймом
   * из lib/theme.ts, из-за чего при загрузке мелькала неоформленная
   * страница, а на /admin тема не применялась вовсе. */
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  /* ---- Server Sync (вынесено в хук) ---- */
  const { syncStatus } = useServerSync({
    workspaceId,
    token: authData.token,
    allData,
    backlog,
    monthlyPlanByYearMonth,
    isSyncingRef,
    setIsOnline,
    setLastSync,
    setIsInitialLoading,
    setQuestions,
    currentUsername: authData.user.username,
    onRemoteChanges: () => {
      // Тосты об изменениях коллег отключены — данные обновляются автоматически через LWW-мерж
    },
    onSkippedDomains: (_names) => {
      // Ошибка прав отображается через индикатор синхронизации (SyncStatus: "denied").
      // Всплывашка убрана; подробности — в колокольчике / запросе доступа.
    },
  });

  /* Focus editing cell */
  useEffect(() => {
    if (editingCell && editRef.current) {
      editRef.current.focus();
    }
  }, [editingCell]);

  /* ---- Computed data ---- */

  const activeDomain = useMemo(
    () => domains.find((d) => d.id === activeDomainId),
    [domains, activeDomainId]
  );

  /** Открытые вопросы активного домена (+общие) — бейдж в сайдбаре. */
  const openQuestionsCount = useMemo(
    () => questions.filter(q =>
      (q.status === "open" || q.status === "reopened") &&
      (!q.domainId || q.domainId === activeDomainId)
    ).length,
    [questions, activeDomainId]
  );

  /* ---- Permissions (вынесено в хук) ---- */
  // Find the current share record if user is accessing a shared workspace
  const currentShare = useMemo(() => {
    if (!authData.accessibleWorkspaces) return undefined;
    return authData.accessibleWorkspaces.find(ws => ws.workspaceId === workspaceId && ws.role !== "editor" && ws.role !== "viewer");
  }, [authData.accessibleWorkspaces, workspaceId]);

  const {
    isAdmin, isGuest, canEdit, canEditActiveDomain, canComment, canSetFlags, isExecutive,
    canDeleteTasks, canEditBacklog, canDeleteBacklog,
    canCreatePresentations, canUseAI,
    allowedTabs, visibleDomains, canSeeQuestions,
  } = usePermissions({ authData, domains, activeDomainId, storeSetActiveDomain: storeSetActiveDomain, currentShare });
  void canDeleteTasks; void canEditBacklog; void canDeleteBacklog; void canCreatePresentations; void canUseAI; void canEdit;

  /** Домен только на просмотр для member (не гость, роль умеет редактировать,
   *  но на этот домен прав нет). */
  const isReadOnlyDomain = !isGuest && !canEditActiveDomain &&
    !["viewer", "guest"].includes(authData.user.role);
  /** Общий флаг «в этом домене редактировать нельзя» — блокирует UI так же,
   *  как гостевой режим. */
  const viewOnly = isGuest || !canEditActiveDomain;

  /** Скрытая вкладка «Оформление» недостижима — уводим на задачи. */
  useEffect(() => {
    if (view === "design") {
      const t = setTimeout(() => setView("table"), 0);
      return () => clearTimeout(t);
    }
  }, [view, setView]);

  /** Табы сайдбара (бейдж «Вопросы» = открытые вопросы активного домена). */
  const sidebarTabs = useMemo((): SidebarTab[] => [
    { key: "table", icon: LayoutGrid, label: "Задачи" },
    { key: "backlog", icon: Package, label: "Беклог" },
    ...(canSeeQuestions ? [{ key: "questions", icon: HelpCircle, label: "Вопросы", badge: openQuestionsCount }] : []),
    { key: "slides", icon: Presentation, label: "Презентация" },
    { key: "protocols", icon: FileText, label: "Протоколы" },
  ], [canSeeQuestions, openQuestionsCount]);


  /** Полный список с сервера (включая archived для админа). */
  /* ---- Бюджет месяца ----
   * Хранится по паре домен + месяц. Правится прямо в шапке списка задач:
   * раньше редактор жил в дашборде, который был удалён как неиспользуемый,
   * и настройка стала недоступна, хотя сеттер в сторе остался. */
  const storeSetMonthlyPlan = useTaskStore((s) => s.setMonthlyPlan);
  const [limitDraft, setLimitDraft] = useState(String(monthlyPlan));

  useEffect(() => { setLimitDraft(String(monthlyPlan)); }, [monthlyPlan]);

  const commitMonthLimit = useCallback(() => {
    const hours = Number(limitDraft);
    if (!Number.isFinite(hours) || hours <= 0) {
      setLimitDraft(String(monthlyPlan));
      return;
    }
    if (hours !== monthlyPlan) storeSetMonthlyPlan(currentMonthKey, hours);
  }, [limitDraft, monthlyPlan, currentMonthKey, storeSetMonthlyPlan]);

  /* ---- Домены (реализация — hooks/useDomains.ts) ---- */
  const {
    domains: serverDomains,
    refresh: refreshDomains,
    create: createDomainFromHeader,
    creating: creatingDomain,
    dialogOpen: newDomainDialog,
    setDialogOpen: setNewDomainDialog,
    newName: newDomainName,
    setNewName: setNewDomainName,
    requestAccess: requestAccessToActive,
    requestingAccess,
  } = useDomains({
    token: authData.token,
    activeDomainId,
    setStoreDomains: storeSetDomains,
    setActiveDomain: storeSetActiveDomain,
    refreshAuth: async () => { await refreshAuth?.(); },
    onError: setActionError,
  });

  /** Глобальный поиск (Ctrl+K). */
  const [paletteOpen, setPaletteOpen] = useState(false);

  const totalFactMap = useMemo(
    () => buildTotalFactMap(activeDomainData?.dataByYearMonth || {}, currentYear, currentMonth),
    [activeDomainData?.dataByYearMonth, currentYear, currentMonth]
  );

  const rows = useMemo(
    () => (allData[currentMonth] || []).filter((r) => !r._deleted),
    [allData, currentMonth]
  );

  const qMap = useMemo(() => {
    const sorted = [...rows].sort((a, b) => PRIO_START[a.priority] - PRIO_START[b.priority]);
    return calcQueueMap(sorted);
  }, [rows]);

  const visibleRows = useMemo(
    () =>
      clientMode ? rows.filter((r) => !r._hidden) : rows,
    [rows, clientMode]
  );

  const filteredRows = useMemo(
    () => filterTasks(visibleRows, {
      signalsOnly: signalsFilterActive,
      statuses: filterStatuses,
      priorities: filterPriorities,
      search: searchQuery,
    }),
    [visibleRows, filterStatuses, filterPriorities, searchQuery, signalsFilterActive],
  );

  const sortedRows = useMemo(
    () => sortTasks(filteredRows, sortKey, sortDir as 1 | -1,
      (task, key) => sortVal(task, key, qMap, totalFactMap)),
    [filteredRows, sortKey, sortDir, qMap, totalFactMap],
  );

  const rowsMetrics = useMemo(
    () => getRowsMetrics(visibleRows, totalFactMap),
    [visibleRows, totalFactMap]
  );

  /** Сколько запланировано от бюджета месяца. */
  const monthLoad = useMemo(
    () => (monthlyPlan > 0 ? Math.round((rowsMetrics.totPlan / monthlyPlan) * 100) : 0),
    [rowsMetrics.totPlan, monthlyPlan],
  );

  const monthHasData = useCallback(
    (m: number) => {
      const mr = allData[m] || [];
      return mr.some((r) => r.name || r.num);
    },
    [allData]
  );


  /* Phase 4: monthKey для запросов в /api/insights */
  const insightMonthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;

  /* Разбивка по месяцам для окна «Итого» */
  const monthBreakdown = useMemo(
    () => buildMonthBreakdown(totalHDialog.taskNum, allData, evalExpr),
    [totalHDialog.taskNum, allData],
  );


  /* ---- Handlers ---- */
  const startEditing = useCallback(
    (rowId: string, col: string) => {
      // Save snapshot before inline editing begins
      useTaskStore.getState().snapshot();
      setEditingCell({ rowId, col });
    },
    []
  );

  const stopEditing = useCallback(() => {
    setEditingCell(null);
  }, []);

  /** При выходе из редактирования комментария применяем формулы «@факт+10». */
  const commitCommentFormulas = useCallback((month: number, taskId: string) => {
    const task = (allData[month] || []).find((r) => r.id === taskId);
    if (!task) return;

    const result = applyCommentFormulas(
      task.comment || "",
      evalExpr(task.factH),
      evalExpr(task.planH),
    );
    if (!result.applied) return;

    useTaskStore.getState().snapshot();
    if (evalExpr(task.factH) !== result.factH) {
      updateTask(month, taskId, "factH", String(result.factH));
    }
    if (evalExpr(task.planH) !== result.planH) {
      updateTask(month, taskId, "planH", String(result.planH));
    }
    updateTask(month, taskId, "comment", result.comment);
  }, [allData, updateTask]);

  const isEditing = useCallback(
    (rowId: string, col: string) =>
      editingCell?.rowId === rowId && editingCell?.col === col,
    [editingCell]
  );

  const toggleHidden = useCallback(
    (taskId: string) => {
      const task = rows.find((r) => r.id === taskId);
      if (task) {
        useTaskStore.getState().snapshot();
        updateTask(
          currentMonth,
          taskId,
          "_hidden",
          !task._hidden
        );
      }
    },
    [rows, currentMonth, updateTask]
  );

  const handleSort = useCallback(
    (key: string) => {
      setSortKey(key);
    },
    [setSortKey]
  );


  /* ---- Export / Import (вынесено в хук) ---- */
  const {
    importConfirm, setImportConfirm,
    isImportOpen, setIsImportOpen,
    pendingXlsxFile, setPendingXlsxFile,
    dragOverlay,
    exportError, clearExportError,
    handleExportJSON, handleExportMonthXLSX, handleExportAllXLSX,
    handleJSONFileSelect, handleXLSXFileSelect,
    handleConfirmImport,
    handleDragOver, handleDragLeave, handleDrop,
  } = useExport({
    allData, backlog, currentMonth, totalFactMap,
    domains, activeDomainId,
    activeDomainName: activeDomain?.name,
    questions, presBg,
    storeSetAllData, storeSetBacklog, storeSetDomains,
    storeSetActiveDomainId,
    storeSetPresBg: (bg) => storeSetPresBg(bg as Record<string, unknown>),
    setQuestions: setQuestions as (q: unknown[]) => void,
  });

  /* ---- Presentation (вынесено в хук) ---- */
  const {
    slides, currentSlide, setCurrentSlide,
    aiConclusion, setAiConclusion,
    aiDraft, setAiDraft,
    aiConclusionBusy, aiAnalysisError,
    currentDataHash, setCurrentDataHash,
    fullscreenContainerRef,
    openPresentation,
    readTrackerTokens,
    handleExportSlidesHTML, handleExportPDF, handleEnterFullscreen,
    handleAiAnalysis, handleApproveDraft, handleDiscardDraft, handleRemoveConclusion,
    snapshot: presentationSnapshot, setSnapshot: setPresentationSnapshot,
  } = usePresentation({
    allData, backlog, currentMonth, currentYear, darkMode,
    totalFactMap, dataByYearMonth: activeDomainData?.dataByYearMonth || {},
    presBg, workspaceId, activeDomainId, insightMonthKey,
    chatModel, apiKeyRef, setView: setView as (v: string) => void, setApiKeyDialogOpen,
    monthCapacity: monthlyPlan > 0 ? monthlyPlan : 240,
  });

  /* Инсайт: загрузка с сервера + пометка «устарел» (hooks/useInsightSync.ts) */
  const { isStale: aiInsightStale } = useInsightSync({
    workspaceId, activeDomainId, monthKey: insightMonthKey,
    monthTasks: allData[currentMonth] || [],
    insight: aiConclusion, setInsight: setAiConclusion, setDraft: setAiDraft,
    currentDataHash, setCurrentDataHash,
  });

  const handleTransfer = useCallback(() => {
    if (transferTarget < 0 || transferTarget === currentMonth) return;
    storeTransferIncomplete(currentMonth, transferTarget);
    setTransferDialog(false);
    setTransferTarget(-1);
  }, [currentMonth, transferTarget, storeTransferIncomplete]);

  /* ---- Горячие клавиши (реализация — hooks/useKeyboardShortcuts.ts) ---- */
  useKeyboardShortcuts({
    togglePalette: () => setPaletteOpen((o) => !o),
    undo: storeUndo,
    redo: storeRedo,
    createTask: () => setNewTaskDialog({ open: true, month: currentMonth }),
    exportJson: handleExportJSON,
    setView: setView as (v: string) => void,
    allowedTabs: allowedTabs ?? undefined,
    readOnly: clientMode,
    isEditing: Boolean(editingCell),
    closeTopDialog: () => {
      if (settingsOpen) { setSettingsOpen(false); return true; }
      if (newTaskDialog.open) { setNewTaskDialog({ open: false, month: 0 }); return true; }
      if (transferDialog) { setTransferDialog(false); setTransferTarget(-1); return true; }
      if (apiKeyDialogOpen) { setApiKeyDialogOpen(false); return true; }
      if (editingCell) { stopEditing(); return true; }
      return false;
    },
    deleteSelected: () => {
      if (!selectedRowId) return;
      deleteTask(currentMonth, selectedRowId);
      setSelectedRowId(null);
    },
  });

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */

  return (
    <>
    {/* ---- LOADING SCREEN ---- */}
    <BrandSplash visible={isInitialLoading} label="Загружаем ваши задачи..." />

    {/* ---- MAIN APP ---- */}
    <SidebarProvider>
      {/* ---- SIDEBAR ---- */}
      <AppSidebar
        tabs={sidebarTabs}
        view={view}
        setView={setView as (v: string) => void}
        allowedTabs={allowedTabs}
        currentMonth={currentMonth}
        setCurrentMonth={setCurrentMonth}
        currentYear={currentYear}
        setCurrentYear={setCurrentYearStore}
        monthHasData={monthHasData}
        getAvailableYears={getAvailableYears}
        authData={authData}
        workspaceId={workspaceId}
        switchWorkspace={switchWorkspace}
        activeDomainId={activeDomainId}
        visibleDomains={visibleDomains}
        storeSetActiveDomain={storeSetActiveDomain}
        setNewDomainDialog={setNewDomainDialog}
        canCreateDomain={!isGuest && authData.user.role !== "viewer"}
        isReadOnlyDomain={isReadOnlyDomain}
        requestingAccess={requestingAccess}
        requestAccessToActive={requestAccessToActive}
        storeUndo={storeUndo}
        storeRedo={storeRedo}
        darkMode={darkMode}
        setDarkMode={storeSetDarkMode}
        setShareDialogOpen={setShareDialogOpen}
        setSettingsOpen={openSettings}
        refreshAuth={refreshAuth}
        onOpenTask={(domainId, monthKey, taskId) => {
          // Переключаем домен и месяц/год, затем открываем детали задачи.
          storeSetActiveDomain(domainId);
          if (monthKey) {
            const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
            if (m) {
              const y = Number(m[1]);
              const mo = Number(m[2]) - 1;
              if (y !== currentYear) setCurrentYearStore(y);
              if (mo !== currentMonth) useTaskStore.getState().setCurrentMonth(mo);
            }
          }
          // Открываем задачу после обновления домена/месяца (через короткий таймер).
          setTimeout(() => {
            const t = (useTaskStore.getState().allData[useTaskStore.getState().currentMonth] || [])
              .find(r => r.id === taskId && !r._deleted);
            if (t) setTaskDetailTask({ task: t, month: useTaskStore.getState().currentMonth });
          }, 150);
        }}
        allData={allData}
        backlog={backlog}
        monthlyPlan={monthlyPlan}
        updateTask={updateTask}
        addLinkedQuestion={addLinkedQuestion}
        signalsFilterActive={signalsFilterActive}
        setSignalsFilterActive={setSignalsFilterActive}
        isGuest={isGuest}
        isAdmin={isAdmin}
        clientMode={clientMode}
        toggleClientMode={toggleClientMode}
        onLogout={onLogout}
        syncStatus={syncStatus}
        lastSync={lastSync}
      />

      <SidebarInset
        className={`transition-opacity duration-500 ${isInitialLoading ? "opacity-0" : "opacity-100"}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* ---- DRAG OVERLAY ---- */}
        {dragOverlay && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-[var(--tracker-accent)] bg-background/90 p-12">
              <Upload className="size-12 text-[var(--tracker-accent)]" />
              <p className="text-lg font-semibold text-foreground">
                Перетащите файл сюда
              </p>
              <p className="text-sm text-muted-foreground">
                Поддерживаются файлы .json и .xlsx
              </p>
            </div>
          </div>
        )}

        {/* ---- INLINE ОШИБКА ДЕЙСТВИЯ (замена toast) ---- */}
        {actionError && (
          <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 backdrop-blur px-4 py-2.5 text-sm text-destructive shadow-lg max-w-md">
            <span className="flex-1">{actionError}</span>
            <button
              type="button"
              className="shrink-0 text-destructive/70 hover:text-destructive"
              onClick={() => setActionError(null)}
              aria-label="Закрыть сообщение об ошибке"
            >✕</button>
          </div>
        )}

        {/* ---- INLINE ОШИБКА ЭКСПОРТА/ИМПОРТА ---- */}
        {exportError && (
          <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 backdrop-blur px-4 py-2.5 text-sm text-destructive shadow-lg max-w-md">
            <span className="flex-1">{exportError}</span>
            <button
              type="button"
              className="shrink-0 text-destructive/70 hover:text-destructive"
              onClick={clearExportError}
              aria-label="Закрыть сообщение об ошибке"
            >✕</button>
          </div>
        )}

        {/* ---- MOBILE TOP BAR (десктоп живёт без шапки) ---- */}
        <div
          className="md:hidden sticky top-0 z-30 flex items-center gap-2 px-3 h-12"
          style={{ background: RAIL.bg, borderBottom: `1px solid ${RAIL.line}` }}
        >
          <SidebarTrigger className="shrink-0" style={{ color: RAIL.text }} />
          <svg width="14" height="12" viewBox="0 0 40 36" xmlns="http://www.w3.org/2000/svg" style={{ color: RAIL.text }}>
            <polygon points="20,2 38,34 2,34" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/>
          </svg>
          <span className="text-[11px] font-semibold uppercase select-none"
            style={{ color: RAIL.text, letterSpacing: "0.3em", fontFamily: "var(--font-geist-mono, ui-monospace, monospace)" }}>
            Delta
          </span>
          {/* Домен — тап для смены */}
          <button
            onClick={() => setMobileDomainPickerOpen(true)}
            className="ml-1 text-[11px] font-medium truncate max-w-[35%] px-2 py-1 rounded-lg active:scale-[0.95] transition-transform"
            style={{ color: "rgba(250,250,248,0.6)" }}
          >
            {activeDomain?.name || "Домен"}
          </button>
          <span className="ml-auto flex items-center gap-1">
            {/* Месяц — тап для выбора */}
            <button
              onClick={() => setMobileMonthPickerOpen(true)}
              className="text-[11px] font-medium px-2 py-1 rounded-lg active:scale-[0.95] transition-transform"
              style={{ color: "rgba(250,250,248,0.6)" }}
            >
              {MONTHS_SHORT[currentMonth]}
            </button>
            {/* Еще — action sheet */}
            <button
              onClick={() => setMobileActionSheetOpen(true)}
              className="size-7 flex items-center justify-center rounded-lg active:scale-[0.95] transition-transform"
              style={{ color: "rgba(250,250,248,0.6)" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>
              </svg>
            </button>
          </span>
        </div>

        {/* Скрытые input'ы импорта (жили в шапке) */}
        <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleJSONFileSelect} />
        <input ref={xlsxInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleXLSXFileSelect} />

        {/* ---- MAIN CONTENT ---- */}
        <main className="flex-1 w-full px-4 md:px-5 py-4 md:py-5 pb-20 md:pb-5 space-y-4 md:space-y-5">

        {/* ---- MONTH SELECTOR (mobile / inline fallback) ---- */}
        {(view === "table" || view === "slides") && (
          <div className="w-full space-y-2 md:hidden">
            <ScrollArea className="w-full" type="scroll">
              <div className="flex gap-2 pb-1">
                {MONTHS.map((m, i) => (
                  <button
                    key={m}
                    onClick={() => setCurrentMonth(i)}
                    className={`relative flex items-center justify-center gap-2 shrink-0 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                      currentMonth === i
                        ? "bg-[var(--tracker-accent)] text-[var(--tracker-accent-contrast)] shadow-md"
                        : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {monthHasData(i) && (
                      <span className={`size-2 rounded-full shrink-0 ${currentMonth === i ? "bg-[var(--tracker-bg-card)]/70" : "bg-[var(--tracker-accent)]"}`} />
                    )}
                    <span className="text-xs font-semibold">{MONTHS_SHORT[i]}</span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* ---- Шапка вкладки ----
             Титул разворота есть у каждой вкладки, а не только у задач:
             без него остальные разделы начинались сразу с содержания
             и выглядели как чужие экраны. */}
        <div className="month-masthead view-enter" key={`head-${view}-${currentMonth}-${currentYear}`}>
          <div>
            <p className="paper-eyebrow">{currentYear} · {(activeDomain?.name || "").toUpperCase()}</p>
            <h1 className="month-masthead-title">
              {view === "table" ? MONTHS[currentMonth] : (sidebarTabs.find((t) => t.key === view)?.label ?? "")}
            </h1>
          </div>

          {/* Метрики только на задачах: в остальных вкладках они не про то,
              что на экране. Раньше жили в тулбаре узкой плашкой рядом
              с поиском — числа месяца важнее инструментов. */}
          {view === "table" && visibleRows.length > 0 && (
            <dl className="month-masthead-metrics">
              <div className="month-limit">
                <dt>Бюджет месяца</dt>
                <dd>
                  <input
                    className="month-limit-input delta-num"
                    type="text"
                    inputMode="numeric"
                    value={limitDraft}
                    onChange={(e) => setLimitDraft(e.target.value.replace(/[^\d]/g, ""))}
                    onBlur={commitMonthLimit}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    disabled={clientMode}
                    aria-label={`Бюджет часов на ${MONTHS[currentMonth]}`}
                  />
                  <span className="month-limit-unit">ч</span>
                </dd>
              </div>

              <div className="month-masthead-sep" aria-hidden="true" />

              <div>
                <dt>План</dt>
                <dd>{fmt2(rowsMetrics.totPlan)}</dd>
              </div>
              <div>
                <dt>Факт</dt>
                <dd>{fmt2(rowsMetrics.totFact)}</dd>
              </div>
              <div>
                <dt>Итого</dt>
                <dd>{fmt2(rowsMetrics.totTotalH)}</dd>
              </div>

              {/* Загрузка: сколько запланировано от лимита. Раньше здесь стоял
                  средний прогресс по задачам — он усредняет проценты задач
                  разного веса и потому мало о чём говорит. */}
              <div className="month-load">
                <dt>Загрузка</dt>
                <dd>
                  <span className="month-load-bar" role="img" aria-label={`Загрузка месяца ${monthLoad}%`}>
                    <i style={{ width: `${Math.min(monthLoad, 100)}%`, background: monthLoad > 100 ? "var(--tracker-danger)" : "var(--tracker-accent)" }} />
                  </span>
                  <span style={{ color: monthLoad > 100 ? "var(--tracker-danger)" : undefined }}>{monthLoad}%</span>
                </dd>
              </div>
            </dl>
          )}
        </div>

        {view === "table" && (
          <div className="view-enter" key={`table-${currentMonth}-${currentYear}`}>
          <TableView
            rows={sortedRows}
            totalRows={visibleRows}
            allData={allData}
            backlog={backlog}
            qMap={qMap}
            totalFactMap={totalFactMap}
            rowsMetrics={rowsMetrics}
            month={currentMonth}
            clientMode={clientMode}
            editingCell={editingCell}
            editRef={editRef}
            inputEditRef={inputEditRef}
            isEditing={isEditing}
            startEditing={startEditing}
            stopEditing={stopEditing}
            commitCommentFormulas={commitCommentFormulas}
            updateTask={updateTask}
            deleteTask={deleteTask}
            reorderTask={reorderTask}
            sortMonthTasks={sortMonthTasks}
            moveToBacklog={moveToBacklog}
            toggleHidden={toggleHidden}
            handleSort={handleSort}
            sortKey={sortKey}
            sortDir={sortDir}
            filterStatuses={filterStatuses}
            filterPriorities={filterPriorities}
            searchQuery={searchQuery}
            toggleStatusFilter={toggleStatusFilter}
            togglePriorityFilter={togglePriorityFilter}
            setSearchQuery={setSearchQuery}
            clearFilters={clearFilters}
            onCreatePresentation={openPresentation}
            onOpenTransfer={() => { setTransferTarget(-1); setTransferDialog(true); }}
            setTotalHDialog={setTotalHDialog}
            setCommentArchiveDialog={setCommentArchiveDialog}
            selectedRowId={selectedRowId}
            setSelectedRowId={setSelectedRowId}
            isDark={darkMode}
            onExportJSON={handleExportJSON}
            onExportMonthXLSX={handleExportMonthXLSX}
            onExportAllXLSX={handleExportAllXLSX}
            onExportPDF={handleExportPDF}
            onImportJSON={() => fileInputRef.current?.click()}
            onImportXLSX={() => setIsImportOpen(true)}
            onOpenNewTaskDialog={(month) => setNewTaskDialog({ open: true, month })}
            onOpenBudgetSheet={(task, month) => setTaskDetailTask({ task, month })}
            onOpenTaskDetail={(task, month) => setTaskDetailTask({ task, month })}
            selectedTaskIds={selectedTaskIds}
            toggleTaskSelection={toggleTaskSelection}
            selectAllTasks={selectAllTasks}
            clearSelection={clearSelection}
            bulkUpdateTasks={bulkUpdateTasks}
            duplicateTask={duplicateTask}
            isExecutive={isExecutive}
            isGuest={viewOnly}
          />
          </div>
        )}

        {view === "backlog" && (
          <div className="view-enter">
          <BacklogView
            backlog={backlog}
            currentMonth={currentMonth}
            updateBacklogTask={updateBacklogTask}
            deleteBacklogTask={deleteBacklogTask}
            reorderBacklog={reorderBacklog}
            setCommentArchiveDialog={setCommentArchiveDialog}
            isDark={darkMode}
            isGuest={viewOnly}
          />
          </div>
        )}

        {view === "questions" && (
          <div className="view-enter">
          <QuestionsView
            questions={questions}
            newQuestionText={newQuestionText}
            setNewQuestionText={setNewQuestionText}
            addQuestion={addQuestion}
            addLinkedQuestion={addLinkedQuestion}
            removeQuestion={removeQuestion}
            answerQuestion={answerQuestion}
            deleteAnswer={deleteAnswer}
            archiveQuestion={archiveQuestion}
            restoreQuestion={restoreQuestion}
            currentUsername={authData.user.displayName || authData.user.username}
            currentMonth={currentMonth}
            allData={allData}
            updateTask={updateTask}
            addToBacklog={(task) => {
              useTaskStore.setState({ backlog: [...useTaskStore.getState().backlog, { ...task, _ts: Date.now() }] });
            }}
            addToTable={(month, task) => {
              const state = useTaskStore.getState();
              const existing = state.allData[month] || [];
              const isEmpty = existing.length === 1 && !existing[0].num && !existing[0].name;
              state.setAllData({ ...state.allData, [month]: isEmpty ? [task] : [...existing, task] });
            }}
            isDark={darkMode}
            isGuest={viewOnly}
            activeDomainId={activeDomainId}
            activeDomainName={activeDomain?.name}
          />
          </div>
        )}

        {view === "chat" && (
          <div className="view-enter">
          <ChatView
            apiKeyRef={apiKeyRef}
            apiKeyDialogOpen={apiKeyDialogOpen}
            setApiKeyDialogOpen={setApiKeyDialogOpen}
            onApiKeySaved={() => setHasApiKey(true)}
            chatModel={chatModel}
            setChatModel={setChatModel}
            rows={rows}
            month={currentMonth}
            year={currentYear}
            allData={allData}
            backlog={backlog}
            totalFactMap={totalFactMap}
            questions={questions}
            addQuestion={addQuestionDirect}
          />
          </div>
        )}

        {view === "slides" && (
          <div className="view-enter">
          <SlidesView
            slides={slides}
            currentSlide={currentSlide}
            setCurrentSlide={setCurrentSlide}
            presBg={presBg}
            darkMode={darkMode}
            onSetPresBg={storeSetPresBg}
            onResetPresBg={() => storeSetPresBg(DEFAULT_PRES_BG)}
            onExportHTML={handleExportSlidesHTML}
            onExportPDF={handleExportPDF}
            onEnterFullscreen={handleEnterFullscreen}
            fullscreenContainerRef={fullscreenContainerRef}
            hasData={Object.values(allData as Record<number, Task[]>).some((monthRows) => monthRows.some((r) => !r._deleted && (r.name || r.num))) || backlog.some((r) => !r._deleted && (r.name || r.num))}
            onAiAnalysis={handleAiAnalysis}
            aiAnalysisBusy={aiConclusionBusy}
            aiDraft={aiDraft}
            aiConclusion={aiConclusion}
            onSetAiDraft={setAiDraft}
            onApproveDraft={handleApproveDraft}
            onDiscardDraft={handleDiscardDraft}
            onRemoveConclusion={handleRemoveConclusion}
            aiInsightStale={aiInsightStale}
            aiAnalysisError={aiAnalysisError}
            onOpenApiKeyDialog={() => setApiKeyDialogOpen(true)}
            chatModel={chatModel}
            setChatModel={setChatModel}
            hasApiKey={hasApiKey}
            presSubTab={presSubTab}
            setPresSubTab={setPresSubTab}
            currentMonth={currentMonth}
            currentYear={currentYear}
            isGuest={isGuest}
            authToken={authData.token}
            activeDomainId={activeDomainId}
            monthKey={insightMonthKey}
            snapshot={presentationSnapshot}
            onSnapshotChange={setPresentationSnapshot}
          />
          </div>
        )}

        {view === "protocols" && (
          <div className="view-enter">
          <ProtocolsView
            protocols={protocolsHook.protocols}
            loading={protocolsHook.loading}
            uploading={protocolsHook.uploading}
            fetchProtocols={protocolsHook.fetchProtocols}
            uploadProtocol={protocolsHook.uploadProtocol}
            deleteProtocol={protocolsHook.deleteProtocol}
            downloadProtocol={protocolsHook.downloadProtocol}
            getPreviewData={protocolsHook.getPreviewData}
            currentUsername={protocolsHook.currentUsername}
            isDark={darkMode}
            isGuest={isGuest}
          />
          </div>
        )}
      </main>
      </SidebarInset>

      <MobileBottomNav
        view={view}
        setView={setView}
        allowedTabs={allowedTabs ?? undefined}
        canSeeQuestions={canSeeQuestions}
      />
      {/* ---- TOTALH DIALOG ---- */}
      <TotalHDialog
        open={totalHDialog.open}
        taskNum={totalHDialog.taskNum}
        taskName={monthBreakdown.taskName}
        rows={monthBreakdown.rows}
        isDark={darkMode}
        onClose={() => setTotalHDialog({ taskNum: "", open: false })}
      />

      {/* ---- COMMENT ARCHIVE ---- */}
      <CommentArchiveDialog
        open={commentArchiveDialog.open}
        taskName={commentArchiveDialog.taskName}
        logs={commentArchiveDialog.logs}
        isDark={darkMode}
        onClose={() => setCommentArchiveDialog(prev => ({ ...prev, open: false }))}
      />

      {/* ---- TRANSFER ---- */}
      <TransferDialog
        open={transferDialog}
        currentMonth={currentMonth}
        transferTarget={transferTarget}
        onTargetChange={setTransferTarget}
        onTransfer={handleTransfer}
        onClose={() => { setTransferDialog(false); setTransferTarget(-1); }}
      />

      {/* ---- IMPORT CONFIRM ---- */}
      <ImportConfirmDialog
        open={importConfirm.open}
        file={importConfirm.file}
        onConfirm={handleConfirmImport}
        onClose={() => setImportConfirm({ open: false, type: "json", file: null })}
      />

      {/* ---- NEW TASK ---- */}
      <NewTaskDialog
        open={newTaskDialog.open}
        month={newTaskDialog.month}
        year={currentYear}
        onClose={() => setNewTaskDialog({ open: false, month: 0 })}
      />

      {/* ── TaskDetailDialog (unified) ── */}
      {taskDetailTask && (() => {
        const monthTasks = (allData[taskDetailTask.month] || []).filter(t => !t._deleted);
        const cap = monthlyPlan > 0 ? monthlyPlan : 240;
        const cutIds = computeFirstToCut(monthTasks, cap);
        return (
          <TaskDetailDialog
            open={!!taskDetailTask}
            onOpenChange={(o) => {
              if (!o) setTaskDetailTask(null);
              else {
                const storeData = useTaskStore.getState().allData;
                const fresh = (storeData[taskDetailTask.month] || []).find(t => t.id === taskDetailTask.task.id);
                if (fresh) setTaskDetailTask({ task: fresh, month: taskDetailTask.month });
              }
            }}
            task={taskDetailTask.task}
            month={taskDetailTask.month}
            isDark={darkMode}
            currentUsername={currentUsername}
            allData={allData}
            onDeleteTask={(m, id) => { deleteTask(m, id); setTaskDetailTask(null); }}
            onMoveToBacklog={(m, id) => { moveToBacklog(m, id); setTaskDetailTask(null); }}
            onUpdateTask={(month, taskId, key, value) => {
              updateTask(month, taskId, key, value);
              const storeData = useTaskStore.getState().allData;
              const fresh = (storeData[month] || []).find(t => t.id === taskId);
              if (fresh) setTaskDetailTask({ task: fresh, month });
            }}
          />
        );
      })()}


      {/* ---- SETTINGS ---- */}
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialTab={settingsTab}
        darkMode={darkMode}
        token={authData.token}
        isAdmin={isAdmin}
        userRole={authData.user.role}
        domains={isAdmin && serverDomains.length > 0 ? serverDomains : domains}
        activeDomainId={activeDomainId}
        onSetActiveDomain={storeSetActiveDomain}
        onDomainsChanged={refreshDomains}
      />

      {/* ---- DOMAIN ACCESS ---- */}
      <DomainAccessDialog
        open={shareDialogOpen}
        onClose={() => setShareDialogOpen(false)}
        token={authData.token}
        domains={domains}
        activeDomainId={activeDomainId}
        currentUser={{ id: authData.user.id, role: authData.user.role }}
        editableDomainIds={authData.editableDomainIds}
        onChanged={() => { refreshAuth(); }}
      />

      {/* ---- COMMAND PALETTE (Ctrl+K) ---- */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        questions={questions}
        activeDomainId={activeDomainId}
        onGoToTask={(year, month, taskId) => {
          if (year !== currentYear) setCurrentYearStore(year);
          setCurrentMonth(month);
          setView("table");
          setSelectedRowId(taskId);
        }}
        onGoToBacklog={() => setView("backlog")}
        onGoToQuestions={() => setView("questions")}
      />

      {/* ---- NEW DOMAIN (из шапки) ---- */}
      <Dialog open={newDomainDialog} onOpenChange={(o) => { if (!o) setNewDomainDialog(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Новый домен</DialogTitle>
            <DialogDescription>
              Домен видят все пользователи. Право редактирования будет у вас как у создателя.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={newDomainName}
            onChange={(e) => setNewDomainName(e.target.value)}
            placeholder="Название домена..."
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") createDomainFromHeader(); }}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setNewDomainDialog(false)}>Отмена</Button>
            <Button size="sm" disabled={!newDomainName.trim() || creatingDomain} onClick={createDomainFromHeader}>
              {creatingDomain ? <Loader2 className="size-3.5 mr-1 animate-spin" /> : null}
              Создать
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ExcelImportModal
        isOpen={isImportOpen}
        onClose={() => {
          setIsImportOpen(false);
          setPendingXlsxFile(null);
        }}
        currentMonthTasks={allData[currentMonth] || []}
        currentMonth={currentMonth}
        onApplyChanges={handleSyncApply}
        initialFile={pendingXlsxFile}
      />

      {/* ---- MOBILE SHEETS ---- */}
      <MobileActionSheet
        open={mobileActionSheetOpen}
        onOpenChange={setMobileActionSheetOpen}
        canUndo={undoStore.canUndo()}
        canRedo={undoStore.canRedo()}
        onUndo={storeUndo}
        onRedo={storeRedo}
        onSwitchDomain={() => { setMobileDomainPickerOpen(true); }}
        onSettings={() => openSettings(true)}
        isDark={darkMode}
        onToggleTheme={() => storeSetDarkMode(!darkMode)}
        onExport={handleExportJSON}
        onImport={() => setIsImportOpen(true)}
      />

      <MobileMonthPicker
        open={mobileMonthPickerOpen}
        onOpenChange={setMobileMonthPickerOpen}
        currentMonth={currentMonth}
        currentYear={currentYear}
        onSelectMonth={setCurrentMonth}
        monthHasData={monthHasData}
      />

      <MobileDomainPicker
        open={mobileDomainPickerOpen}
        onOpenChange={setMobileDomainPickerOpen}
        domains={serverDomains.length > 0 ? serverDomains : domains}
        activeDomainId={activeDomainId}
        editableDomainIds={authData.editableDomainIds}
        onSelectDomain={(id) => {
          storeSetActiveDomain(id);
          refreshAuth();
        }}
        onCreateDomain={async (name) => {
          const res = await fetch("/api/domains", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${authData.token}` },
            body: JSON.stringify({ token: authData.token, name }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.domain) {
            await refreshDomains();
            await refreshAuth();
            storeSetActiveDomain(data.domain.id);
          } else {
            throw new Error(data.error || "Не удалось создать домен");
          }
        }}
        onRequestAccess={async (domainId) => {
          const res = await fetch("/api/domains/access", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${authData.token}` },
            body: JSON.stringify({ token: authData.token, domainId }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || "Ошибка запроса");
          }
        }}
      />
    </SidebarProvider>
    </>
  );
}

/* ================================================================ */
/*  TABLE VIEW COMPONENT                                             */
/* ================================================================ */

