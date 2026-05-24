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
  const [newTaskDraft, setNewTaskDraft] = useState({ num: "", name: "", planH: "", priority: PRIORITIES.MEDIUM as Priority, status: STATUSES.NEW as Status });

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
  const [importConfirm, setImportConfirm] = useState<{
    open: boolean;
    type: "json";
    file: File | null;
  }>({ open: false, type: "json", file: null });

  // Excel import modal
  const [isImportOpen, setIsImportOpen] = useState(false);
  // Файл, переданный в модалку из drag&drop, чтобы она открылась
  // уже с подгруженным содержимым и сразу показала diff.
  const [pendingXlsxFile, setPendingXlsxFile] = useState<File | null>(null);

  const handleSyncApply = useCallback((payload: {
    updatedTasks: Task[];
    newTasks: Array<{
      num: string;
      name: string;
      planH: string;
      factH: string;
      priority: Priority;
      status: Status;
      comment: string;
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
  const [currentSlide, setCurrentSlide] = useState(0);
  /* Phase 4: aiConclusion теперь — серверный объект (с dataHash, source,
   * updatedAt). Загружается при смене (workspaceId, activeDomainId,
   * currentMonth, currentYear). aiDraft остаётся локальным. */
  const [aiConclusion, setAiConclusion] = useState<AiInsightShape | null>(null);
  const [aiDraft, setAiDraft] = useState<{
    achievements: string[];
    risks: string[];
    inProgress: string[];
    nextSteps: string[];
  } | null>(null);
  const [aiConclusionBusy, setAiConclusionBusy] = useState(false);
  /** Phase 7.3: ошибка последней AI-генерации (для красного баннера в Презентации). */
  const [aiAnalysisError, setAiAnalysisError] = useState<string | null>(null);
  /* Phase 4: текущий хеш задач месяца — для детекции stale-инсайтов. */
  const [currentDataHash, setCurrentDataHash] = useState<string>("");

  // Drag overlay
  const [dragOverlay, setDragOverlay] = useState(false);

  // Settings dialog
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("theme");
  const [customColorInput, setCustomColorInput] = useState(customColor || themeId || "#9B72CF");
  const [newDomainName, setNewDomainName] = useState("");

  useEffect(() => {
    setCustomColorInput(customColor || themeId || "#9B72CF");
  }, [customColor, themeId]);

  // Sync tracker color theme → presentation preset (emojis, pattern, animation)
  useEffect(() => {
    const hex = themeId;
    if (!hex || customColor) return; // custom colors have no preset
    const preset = THEME_TO_PRES[hex];
    if (!preset) return;
    storeSetPresBg({ emojis: preset.emojis, pattern: preset.pattern, emojiAnim: preset.emojiAnim, emojiCount: 20, emojiSpeed: 1, emojiOpacity: 25 });
  }, [themeId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [editingDomainId, setEditingDomainId] = useState<string | null>(null);
  const [editingDomainName, setEditingDomainName] = useState("");
  const [deleteDomainConfirm, setDeleteDomainConfirm] = useState<string | null>(null);
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
    setQuestions: (qs: Question[]) => setQuestions(qs),
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

  /* Phase 3: slides — производное от данных. Никаких setSlides, никакой
   * кнопки «Создать». Если данных нет — массив пустой, UI показывает
   * заглушку. Если есть — слайды всегда актуальны. */
  const slides = useMemo(() => {
    const monthRows = (allData[currentMonth] || []).filter((r) => r.name || r.num);
    if (monthRows.length === 0) return [];
    return generateSlides(currentMonth, currentYear, allData, accentHex, totalFactMap);
  }, [allData, currentMonth, currentYear, accentHex, totalFactMap]);

  /* Когда меняется набор слайдов (например, переключился месяц/год),
   * сбрасываем currentSlide на первый, чтобы не было «пустых» состояний. */
  useEffect(() => {
    if (currentSlide >= slides.length && slides.length > 0) {
      setCurrentSlide(0);
    }
  }, [slides.length, currentSlide]);

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

  /* Phase 4: stale-флаг — данные изменились с момента генерации инсайта */
  const aiInsightStale = useMemo(() => {
    if (!aiConclusion) return false;
    if (!aiConclusion.dataHash || !currentDataHash) return false;
    return aiConclusion.dataHash !== currentDataHash;
  }, [aiConclusion, currentDataHash]);

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


  /* ---- Export/Import Handlers ---- */
  const handleExportJSON = useCallback(() => {
    exportJSON(
      allData,
      backlog,
      themeId,
      customColor,
      domains,
      activeDomainId,
      activeDomain?.name
    );
    toast({ title: "💾 Экспорт", description: "JSON файл сохранён" });
  }, [allData, backlog, themeId, customColor, domains, activeDomainId, activeDomain, toast]);

  const handleExportMonthXLSX = useCallback(async () => {
    const monthRows = (allData[currentMonth] || []).filter((r) => r.name || r.num);
    if (monthRows.length === 0) {
      toast({ title: "Нет данных", description: "Текущий месяц не содержит задач", variant: "destructive" });
      return;
    }
    try {
      await exportMonthXLSX(monthRows, currentMonth, totalFactMap, accentHex);
      toast({ title: "💾 Сохранить", description: "Excel файл сохранён" });
    } catch (err) {
      console.error("Excel export error:", err);
      toast({ title: "Ошибка", description: String(err), variant: "destructive" });
    }
  }, [allData, currentMonth, totalFactMap, accentHex, toast]);

  const handleExportAllXLSX = useCallback(async () => {
    try {
      await exportAllXLSX(allData, totalFactMap, accentHex);
      toast({ title: "💾 Сохранить", description: "Excel файл (все месяцы) сохранён" });
    } catch (err) {
      console.error("Excel export error:", err);
      toast({ title: "Ошибка", description: String(err), variant: "destructive" });
    }
  }, [allData, totalFactMap, accentHex, toast]);

  const handleJSONFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setImportConfirm({ open: true, type: "json", file });
      e.target.value = "";
    },
    []
  );

  const handleXLSXFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      // Открываем ту же модалку сверки, что и drag&drop / кнопка меню —
      // унифицированный путь для XLSX, никаких слепых импортов.
      setPendingXlsxFile(file);
      setIsImportOpen(true);
      e.target.value = "";
    },
    []
  );

  const handleConfirmImport = useCallback(async () => {
    const { file } = importConfirm;
    if (!file) return;

    try {
      const result = await importJSON(file);
      storeSetAllData(result.allData);
      storeSetBacklog(result.backlog);
      storeSetDomains(result.domains);
      storeSetActiveDomainId(result.activeDomainId);
      storeSetThemeId(result.themeId);
      storeSetCustomColor(result.customColor || "", false);
      toast({ title: "📂 Импорт", description: "Данные успешно загружены из JSON" });
    } catch (err) {
      toast({
        title: "Ошибка импорта",
        description: err instanceof Error ? err.message : "Неизвестная ошибка",
        variant: "destructive",
      });
    }
    setImportConfirm({ open: false, type: "json", file: null });
  }, [importConfirm, storeSetAllData, storeSetBacklog, storeSetDomains, storeSetActiveDomainId, storeSetThemeId, storeSetCustomColor, toast]);

  /* ---- Drag & Drop (file import) ---- */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    // Only show overlay for external file drops, not internal row drags
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      e.stopPropagation();
      setDragOverlay(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverlay(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOverlay(false);

      const file = e.dataTransfer.files?.[0];
      if (!file) return;

      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext === "json") {
        setImportConfirm({ open: true, type: "json", file });
      } else if (ext === "xlsx" || ext === "xls") {
        // XLSX больше не идёт через быстрый импорт — открываем модалку сверки
        // с уже подгруженным файлом, чтобы юзер увидел отличия и подтвердил.
        setPendingXlsxFile(file);
        setIsImportOpen(true);
      } else {
        toast({ title: "Неподдерживаемый формат", description: "Поддерживаются только .json и .xlsx файлы", variant: "destructive" });
      }
    },
    [toast]
  );

  /* ---- Presentation ---- */
  /* Phase 3: handleCreatePresentation удалён — слайды теперь производное
   * от данных через useMemo. Кнопка «Создать» больше не нужна.
   * Открытие таба «Презентация»: setView("slides"). */
  const openPresentation = useCallback(() => {
    setView("slides");
  }, [setView]);

  /* Phase 6: снапшот текущих CSS-переменных темы трекера для прокидывания
   * в SSR-рендер (renderPresentationHtml) и в локальное превью.
   * Возвращает объект, совместимый с TrackerThemeTokens. */
  const readTrackerTokens = useCallback(() => {
    if (typeof window === "undefined") {
      return {
        bgMain: "#0d1117",
        bgCard: "#1a1f2a",
        textMain: "#e2e8f0",
        textMuted: "rgba(148,163,184,.7)",
        border: "rgba(255,255,255,.1)",
        isDark: true,
      };
    }
    const cs = getComputedStyle(document.documentElement);
    const v = (n: string, f: string) => (cs.getPropertyValue(n).trim() || f);
    const bgMain = v("--tracker-bg-main", "#0d1117");
    return {
      bgMain,
      bgCard: v("--tracker-bg-card", customDark ? "#1a1f2a" : "#ffffff"),
      textMain: v("--tracker-text-main", customDark ? "#e2e8f0" : "#1e293b"),
      textMuted: v("--tracker-text-muted", customDark ? "rgba(148,163,184,.7)" : "rgba(100,116,139,.75)"),
      border: v("--tracker-border", customDark ? "rgba(255,255,255,.1)" : "rgba(0,0,0,.08)"),
      isDark: customDark,
    };
  }, [customDark]);

  const handleExportSlidesHTML = useCallback(() => {
    if (slides.length === 0) return;
    const html = renderPresentationHtml(slides, presBg, aiConclusion, readTrackerTokens());
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `presentation_${currentYear}-${String(currentMonth + 1).padStart(2, "0")}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "📥 Скачать HTML", description: "Презентация сохранена как HTML" });
  }, [slides, currentMonth, currentYear, toast, presBg, aiConclusion, readTrackerTokens]);

  /* Phase 6: PDF-экспорт через нативный print диалог.
   * Открываем сгенерированный HTML в скрытом iframe → ждём загрузку →
   * вызываем print(). Юзер выбирает "Сохранить как PDF" в диалоге. */
  const handleExportPDF = useCallback(() => {
    if (slides.length === 0) return;
    const html = renderPresentationHtml(slides, presBg, aiConclusion, readTrackerTokens());
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.left = "-10000px";
    iframe.style.top = "0";
    iframe.style.width = "1280px";
    iframe.style.height = "720px";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    iframe.setAttribute("aria-hidden", "true");
    document.body.appendChild(iframe);

    const cleanup = () => {
      // Откладываем, иначе Chrome ругается «Document not ready»
      setTimeout(() => { try { document.body.removeChild(iframe); } catch { /* */ } }, 1000);
    };

    iframe.onload = () => {
      try {
        const win = iframe.contentWindow;
        if (!win) { cleanup(); return; }
        // Небольшая пауза чтобы все @font-face / images / SVG отрендерились
        setTimeout(() => {
          try {
            win.focus();
            win.print();
          } catch (e) {
            console.error("Print failed", e);
          }
          cleanup();
        }, 250);
      } catch (e) {
        console.error("Print iframe error", e);
        cleanup();
      }
    };

    iframe.srcdoc = html;
    toast({ title: "📄 PDF", description: "Откроется диалог печати — выберите «Сохранить как PDF»" });
  }, [slides, presBg, aiConclusion, readTrackerTokens, toast]);

  /* Phase 6: Fullscreen режим. Использует Fullscreen API на DOM-узле,
   * куда вставлено превью презентации. Узел получает ref через callback. */
  const fullscreenContainerRef = useRef<HTMLDivElement | null>(null);
  const handleEnterFullscreen = useCallback(() => {
    const el = fullscreenContainerRef.current;
    if (!el) return;
    const req = (el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }).requestFullscreen
      || (el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen;
    if (req) {
      try {
        req.call(el);
      } catch (e) {
        console.error("Fullscreen request failed", e);
      }
    }
  }, []);

  const handleAiAnalysis = useCallback(async () => {
    const apiKey = apiKeyRef.current;
    if (!apiKey) {
      setApiKeyDialogOpen(true);
      setAiAnalysisError("Сначала введите API ключ Gemini");
      return;
    }
    const rows = (allData[currentMonth] || []).filter(r => r.name || r.num);
    if (rows.length === 0) {
      setAiAnalysisError("В этом месяце нет задач для анализа");
      return;
    }
    setAiAnalysisError(null);
    setAiConclusionBusy(true);
    try {
      const summary = rows.map(r =>
        `#${r.num} "${r.name}" — статус: ${r.status}, план: ${r.planH||"—"}ч, факт: ${r.factH||"—"}ч`
      ).join("\n");
      const prompt = `Ты аналитик проекта. На основе списка задач за ${MONTHS[currentMonth]} ${currentYear} напиши краткие выводы на русском языке. Ответь строго в формате JSON без пояснений:
{"achievements":["...","..."],"risks":["...","..."],"inProgress":["...","..."],"nextSteps":["...","..."]}
Каждый массив — 2-3 пункта, лаконично, до 10 слов каждый.
Задачи:\n${summary}`;
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", parts: [{ text: prompt }] }],
          apiKey,
          model: chatModel,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const text = (data.text || "").replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(text);
      // Route to draft buffer — user must approve before injecting into slides
      setAiDraft(parsed);
      toast({ title: "✨ AI черновик готов", description: "Проверьте тезисы и нажмите «Применить в презентацию»" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Неизвестная ошибка";
      setAiAnalysisError(msg);
      toast({ title: "Ошибка AI анализа", description: msg, variant: "destructive" });
    } finally {
      setAiConclusionBusy(false);
    }
  }, [allData, currentMonth, currentYear, apiKeyRef, chatModel, setApiKeyDialogOpen, toast]);

  /* ---- Transfer ---- */
  /* Phase 4: при approval-е сохраняем на сервер (с dataHash и source).
   * source = "ai" если черновик от AI, "manual" если юзер заполнял руками,
   * "edited" если редактировал существующий aiConclusion. Точно отличить
   * сложно (черновик может быть результатом редактирования или генерации),
   * поэтому ставим "edited" если уже есть aiConclusion, иначе пусть будет
   * "ai" по умолчанию — в любом случае это just metadata. */
  const handleApproveDraft = useCallback(async () => {
    if (!aiDraft) return;
    const source: "ai" | "manual" | "edited" = aiConclusion ? "edited" : "ai";
    const newConclusion: AiInsightShape = {
      ...aiDraft,
      dataHash: currentDataHash,
      source,
      updatedAt: new Date().toISOString(),
    };
    setAiConclusion(newConclusion);
    setAiDraft(null);
    toast({ title: "✅ AI анализ применён", description: "Тезисы добавлены в слайд «Итоги»" });

    // Сохраняем на сервер (не блокируем UI — fire-and-forget с логированием).
    if (workspaceId) {
      saveInsight(workspaceId, activeDomainId, insightMonthKey, {
        achievements: aiDraft.achievements,
        risks: aiDraft.risks,
        inProgress: aiDraft.inProgress,
        nextSteps: aiDraft.nextSteps,
        dataHash: currentDataHash,
        source,
      }).catch((err) => {
        toast({
          title: "Не удалось сохранить инсайт",
          description: err instanceof Error ? err.message : "Сетевая ошибка",
          variant: "destructive",
        });
      });
    }
  }, [aiDraft, aiConclusion, currentDataHash, workspaceId, activeDomainId, insightMonthKey, toast]);

  const handleDiscardDraft = useCallback(() => {
    setAiDraft(null);
  }, []);

  const handleRemoveConclusion = useCallback(() => {
    setAiConclusion(null);
    if (workspaceId) {
      deleteInsight(workspaceId, activeDomainId, insightMonthKey).catch((err) => {
        toast({
          title: "Не удалось удалить инсайт",
          description: err instanceof Error ? err.message : "Сетевая ошибка",
          variant: "destructive",
        });
      });
    }
  }, [workspaceId, activeDomainId, insightMonthKey, toast]);

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
              onClick={() => { setSettingsOpen(true); setSettingsTab("theme"); setCustomColorInput(customColor || themeId || "#9B72CF"); }}
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
      <Dialog
        open={totalHDialog.open}
        onOpenChange={(open) =>
          setTotalHDialog({ taskNum: "", open })
        }
      >
        <DialogContent
          className="sm:max-w-lg"
          style={{
            background: "#ffffff",
            color: "#1a1a2e",
            border: "1px solid #e2e8f0",
          }}
        >
          {/* Header */}
          <DialogHeader className="gap-0.5">
            <span style={{ fontSize: "12px", color: "#94a3b8" }}>Задача #{totalHDialog.taskNum}</span>
            <DialogTitle className="text-base leading-tight" style={{ color: "#1a1a2e" }}>
              {monthBreakdown.taskName || "Задача"}
            </DialogTitle>
            <DialogDescription>Разбивка часов по месяцам для задачи</DialogDescription>
          </DialogHeader>

          {monthBreakdown.rows.length === 0 ? (
            <p style={{ fontSize: "14px", color: "#94a3b8", padding: "16px 0", textAlign: "center" }}>
              Нет данных по часам для этой задачи.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {/* Compact bar chart */}
              <div>
                <div style={{ display: "flex", alignItems: "flex-end", height: "100px", gap: "6px" }}>
                  {monthBreakdown.rows.map((r) => {
                    const maxVal = Math.max(...monthBreakdown.rows.map(x => Math.max(x.planH, x.cumulative)), 1);
                    const planPx = Math.max((r.planH / maxVal) * 100, 2);
                    const cumPx = Math.max((r.cumulative / maxVal) * 100, 2);
                    const exceeded = r.cumulative > r.planH && r.planH > 0;
                    return (
                      <div key={r.month} style={{ flex: "1", display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0, background: "#f1f5f9", borderRadius: "4px 4px 0 0", padding: "0 2px 4px 2px" }}>
                        <span style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px", lineHeight: "1", fontWeight: 600 }}>{MONTHS[r.month].substring(0, 3).toLowerCase()}</span>
                        <div style={{ width: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center", gap: "1px", height: "72px" }}>
                          <div
                            style={{ flex: "1", maxWidth: "none", borderRadius: "2px 2px 0 0", height: `${planPx}%`, background: "#94a3b8", minHeight: "2px" }}
                            title={`План: ${fmt2(r.planH)} ч`}
                          />
                          <div
                            style={{ flex: "1", maxWidth: "none", borderRadius: "2px 2px 0 0", height: `${cumPx}%`, background: exceeded ? "#ef4444" : "#22c55e", minHeight: "2px" }}
                            title={`Итого: ${fmt2(r.cumulative)} ч`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", fontSize: "10px", color: "#94a3b8", marginTop: "6px" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "2px", background: "#94a3b8" }} />План</span>
                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "2px", background: "#22c55e" }} />Итого</span>
                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "2px", background: "#ef4444" }} />Превышение</span>
                </div>
              </div>

              {/* Data table */}
              <div style={{ borderRadius: "8px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
                <table style={{ width: "100%", fontSize: "14px", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f1f5f9", fontSize: "10px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      <th style={{ textAlign: "left", padding: "6px 10px", fontWeight: 500 }}>Месяц</th>
                      <th style={{ textAlign: "right", padding: "6px 10px", fontWeight: 500 }}>План</th>
                      <th style={{ textAlign: "right", padding: "6px 10px", fontWeight: 500 }}>Факт</th>
                      <th style={{ textAlign: "right", padding: "6px 10px", fontWeight: 500 }}>Итого</th>
                      <th style={{ textAlign: "center", padding: "6px 10px", fontWeight: 500 }}>Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthBreakdown.rows.map((r) => {
                      const exceeded = r.cumulative > r.planH && r.planH > 0;
                      return (
                        <tr key={r.month} style={{ borderTop: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "6px 10px", fontWeight: 500, fontSize: "12px" }}>{MONTHS[r.month]}</td>
                          <td style={{ textAlign: "right", padding: "6px 10px", fontSize: "12px", color: "#94a3b8" }}>{fmt2(r.planH)} ч</td>
                          <td style={{ textAlign: "right", padding: "6px 10px", fontSize: "12px" }}>{fmt2(r.factH)} ч</td>
                          <td style={{ textAlign: "right", padding: "6px 10px", fontSize: "12px", fontWeight: 600, color: exceeded ? "#ef4444" : "#22c55e" }}>
                            {fmt2(r.cumulative)} ч
                          </td>
                          <td style={{ textAlign: "center", padding: "6px 10px" }}>
                            <span style={{ fontSize: "10px", fontWeight: 500, color: scolText(r.status as Status, customDark) }}>
                              {r.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {/* Summary row */}
                    {monthBreakdown.rows.length > 0 && (() => {
                      const maxPlan = Math.max(...monthBreakdown.rows.map(r => r.planH));
                      const sumFact = monthBreakdown.rows.reduce((s, r) => s + r.factH, 0);
                      const maxCum = Math.max(...monthBreakdown.rows.map(r => r.cumulative));
                      const months = monthBreakdown.rows.length;
                      const inPlan = maxCum <= maxPlan;
                      return (
                        <tr style={{ borderTop: "2px solid #e2e8f0", background: "#f8fafc", fontWeight: 700 }}>
                          <td style={{ padding: "6px 10px", fontSize: "12px" }}>Итого</td>
                          <td style={{ textAlign: "right", padding: "6px 10px", fontSize: "12px", color: "#94a3b8" }}>{fmt2(maxPlan)} ч</td>
                          <td style={{ textAlign: "right", padding: "6px 10px", fontSize: "12px" }}>{fmt2(sumFact)} ч</td>
                          <td style={{ textAlign: "right", padding: "6px 10px", fontSize: "12px", fontWeight: 700, color: inPlan ? "#22c55e" : "#ef4444" }}>{fmt2(maxCum)} ч</td>
                          <td style={{ textAlign: "center", padding: "6px 10px", fontSize: "10px", color: "#94a3b8" }}>{months} мес.</td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ---- COMMENT ARCHIVE DIALOG ---- */}
      <Dialog
        open={commentArchiveDialog.open}
        onOpenChange={(open) => setCommentArchiveDialog(prev => ({ ...prev, open }))}
      >
        <DialogContent
          className="sm:max-w-lg"
        >
          <DialogHeader className="gap-0.5">
            <DialogTitle className="text-base leading-tight">
              📜 Архив комментариев
            </DialogTitle>
            <span className="text-xs" style={{ color: "var(--tracker-text-muted)" }}>
              {commentArchiveDialog.taskName}
            </span>
            <DialogDescription>История комментариев и статусов задачи по неделям</DialogDescription>
          </DialogHeader>

          {commentArchiveDialog.logs.length === 0 ? (
            <p className="text-sm text-center py-4" style={{ color: "var(--tracker-text-muted)" }}>
              Архив комментариев пуст.
            </p>
          ) : (
            <div style={{ maxHeight: "400px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
              {commentArchiveDialog.logs.map((log, idx) => (
                <div
                  key={idx}
                  style={{
                    background: "var(--tracker-accent-bg)",
                    border: "1px solid var(--tracker-border)",
                    borderRadius: "8px",
                    padding: "10px 12px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ fontSize: "11px", color: "var(--tracker-text-muted)", fontWeight: 600 }}>
                      {log.date} · Неделя {log.week}
                    </span>
                    <span style={{ fontSize: "10px", fontWeight: 500, color: scolText(log.status as Status, customDark) }}>
                      {log.status}
                    </span>
                  </div>
                  <p style={{ fontSize: "13px", color: "var(--tracker-text-main)", lineHeight: "1.5", margin: "0 0 6px 0", whiteSpace: "pre-wrap" }}>
                    {log.text}
                  </p>
                  <div style={{ display: "flex", gap: "12px", fontSize: "11px", color: "var(--tracker-text-muted)" }}>
                    <span>План: {log.planH} ч</span>
                    <span>Факт: {log.factH} ч</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ---- TRANSFER DIALOG ---- */}
      <Dialog open={transferDialog} onOpenChange={setTransferDialog}>
        <DialogContent className="sm:max-w-sm" style={{ background: "var(--tracker-bg-card, var(--card))", border: "1px solid var(--tracker-border, var(--border))" }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <span className="w-8 h-8 rounded-xl flex items-center justify-center text-lg" style={{ background: "var(--tracker-accent-bg)", color: "var(--tracker-accent-fg-dark)" }}>↗️</span>
              Перенос задач
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              Незавершённые задачи будут скопированы в выбранный месяц с обнулением факта.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {/* Из → В */}
            <div className="flex items-center gap-2 rounded-xl px-4 py-3" style={{ background: "var(--tracker-accent-bg)", border: "1px solid var(--tracker-border)" }}>
              <div className="flex-1 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "var(--tracker-text-muted)" }}>Из</p>
                <p className="text-sm font-bold" style={{ color: "var(--tracker-accent-fg-dark)" }}>{MONTHS[currentMonth]}</p>
              </div>
              <span className="text-lg opacity-50">→</span>
              <div className="flex-1 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "var(--tracker-text-muted)" }}>В</p>
                <p className="text-sm font-bold" style={{ color: transferTarget >= 0 ? "var(--tracker-accent-fg-dark)" : "var(--tracker-text-muted)" }}>
                  {transferTarget >= 0 ? MONTHS[transferTarget] : "не выбран"}
                </p>
              </div>
            </div>
            <Select
              value={transferTarget >= 0 ? String(transferTarget) : undefined}
              onValueChange={(v) => setTransferTarget(Number(v))}
            >
              <SelectTrigger style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-bg, var(--background))" }}>
                <SelectValue placeholder="Выберите целевой месяц…" />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) =>
                  i !== currentMonth ? (
                    <SelectItem key={m} value={String(i)}>{m}</SelectItem>
                  ) : null
                )}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setTransferDialog(false)}>Отмена</Button>
            <Button
              size="sm"
              onClick={handleTransfer}
              disabled={transferTarget < 0}
              style={{ background: "var(--tracker-accent)", color: "#fff" }}
              className="gap-1.5"
            >
              <ArrowRight className="size-3.5" />
              Перенести
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>



      {/* ---- IMPORT CONFIRM DIALOG (только JSON; XLSX идёт через ExcelImportModal) ---- */}
      <Dialog
        open={importConfirm.open}
        onOpenChange={(open) => {
          if (!open) setImportConfirm({ open: false, type: "json", file: null });
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>📂 Загрузить JSON?</DialogTitle>
            <DialogDescription>
              Текущие данные будут заменены данными из файла. Продолжить?
            </DialogDescription>
          </DialogHeader>
          {importConfirm.file && (
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
              <span className="font-medium">Файл:</span>{" "}
              {importConfirm.file.name}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setImportConfirm({ open: false, type: "json", file: null })}
            >
              Отмена
            </Button>
            <Button onClick={handleConfirmImport}>
              <Upload className="size-4 mr-1.5" />
              Загрузить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- SETTINGS DIALOG ---- */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>⚙️ Настройки</DialogTitle>
            <DialogDescription>Настройка темы и доменов</DialogDescription>
          </DialogHeader>
          <Tabs value={settingsTab} onValueChange={setSettingsTab}>
            <TabsList className="w-full">
              <TabsTrigger value="theme" className="flex-1">🎨 Тема</TabsTrigger>
              <TabsTrigger value="domains" className="flex-1">📁 Домены</TabsTrigger>
            </TabsList>

            {/* Theme tab */}
            <TabsContent value="theme" className="space-y-4 pt-2">
              <div>
                <label className="text-sm font-medium mb-2 block">Цвет акцента</label>
                <div className="grid grid-cols-6 gap-2">
                  {[
                    { hex: "#5B9BD5", label: "Небо" },
                    { hex: "#4DB6AC", label: "Бирюза" },
                    { hex: "#4FC3F7", label: "Океан" },
                    { hex: "#66BB6A", label: "Трава" },
                    { hex: "#9CCC65", label: "Мята" },
                    { hex: "#D4A017", label: "Мёд" },
                    { hex: "#E8813A", label: "Закат" },
                    { hex: "#E86B6B", label: "Коралл" },
                    { hex: "#E07BAD", label: "Фуксия" },
                    { hex: "#9B72CF", label: "Сирень" },
                    { hex: "#7986CB", label: "Лаванда" },
                    { hex: "#C49A6C", label: "Песок" },
                  ].map((c) => (
                    <button
                      key={c.hex}
                      title={c.label}
                      onClick={() => storeTheme(c.hex)}
                      className={`relative h-9 w-9 rounded-lg border-2 transition-all hover:scale-110 ${
                        themeId === c.hex && !customColor
                          ? "border-foreground ring-2 ring-foreground/20"
                          : "border-transparent"
                      }`}
                      style={{ backgroundColor: c.hex }}
                    >
                      {themeId === c.hex && !customColor && (
                        <Check className="size-3.5 text-white absolute inset-0 m-auto drop-shadow-sm" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <Separator />

              <div>
                <label className="text-sm font-medium mb-2 block">Свой цвет</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={customColorInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomColorInput(val);
                      storeSetCustomColor(val, false);
                    }}
                    className="h-9 w-12 rounded-lg border cursor-pointer bg-transparent"
                  />
                  <Input
                    value={customColorInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomColorInput(val);
                      if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
                        storeSetCustomColor(val, false);
                      }
                    }}
                    className="h-9 w-28 font-mono text-sm"
                    placeholder="#RRGGBB"
                    maxLength={7}
                  />
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium">Тёмный режим</label>
                  <p className="text-xs text-muted-foreground mt-0.5">Переключить тему оформления</p>
                </div>
                <Switch
                  checked={customDark}
                  onCheckedChange={(checked) => {
                    storeSetCustomColor(customColor || themeId || "#5B9BD5", checked);
                  }}
                />
              </div>
            </TabsContent>

            {/* Domains tab */}
            <TabsContent value="domains" className="space-y-4 pt-2">
              {/* Add domain */}
              <div className="flex items-center gap-2">
                <Input
                  value={newDomainName}
                  onChange={(e) => setNewDomainName(e.target.value)}
                  placeholder="Название нового домена..."
                  className="h-9 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newDomainName.trim()) {
                      storeAddDomain(newDomainName.trim());
                      setNewDomainName("");
                      toast({ title: "📁 Домен", description: `Домен «${newDomainName.trim()}» создан` });
                    }
                  }}
                />
                <Button
                  size="sm"
                  className="h-9 shrink-0 bg-[var(--tracker-accent)] text-white hover:bg-[var(--tracker-accent-hover)]"
                  disabled={!newDomainName.trim()}
                  onClick={() => {
                    storeAddDomain(newDomainName.trim());
                    setNewDomainName("");
                    toast({ title: "📁 Домен", description: `Домен «${newDomainName.trim()}» создан` });
                  }}
                >
                  <Plus className="size-3.5 mr-1" />
                  Добавить
                </Button>
              </div>

              <Separator />

              {/* Domain list */}
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {domains.map((d) => (
                  <div
                    key={d.id}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 transition-colors ${
                      d.id === activeDomainId
                        ? "bg-[var(--tracker-accent-soft)] border border-[var(--tracker-accent)]"
                        : "bg-muted/40 border border-transparent hover:bg-muted/60"
                    }`}
                  >
                    {editingDomainId === d.id ? (
                      <Input
                        value={editingDomainName}
                        onChange={(e) => setEditingDomainName(e.target.value)}
                        className="h-7 text-sm flex-1"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && editingDomainName.trim()) {
                            storeRenameDomain(d.id, editingDomainName.trim());
                            setEditingDomainId(null);
                            toast({ title: "📁 Домен", description: "Домен переименован" });
                          }
                          if (e.key === "Escape") setEditingDomainId(null);
                        }}
                        onBlur={() => {
                          if (editingDomainName.trim()) {
                            storeRenameDomain(d.id, editingDomainName.trim());
                            toast({ title: "📁 Домен", description: "Домен переименован" });
                          }
                          setEditingDomainId(null);
                        }}
                      />
                    ) : (
                      <button
                        className="flex-1 text-left text-sm font-medium truncate"
                        onClick={() => {
                          if (d.id !== activeDomainId) {
                            storeSetActiveDomain(d.id);
                            toast({ title: "📁 Домен", description: `Переключено на «${d.name}»` });
                          }
                        }}
                        title={d.id === activeDomainId ? "Текущий домен" : `Переключиться на «${d.name}»`}
                      >
                        {d.name}
                        {d.id === activeDomainId && (
                          <Check className="size-3 inline ml-1.5 text-[var(--tracker-accent-fg)]" />
                        )}
                      </button>
                    )}
                    <div className="flex items-center gap-0.5 shrink-0">
                      {editingDomainId !== d.id && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Переименовать"
                            onClick={() => { setEditingDomainId(d.id); setEditingDomainName(d.name); }}
                          >
                            <span className="text-xs">✏️</span>
                          </Button>
                          {deleteDomainConfirm === d.id ? (
                            <>
                              <Button
                                variant="destructive"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => {
                                  storeDeleteDomain(d.id);
                                  setDeleteDomainConfirm(null);
                                  toast({ title: "📁 Домен", description: "Домен удалён" });
                                }}
                              >
                                Удалить
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => setDeleteDomainConfirm(null)}
                              >
                                Отмена
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="Удалить"
                              disabled={domains.length <= 1}
                              onClick={() => setDeleteDomainConfirm(d.id)}
                            >
                              <Trash2 className="size-3 text-muted-foreground" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {domains.length <= 1 && (
                <p className="text-xs text-muted-foreground">
                  Минимум один домен обязателен. Создайте новый, чтобы управлять несколькими.
                </p>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>

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

      {/* ── Диалог создания задачи ── */}
      <Dialog open={newTaskDialog.open} onOpenChange={o => { if (!o) { setNewTaskDialog({ open: false, month: 0 }); setNewTaskDraft({ num: "", name: "", planH: "", priority: PRIORITIES.MEDIUM, status: STATUSES.NEW }); } }}>
        <DialogContent className="sm:max-w-md" style={{ background: "var(--tracker-bg-card, var(--card))", border: "1px solid var(--tracker-border, var(--border))" }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <span className="w-7 h-7 rounded-lg flex items-center justify-center text-sm" style={{ background: "var(--tracker-accent-bg)", color: "var(--tracker-accent-fg-dark)" }}>＋</span>
              Новая задача
            </DialogTitle>
            <DialogDescription className="text-xs">{MONTHS[newTaskDialog.month]} {currentYear}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 pt-1">
            <div className="grid grid-cols-[80px_1fr] gap-2">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: "var(--tracker-text-muted)" }}>№</label>
                <Input value={newTaskDraft.num} onChange={e => setNewTaskDraft(d => ({ ...d, num: e.target.value }))} placeholder="—" className="h-9 text-sm" style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-bg, var(--background))" }} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: "var(--tracker-text-muted)" }}>Наименование *</label>
                <Input value={newTaskDraft.name} onChange={e => setNewTaskDraft(d => ({ ...d, name: e.target.value }))} placeholder="Название задачи" className="h-9 text-sm" style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-bg, var(--background))" }} autoFocus />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: "var(--tracker-text-muted)" }}>План, ч</label>
                <Input value={newTaskDraft.planH} onChange={e => setNewTaskDraft(d => ({ ...d, planH: e.target.value }))} placeholder="0" className="h-9 text-sm" style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-bg, var(--background))" }} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: "var(--tracker-text-muted)" }}>Приоритет</label>
                <Select value={newTaskDraft.priority} onValueChange={v => setNewTaskDraft(d => ({ ...d, priority: v as Priority }))}>
                  <SelectTrigger className="h-9 text-xs" style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-bg, var(--background))" }}><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.values(PRIORITIES).map(p => <SelectItem key={p} value={p} className="text-xs"><span style={{ color: PCOL[p] }}>{p}</span></SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: "var(--tracker-text-muted)" }}>Статус</label>
                <Select value={newTaskDraft.status} onValueChange={v => setNewTaskDraft(d => ({ ...d, status: v as Status }))}>
                  <SelectTrigger className="h-9 text-xs" style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-bg, var(--background))" }}><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.values(STATUSES).map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setNewTaskDialog({ open: false, month: 0 })}>Отмена</Button>
            <Button size="sm"
              className="gap-1.5"
              style={{ background: "var(--tracker-accent)", color: "#fff" }}
              disabled={!newTaskDraft.name.trim()}
              onClick={() => {
                const t: Task = {
                  id: crypto.randomUUID(),
                  num: newTaskDraft.num,
                  name: newTaskDraft.name,
                  planH: newTaskDraft.planH || "0",
                  factH: "0",
                  priority: newTaskDraft.priority,
                  status: newTaskDraft.status,
                  comment: "",
                  commentLog: [],
                  _ts: Date.now(),
                  statusChangedAt: new Date().toISOString(),
                  daysInStatus: 0,
                  approvalStatus: "approved",
                };
                useTaskStore.getState().addTasksToMonth(newTaskDialog.month, [t]);
                setNewTaskDialog({ open: false, month: 0 });
                setNewTaskDraft({ num: "", name: "", planH: "", priority: PRIORITIES.MEDIUM, status: STATUSES.NEW });
              }}
            >
              <Plus className="size-3.5" />
              Создать задачу
            </Button>
          </DialogFooter>
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
    </>
  );
}

/* ================================================================ */
/*  TABLE VIEW COMPONENT                                             */
/* ================================================================ */

