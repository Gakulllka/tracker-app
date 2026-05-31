"use client";

import React, {
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
  type KeyboardEvent,
} from "react";
import { useTaskStore, PresBgSettings, DEFAULT_PRES_BG, undoStore } from "@/lib/store";
import {
  PresentationSlide,
  PresentationBgLayer,
  buildTheme,
  type SlideData,
  type AiConclusion,
} from "@/lib/presentation-renderer";
import { renderPresentationHtml } from "@/lib/presentation-export";
import { generateSlides } from "@/lib/slides";
import { createTheme, applyTheme, hexToRgb, NAMED_THEMES, THEME_TO_PRES } from "@/lib/theme";
import { mapQuestionFromAPI, fmtDate as fmtDateUtil } from "@/lib/questions";
import type { Question, QuestionAnswer } from "@/lib/questions";
import { useServerSync } from "@/hooks/useServerSync";
import { useAuth } from "@/hooks/useAuth";
import type { AuthData, UserPermissions, RolePermissions } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { useQuestions } from "@/hooks/useQuestions";
import { useExport } from "@/hooks/useExport";
import { usePresentation } from "@/hooks/usePresentation";
import {
  fetchInsight,
  saveInsight,
  deleteInsight,
  hashTasks,
  type AiInsightShape,
} from "@/lib/ai-insights-client";
import {
  COLS,
  MONTHS,
  MONTHS_SHORT,
  STATUSES,
  PRIORITIES,
  PCOL,
  SCOL,
  scolText,
  type Status,
  type Priority,
  type Task,
  type Domain,
  STATUS_ORDER,
  PRIO_START,
} from "@/lib/types";
import {
  parseFormulas,
  applyFormula,
  describeFormula,
} from "@/lib/comment-formulas";

import {
  getTaskMetrics,
  getRowsMetrics,
  calcQueueMap,
  buildTotalFactMap,
  evalExpr,
  fmt2,
  R2,
  progColor,
  CLOSED_STATUSES,
  createNewTask,
  sortVal,
} from "@/lib/metrics";
import {
  exportJSON,
  importJSON,
  exportMonthXLSX,
  exportAllXLSX,
} from "@/lib/export";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { ExcelImportModal } from "@/components/excel-import-modal";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AutoResizeTextarea } from "@/components/auto-resize-textarea";
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Plus,
  Trash2,
  Archive,
  Search,
  Undo2,
  Redo2,
  Eye,
  EyeOff,
  Presentation,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Filter,
  X,
  Save,
  FolderOpen,
  FileSpreadsheet,
  Download,
  Upload,
  ArrowRight,
  Sparkles,
  Settings,
  Check,
  MessageSquare,
  Send,
  Loader2,
  KeyRound,
  Share2,
  LogOut,
  Shield,
  Maximize2,
  FileText,
  Sun,
  Moon,
  ArrowUpDown,
} from "lucide-react";
import AuthScreen from "@/components/auth-screen";
import { BudgetSignalsSheet } from "@/components/budget-signals-sheet";
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
import { TaskLink } from "@/lib/planfix";
import { calcMonthBudgetUsed } from "@/lib/metrics";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface EditingCell {
  rowId: string;
  col: string;
}


/* ------------------------------------------------------------------ */
/*  Planfix Integration                                                 */
/* ------------------------------------------------------------------ */


/* ------------------------------------------------------------------ */
/*  Theme Utilities (ported from original 8-color theme system)          */
/* ------------------------------------------------------------------ */


/* ------------------------------------------------------------------ */
/*  Auth Context                                                       */
/* ------------------------------------------------------------------ */


/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function TaskTrackerPage() {
  return (
    <React.Suspense fallback={<div className="flex h-screen items-center justify-center text-muted-foreground">Загрузка...</div>}>
      <AppWithAuth />
    </React.Suspense>
  );
}

function AppWithAuth() {
  const { authData, authChecking, handleAuth, handleLogout } = useAuth();

  if (authChecking) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: "linear-gradient(135deg, #f3f0ff 0%, #fce4f4 40%, #e8f4fd 100%)" }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "var(--tracker-bg-card, #fff)" }}>
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--tracker-accent, #9B72CF)" }} />
          </div>
          <p className="text-sm" style={{ color: "var(--tracker-text-muted)" }}>Проверка авторизации...</p>
        </div>
      </div>
    );
  }

  if (!authData) return <AuthScreen onAuth={handleAuth} />;
  return <TaskTrackerInner authData={authData} onLogout={handleLogout} />;
}

//  DesignView — theme picker with named themes and live preview
// ──────────────────────────────────────────────────────────────────

function TaskTrackerInner({ authData, onLogout }: { authData: AuthData; onLogout: () => void }) {
  /* ---- Auth-provided workspace ---- */
  const workspaceId = authData.workspaceId;
  const [isOnline, setIsOnline] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const isSyncingRef = useRef(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

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
  const storeAddDomain = useTaskStore((s) => s.addDomain);
  const storeRenameDomain = useTaskStore((s) => s.renameDomain);
  const storeDeleteDomain = useTaskStore((s) => s.deleteDomain);
  const storeSetActiveDomain = useTaskStore((s) => s.setActiveDomain);

  /* ---- Toast ---- */
  const { toast } = useToast();

  /* ---- Local state ---- */
  const [editingCell, setEditingCell] = useState<EditingCell | null>(
    null
  );

  // ── Delta: Budget & Signals Sheet ────────────────────────────────────────
  const [budgetSheetTask, setBudgetSheetTask] = useState<{ task: Task; month: number } | null>(null);
  const [signalsFilterActive, setSignalsFilterActive] = useState(false);

  // ── Диалог создания новой задачи ─────────────────────────────────────────
  const [newTaskDialog, setNewTaskDialog] = useState<{ open: boolean; month: number }>({ open: false, month: 0 });

  /* ---- Questions (вынесено в хук) ---- */
  const currentUsername = authData.user.displayName || authData.user.username;
  const {
    questions, setQuestions,
    newQuestionText, setNewQuestionText,
    addQuestion, addQuestionDirect, addLinkedQuestion,
    removeQuestion, answerQuestion, deleteAnswer,
  } = useQuestions(currentUsername);

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
      title: "📥 Импорт применён",
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
  useServerSync({
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

  /* ---- Permissions (вынесено в хук) ---- */
  const {
    isAdmin, canEdit,
    canDeleteTasks, canEditBacklog, canDeleteBacklog,
    canCreatePresentations, canUseAI,
    allowedTabs, visibleDomains, canSeeQuestions,
  } = usePermissions({ authData, domains, activeDomainId, storeSetActiveDomain: storeSetActiveDomain });
  void canDeleteTasks; void canEditBacklog; void canDeleteBacklog; void canCreatePresentations; void canUseAI;

  const totalFactMap = useMemo(
    () => buildTotalFactMap(allData, currentMonth),
    [allData, currentMonth]
  );

  const rows = useMemo(
    () => (allData[currentMonth] || []).filter((r) => !r._deleted),
    [allData, currentMonth]
  );

  const qMap = useMemo(() => calcQueueMap(rows), [rows]);

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
    storeSetAllData, storeSetBacklog, storeSetDomains,
    storeSetActiveDomainId, storeSetThemeId,
    storeSetCustomColor: (c, d) => storeSetCustomColor(c, d),
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
      title: "↗️ Перенос",
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

      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
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
      } else if (e.key === "Delete" && selectedRowId && !editingCell) {
        e.preventDefault();
        deleteTask(currentMonth, selectedRowId);
        setSelectedRowId(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [storeUndo, storeRedo, clientMode, currentMonth, setNewTaskDialog, handleExportJSON, selectedRowId, editingCell, deleteTask]);

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */

  return (
    <>
    {/* ---- LOADING SCREEN ---- */}
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center transition-all duration-700 ${isInitialLoading ? "opacity-100" : "opacity-0 pointer-events-none"} ${customDark ? "loader-bg-dark" : "loader-bg-light"}`}
      style={
        customDark
          ? { background: "linear-gradient(135deg, #0d0d1a 0%, #12091f 50%, #0a0f1e 100%)" }
          : { background: "linear-gradient(135deg, #f3f0ff 0%, #fce4f4 40%, #e8f4fd 100%)" }
      }
    >
      {/* Animated background circles */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="loader-circle loader-circle-1" />
        <div className="loader-circle loader-circle-2" />
        <div className="loader-circle loader-circle-3" />
      </div>

      {/* Content */}
      <div className={`relative z-10 flex flex-col items-center gap-6 transition-all duration-500 ${isInitialLoading ? "scale-100 translate-y-0" : "scale-95 -translate-y-4"}`}>
        {/* Delta Logo */}
        <div className="loader-delta-wrap">
          <div className="loader-delta-ring" />
          <div className="loader-delta-ring2" />
          {/* Inline SVG — контур треугольника Delta, цвет наследует акцент темы */}
          <svg
            className="loader-delta-svg"
            viewBox="0 0 40 36"
            xmlns="http://www.w3.org/2000/svg"
            style={{ color: "var(--tracker-accent, #9B72CF)" }}
          >
            {/* Внешний контур Δ */}
            <polygon
              points="20,2 38,34 2,34"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            {/* Внутренний контур — создаёт "пустую" дельту */}
            <polygon
              points="20,11 31.5,32 8.5,32"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinejoin="round"
              opacity="0.35"
            />
            {/* Центральная точка-акцент */}
            <circle cx="20" cy="2" r="2" fill="currentColor" opacity="0.7" />
          </svg>
        </div>

        {/* Title */}
        <div className="text-center">
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: customDark ? "#ede9fe" : "#3d2264" }}
          >
            Delta
          </h1>
          <p className="mt-1 text-sm" style={{ color: customDark ? "rgba(196,181,253,0.6)" : "#7c6fa0" }}>
            Загрузка данных...
          </p>
        </div>

        {/* Shimmer bar */}
        <div className="h-1 w-48 overflow-hidden rounded-full" style={{ background: customDark ? "rgba(167,139,250,0.15)" : "rgba(155,114,207,0.15)" }}>
          <div className="loader-shimmer-bar" />
        </div>
      </div>
    </div>

    {/* ---- MAIN APP ---- */}
    <div
      className={`min-h-screen flex flex-col bg-background text-foreground transition-opacity duration-500 ${isInitialLoading ? "opacity-0" : "opacity-100"}`}
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

      {/* ---- HEADER ---- */}
      <header className="sticky top-0 z-30 backdrop-blur-md supports-[backdrop-filter]:bg-[var(--tracker-bg-card)]/90 bg-[var(--tracker-bg-card)]" style={{ borderBottom: "1px solid var(--tracker-border)", boxShadow: "0 1px 0 0 var(--tracker-border)" }}>
        <div className="delta-header flex h-12 md:h-14 items-center justify-between px-3 md:px-4 gap-2 md:gap-3">
          <h1 className="text-base md:text-xl font-bold tracking-tight whitespace-nowrap flex items-center gap-1.5 md:gap-2">
            <svg width="18" height="16" viewBox="0 0 40 36" xmlns="http://www.w3.org/2000/svg"
              style={{ flexShrink: 0, color: "var(--tracker-accent)" }}>
              <polygon points="20,2 38,34 2,34" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/>
              <polygon points="20,12 31,32 9,32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" opacity="0.4"/>
            </svg>
            <span style={{ color: "var(--tracker-text-main)" }}>Delta</span>
          </h1>

          {/* Sync status */}
          <div className="flex items-center gap-1.5 ml-2" title={isOnline ? (lastSync ? `Синхронизировано: ${lastSync.toLocaleTimeString("ru-RU")}` : "Подключение...") : "Нет подключения"}>
            <div className={`size-2 rounded-full ${isOnline ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
            <span className="text-xs text-[var(--tracker-text-muted)] hidden md:inline">{isOnline ? "Онлайн" : "Оффлайн"}</span>
          </div>

          {/* Phase 7: Year selector в шапке (рядом с sync status) */}
          {(view === "table" || view === "dashboard" || view === "slides") && (
            <div className="header-year-selector hidden md:flex items-center gap-1 ml-2" title="Год">
              <button
                onClick={() => setCurrentYearStore(currentYear - 1)}
                className="size-7 rounded-md text-sm font-medium text-[var(--tracker-text-muted)] hover:bg-[var(--tracker-accent-bg)] hover:text-[var(--tracker-text-main)] transition-colors flex items-center justify-center"
                aria-label="Предыдущий год"
              >
                ‹
              </button>
              <Select value={String(currentYear)} onValueChange={(v) => setCurrentYearStore(Number(v))}>
                <SelectTrigger className="h-7 w-[78px] text-xs font-medium border-[var(--tracker-border)] bg-transparent text-[var(--tracker-text-main)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    const yrs = new Set<number>(getAvailableYears());
                    const now = new Date().getFullYear();
                    for (let dy = -2; dy <= 2; dy++) yrs.add(now + dy);
                    yrs.add(currentYear);
                    return Array.from(yrs).sort((a, b) => b - a).map((y) => (
                      <SelectItem key={y} value={String(y)} className="text-sm">
                        {y}{getAvailableYears().includes(y) ? "" : " ·"}
                      </SelectItem>
                    ));
                  })()}
                </SelectContent>
              </Select>
              <button
                onClick={() => setCurrentYearStore(currentYear + 1)}
                className="size-7 rounded-md text-sm font-medium text-[var(--tracker-text-muted)] hover:bg-[var(--tracker-accent-bg)] hover:text-[var(--tracker-text-main)] transition-colors flex items-center justify-center"
                aria-label="Следующий год"
              >
                ›
              </button>
            </div>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/*
           * Phase 7: новый порядок справа налево —
           *   Logout → Учётка → Settings → Admin → Save (Файл) → Дем. режим → Домены
           * (то есть на экране слева направо: Домены | Дем.режим | Файл | Admin | Settings | Учётка | Logout)
           *
           * Тёмная тема — отдельный иконочный тумблер слева от Settings.
           */}
          <div className="flex items-center gap-1.5">
            {/* Domain selector (only if > 1 visible domain) */}
            {visibleDomains.length > 1 && (
              <Select value={activeDomainId} onValueChange={storeSetActiveDomain}>
                <SelectTrigger className="h-8 w-auto max-w-[160px] text-xs border-[var(--tracker-border)] bg-transparent text-[var(--tracker-text-main)] hidden sm:flex">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {visibleDomains.map((d) => (
                    <SelectItem key={d.id} value={d.id} className="text-xs">
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Client mode toggle */}
            <Button
              variant={clientMode ? "default" : "outline"}
              size="sm"
              onClick={toggleClientMode}
              className={
                clientMode
                  ? "gap-1.5 bg-[var(--tracker-accent)] text-white hover:bg-[var(--tracker-accent-hover)] hover:text-white border-[var(--tracker-accent)]"
                  : "gap-1.5 border-[var(--tracker-border)] bg-transparent text-[var(--tracker-text-main)] hover:bg-[var(--tracker-accent-bg)] hover:text-[var(--tracker-accent-fg-dark)]"
              }
            >
              {clientMode ? (
                <>
                  <EyeOff className="size-3.5" />
                  <span className="hidden sm:inline">Выйти</span>
                </>
              ) : (
                <>
                  <Eye className="size-3.5" />
                  <span className="hidden sm:inline">Демонстрация</span>
                </>
              )}
            </Button>

            {/* Hidden file inputs */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleJSONFileSelect}
            />
            <input
              ref={xlsxInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleXLSXFileSelect}
            />

            {/* Undo / Redo */}
            <span className="header-undo-redo contents">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-[var(--tracker-text-muted)] hover:text-[var(--tracker-text-main)] hover:bg-[var(--tracker-accent-bg)]"
              title="Отменить (Ctrl+Z)"
              disabled={!undoStore.canUndo()}
              onClick={storeUndo}
            >
              <Undo2 className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-[var(--tracker-text-muted)] hover:text-[var(--tracker-text-main)] hover:bg-[var(--tracker-accent-bg)]"
              title="Повторить (Ctrl+Shift+Z)"
              disabled={!undoStore.canRedo()}
              onClick={storeRedo}
            >
              <Redo2 className="size-4" />
            </Button>
            </span>

            {/* Admin panel button */}
            {isAdmin && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-[var(--tracker-text-muted)] hover:text-[var(--tracker-text-main)] hover:bg-[var(--tracker-accent-bg)]"
                title="Админ-панель"
                onClick={() => window.location.href = "/admin"}
              >
                <Shield className="size-4" />
              </Button>
            )}

            {/* ── Панель сигналов руководителя ── */}
            <ExecSignalsPanel
              allTasks={allData}
              backlogTasks={backlog}
              monthCapacity={monthlyPlan > 0 ? monthlyPlan : 240}
              isAdmin={isAdmin}
              currentUsername={authData.user.displayName || authData.user.username}
              onUpdateTask={(month, taskId, updates) => {
                Object.entries(updates).forEach(([k, v]) => {
                  updateTask(month, taskId, k as keyof Task, v);
                });
              }}
              onCreateLinkedQuestion={addLinkedQuestion}
              onFilterSignals={(on) => setSignalsFilterActive(on)}
              filterActive={signalsFilterActive}
              onGoToQuestions={() => setView("questions")}
            />

            {/* Phase 7: тумблер тёмной темы — глобальный, доступен в шапке */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-[var(--tracker-text-muted)] hover:text-[var(--tracker-text-main)] hover:bg-[var(--tracker-accent-bg)]"
              title={customDark ? "Светлая тема" : "Тёмная тема"}
              onClick={() => storeSetCustomDark(!customDark)}
            >
              {customDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>

            {/* Settings button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-[var(--tracker-text-muted)] hover:text-[var(--tracker-text-main)] hover:bg-[var(--tracker-accent-bg)]"
              title="Настройки"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings className="size-4" />
            </Button>

            {/* User info + Logout */}
            <Separator
              orientation="vertical"
              className="header-separator mx-1 h-6 bg-[var(--tracker-border)] hidden sm:block"
            />
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[var(--tracker-accent-bg)]">
              <div className="w-5 h-5 rounded-full bg-[var(--tracker-accent)]/20 flex items-center justify-center shrink-0">
                <span className="text-[10px] font-bold text-[var(--tracker-accent-fg-dark)]">{(authData.user.displayName || authData.user.username).charAt(0).toUpperCase()}</span>
              </div>
              <span className="text-xs text-[var(--tracker-text-main)] max-w-[120px] truncate hidden sm:inline">{authData.user.displayName || authData.user.username}</span>
              {isAdmin && (
                <span className="text-[9px] px-1 py-0.5 rounded font-bold hidden sm:inline" style={{ background: "var(--tracker-accent-bg)", color: "var(--tracker-accent-fg-dark)", border: "1px solid var(--tracker-border)" }}>ADMIN</span>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-[var(--tracker-text-muted)] hover:text-[var(--tracker-text-main)] hover:bg-[var(--tracker-accent-bg)]"
              title="Выйти из аккаунта"
              onClick={onLogout}
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* ---- MAIN CONTENT ---- */}
      <main className="flex-1 w-full px-3 md:px-4 py-3 md:py-4 pb-20 md:pb-4 space-y-3 md:space-y-4">
        {/* ---- NAVIGATION TABS ---- */}
        <nav className="hidden md:flex gap-1 rounded-lg bg-muted/60 p-1">
          {(
            [
              { key: "table", emoji: "📋", label: "Задачи" },
              { key: "backlog", emoji: "📦", label: "Беклог" },
              ...(canSeeQuestions ? [{ key: "questions" as const, emoji: "❓", label: "Вопросы" }] : []),
              { key: "dashboard", emoji: "📊", label: "Дашборд" },
              { key: "design", emoji: "🎨", label: "Оформление" },
              { key: "chat", emoji: "💬", label: "Чат" },
              { key: "slides", emoji: "📑", label: "Презентация" },
            ] as const
          )
            .filter((tab) => !allowedTabs || allowedTabs.has(tab.key))
            .map((tab) => (
            <button
              key={tab.key}
              onClick={() => setView(tab.key)}
              className={`flex-1 rounded-md px-2 sm:px-3 py-2 text-sm font-medium transition-colors ${
                view === tab.key
                  ? "bg-[var(--tracker-accent)] text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-[var(--tracker-accent-soft)]"
              }`}
            >
              <span>{tab.emoji}</span>
              <span className="hidden sm:inline ml-1">{tab.label}</span>
            </button>
          ))}
        </nav>

        {/* ---- MONTH SELECTOR ---- */}
        {(view === "table" || view === "dashboard" || view === "slides") && (
          <div className="w-full mt-4 space-y-2">
            {/* Phase 7: переключатель года перенесён в шапку (см. <header>). */}
            <ScrollArea className="w-full" type="scroll">
              <div className="flex gap-1.5 pb-1 sm:justify-center">
                {MONTHS.map((m, i) => (
                  <button
                    key={m}
                    onClick={() => setCurrentMonth(i)}
                    className={`relative flex items-center justify-center gap-1.5 shrink-0 sm:flex-1 sm:min-w-0 rounded-lg px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium transition-colors ${
                      currentMonth === i
                        ? "bg-[var(--tracker-accent)] text-white shadow-sm"
                        : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {monthHasData(i) && (
                      <span
                        className={`size-1.5 rounded-full shrink-0 ${
                          currentMonth === i
                            ? "bg-white/70"
                            : "bg-[var(--tracker-accent)]"
                        }`}
                      />
                    )}
                    <span className="truncate hidden sm:inline">{m}</span>
                    <span className="sm:hidden text-[11px] font-semibold">{MONTHS_SHORT[i]}</span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* ---- VIEWS ---- */}
        {view === "table" && (
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
            onOpenBudgetSheet={(task, month) => setBudgetSheetTask({ task, month })}
          />
        )}

        {view === "backlog" && (
          <BacklogView
            backlog={backlog}
            currentMonth={currentMonth}
            updateBacklogTask={updateBacklogTask}
            deleteBacklogTask={deleteBacklogTask}
            reorderBacklog={reorderBacklog}
            setCommentArchiveDialog={setCommentArchiveDialog}
            isDark={customDark}
          />
        )}

        {view === "dashboard" && (
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
        )}

        {view === "questions" && (
          <QuestionsView
            questions={questions}
            newQuestionText={newQuestionText}
            setNewQuestionText={setNewQuestionText}
            addQuestion={addQuestion}
            removeQuestion={removeQuestion}
            answerQuestion={answerQuestion}
            deleteAnswer={deleteAnswer}
            currentUsername={authData.user.displayName || authData.user.username}
            currentMonth={currentMonth}
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
          />
        )}

        {view === "chat" && (
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
            isDark={customDark}
          />
        )}

        {view === "design" && (
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
        )}

        {view === "slides" && (
          <SlidesView
            slides={slides}
            currentSlide={currentSlide}
            setCurrentSlide={setCurrentSlide}
            accentHex={accentHex}
            presBg={presBg}
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
            onOpenGlobalDesign={() => setView("design")}
            currentMonth={currentMonth}
            currentYear={currentYear}
          />
        )}
      </main>

      {/* ---- MOBILE BOTTOM NAV ---- */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 mobile-bottom-nav">
        <div className="flex items-stretch">
          {(
            [
              { key: "table",     emoji: "📋", label: "Задачи" },
              { key: "backlog",   emoji: "📦", label: "Беклог" },
              ...(canSeeQuestions ? [{ key: "questions" as const, emoji: "❓", label: "Вопросы" }] : []),
              { key: "dashboard", emoji: "📊", label: "Дашборд" },
              { key: "chat",      emoji: "💬", label: "Чат" },
            ] as const
          )
            .filter((tab) => !allowedTabs || allowedTabs.has(tab.key))
            .map((tab) => (
            <button
              key={tab.key}
              onClick={() => setView(tab.key)}
              className={`mobile-bottom-nav-item ${view === tab.key ? "active" : ""}`}
            >
              <span className="mobile-bottom-nav-icon">{tab.emoji}</span>
              <span className="mobile-bottom-nav-label">{tab.label}</span>
            </button>
          ))}
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

      {/* ── Delta: BudgetSignalsSheet ── */}
      {budgetSheetTask && (
        <BudgetSignalsSheet
          open={!!budgetSheetTask}
          onOpenChange={(o) => { if (!o) setBudgetSheetTask(null); }}
          task={budgetSheetTask.task}
          usedHoursInMonth={calcMonthBudgetUsed(
            (allData[budgetSheetTask.month] || []).filter(t => !t._deleted)
          )}
          monthCapacity={monthlyPlan > 0 ? monthlyPlan : 240}
          onSave={(updates) => {
            Object.entries(updates).forEach(([k, v]) => {
              updateTask(budgetSheetTask.month, budgetSheetTask.task.id, k as keyof Task, v);
            });
            const freshTask = (allData[budgetSheetTask.month] || []).find(
              t => t.id === budgetSheetTask.task.id
            );
            if (freshTask) setBudgetSheetTask({ task: freshTask, month: budgetSheetTask.month });
          }}
        />
      )}


      {/* ---- SETTINGS ---- */}
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        themeId={themeId}
        customColor={customColor}
        customDark={customDark}
        onSetTheme={storeTheme}
        onSetCustomColor={storeSetCustomColor}
        domains={domains}
        activeDomainId={activeDomainId}
        onAddDomain={storeAddDomain}
        onRenameDomain={storeRenameDomain}
        onDeleteDomain={storeDeleteDomain}
        onSetActiveDomain={storeSetActiveDomain}
        toast={toast}
      />

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
    </div>{/* /MAIN APP */}
    </>
  );
}

/* ================================================================ */
/*  TABLE VIEW COMPONENT                                             */
/* ================================================================ */

