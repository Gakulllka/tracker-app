"use client";

import React, {
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { useTaskStore, PresBgSettings, DEFAULT_PRES_BG, undoStore } from "@/lib/store";
import { createTheme, applyTheme, THEME_TO_PRES } from "@/lib/theme";
import { useServerSync } from "@/hooks/useServerSync";
import { useAuth } from "@/hooks/useAuth";
import type { AuthData } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useQuestions } from "@/hooks/useQuestions";
import { useExport } from "@/hooks/useExport";
import { usePresentation } from "@/hooks/usePresentation";
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
import {
  parseFormulas,
  applyFormula,
  describeFormula,
} from "@/lib/comment-formulas";

import {
  getRowsMetrics,
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
import { useToast } from "@/hooks/use-toast";
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
  Palette,
  Share2,
  Users,
  Check,
} from "lucide-react";
import AuthScreen from "@/components/auth-screen";
import { TaskDetailDialog } from "@/components/dialogs/task-detail-dialog";
import { DashboardDelta } from "@/components/dashboard-delta";
import { ExecSignalsPanel } from "@/components/exec-signals-panel";
import { QuestionsView } from "@/components/views/questions-view";
import { ChatView } from "@/components/views/chat-view";
import { DesignView } from "@/components/views/design-view";
import { TableView } from "@/components/views/table-view";
import { BacklogView } from "@/components/views/backlog-view";
import { SlidesView } from "@/components/views/slides-view";
import { TotalHDialog } from "@/components/dialogs/total-h-dialog";
import { CommentArchiveDialog } from "@/components/dialogs/comment-archive-dialog";
import { TransferDialog } from "@/components/dialogs/transfer-dialog";
import { ImportConfirmDialog } from "@/components/dialogs/import-confirm-dialog";
import { NewTaskDialog } from "@/components/dialogs/new-task-dialog";
import { SettingsDialog } from "@/components/dialogs/settings-dialog";
import { DomainAccessDialog } from "@/components/dialogs/domain-access-dialog";
import { NotificationsBell } from "@/components/notifications-bell";
import { PresenceAvatars } from "@/components/presence-avatars";
import { CommandPalette } from "@/components/command-palette";
import { AppSidebar } from "@/components/app-sidebar";
import { BrandSplash } from "@/components/brand-splash";
import type { SidebarTab } from "@/components/app-sidebar";
import { calcMonthBudgetUsed } from "@/lib/metrics";
import { computeFirstToCut } from "@/lib/cut-algorithm";

export interface EditingCell {
  rowId: string;
  col: string;
}

export default function TaskTrackerPage() {
  return (
    <React.Suspense fallback={<div className="flex h-screen items-center justify-center text-muted-foreground">Загрузка...</div>}>
      <AppWithAuth />
    </React.Suspense>
  );
}

function AppWithAuth() {
  const { authData, authChecking, handleAuth, handleLogout, switchWorkspace, refreshAuth } = useAuth();

  if (authChecking) {
    return <BrandSplash visible label="Проверяем доступ..." />;
  }

  if (!authData) return <AuthScreen onAuth={handleAuth} />;
  return <TaskTrackerInner authData={authData} onLogout={handleLogout} switchWorkspace={switchWorkspace} refreshAuth={refreshAuth} />;
}

//  DesignView — theme picker with named themes and live preview
// ──────────────────────────────────────────────────────────────────

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
  const themeId = useTaskStore((s) => s.themeId);
  const customColor = useTaskStore((s) => s.customColor);
  const customDark = useTaskStore((s) => s.customDark);
  const storeSetCustomColor = useTaskStore((s) => s.setCustomColor);
  const storeSetCustomDark = useTaskStore((s) => s.setCustomDark);
  const storeSetTheme = useTaskStore((s) => s.setTheme);
  const presBg = useTaskStore((s) => s.presBg);
  const storeSetPresBg = useTaskStore((s) => s.setPresBg);
  const presSubTab = useTaskStore((s) => s.presSubTab);
  const setPresSubTab = useTaskStore((s) => s.setPresSubTab);
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
  const storeSetThemeId = useTaskStore((s) => s.setThemeId);
  const storeAddTasksToMonth = useTaskStore((s) => s.addTasksToMonth);
  const storeTransferIncomplete = useTaskStore((s) => s.transferIncompleteTasks);
  const storeUndo = useTaskStore((s) => s.undo);
  const storeRedo = useTaskStore((s) => s.redo);
  const undoVersion = useTaskStore((s) => s.undoVersion);
  const storeTheme = useTaskStore((s) => s.setTheme);
  const storeSetActiveDomain = useTaskStore((s) => s.setActiveDomain);

  /* ---- Toast ---- */
  const { toast } = useToast();

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

  const [totalHDialog, setTotalHDialog] = useState<{
    taskNum: string;
    open: boolean;
  }>({ taskNum: "", open: false });

  // Comment archive dialog
  const [commentArchiveDialog, setCommentArchiveDialog] = useState<{
    taskId: string;
    taskName: string;
    logs: Array<{ date: string; week: string; text: string; planH: string; factH: string; status: string }>;
    open: boolean;
  }>({ taskId: "", taskName: "", logs: [], open: false });

  // Transfer dialog
  const [transferDialog, setTransferDialog] = useState(false);
  const [transferTarget, setTransferTarget] = useState<number>(-1);

  // Import confirmation dialog (только для JSON; для XLSX используется ExcelImportModal со сверкой).
  const handleSyncApply = useCallback((payload: {
    updatedTasks: Task[];
    newTasks: Array<{
      num: string; name: string; planH: string; factH: string;
      priority: Priority; status: Status; comment: string;
    }>;
  }) => {
    const { updatedTasks, newTasks } = payload;
    useTaskStore.getState().snapshot();

    const updatedIds = new Set(updatedTasks.map((t) => t.id));
    const now = Date.now();

    // Карта tombstone'ов текущего месяца — задач с _deleted=true.
    // Если из файла приходит "новая" задача с тем же номером, мы оживляем
    // tombstone вместо создания дубликата. Иначе в allData[месяц] появятся
    // две записи с одним и тем же num, что собьёт серверную синхронизацию.
    const monthRows = allData[currentMonth] || [];
    const tombstonesByNum = new Map<string, Task>();
    for (const r of monthRows) {
      if (r._deleted && r.num) {
        tombstonesByNum.set(r.num.trim(), r);
      }
    }

    const reviveIds = new Set<string>();
    const newTaskObjs: Task[] = [];
    for (const imp of newTasks) {
      const trimmedNum = (imp.num || "").trim();
      const tomb = trimmedNum ? tombstonesByNum.get(trimmedNum) : undefined;
      if (tomb) {
        // Оживляем: id и commentLog сохраняем (история не теряется),
        // содержимое перезаписываем импортируемым.
        reviveIds.add(tomb.id);
      } else {
        // Действительно новая задача.
        newTaskObjs.push({
          id: crypto.randomUUID(),
          num: imp.num || "",
          name: imp.name || "",
          planH: imp.planH || "",
          factH: imp.factH || "",
          priority: imp.priority,
          status: imp.status,
          comment: imp.comment || "",
          commentLog: [],
          _ts: now,
        });
      }
    }

    // Один проход по месяцу: обновления, оживления, остальное — как было.
    const mergedRows: Task[] = monthRows.map((row) => {
      if (updatedIds.has(row.id)) {
        const updated = updatedTasks.find((t) => t.id === row.id);
        return updated ? { ...row, ...updated, _ts: now } : row;
      }
      if (reviveIds.has(row.id)) {
        const trimmedNum = (row.num || "").trim();
        const imp = newTasks.find((n) => (n.num || "").trim() === trimmedNum);
        if (imp) {
          return {
            ...row,
            num: imp.num,
            name: imp.name,
            planH: imp.planH,
            factH: imp.factH,
            priority: imp.priority,
            status: imp.status,
            comment: imp.comment,
            _deleted: false,
            _ts: now,
          };
        }
      }
      return row;
    });

    storeSetAllData({ ...allData, [currentMonth]: [...mergedRows, ...newTaskObjs] });

    setIsImportOpen(false);
    setPendingXlsxFile(null);

    // Понятное резюме без «синхронизация», ближе к языку трекера.
    const revivedCount = reviveIds.size;
    const trulyNewCount = newTaskObjs.length;
    const parts: string[] = [];
    if (trulyNewCount) parts.push(`добавлено ${trulyNewCount}`);
    if (revivedCount) parts.push(`восстановлено ${revivedCount}`);
    if (updatedTasks.length) parts.push(`обновлено ${updatedTasks.length}`);
    toast({
      title: "Импорт применён",
      description: parts.length ? parts.join(" · ") : "Изменений не было",
    });
  }, [allData, currentMonth, storeSetAllData, toast]);

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


  // Sync tracker color theme → presentation preset (emojis, pattern, animation)
  useEffect(() => {
    const hex = themeId;
    if (!hex || customColor) return; // custom colors have no preset
    const preset = THEME_TO_PRES[hex];
    if (!preset) return;
    storeSetPresBg({ emojis: preset.emojis, pattern: preset.pattern, emojiAnim: preset.emojiAnim, emojiCount: 20, emojiSpeed: 1, emojiOpacity: 25 });
  }, [themeId]); // eslint-disable-line react-hooks/exhaustive-deps
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

  /* ---- Theme effect ---- */
  const initialThemeAppliedRef = useRef(false);
  useEffect(() => {
    const hex = customColor || themeId || "#9B72CF";
    const isDark = customDark;
    const th = createTheme(hex, isDark);
    applyTheme(th);
    // Toggle .dark class on <html> for shadcn components
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    initialThemeAppliedRef.current = true;
  }, [themeId, customColor, customDark]);

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
    onRemoteChanges: (messages) => {
      toast({
        title: "Обновлено коллегами",
        description: messages.join("; "),
      });
    },
    onSkippedDomains: (names) => {
      toast({
        title: "Изменения не сохранены",
        description: names.length > 0
          ? `Нет прав на редактирование: ${names.join(", ")}. Запросите доступ у редактора домена.`
          : "У вас нет прав на редактирование этого домена.",
      });
    },
  });

  /* Focus editing cell */
  useEffect(() => {
    if (editingCell && editRef.current) {
      editRef.current.focus();
    }
  }, [editingCell]);

  /* ---- Computed data ---- */
  const accentHex = useMemo(
    () => customColor || themeId || "#5B9BD5",
    [customColor, themeId]
  );

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
    { key: "design", icon: Palette, label: "Оформление", disabled: true },
    { key: "dashboard", icon: BarChart3, label: "Дашборд", disabled: true },
    { key: "chat", icon: MessageSquare, label: "Чат", disabled: true },
  ], [canSeeQuestions, openQuestionsCount]);


  /** Полный список с сервера (включая archived для админа). */
  const [serverDomains, setServerDomains] = useState<Array<{ id: string; name: string; archived?: boolean }>>([]);

  /** Перечитать домены с сервера и положить в store. */
  const refreshDomains = useCallback(async () => {
    try {
      const res = await fetch("/api/domains", {
        headers: { Authorization: `Bearer ${authData.token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.domains)) {
        storeSetDomains(data.domains.map((d: { id: string; name: string }) => ({ id: d.id, name: d.name })));
        setServerDomains(data.domains);
      }
    } catch { /* silent */ }
  }, [authData.token, storeSetDomains]);

  useEffect(() => {
    const t = setTimeout(() => { refreshDomains(); }, 0);
    return () => clearTimeout(t);
  }, [refreshDomains]);

  /** Диалог создания домена из шапки. */
  const [newDomainDialog, setNewDomainDialog] = useState(false);
  const [newDomainName, setNewDomainName] = useState("");
  const [creatingDomain, setCreatingDomain] = useState(false);
  const createDomainFromHeader = useCallback(async () => {
    const name = newDomainName.trim();
    if (!name) return;
    setCreatingDomain(true);
    try {
      const res = await fetch("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authData.token}` },
        body: JSON.stringify({ token: authData.token, name }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.domain) {
        toast({ title: "Домен создан", description: `«${data.domain.name}»` });
        await refreshDomains();
        await refreshAuth(); // создатель получил право редактирования
        storeSetActiveDomain(data.domain.id);
        setNewDomainDialog(false);
        setNewDomainName("");
      } else {
        toast({ title: "Ошибка", description: data.error || "Не удалось создать домен" });
      }
    } catch {
      toast({ title: "Ошибка", description: "Нет соединения с сервером" });
    }
    setCreatingDomain(false);
  }, [newDomainName, authData.token, toast, refreshDomains, refreshAuth, storeSetActiveDomain]);

  /** Глобальный поиск (Ctrl+K). */
  const [paletteOpen, setPaletteOpen] = useState(false);

  /** Запрос доступа к активному домену прямо из шапки. */
  const [requestingAccess, setRequestingAccess] = useState(false);
  const requestAccessToActive = useCallback(async () => {
    setRequestingAccess(true);
    try {
      const res = await fetch("/api/domains/access", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authData.token}` },
        body: JSON.stringify({ token: authData.token, domainId: activeDomainId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast({ title: "Запрос отправлен", description: "Редактор домена увидит его в уведомлениях" });
      } else {
        toast({ title: "Не получилось", description: data.error || "Ошибка запроса" });
      }
    } catch {
      toast({ title: "Ошибка", description: "Нет соединения с сервером" });
    }
    setRequestingAccess(false);
  }, [authData.token, activeDomainId, toast]);

  const totalFactMap = useMemo(
    () => buildTotalFactMap(allData, currentMonth),
    [allData, currentMonth]
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

  const filteredRows = useMemo(() => {
    let result = visibleRows;
    // Фильтр по сигналам руководителя (кнопка-уведомление)
    if (signalsFilterActive) {
      result = result.filter(r =>
        r.approvalStatus === "pending" ||
        r.approvalStatus === "rejected" ||
        !!r.executiveFlag
      );
    }
    if (filterStatuses.size > 0) {
      result = result.filter((r) => filterStatuses.has(r.status));
    }
    if (filterPriorities.size > 0) {
      result = result.filter((r) =>
        filterPriorities.has(r.priority)
      );
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.num.toLowerCase().includes(q) ||
          r.comment.toLowerCase().includes(q) ||
          r.status.toLowerCase().includes(q) ||
          r.priority.toLowerCase().includes(q)
      );
    }
    return result;
  }, [visibleRows, filterStatuses, filterPriorities, searchQuery, signalsFilterActive]);

  const sortedRows = useMemo(() => {
    const arr = [...filteredRows];
    if (sortKey) {
      arr.sort((a, b) => {
        if (sortKey === "name")
          return sortDir * a.name.localeCompare(b.name);
        if (sortKey === "comment")
          return sortDir * a.comment.localeCompare(b.comment);
        if (sortKey === "priority")
          return (
            sortDir *
            (PRIO_START[a.priority] - PRIO_START[b.priority])
          );
        if (sortKey === "status")
          return (
            sortDir *
            (STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
          );
        return (
          sortDir *
          (sortVal(a, sortKey, qMap, totalFactMap) -
            sortVal(b, sortKey, qMap, totalFactMap))
        );
      });
    }
    return arr;
  }, [filteredRows, sortKey, sortDir, qMap, totalFactMap]);

  const rowsMetrics = useMemo(
    () => getRowsMetrics(visibleRows, totalFactMap),
    [visibleRows, totalFactMap]
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

  /* Phase 4: загрузка AI-инсайта с сервера при смене контекста.
   * При смене (workspaceId, activeDomainId, currentMonth, currentYear)
   * сбрасываем aiDraft (он принадлежал предыдущему контексту) и
   * подтягиваем сохранённый инсайт. */
  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    setAiDraft(null);
    fetchInsight(workspaceId, activeDomainId, insightMonthKey)
      .then((insight) => {
        if (cancelled) return;
        setAiConclusion(insight);
      })
      .catch(() => {
        if (cancelled) return;
        setAiConclusion(null);
      });
    return () => { cancelled = true; };
  }, [workspaceId, activeDomainId, insightMonthKey]);

  /* Phase 4: вычисляем хеш текущих задач месяца — для бейджа stale.
   * Хеш хранится в state, чтобы UI мог его сравнить с aiConclusion.dataHash. */
  useEffect(() => {
    let cancelled = false;
    const monthRows = (allData[currentMonth] || []).filter((r) => r.name || r.num);
    if (monthRows.length === 0) {
      setCurrentDataHash("");
      return;
    }
    hashTasks(monthRows).then((h) => {
      if (!cancelled) setCurrentDataHash(h);
    }).catch(() => { /* crypto.subtle недоступен — оставляем "" */ });
    return () => { cancelled = true; };
  }, [allData, currentMonth]);


  /* TotalH dialog breakdown */
  const monthBreakdown = useMemo(() => {
    if (!totalHDialog.taskNum) return { rows: [], taskName: "" };
    const rows: { month: number; planH: number; factH: number; cumulative: number; status: string }[] = [];
    let taskName = "";
    let cum = 0;
    for (let m = 0; m <= 11; m++) {
      const mr = allData[m] || [];
      const t = mr.find((r) => r.num === totalHDialog.taskNum);
      if (t) {
        if (!taskName) taskName = t.name;
        const plan = evalExpr(t.planH);
        const fact = evalExpr(t.factH);
        cum += fact;
        rows.push({ month: m, planH: plan, factH: fact, cumulative: cum, status: t.status });
      }
    }
    return { rows, taskName };
  }, [totalHDialog.taskNum, allData]);

  /* Dashboard data */
  const dashboardData = useMemo(() => {
    const allRows = (allData[currentMonth] || []).filter(r => !r._deleted);
    let total = 0, completed = 0, planH = 0, factH = 0;
    const statusCounts: Record<string, number> = {};
    const priorityCounts: Record<string, number> = {};
    const atRisk: Task[] = [];

    for (const r of allRows) {
      if (!r.name && !r.num) continue; // skip empty rows
      total++;
      const isCompleted = r.status === STATUSES.DONE || r.status === STATUSES.COMPLETED;
      if (isCompleted) completed++;
      const p = evalExpr(r.planH);
      const f = evalExpr(r.factH);
      planH += p;
      factH += f;
      statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
      priorityCounts[r.priority] = (priorityCounts[r.priority] || 0) + 1;
      if (p > 0 && f > p && !isCompleted) atRisk.push(r);
    }

    // Month-by-month sparkline (fact hours per month, all 12)
    const monthlyFact = Array.from({ length: 12 }, (_, i) => {
      const monthRows = (allData[i] || []).filter(r => !r._deleted && (r.name || r.num));
      return R2(monthRows.reduce((sum, r) => sum + evalExpr(r.factH), 0));
    });
    const monthlyPlan = Array.from({ length: 12 }, (_, i) => {
      const monthRows = (allData[i] || []).filter(r => !r._deleted && (r.name || r.num));
      return R2(monthRows.reduce((sum, r) => sum + evalExpr(r.planH), 0));
    });
    const monthlyTotal = Array.from({ length: 12 }, (_, i) =>
      (allData[i] || []).filter(r => !r._deleted && (r.name || r.num)).length
    );
    const monthlyCompleted = Array.from({ length: 12 }, (_, i) =>
      (allData[i] || []).filter(r => !r._deleted && (r.status === STATUSES.DONE || r.status === STATUSES.COMPLETED)).length
    );

    // Top tasks by fact hours in current month
    const topTasks = [...allRows]
      .filter(r => evalExpr(r.factH) > 0 && (r.name || r.num))
      .sort((a, b) => evalExpr(b.factH) - evalExpr(a.factH))
      .slice(0, 5);

    return {
      total, completed, planH: R2(planH), factH: R2(factH),
      statusCounts, priorityCounts, atRisk,
      monthlyFact, monthlyPlan, monthlyTotal, monthlyCompleted,
      topTasks,
      // Delta: суммарный budgetAllocated по месяцам
      monthlyAllocated: Array.from({ length: 12 }, (_, i) =>
        calcMonthBudgetUsed((allData[i] || []).filter(r => !r._deleted))
      ),
    };
  }, [allData, currentMonth]);

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

  /* Phase 7.3: при выходе из редактирования комментария — пробуем
   * распознать формулы (@факт+10, @план*2 и т.п.). Если найдены —
   * меняем factH/planH и заменяем комментарий на системную запись. */
  const commitCommentFormulas = useCallback((month: number, taskId: string) => {
    const task = (allData[month] || []).find((r) => r.id === taskId);
    if (!task) return;
    const { formulas, remainingText } = parseFormulas(task.comment || "");
    if (formulas.length === 0) return;

    let newFactH = evalExpr(task.factH);
    let newPlanH = evalExpr(task.planH);
    const systemNotes: string[] = [];

    for (const f of formulas) {
      if (f.target === "fact") {
        const oldVal = newFactH;
        newFactH = applyFormula(oldVal, f.op, f.operand);
        systemNotes.push(describeFormula(f, oldVal, newFactH));
      } else {
        const oldVal = newPlanH;
        newPlanH = applyFormula(oldVal, f.op, f.operand);
        systemNotes.push(describeFormula(f, oldVal, newPlanH));
      }
    }

    // Применяем изменения. Делаем snapshot для undo.
    useTaskStore.getState().snapshot();
    if (systemNotes.length > 0 && evalExpr(task.factH) !== newFactH) {
      updateTask(month, taskId, "factH", String(Math.round(newFactH * 100) / 100));
    }
    if (systemNotes.length > 0 && evalExpr(task.planH) !== newPlanH) {
      updateTask(month, taskId, "planH", String(Math.round(newPlanH * 100) / 100));
    }
    // Заменяем комментарий: системные строки + остаток обычного текста (если был).
    const newComment = systemNotes.join("\n") + (remainingText ? "\n" + remainingText : "");
    updateTask(month, taskId, "comment", newComment);
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
    handleExportJSON, handleExportMonthXLSX, handleExportAllXLSX,
    handleJSONFileSelect, handleXLSXFileSelect,
    handleConfirmImport,
    handleDragOver, handleDragLeave, handleDrop,
  } = useExport({
    allData, backlog, currentMonth, totalFactMap, accentHex,
    themeId, customColor, domains, activeDomainId,
    activeDomainName: activeDomain?.name,
    questions, presBg,
    storeSetAllData, storeSetBacklog, storeSetDomains,
    storeSetActiveDomainId, storeSetThemeId,
    storeSetCustomColor: (c, d) => storeSetCustomColor(c, d),
    storeSetPresBg: (bg) => storeSetPresBg(bg as Record<string, unknown>),
    setQuestions: setQuestions as (q: unknown[]) => void,
    toast,
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
  } = usePresentation({
    allData, currentMonth, currentYear, accentHex, customDark,
    totalFactMap, presBg, workspaceId, activeDomainId, insightMonthKey,
    chatModel, apiKeyRef, setView: setView as (v: string) => void, setApiKeyDialogOpen, toast,
    monthCapacity: monthlyPlan > 0 ? monthlyPlan : 240,
  });

  /* Phase 4: stale-флаг — данные изменились с момента генерации инсайта */
  const aiInsightStale = useMemo(() => {
    if (!aiConclusion) return false;
    if (!aiConclusion.dataHash || !currentDataHash) return false;
    return aiConclusion.dataHash !== currentDataHash;
  }, [aiConclusion, currentDataHash]);

  const handleTransfer = useCallback(() => {
    if (transferTarget < 0 || transferTarget === currentMonth) return;
    const count = storeTransferIncomplete(currentMonth, transferTarget);
    toast({
      title: "Перенос выполнен",
      description: `${count} задач перенесено в ${MONTHS[transferTarget]}`,
    });
    setTransferDialog(false);
    setTransferTarget(-1);
  }, [currentMonth, transferTarget, storeTransferIncomplete, toast]);

  /* ---- Keyboard shortcuts ---- */
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "л")) {
        e.preventDefault();
        setPaletteOpen(o => !o);
      } else if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        storeUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "Z") {
        e.preventDefault();
        storeRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault();
        storeRedo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        if (!clientMode) setNewTaskDialog({ open: true, month: currentMonth });
      } else if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleExportJSON();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        const searchInput = document.querySelector('input[placeholder*="Поиск задач"]') as HTMLInputElement | null;
        if (searchInput) searchInput.focus();
      } else if ((e.ctrlKey || e.metaKey) && e.key >= "1" && e.key <= "7") {
        e.preventDefault();
        const viewKeys = ["table", "backlog", "questions", "dashboard", "design", "chat", "slides"] as const;
        const idx = parseInt(e.key) - 1;
        if (idx < viewKeys.length && (!allowedTabs || allowedTabs.has(viewKeys[idx]))) {
          setView(viewKeys[idx]);
        }
      } else if (e.key === "Escape") {
        if (settingsOpen) setSettingsOpen(false);
        else if (newTaskDialog.open) setNewTaskDialog({ open: false, month: 0 });
        else if (transferDialog) { setTransferDialog(false); setTransferTarget(-1); }
        else if (apiKeyDialogOpen) setApiKeyDialogOpen(false);
        else if (editingCell) stopEditing();
      } else if (e.key === "Delete" && selectedRowId && !editingCell) {
        e.preventDefault();
        deleteTask(currentMonth, selectedRowId);
        setSelectedRowId(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [storeUndo, storeRedo, clientMode, currentMonth, setNewTaskDialog, handleExportJSON, selectedRowId, editingCell, deleteTask, allowedTabs, setView, settingsOpen, setSettingsOpen, newTaskDialog, transferDialog, setTransferDialog, setTransferTarget, apiKeyDialogOpen, setApiKeyDialogOpen, editingCell, stopEditing]);

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
        customDark={customDark}
        storeSetCustomDark={storeSetCustomDark}
        setShareDialogOpen={setShareDialogOpen}
        setSettingsOpen={openSettings}
        refreshAuth={refreshAuth}
        toast={toast}
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

        {/* ---- MOBILE TOP BAR (десктоп живёт без шапки) ---- */}
        <div
          className="md:hidden sticky top-0 z-30 flex items-center gap-2 px-3 h-12"
          style={{ background: "#17181C", borderBottom: "1px solid rgba(250,250,248,0.12)" }}
        >
          <SidebarTrigger className="shrink-0" style={{ color: "#FAFAF8" }} />
          <svg width="14" height="12" viewBox="0 0 40 36" xmlns="http://www.w3.org/2000/svg" style={{ color: "#FAFAF8" }}>
            <polygon points="20,2 38,34 2,34" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/>
          </svg>
          <span className="text-[11px] font-semibold uppercase select-none"
            style={{ color: "#FAFAF8", letterSpacing: "0.3em", fontFamily: "var(--font-geist-mono, ui-monospace, monospace)" }}>
            Delta
          </span>
          <span className="ml-auto text-[11px] font-medium truncate max-w-[40%]" style={{ color: "rgba(250,250,248,0.6)" }}>
            {activeDomain?.name}
          </span>
        </div>

        {/* Скрытые input'ы импорта (жили в шапке) */}
        <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleJSONFileSelect} />
        <input ref={xlsxInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleXLSXFileSelect} />

        {/* ---- MAIN CONTENT ---- */}
        <main className="flex-1 w-full px-4 md:px-5 py-4 md:py-5 pb-20 md:pb-5 space-y-4 md:space-y-5">

        {/* ---- MONTH SELECTOR (mobile / inline fallback) ---- */}
        {(view === "table" || view === "dashboard" || view === "slides") && (
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
                      <span className={`size-2 rounded-full shrink-0 ${currentMonth === i ? "bg-white/70" : "bg-[var(--tracker-accent)]"}`} />
                    )}
                    <span className="text-xs font-semibold">{MONTHS_SHORT[i]}</span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* ---- VIEWS ---- */}
        {view === "table" && (
          <div className="view-enter" key={`head-${currentMonth}-${currentYear}`}>
            <p className="paper-eyebrow">{currentYear} · {(activeDomain?.name || "").toUpperCase()}</p>
            <h1 className="mt-0.5 text-[22px] font-bold tracking-tight text-[var(--tracker-text-main)]">
              {MONTHS[currentMonth]}
            </h1>
          </div>
        )}

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
            isDark={customDark}
            accentHex={accentHex}
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
            isDark={customDark}
            isGuest={viewOnly}
          />
          </div>
        )}

        {view === "dashboard" && (
          <div className="view-enter">
          <DashboardDelta
            tasks={(allData[currentMonth] || []).filter(t => !t._deleted)}
            backlogTasks={backlog}
            monthCapacity={monthlyPlan > 0 ? monthlyPlan : 240}
            onSetMonthCapacity={(h) => setMonthlyPlan(currentMonthKey, h)}
            monthlyFact={dashboardData.monthlyFact}
            monthlyAllocated={dashboardData.monthlyAllocated}
            currentMonth={currentMonth}
            currentYear={currentYear}
            isDark={customDark}
            onUpdateTask={(taskId, updates) => {
              Object.entries(updates).forEach(([k, v]) => {
                updateTask(currentMonth, taskId, k as keyof Task, v);
              });
            }}
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
            isDark={customDark}
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

        {view === "design" && (
          <div className="view-enter">
          <DesignView
            themeId={themeId}
            customColor={customColor}
            customDark={customDark}
            accentHex={accentHex}
            onSetTheme={storeTheme}
            onSetCustomColor={storeSetCustomColor}
            presBg={presBg}
            onSetPresBg={storeSetPresBg}
            toast={toast}
          />
          </div>
        )}

        {view === "slides" && (
          <div className="view-enter">
          <SlidesView
            slides={slides}
            currentSlide={currentSlide}
            setCurrentSlide={setCurrentSlide}
            accentHex={accentHex}
            presBg={presBg}
            customDark={customDark}
            onSetPresBg={storeSetPresBg}
            onResetPresBg={() => storeSetPresBg(DEFAULT_PRES_BG)}
            onExportHTML={handleExportSlidesHTML}
            onExportPDF={handleExportPDF}
            onEnterFullscreen={handleEnterFullscreen}
            fullscreenContainerRef={fullscreenContainerRef}
            hasData={(allData[currentMonth] || []).some((r) => r.name || r.num)}
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
          />
          </div>
        )}
      </main>
      </SidebarInset>

      {/* ---- MOBILE BOTTOM NAV ---- */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 mobile-bottom-nav" role="navigation" aria-label="Мобильная навигация">
        <div className="flex items-stretch" role="tablist" aria-label="Вкладки приложения">
          {(
            [
              { key: "table",     icon: LayoutGrid,    label: "Задачи" },
              { key: "backlog",   icon: Package,       label: "Беклог" },
              ...(canSeeQuestions ? [{ key: "questions" as const, icon: HelpCircle, label: "Вопросы" }] : []),
              { key: "slides",    icon: Presentation,  label: "Слайды" },
              { key: "dashboard", icon: BarChart3,     label: "Дашборд", disabled: true },
              { key: "chat",      icon: MessageSquare, label: "Чат", disabled: true },
            ] as const
          )
            .filter((tab) => !allowedTabs || allowedTabs.has(tab.key))
            .map((tab) => {
              const isDisabled = "disabled" in tab && tab.disabled;
              return (
                <button
                  key={tab.key}
                  role="tab"
                  aria-selected={view === tab.key}
                  aria-label={isDisabled ? `${tab.label} — в разработке` : tab.label}
                  onClick={isDisabled ? undefined : () => setView(tab.key)}
                  disabled={isDisabled}
                  className={`mobile-bottom-nav-item ${view === tab.key ? "active" : ""} ${isDisabled ? "opacity-40 cursor-not-allowed" : ""}`}
                >
                  <span className="mobile-bottom-nav-icon"><tab.icon className="size-[18px]" /></span>
                  <span className="mobile-bottom-nav-label">{tab.label}</span>
                </button>
              );
            })}
        </div>
      </nav>

      {/* ---- TOTALH DIALOG ---- */}
      <TotalHDialog
        open={totalHDialog.open}
        taskNum={totalHDialog.taskNum}
        taskName={monthBreakdown.taskName}
        rows={monthBreakdown.rows}
        isDark={customDark}
        onClose={() => setTotalHDialog({ taskNum: "", open: false })}
      />

      {/* ---- COMMENT ARCHIVE ---- */}
      <CommentArchiveDialog
        open={commentArchiveDialog.open}
        taskName={commentArchiveDialog.taskName}
        logs={commentArchiveDialog.logs}
        isDark={customDark}
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
            isDark={customDark}
            currentUsername={currentUsername}
            allData={allData}
            onDeleteTask={(m, id) => { deleteTask(m, id); setTaskDetailTask(null); }}
            onMoveToBacklog={(m, id) => { moveToBacklog(m, id); setTaskDetailTask(null); }}
            usedHoursInMonth={calcMonthBudgetUsed(monthTasks)}
            monthCapacity={cap}
            isFirstToCutIds={cutIds}
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
        themeId={themeId}
        customColor={customColor}
        customDark={customDark}
        onSetTheme={storeTheme}
        onSetCustomColor={storeSetCustomColor}
        token={authData.token}
        isAdmin={isAdmin}
        userRole={authData.user.role}
        domains={isAdmin && serverDomains.length > 0 ? serverDomains : domains}
        activeDomainId={activeDomainId}
        onSetActiveDomain={storeSetActiveDomain}
        onDomainsChanged={refreshDomains}
        toast={toast}
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
        toast={toast}
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
    </SidebarProvider>
    </>
  );
}

/* ================================================================ */
/*  TABLE VIEW COMPONENT                                             */
/* ================================================================ */

