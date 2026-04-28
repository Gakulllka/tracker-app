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
  COLS,
  MONTHS,
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
  getTaskMetrics,
  getRowsMetrics,
  calcQueueMap,
  buildTotalFactMap,
  evalExpr,
  fmt2,
  progColor,
  createNewTask,
  sortVal,
} from "@/lib/metrics";
import {
  exportJSON,
  importJSON,
  exportMonthXLSX,
  exportAllXLSX,
  importMonthXLSX,
} from "@/lib/export";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { ExportMenu } from "@/components/export-menu";
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
} from "lucide-react";
import AuthScreen from "@/components/auth-screen";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface EditingCell {
  rowId: string;
  col: string;
}

interface Question {
  id: string;
  text: string;
  author: string;
  answer?: string;
  questionDate?: string;
  answerDate?: string;
}

interface SlideData {
  type: "title" | "kpi" | "statuses" | "completed" | "inprogress" | "table" | "summary";
  content: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/*  Planfix Integration                                                 */
/* ------------------------------------------------------------------ */

const PLANFIX_BASE_URL = "https://emk.planfix.ru/task/";

function TaskLink({ num }: { num: string }) {
  if (!num) return null;
  return (
    <a
      href={`${PLANFIX_BASE_URL}${num}`}
      target="_blank"
      rel="noreferrer"
      className="ml-1 inline-block text-xs opacity-60 transition-opacity hover:opacity-100"
      title={`Planfix: /task/${num}`}
    >
      🔗
    </a>
  );
}

/* ------------------------------------------------------------------ */
/*  Theme Utilities (ported from original 8-color theme system)          */
/* ------------------------------------------------------------------ */

function hexToRgb(hex: string): [number, number, number] {
  const cleaned = hex.replace("#", "");
  return [
    parseInt(cleaned.substring(0, 2), 16),
    parseInt(cleaned.substring(2, 4), 16),
    parseInt(cleaned.substring(4, 6), 16),
  ];
}

function hex2hsl(hex: string): [number, number, number] {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0, s = 0, l = (mx + mn) / 2;
  if (d > 0) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) * 60
      : mx === g ? ((b - r) / d + 2) * 60
      : ((r - g) / d + 4) * 60;
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}

function hsl2hex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
  const f = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${f(r)}${f(g)}${f(b)}`;
}

interface ThemeColors {
  accent: string;
  accentSoft: string;
  bgMain: string;
  bgCard: string;
  textMain: string;
  textMuted: string;
  border: string;
  danger: string;
}

function createTheme(baseHex: string, isDark = false): ThemeColors {
  const [h, s] = hex2hsl(baseHex);
  const sat = Math.min(s, 55);
  const acSat = isDark ? Math.min(s, 75) : Math.min(s, 72);
  const hx = (sm: number, l: number) => hsl2hex(h, sat * sm, l);
  return {
    accent: hsl2hex(h, acSat, isDark ? 70 : 54),
    accentSoft: hsl2hex(h, acSat, isDark ? 70 : 54) + "22",
    bgMain: hx(isDark ? 0.55 : 0.85, isDark ? 10 : 95),
    bgCard: hx(isDark ? 0.4 : 0.55, isDark ? 15 : 98),
    textMain: hx(isDark ? 0.2 : 0.4, isDark ? 90 : 14),
    textMuted: hx(isDark ? 0.25 : 0.35, isDark ? 44 : 48),
    border: hx(isDark ? 0.35 : 0.55, isDark ? 22 : 85),
    danger: hsl2hex(350, isDark ? 55 : 58, isDark ? 68 : 48),
  };
}

function applyTheme(th: ThemeColors) {
  const root = document.documentElement;
  const s = root.style;
  // Tracker-specific vars
  s.setProperty("--tracker-accent", th.accent);
  s.setProperty("--tracker-accent-soft", th.accentSoft);
  s.setProperty("--tracker-bg-main", th.bgMain);
  s.setProperty("--tracker-bg-card", th.bgCard);
  s.setProperty("--tracker-text-main", th.textMain);
  s.setProperty("--tracker-text-muted", th.textMuted);
  s.setProperty("--tracker-border", th.border);
  s.setProperty("--tracker-danger", th.danger);
  const [r, g, b] = hexToRgb(th.accent);
  s.setProperty("--tracker-accent-hover", `rgba(${r}, ${g}, ${b}, 0.22)`);
  s.setProperty("--tracker-accent-fg", th.accent);
  // Override shadcn CSS variables so all components follow the theme
  s.setProperty("--background", th.bgMain);
  s.setProperty("--foreground", th.textMain);
  s.setProperty("--card", th.bgCard);
  s.setProperty("--card-foreground", th.textMain);
  s.setProperty("--popover", th.bgCard);
  s.setProperty("--popover-foreground", th.textMain);
  s.setProperty("--primary", th.accent);
  s.setProperty("--primary-foreground", "#ffffff");
  s.setProperty("--secondary", th.bgMain);
  s.setProperty("--secondary-foreground", th.textMain);
  s.setProperty("--muted", th.bgMain);
  s.setProperty("--muted-foreground", th.textMuted);
  s.setProperty("--accent", th.accentSoft);
  s.setProperty("--accent-foreground", th.accent);
  s.setProperty("--destructive", th.danger);
  s.setProperty("--destructive-foreground", "#ffffff");
  s.setProperty("--border", th.border);
  s.setProperty("--input", th.border);
  s.setProperty("--ring", th.accent);
  document.body.style.background = th.bgMain;
  document.body.style.color = th.textMain;
  document.body.style.transition = "background 0.3s, color 0.3s";
}

const PALETTE_COLORS = [
  { hex: "#5B9BD5", label: "Небо", icon: "\uD83C\uDF24" },
  { hex: "#4DB6AC", label: "Бирюза", icon: "\uD83E\uDDCA" },
  { hex: "#4FC3F7", label: "Океан", icon: "\uD83C\uDF0A" },
  { hex: "#66BB6A", label: "Трава", icon: "\uD83C\uDF3F" },
  { hex: "#9CCC65", label: "Мята", icon: "\uD83C\uDF43" },
  { hex: "#D4A017", label: "Мёд", icon: "\uD83C\uDF1F" },
  { hex: "#E8813A", label: "Закат", icon: "\uD83C\uDF05" },
  { hex: "#E86B6B", label: "Коралл", icon: "\uD83D\uDC1A" },
  { hex: "#E07BAD", label: "Фуксия", icon: "\uD83C\uDF38" },
  { hex: "#9B72CF", label: "Сирень", icon: "\uD83D\uDC9C" },
  { hex: "#7986CB", label: "Лаванда", icon: "\uD83D\uDD2E" },
  { hex: "#C49A6C", label: "Песок", icon: "\uD83C\uDFD6" },
];

const NEUTRAL_COLORS = [
  { hex: "#6B7280", label: "Серый", icon: "\uD83E\uDD0D" },
  { hex: "#374151", label: "Тёмный серый", icon: "\u26AB" },
  { hex: "#9CA3AF", label: "Серебро", icon: "\u26AA" },
];

const EMOJI_CATS = [
  { name: "Бизнес", items: "📊 📈 📉 💼 🏆 🎯 💡 🚀 ⚡ 💎 🔑 📋 ✅ 📌 🔔" },
  { name: "Природа", items: "🌿 🍃 🍀 🌱 🌸 🌺 🌷 🦋 🌻 🌼 🍂 🍁 🌴 🌵 🪴" },
  { name: "Погода", items: "☀️ 🌤 ☁️ 🌧 ⛈ 🌈 ❄️ ⛄ 🌨 💧 🔥 🌊 💨 🌙 ⭐" },
  { name: "Еда", items: "🍯 🍉 🍇 🍓 🍒 🍵 🧊 🍕 🎂 🧁 🍩 🍫 🥤 🍷 🥂" },
  { name: "Животные", items: "🦊 🦎 🐠 🐚 🦩 🐝 🦄 🐪 🦋 🐬 🦜 🐾 🦁 🐧 🐌" },
  { name: "Праздник", items: "🎄 🎁 ⭐ 🔔 🎀 🎊 🎉 🎈 🪅 🧧 🎃 🕯 🧨 🎆 🎇" },
  { name: "Символы", items: "✨ 💜 💙 💚 💛 🧡 ❤️ 🤍 🖤 🔮 💠 🔷 🔶 ♦️ ☯️" },
];

const PATTERN_OPTIONS = [
  { key: "none", label: "Нет" },
  { key: "grid", label: "Сетка" },
  { key: "diagonal", label: "╱ Линии" },
  { key: "diamond", label: "◇ Ромбы" },
  { key: "waves", label: "〰 Волны" },
  { key: "zigzag", label: "⚡ Зигзаг" },
];

/* ------------------------------------------------------------------ */
/*  Slide Generation                                                   */
/* ------------------------------------------------------------------ */

function generateSlides(month: number, allData: Record<number, Task[]>, accentHex: string, totalFactMap: Record<string, number>): SlideData[] {
  const rows = (allData[month] || []).filter((r) => r.name || r.num);
  let total = rows.length;
  let completed = 0;
  let planH = 0;
  let factH = 0;
  const statusCounts: Record<string, number> = {};
  const completedTasks: Task[] = [];
  const inProgressTasks: Task[] = [];

  for (const r of rows) {
    if (r.status === STATUSES.DONE || r.status === STATUSES.COMPLETED) {
      completed++;
      completedTasks.push(r);
    } else if (
      r.status !== STATUSES.CANCEL &&
      r.status !== STATUSES.IDEA
    ) {
      inProgressTasks.push(r);
    }
    planH += evalExpr(r.planH);
    factH += evalExpr(r.factH);
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
  }

  const compPct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const slides: SlideData[] = [];

  // 1. Title slide
  slides.push({
    type: "title",
    content: {
      month: MONTHS[month],
      total,
      completed,
      pct: compPct,
      accent: accentHex,
    },
  });

  // 2. KPI slide
  slides.push({
    type: "kpi",
    content: {
      total,
      completed,
      planH: fmt2(planH),
      factH: fmt2(factH),
      accent: accentHex,
    },
  });

  // 3. Statuses slide
  slides.push({
    type: "statuses",
    content: { statusCounts, accent: accentHex },
  });

  // 4. Completed tasks
  if (completedTasks.length > 0) {
    slides.push({
      type: "completed",
      content: { tasks: completedTasks.slice(0, 8), total: completedTasks.length, accent: accentHex },
    });
  }

  // 5. In-progress tasks
  if (inProgressTasks.length > 0) {
    slides.push({
      type: "inprogress",
      content: { tasks: inProgressTasks.slice(0, 8), total: inProgressTasks.length, accent: accentHex },
    });
  }

  // 6. Table slide
  slides.push({
    type: "table",
    content: { rows: rows.slice(0, 15), total: rows.length, accent: accentHex, totalFactMap },
  });

  // 7. Summary slide
  const overTasks = rows.filter(r => evalExpr(r.factH) > evalExpr(r.planH) && evalExpr(r.planH) > 0).length;
  const factOverPlan = evalExpr(factH) > evalExpr(planH);
  slides.push({
    type: "summary",
    content: {
      month: MONTHS[month],
      accent: accentHex,
      total,
      completed,
      planH: fmt2(planH),
      factH: fmt2(factH),
      overTasks,
      inProgressCount: inProgressTasks.length,
      pct: compPct,
      factOverPlan,
    },
  });

  return slides;
}

/* ------------------------------------------------------------------ */
/*  Auth Context                                                       */
/* ------------------------------------------------------------------ */

interface UserPermissions {
  visibleTabs: string;
  visibleDomainIds: string;
  canEdit: boolean;
  canSeeQuestions: boolean;
}

interface AuthData {
  token: string;
  workspaceId: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    role: string;
  };
  permissions: UserPermissions | null;
}

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
  const [authData, setAuthData] = useState<AuthData | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        const token = localStorage.getItem("auth_token");
        if (!token) {
          setAuthChecking(false);
          return;
        }

        const res = await fetch(`/api/auth/me?token=${encodeURIComponent(token)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            // Save full auth data to localStorage
            localStorage.setItem("auth_user", JSON.stringify(data.user));
            localStorage.setItem("auth_permissions", JSON.stringify(data.permissions || null));
            setAuthData({
              token,
              workspaceId: data.workspaceId,
              user: data.user,
              permissions: data.permissions,
            });
          } else {
            // Session invalid, clear it
            localStorage.removeItem("auth_token");
            localStorage.removeItem("auth_user");
            localStorage.removeItem("auth_workspace");
            localStorage.removeItem("auth_permissions");
          }
        } else {
          localStorage.removeItem("auth_token");
          localStorage.removeItem("auth_user");
          localStorage.removeItem("auth_workspace");
          localStorage.removeItem("auth_permissions");
        }
      } catch {
        // Network error, allow offline with cached data
        const cachedToken = localStorage.getItem("auth_token");
        const cachedUser = localStorage.getItem("auth_user");
        const cachedWs = localStorage.getItem("auth_workspace");
        if (cachedToken && cachedUser && cachedWs) {
          const cachedPerms = localStorage.getItem("auth_permissions");
          setAuthData({
            token: cachedToken,
            workspaceId: cachedWs,
            user: JSON.parse(cachedUser),
            permissions: cachedPerms ? JSON.parse(cachedPerms) : null,
          });
        }
      } finally {
        setAuthChecking(false);
      }
    };
    checkSession();
  }, []);

  const handleAuth = useCallback((data: AuthData) => {
    setAuthData(data);
  }, []);

  const handleLogout = useCallback(async () => {
    if (authData) {
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: authData.token }),
        });
      } catch { /* silent */ }
    }
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    localStorage.removeItem("auth_workspace");
    localStorage.removeItem("auth_permissions");
    setAuthData(null);
  }, [authData]);

  // Show auth screen if not authenticated
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

  if (!authData) {
    return <AuthScreen onAuth={handleAuth} />;
  }

  return <TaskTrackerInner authData={authData} onLogout={handleLogout} />;
}

function mapQuestionFromAPI(q: { id: string; text: string; author: string; answer?: string; questionDate?: string; answerDate?: string }) {
  return {
    id: q.id,
    text: q.text,
    author: q.author || "Аноним",
    answer: q.answer || "",
    questionDate: q.questionDate,
    answerDate: q.answerDate,
  };
}

function TaskTrackerInner({ authData, onLogout }: { authData: AuthData; onLogout: () => void }) {
  /* ---- Auth-provided workspace ---- */
  const workspaceId = authData.workspaceId;
  const [isOnline, setIsOnline] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const isSyncingRef = useRef(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  /* ---- Store selectors ---- */
  const allData = useTaskStore((s) => s.allData);
  const backlog = useTaskStore((s) => s.backlog);
  const domains = useTaskStore((s) => s.domains);
  const activeDomainId = useTaskStore((s) => s.activeDomainId);
  const currentMonth = useTaskStore((s) => s.currentMonth);
  const view = useTaskStore((s) => s.view);
  const clientMode = useTaskStore((s) => s.clientMode);
  const themeId = useTaskStore((s) => s.themeId);
  const customColor = useTaskStore((s) => s.customColor);
  const customDark = useTaskStore((s) => s.customDark);
  const storeSetCustomColor = useTaskStore((s) => s.setCustomColor);
  const storeSetTheme = useTaskStore((s) => s.setTheme);
  const presBg = useTaskStore((s) => s.presBg);
  const storeSetPresBg = useTaskStore((s) => s.setPresBg);
  const monthBudget = useTaskStore((s) => s.monthBudget);
  const setMonthBudget = useTaskStore((s) => s.setMonthBudget);
  const filterStatuses = useTaskStore((s) => s.filterStatuses);
  const filterPriorities = useTaskStore((s) => s.filterPriorities);
  const sortKey = useTaskStore((s) => s.sortKey);
  const sortDir = useTaskStore((s) => s.sortDir);
  const searchQuery = useTaskStore((s) => s.searchQuery);

  const setCurrentMonth = useTaskStore((s) => s.setCurrentMonth);
  const setView = useTaskStore((s) => s.setView);
  const updateTask = useTaskStore((s) => s.updateTask);
  const addTask = useTaskStore((s) => s.addTask);
  const deleteTask = useTaskStore((s) => s.deleteTask);
  const reorderTask = useTaskStore((s) => s.reorderTask);
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
  const [questions, setQuestions] = useState<Question[]>([]);
  const [newQuestionText, setNewQuestionText] = useState("");
  const [newQuestionAuthor, setNewQuestionAuthor] = useState("");
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState("");
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

  // Import confirmation dialog
  const [importConfirm, setImportConfirm] = useState<{
    open: boolean;
    type: "json" | "xlsx";
    file: File | null;
  }>({ open: false, type: "json", file: null });

  // Excel import modal
  const [isImportOpen, setIsImportOpen] = useState(false);

  const handleSyncApply = useCallback(({ updatedTasks, newTasks }: { updatedTasks: Task[]; newTasks: any[] }) => {
    useTaskStore.getState().snapshot();

    // Update existing tasks field-by-field
    if (updatedTasks.length > 0) {
      const updatedIds = new Set(updatedTasks.map((t) => t.id));
      const currentRows = [...(allData[currentMonth] || [])];
      const newRows = currentRows.map((row) => {
        if (!updatedIds.has(row.id)) return row;
        const updated = updatedTasks.find((t) => t.id === row.id);
        return updated ? { ...row, ...updated } : row;
      });
      storeSetAllData({ ...allData, [currentMonth]: newRows });
    }

    // Add new tasks
    if (newTasks.length > 0) {
      const newTaskObjs: Task[] = newTasks.map((imp: any) => ({
        id: crypto.randomUUID(),
        num: imp.num || "",
        name: imp.name || "",
        planH: String(imp.planH || ""),
        factH: String(imp.factH || ""),
        priority: imp.priority || PRIORITIES.MEDIUM,
        status: imp.status || STATUSES.IDEA,
        comment: imp.comment || "",
        commentLog: [] as any[],
      }));
      const currentRows = updatedTasks.length > 0
        ? (allData[currentMonth] || []).map((row) => {
            const updated = updatedTasks.find((t) => t.id === row.id);
            return updated ? { ...row, ...updated } : row;
          })
        : (allData[currentMonth] || []);
      storeSetAllData({ ...allData, [currentMonth]: [...currentRows, ...newTaskObjs] });
    }

    setIsImportOpen(false);
    toast({
      title: "Синхронизация",
      description: `Обновлено ${updatedTasks.length} задач, добавлено ${newTasks.length} новых`,
    });
  }, [allData, currentMonth, storeSetAllData, toast]);

  // Slide data
  const [slides, setSlides] = useState<SlideData[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);

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
  const [editingDomainId, setEditingDomainId] = useState<string | null>(null);
  const [editingDomainName, setEditingDomainName] = useState("");
  const [deleteDomainConfirm, setDeleteDomainConfirm] = useState<string | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  // Chat state
  const apiKeyRef = useRef<string>("");
  const [chatModel, setChatModel] = useState("gemini-2.0-flash");
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

  /* ---- Server Sync ---- */
  // The server is the SINGLE source of truth.
  // Flow: mount → pull from server → update local state → enable push on changes.
  // Push sends clientUpdatedAt so the server can reject stale overwrites.
  // Questions are managed via /api/question & /api/answer only (not via /sync).
  const initialLoadDoneRef = useRef(false);
  const serverUpdatedAtRef = useRef<string>("");
  const suppressNextPushRef = useRef(false);
  const lastLocalChangeRef = useRef(0);

  const pushToServer = useCallback(async () => {
    if (isSyncingRef.current) return;
    if (!initialLoadDoneRef.current) return;
    if (suppressNextPushRef.current) {
      suppressNextPushRef.current = false;
      return;
    }
    isSyncingRef.current = true;
    try {
      const s = useTaskStore.getState();
      // Save current live data into domainData before pushing
      const domainData = {
        ...s.domainData,
        [s.activeDomainId]: { allData: s.allData, backlog: s.backlog },
      };
      const payload = {
        id: workspaceId,
        domainData,
        clientUpdatedAt: serverUpdatedAtRef.current || new Date().toISOString(),
      };
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const result = await res.json();
        if (result.updatedAt) {
          serverUpdatedAtRef.current = result.updatedAt;
        }
        setLastSync(new Date());
        setIsOnline(true);
      }
    } catch {
      setIsOnline(false);
    } finally {
      isSyncingRef.current = false;
    }
  }, [workspaceId]);

  const pullFromServer = useCallback(async () => {
    try {
      const res = await fetch(`/api/sync?id=${encodeURIComponent(workspaceId)}`);
      if (!res.ok) return;
      const data = await res.json();

      // Update server timestamp for future push comparisons
      if (data.updatedAt) {
        serverUpdatedAtRef.current = data.updatedAt;
      }

      const s = useTaskStore.getState();

      // Always accept server data — it's the source of truth.
      // Suppress the push that setDomainData will trigger.
      suppressNextPushRef.current = true;

      if (data.domainData && Object.keys(data.domainData).length > 0) {
        s.setDomainData(data.domainData);
      }
      setLastSync(new Date());
      setIsOnline(true);
    } catch {
      setIsOnline(false);
    }
  }, [workspaceId]);

  // Initial load from server — pull FIRST, then mark as ready
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const start = Date.now();
      await pullFromServer();
      // Load shared questions from dedicated API
      try {
        const res = await fetch("/api/question");
        if (res.ok) {
          const data = await res.json();
          if (data.questions && Array.isArray(data.questions)) {
            setQuestions(data.questions.map(mapQuestionFromAPI));
          }
        }
      } catch { /* silent */ }
      // Ensure the loading screen is visible for at least 800ms
      const elapsed = Date.now() - start;
      if (elapsed < 800) {
        await new Promise((r) => setTimeout(r, 800 - elapsed));
      }
      if (!cancelled) {
        initialLoadDoneRef.current = true;
        setIsInitialLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [pullFromServer]);

  // Poll questions every 5 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/question");
        if (res.ok) {
          const data = await res.json();
          if (data.questions && Array.isArray(data.questions)) {
            setQuestions(data.questions.map(mapQuestionFromAPI));
          }
        }
      } catch { /* silent */ }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Push to server: instant on every local data change
  useEffect(() => {
    if (!initialLoadDoneRef.current) return;
    if (suppressNextPushRef.current) {
      suppressNextPushRef.current = false;
      return;
    }
    // This is a local change — debounce push by 500ms
    lastLocalChangeRef.current = Date.now();
    const timer = setTimeout(() => {
      pushToServer();
    }, 500);
    return () => clearTimeout(timer);
  }, [allData, backlog, pushToServer]);

  // Pull from server: every 15 seconds, but only if user has been idle for 3+ seconds
  useEffect(() => {
    if (!initialLoadDoneRef.current) return;
    const interval = setInterval(() => {
      if (Date.now() - lastLocalChangeRef.current > 3000) {
        pullFromServer();
      }
    }, 15_000);
    return () => clearInterval(interval);
  }, [pullFromServer]);

  // Backup push every 5 minutes
  useEffect(() => {
    if (!initialLoadDoneRef.current) return;
    const interval = setInterval(() => {
      pushToServer();
    }, 300_000);
    return () => clearInterval(interval);
  }, [pushToServer]);

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

  /* ---- Permission helpers ---- */
  const isAdmin = authData.user.role === "admin";
  const perms = authData.permissions;
  const canEdit = isAdmin || !perms || perms.canEdit;

  const allowedTabs = useMemo(() => {
    if (isAdmin) return null; // Admin sees all
    if (!perms || !perms.visibleTabs) return null; // No restrictions
    const tabList = perms.visibleTabs.split(",").filter(Boolean);
    return new Set(tabList);
  }, [isAdmin, perms]);

  const allowedDomainIds = useMemo(() => {
    if (isAdmin) return null; // Admin sees all
    if (!perms || !perms.visibleDomainIds || perms.visibleDomainIds === "[]") return null;
    try {
      const list: string[] = JSON.parse(perms.visibleDomainIds);
      return list.length > 0 ? new Set(list) : null;
    } catch {
      return null;
    }
  }, [isAdmin, perms]);

  // Filter domains based on permissions
  const visibleDomains = useMemo(() => {
    if (!allowedDomainIds) return domains;
    return domains.filter((d) => allowedDomainIds.has(d.id));
  }, [domains, allowedDomainIds]);

  // If active domain is no longer visible, switch to first visible
  useEffect(() => {
    if (allowedDomainIds && activeDomainId && !allowedDomainIds.has(activeDomainId)) {
      const firstVisible = visibleDomains[0];
      if (firstVisible) {
        storeSetActiveDomain(firstVisible.id);
      }
    }
  }, [allowedDomainIds, activeDomainId, visibleDomains, storeSetActiveDomain]);

  // Check if questions tab should be hidden
  const canSeeQuestions = isAdmin || !perms || perms.canSeeQuestions;

  const totalFactMap = useMemo(
    () => buildTotalFactMap(allData, currentMonth),
    [allData, currentMonth]
  );

  const rows = useMemo(
    () => allData[currentMonth] || [],
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
  }, [visibleRows, filterStatuses, filterPriorities, searchQuery]);

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
    let total = 0;
    let completed = 0;
    let planH = 0;
    let factH = 0;
    const statusCounts: Record<string, number> = {};
    const allRows = allData[currentMonth] || [];
    for (const r of allRows) {
      total++;
      if (
        r.status === STATUSES.DONE ||
        r.status === STATUSES.COMPLETED
      ) {
        completed++;
      }
      planH += evalExpr(r.planH);
      factH += evalExpr(r.factH);
      statusCounts[r.status] =
        (statusCounts[r.status] || 0) + 1;
    }
    return {
      total,
      completed,
      planH,
      factH,
      statusCounts,
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

  const addQuestion = useCallback(async () => {
    if (!newQuestionText.trim()) return;

    // Push to server first
    try {
      const res = await fetch("/api/question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: newQuestionText.trim(), author: newQuestionAuthor.trim() || "Аноним" }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.question) {
          const q = data.question;
          setQuestions((prev) => [...prev, {
            id: q.id,
            text: q.text,
            author: q.author,
            questionDate: q.questionDate,
            answer: q.answer || "",
          }]);
        }
      }
    } catch { /* silent — fallback to local only */ }

    setNewQuestionText("");
    setNewQuestionAuthor("");
  }, [newQuestionText, newQuestionAuthor]);

  const removeQuestion = useCallback(async (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
    try {
      await fetch(`/api/question?id=${id}`, { method: "DELETE" });
    } catch { /* silent */ }
  }, []);

  const answerQuestion = useCallback(async (questionId: string, answer: string) => {
    setQuestions((prev) => prev.map((q) =>
      q.id === questionId ? { ...q, answer, answerDate: new Date().toISOString() } : q
    ));
    setAnsweringId(null);
    setAnswerText("");

    // Push to server
    try {
      await fetch("/api/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, answer }),
      });
    } catch { /* silent */ }
  }, []);

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

  const handleExportMonthXLSX = useCallback(() => {
    const monthRows = (allData[currentMonth] || []).filter((r) => r.name || r.num);
    if (monthRows.length === 0) {
      toast({ title: "Нет данных", description: "Текущий месяц не содержит задач", variant: "destructive" });
      return;
    }
    exportMonthXLSX(monthRows, currentMonth, totalFactMap, accentHex);
    toast({ title: "📊 Экспорт", description: "Excel файл сохранён" });
  }, [allData, currentMonth, totalFactMap, accentHex, toast]);

  const handleExportAllXLSX = useCallback(() => {
    exportAllXLSX(allData, totalFactMap, accentHex);
    toast({ title: "📊 Экспорт", description: "Excel файл (все месяцы) сохранён" });
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
      setImportConfirm({ open: true, type: "xlsx", file });
      e.target.value = "";
    },
    []
  );

  const handleConfirmImport = useCallback(async () => {
    const { type, file } = importConfirm;
    if (!file) return;

    try {
      if (type === "json") {
        const result = await importJSON(file);
        storeSetAllData(result.allData);
        storeSetBacklog(result.backlog);
        storeSetDomains(result.domains);
        storeSetActiveDomainId(result.activeDomainId);
        storeSetThemeId(result.themeId);
        storeSetCustomColor(result.customColor || "", false);
        toast({ title: "📂 Импорт", description: "Данные успешно загружены из JSON" });
      } else if (type === "xlsx") {
        const importedRows = await importMonthXLSX(file, currentMonth);
        if (importedRows.length === 0) {
          toast({ title: "Нет данных", description: "Файл не содержит задач", variant: "destructive" });
        } else {
          storeAddTasksToMonth(currentMonth, importedRows);
          toast({ title: "📂 Импорт", description: `Добавлено ${importedRows.length} задач из Excel` });
        }
      }
    } catch (err) {
      toast({
        title: "Ошибка импорта",
        description: err instanceof Error ? err.message : "Неизвестная ошибка",
        variant: "destructive",
      });
    }
    setImportConfirm({ open: false, type: "json", file: null });
  }, [importConfirm, currentMonth, storeSetAllData, storeSetBacklog, storeSetDomains, storeSetActiveDomainId, storeSetThemeId, storeSetCustomColor, storeAddTasksToMonth, toast]);

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
        setImportConfirm({ open: true, type: "xlsx", file });
      } else {
        toast({ title: "Неподдерживаемый формат", description: "Поддерживаются только .json и .xlsx файлы", variant: "destructive" });
      }
    },
    [toast]
  );

  /* ---- Presentation ---- */
  const handleCreatePresentation = useCallback(() => {
    const monthRows = (allData[currentMonth] || []).filter((r) => r.name || r.num);
    if (monthRows.length === 0) {
      toast({ title: "Нет данных", description: "Нет задач для создания презентации", variant: "destructive" });
      return;
    }
    const newSlides = generateSlides(currentMonth, allData, accentHex, totalFactMap);
    setSlides(newSlides);
    setCurrentSlide(0);
    setView("slides");
  }, [allData, currentMonth, accentHex, totalFactMap, setView, toast]);

  const handleExportSlidesHTML = useCallback(() => {
    if (slides.length === 0) return;
    const html = buildSlidesHTML(slides, presBg);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `presentation_${MONTHS[currentMonth]}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "📥 Скачать HTML", description: "Презентация сохранена как HTML" });
  }, [slides, currentMonth, toast, presBg]);

  /* ---- Transfer ---- */
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
        if (!clientMode) addTask(currentMonth);
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
  }, [storeUndo, storeRedo, clientMode, currentMonth, addTask, handleExportJSON, selectedRowId, editingCell, deleteTask]);

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */

  return (
    <>
    {/* ---- LOADING SCREEN ---- */}
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center transition-all duration-700 ${isInitialLoading ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      style={{ background: "linear-gradient(135deg, #f3f0ff 0%, #fce4f4 40%, #e8f4fd 100%)" }}
    >
      {/* Animated background circles */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="loader-circle loader-circle-1" />
        <div className="loader-circle loader-circle-2" />
        <div className="loader-circle loader-circle-3" />
      </div>

      {/* Content */}
      <div className={`relative z-10 flex flex-col items-center gap-6 transition-all duration-500 ${isInitialLoading ? "scale-100 translate-y-0" : "scale-95 -translate-y-4"}`}>
        {/* Logo */}
        <div className="relative">
          <div className="loader-logo-ring" />
          <div className={`loader-logo-box ${customDark ? "loader-logo-box--dark" : ""}`}>
            <span className="loader-logo-text">ЕМК</span>
          </div>
        </div>

        {/* Title */}
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--tracker-text-main, #1a1a1a)" }}>Трекер задач</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--tracker-text-muted, #888)" }}>Загрузка данных...</p>
        </div>

        {/* Shimmer bar */}
        <div className="h-1 w-48 overflow-hidden rounded-full" style={{ background: "var(--tracker-border, #ddd)" }}>
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
      <header className="sticky top-0 z-30 border-b border-[var(--tracker-accent)]/20 text-white backdrop-blur supports-[backdrop-filter]:opacity-95" style={{ background: "linear-gradient(135deg, var(--tracker-accent) 0%, color-mix(in srgb, var(--tracker-accent) 85%, #a78bfa) 100%)", boxShadow: "0 2px 16px color-mix(in srgb, var(--tracker-accent) 25%, transparent)" }}>
        <div className="flex h-14 items-center justify-between px-4 gap-3">
          <h1 className="text-xl font-bold tracking-tight whitespace-nowrap">
            <span className="text-white/80">✦</span>{" "}
            <span className="text-white">
              Трекер задач
            </span>
          </h1>

          {/* Sync status */}
          <div className="flex items-center gap-1.5 ml-2" title={isOnline ? (lastSync ? `Синхронизировано: ${lastSync.toLocaleTimeString("ru-RU")}` : "Подключение...") : "Нет подключения"}>
            <div className={`size-2 rounded-full ${isOnline ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
            <span className="text-xs text-white/70 hidden md:inline">{isOnline ? "Онлайн" : "Оффлайн"}</span>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* User info + Logout */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/10">
              <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <span className="text-[10px] font-bold text-white/90">{(authData.user.displayName || authData.user.username).charAt(0).toUpperCase()}</span>
              </div>
              <span className="text-xs text-white/80 max-w-[120px] truncate hidden sm:inline">{authData.user.displayName || authData.user.username}</span>
              {isAdmin && (
                <span className="text-[9px] px-1 py-0.5 rounded font-bold hidden sm:inline" style={{ background: "rgba(155,114,207,0.7)", color: "#fff" }}>ADMIN</span>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10"
              title="Выйти из аккаунта"
              onClick={onLogout}
            >
              <LogOut className="size-4" />
            </Button>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Save/Load dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white">
                  <Save className="size-3.5" />
                  <span className="hidden sm:inline">Файл</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Сохранить / Загрузить</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => {
                  navigator.clipboard.writeText(window.location.origin);
                  toast({ title: "Ссылка скопирована", description: "Отправьте ссылку для приглашения" });
                }} className="gap-2 cursor-pointer">
                  <Share2 className="size-4" />
                  <span>Скопировать ссылку</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleExportJSON} className="gap-2 cursor-pointer">
                  <Save className="size-4" />
                  <span>💾 Сохранить JSON</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportMonthXLSX} className="gap-2 cursor-pointer">
                  <FileSpreadsheet className="size-4" />
                  <span>📊 Экспорт Excel (месяц)</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportAllXLSX} className="gap-2 cursor-pointer">
                  <FileSpreadsheet className="size-4" />
                  <span>📊 Экспорт Excel (все)</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => fileInputRef.current?.click()} className="gap-2 cursor-pointer">
                  <FolderOpen className="size-4" />
                  <span>📂 Загрузить JSON</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => xlsxInputRef.current?.click()} className="gap-2 cursor-pointer">
                  <FolderOpen className="size-4" />
                  <span>📂 Загрузить Excel (месяц)</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

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
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10"
              title="Отменить (Ctrl+Z)"
              disabled={!undoStore.canUndo()}
              onClick={storeUndo}
            >
              <Undo2 className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10"
              title="Повторить (Ctrl+Shift+Z)"
              disabled={!undoStore.canRedo()}
              onClick={storeRedo}
            >
              <Redo2 className="size-4" />
            </Button>

            {/* Settings button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10"
              title="Настройки"
              onClick={() => { setSettingsOpen(true); setSettingsTab("theme"); setCustomColorInput(customColor || "#5B9BD5"); }}
            >
              <Settings className="size-4" />
            </Button>

            {/* Admin panel button */}
            {isAdmin && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10"
                title="Админ-панель"
                onClick={() => window.location.href = "/admin"}
              >
                <Shield className="size-4" />
              </Button>
            )}

            <Separator
              orientation="vertical"
              className="mx-1 h-6 bg-white/20 hidden sm:block"
            />

            {/* Domain selector (only if > 1 visible domain) */}
            {visibleDomains.length > 1 && (
              <Select value={activeDomainId} onValueChange={storeSetActiveDomain}>
                <SelectTrigger className="h-8 w-auto max-w-[160px] text-xs border-white/20 bg-white/10 text-white hidden sm:flex">
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
              className="gap-1.5 border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            >
              {clientMode ? (
                <>
                  <EyeOff className="size-3.5" />
                  <span className="hidden sm:inline">
                    Выйти
                  </span>
                </>
              ) : (
                <>
                  <Eye className="size-3.5" />
                  <span className="hidden sm:inline">
                    Демонстрация
                  </span>
                </>
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* ---- MAIN CONTENT ---- */}
      <main className="flex-1 w-full px-4 py-4 space-y-4">
        {/* ---- NAVIGATION TABS ---- */}
        <nav className="flex gap-1 rounded-lg bg-muted/60 p-1">
          {(
            [
              { key: "table", emoji: "📋", label: "Таблица" },
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
          <ScrollArea className="w-full mt-4" type="scrollbar">
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
                  <span className="sm:hidden text-xs font-semibold">{m.charAt(0)}</span>
                </button>
              ))}
            </div>
          </ScrollArea>
        )}

        {/* ---- VIEWS ---- */}
        {view === "table" && (
          <TableView
            rows={sortedRows}
            totalRows={visibleRows}
            qMap={qMap}
            totalFactMap={totalFactMap}
            rowsMetrics={rowsMetrics}
            month={currentMonth}
            clientMode={clientMode}
            editingCell={editingCell}
            editRef={editRef}
            isEditing={isEditing}
            startEditing={startEditing}
            stopEditing={stopEditing}
            updateTask={updateTask}
            deleteTask={deleteTask}
            reorderTask={reorderTask}
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
            addTask={addTask}
            onCreatePresentation={handleCreatePresentation}
            onOpenTransfer={() => { setTransferTarget(-1); setTransferDialog(true); }}
            setTotalHDialog={setTotalHDialog}
            setCommentArchiveDialog={setCommentArchiveDialog}
            selectedRowId={selectedRowId}
            setSelectedRowId={setSelectedRowId}
            isDark={customDark}
          />
        )}

        {view === "backlog" && (
          <BacklogView
            backlog={backlog}
            currentMonth={currentMonth}
            updateBacklogTask={updateBacklogTask}
            deleteBacklogTask={deleteBacklogTask}
            reorderBacklog={reorderBacklog}
            isDark={customDark}
          />
        )}

        {view === "dashboard" && (
          <DashboardView
            data={dashboardData}
            monthBudget={monthBudget[currentMonth]}
            onBudgetChange={(v) => setMonthBudget(currentMonth, v)}
          />
        )}

        {view === "questions" && (
          <QuestionsView
            questions={questions}
            newQuestionText={newQuestionText}
            newQuestionAuthor={newQuestionAuthor}
            setNewQuestionText={setNewQuestionText}
            setNewQuestionAuthor={setNewQuestionAuthor}
            addQuestion={addQuestion}
            removeQuestion={removeQuestion}
            answeringId={answeringId}
            answerText={answerText}
            setAnsweringId={setAnsweringId}
            setAnswerText={setAnswerText}
            answerQuestion={answerQuestion}
          />
        )}

        {view === "chat" && (
          <ChatView
            apiKeyRef={apiKeyRef}
            apiKeyDialogOpen={apiKeyDialogOpen}
            setApiKeyDialogOpen={setApiKeyDialogOpen}
            chatModel={chatModel}
            setChatModel={setChatModel}
            rows={rows}
            month={currentMonth}
            allData={allData}
            backlog={backlog}
            totalFactMap={totalFactMap}
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
            onExportHTML={handleExportSlidesHTML}
            onCreateNew={handleCreatePresentation}
            hasData={(allData[currentMonth] || []).some((r) => r.name || r.num)}
          />
        )}
      </main>

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
          style={{
            background: "#ffffff",
            color: "#1a1a2e",
            border: "1px solid #e2e8f0",
          }}
        >
          <DialogHeader className="gap-0.5">
            <DialogTitle className="text-base leading-tight" style={{ color: "#1a1a2e" }}>
              📜 Архив комментариев
            </DialogTitle>
            <span style={{ fontSize: "12px", color: "#94a3b8" }}>
              {commentArchiveDialog.taskName}
            </span>
          </DialogHeader>

          {commentArchiveDialog.logs.length === 0 ? (
            <p style={{ fontSize: "14px", color: "#94a3b8", padding: "16px 0", textAlign: "center" }}>
              Архив комментариев пуст.
            </p>
          ) : (
            <div style={{ maxHeight: "400px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
              {commentArchiveDialog.logs.map((log, idx) => (
                <div
                  key={idx}
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    padding: "10px 12px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>
                      {log.date} · Неделя {log.week}
                    </span>
                    <span style={{ fontSize: "10px", fontWeight: 500, color: scolText(log.status as Status, customDark) }}>
                      {log.status}
                    </span>
                  </div>
                  <p style={{ fontSize: "13px", color: "#1a1a2e", lineHeight: "1.5", margin: "0 0 6px 0", whiteSpace: "pre-wrap" }}>
                    {log.text}
                  </p>
                  <div style={{ display: "flex", gap: "12px", fontSize: "11px", color: "#94a3b8" }}>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>↗️ Перенос задач</DialogTitle>
            <DialogDescription>
              Незавершённые задачи (без статусов «Завершенная», «Выполненная», «Отменено») будут скопированы в выбранный месяц с обнулением фактических часов.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Целевой месяц</label>
              <Select
                value={transferTarget >= 0 ? String(transferTarget) : undefined}
                onValueChange={(v) => setTransferTarget(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите месяц..." />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) =>
                    i !== currentMonth ? (
                      <SelectItem key={m} value={String(i)}>
                        {m}
                      </SelectItem>
                    ) : null
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferDialog(false)}>
              Отмена
            </Button>
            <Button
              onClick={handleTransfer}
              disabled={transferTarget < 0}
              className="bg-[var(--tracker-accent)] text-white hover:bg-[var(--tracker-accent-hover)]"
            >
              <ArrowRight className="size-4 mr-1.5" />
              Перенести
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>



      {/* ---- IMPORT CONFIRM DIALOG ---- */}
      <Dialog
        open={importConfirm.open}
        onOpenChange={(open) => {
          if (!open) setImportConfirm({ open: false, type: "json", file: null });
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {importConfirm.type === "json" ? "📂 Загрузить JSON?" : "📂 Загрузить Excel?"}
            </DialogTitle>
            <DialogDescription>
              {importConfirm.type === "json"
                ? "Текущие данные будут заменены данными из файла. Продолжить?"
                : `Задачи из файла будут добавлены в ${MONTHS[currentMonth]}. Продолжить?`}
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
      <ExcelImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        currentMonthTasks={allData[currentMonth] || []}
        currentMonth={currentMonth}
        onApplyChanges={handleSyncApply}
      />
    </>
  );
}

/* ================================================================ */
/*  TABLE VIEW COMPONENT                                             */
/* ================================================================ */

interface TableViewProps {
  rows: Task[];
  totalRows: Task[];
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
  isEditing: (rowId: string, col: string) => boolean;
  startEditing: (rowId: string, col: string) => void;
  stopEditing: () => void;
  updateTask: (
    month: number,
    taskId: string,
    key: keyof Task,
    value: unknown
  ) => void;
  deleteTask: (month: number, taskId: string) => void;
  reorderTask: (month: number, fromId: string, toId: string) => void;
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
  addTask: (month: number) => void;
  onCreatePresentation: () => void;
  onOpenTransfer: () => void;
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
  onExportCSV?: () => void;
}

function TableView({
  isDark,
  rows,
  totalRows,
  qMap,
  totalFactMap,
  rowsMetrics,
  month,
  clientMode,
  editingCell,
  editRef,
  isEditing,
  startEditing,
  stopEditing,
  updateTask,
  deleteTask,
  reorderTask,
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
  addTask,
  onCreatePresentation,
  onOpenTransfer,
  setTotalHDialog,
  setCommentArchiveDialog,
  selectedRowId,
  setSelectedRowId,
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
      {!clientMode && (
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Поиск задач..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8"
            />
          </div>

          {/* Status filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-8"
              >
                <Filter className="size-3.5" />
                Статус
                {filterStatuses.size > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                    {filterStatuses.size}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
              <DropdownMenuLabel>Фильтр по статусу</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {Object.values(STATUSES).map((s) => (
                <DropdownMenuCheckboxItem
                  key={s}
                  checked={filterStatuses.has(s)}
                  onCheckedChange={() => toggleStatusFilter(s)}
                  className="text-xs"
                >
                  <span style={{ color: scolText(s, isDark) || "#888" }}>
                    {s}
                  </span>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Priority filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-8"
              >
                <Filter className="size-3.5" />
                Приоритет
                {filterPriorities.size > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                    {filterPriorities.size}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>
                Фильтр по приоритету
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {Object.values(PRIORITIES).map((p) => (
                <DropdownMenuCheckboxItem
                  key={p}
                  checked={filterPriorities.has(p)}
                  onCheckedChange={() =>
                    togglePriorityFilter(p)
                  }
                  className="text-xs"
                >
                  <span style={{ color: PCOL[p] }}>
                    {p}
                  </span>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Clear filters */}
          {(filterStatuses.size > 0 ||
            filterPriorities.size > 0 ||
            searchQuery) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-muted-foreground"
              onClick={clearFilters}
            >
              <X className="size-3.5" />
              Сбросить
            </Button>
          )}

          <div className="flex-1" />

          {/* Action buttons */}
          <Button
            size="sm"
            className="h-8 gap-1.5 bg-[var(--tracker-accent)] text-white hover:bg-[var(--tracker-accent-hover)]"
            onClick={() => addTask(month)}
          >
            <Plus className="size-3.5" />
            Добавить строку
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 border-[var(--tracker-accent)]/30 text-[var(--tracker-accent-fg)] hover:bg-[var(--tracker-accent-soft)]"
            onClick={onOpenTransfer}
          >
            <ArrowRight className="size-3.5" />
            Перенести
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 border-[var(--tracker-accent)]/30 bg-[var(--tracker-accent)]/6 text-[var(--tracker-accent-fg)] hover:bg-[var(--tracker-accent)]/14 hover:border-[var(--tracker-accent)]/50"
            onClick={onCreatePresentation}
          >
            <Presentation className="size-3.5" />
            Презентация
          </Button>
          <ExportMenu
            tasks={rows.map(t => ({
              id: t.id,
              title: t.name,
              status: t.status,
              priority: t.priority,
              planHours: evalExpr(t.planH || "0"),
              factHours: evalExpr(t.factH || "0"),
            }))}
            selectedIds={selectedRowId ? [selectedRowId] : []}
            columns={[
              { key: 'title', label: 'Задача' },
              { key: 'status', label: 'Статус' },
              { key: 'priority', label: 'Приоритет' },
              { key: 'planHours', label: 'План (ч)' },
              { key: 'factHours', label: 'Факт (ч)' },
            ]}
          />
        </div>
      )}

      {/* ---- TABLE ---- */}
      <Card className="max-h-[70vh] overflow-auto py-0">
        <Table className="border-collapse sticky-table-header">
          <TableHeader className="bg-[var(--tracker-accent)]">
            <TableRow className="[&_th]:text-white">
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
                  className="cursor-pointer select-none hover:bg-white/15"
                  style={{ minWidth: col.minW }}
                  onClick={() =>
                    col.sortable && handleSort(col.key)
                  }
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable && sortKey === col.key && (
                      sortDir === 1 ? (
                        <ChevronUp className="size-3.5 text-white/80" />
                      ) : (
                        <ChevronDown className="size-3.5 text-white/80" />
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
                  className={`cursor-pointer ${selectedRowId === task.id ? "bg-[var(--tracker-accent-soft)]" : idx % 2 === 0 ? "" : "bg-[var(--tracker-accent)]/[0.02]"} ${dragRowId === task.id ? "opacity-40" : ""} ${dropTargetId === task.id && dragRowId !== task.id ? "border-t-2 border-b-2 border-[var(--tracker-accent)] bg-[var(--tracker-accent)]/[0.06]" : ""}`}
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
                        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
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
                        ref={editRef}
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
                        onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
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
                        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
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
                        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
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
                          className={`h-full rounded-full transition-all duration-300 ${
                            metrics.prog > 0 && metrics.prog < 100 ? "progress-bar-animated" : ""
                          } ${metrics.over ? "progress-over-pulse bg-red-600" : ""}`}
                          style={{
                            width: `${Math.min(metrics.prog, 100)}%`,
                            backgroundColor: metrics.over ? undefined : progColor(metrics.prog),
                          }}
                        />
                      </div>
                      <span
                        className="w-8 text-right text-xs font-medium tabular-nums"
                        style={{
                          color: progColor(metrics.prog),
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
                      <div className="flex items-start gap-1">
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
                          onBlur={stopEditing}
                          onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
                            if (e.key === "Escape")
                              stopEditing();
                          }}
                        />
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
                        {task.comment && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0 opacity-60 hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              useTaskStore.getState().archiveComment(month, task.id);
                            }}
                            title="Заархивировать комментарий"
                          >
                            <span className="text-xs">🗃️</span>
                          </Button>
                        )}
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
                        ? () => addTask(month)
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
              <TableRow className="font-semibold bg-[var(--tracker-accent)]/10">
                {!clientMode && <TableCell className="border-t border-[var(--tracker-accent)]/20" />}
                <TableCell className="border-t border-[var(--tracker-accent)]/20" />
                <TableCell className="border-t border-[var(--tracker-accent)]/20" />
                <TableCell className="text-[var(--tracker-accent-fg)] border-t border-[var(--tracker-accent)]/20 font-bold">
                  ИТОГО
                </TableCell>
                <TableCell className="text-right border-t border-[var(--tracker-accent)]/20">
                  {fmt2(rowsMetrics.totPlan)} ч
                </TableCell>
                <TableCell className={`text-right border-t border-[var(--tracker-accent)]/20 ${rowsMetrics.totFact > rowsMetrics.totPlan ? "text-[var(--tracker-danger)]" : rowsMetrics.totFact === rowsMetrics.totPlan && rowsMetrics.totFact > 0 ? "text-green-600 dark:text-green-400" : ""}`}>
                  {fmt2(rowsMetrics.totFact)} ч
                </TableCell>
                <TableCell className="text-right font-bold text-[var(--tracker-accent-fg)] border-t border-[var(--tracker-accent)]/20">
                  {fmt2(rowsMetrics.totTotalH)} ч
                </TableCell>
                <TableCell className="border-t border-[var(--tracker-accent)]/20" />
                <TableCell className="border-t border-[var(--tracker-accent)]/20" />
                <TableCell className="border-t border-[var(--tracker-accent)]/20" />
                <TableCell className="border-t border-[var(--tracker-accent)]/20">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-16 rounded-full bg-[var(--tracker-accent)]/10 overflow-hidden">
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
                    <span className="text-xs text-[var(--tracker-accent-fg)] font-semibold">
                      {rowsMetrics.avgProg}%
                    </span>
                  </div>
                </TableCell>
                <TableCell className="border-t border-[var(--tracker-accent)]/20" />
                {!clientMode && <TableCell className="border-t border-[var(--tracker-accent)]/20" />}
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </Card>
    </div>
  );
}

/* ================================================================ */
/*  BACKLOG VIEW                                                     */
/* ================================================================ */

interface BacklogViewProps {
  backlog: Task[];
  currentMonth: number;
  updateBacklogTask: (
    taskId: string,
    key: keyof Task,
    value: unknown
  ) => void;
  deleteBacklogTask: (taskId: string) => void;
  reorderBacklog: (fromId: string, toId: string) => void;
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

function BacklogView({
  backlog,
  currentMonth,
  updateBacklogTask,
  deleteBacklogTask,
  reorderBacklog,
  isDark,
}: BacklogViewProps) {
  const [dragRowId, setDragRowId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, rowId: string) => {
    e.stopPropagation();
    e.dataTransfer.setData("application/backlog-row", rowId);
    e.dataTransfer.effectAllowed = "move";
    setDragRowId(rowId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, rowId: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDropTargetId(rowId);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const fromId = e.dataTransfer.getData("application/backlog-row");
    if (fromId && fromId !== targetId && reorderBacklog) {
      reorderBacklog(fromId, targetId);
    }
    setDragRowId(null);
    setDropTargetId(null);
  }, [reorderBacklog]);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    e.stopPropagation();
    setDragRowId(null);
    setDropTargetId(null);
  }, []);
  const [dialog, setDialog] = useState<BacklogDialogState>({
    open: false,
    taskId: "",
    num: "",
    name: "",
    planH: "0",
    factH: "0",
    month: currentMonth,
    priority: PRIORITIES.QUEUE,
    status: STATUSES.IDEA,
  });

  const handleAddToBacklog = useCallback(() => {
    const newTask = createNewTask();
    const current = useTaskStore.getState().backlog;
    useTaskStore.setState({
      backlog: [...current, newTask],
    });
  }, []);

  const openReturnDialog = useCallback((task: Task) => {
    const resolvedPlan = fmt2(evalExpr(task.planH || "0"));
    const resolvedFact = fmt2(evalExpr(task.factH || "0"));
    console.log("[backlog dialog] raw planH:", task.planH, "=> resolved:", resolvedPlan);
    console.log("[backlog dialog] raw factH:", task.factH, "=> resolved:", resolvedFact);
    setDialog({
      open: true,
      taskId: task.id,
      num: task.num,
      name: task.name,
      planH: resolvedPlan,
      factH: resolvedFact,
      month: currentMonth,
      priority: task.priority,
      status: task.status,
    });
  }, [currentMonth]);

  const closeDialog = useCallback(() => {
    setDialog(prev => ({ ...prev, open: false }));
  }, []);

  const handleReturnToTable = useCallback(() => {
    useTaskStore.getState().returnFromBacklogWithEdits(
      dialog.taskId,
      dialog.month,
      {
        num: dialog.num,
        name: dialog.name,
        planH: dialog.planH,
        factH: dialog.factH,
        priority: dialog.priority,
        status: dialog.status,
      },
    );
    closeDialog();
  }, [dialog, closeDialog]);

  const statusValues = Object.values(STATUSES);
  const priorityValues = Object.values(PRIORITIES);

  return (
    <div className="space-y-3">
      <Card className="max-h-[70vh] overflow-auto py-0">
        <Table className="border-collapse sticky-table-header">
          <TableHeader className="bg-[var(--tracker-accent)]">
            <TableRow className="[&_th]:text-white">
              <TableHead className="w-10">#</TableHead>
              <TableHead className="min-w-[200px]">
                Наименование
              </TableHead>
              <TableHead className="min-w-[100px]">
                Приоритет
              </TableHead>
              <TableHead className="min-w-[160px]">
                Статус
              </TableHead>
              <TableHead className="min-w-[200px]">
                Комментарий
              </TableHead>
              <TableHead className="w-24 text-center">
                Действия
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {backlog.map((task, idx) => (
              <TableRow 
                key={task.id}
                draggable
                onDragStart={(e) => handleDragStart(e, task.id)}
                onDragOver={(e) => handleDragOver(e, task.id)}
                onDrop={(e) => handleDrop(e, task.id)}
                onDragEnd={handleDragEnd}
                className={`cursor-move ${dragRowId === task.id ? "opacity-40" : ""} ${dropTargetId === task.id && dragRowId !== task.id ? "border-t-2 border-b-2 border-[var(--tracker-accent)] bg-[var(--tracker-accent)]/[0.06]" : ""}`}
              >
                <TableCell className="text-center text-muted-foreground text-xs">
                  {idx + 1}
                </TableCell>
                <TableCell>
                  <span className="text-sm block overflow-hidden text-ellipsis whitespace-nowrap">
                    {task.name || (
                      <span className="italic text-muted-foreground">
                        без названия
                      </span>
                    )}
                  </span>
                </TableCell>
                <TableCell>
                  <span
                    className="text-xs font-medium"
                    style={{ color: PCOL[task.priority] }}
                  >
                    {task.priority}
                  </span>
                </TableCell>
                <TableCell>
                  <span
                    className="text-xs"
                    style={{ color: scolText(task.status, isDark) || "#888" }}
                  >
                    {task.status}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground block overflow-hidden text-ellipsis whitespace-nowrap">
                    {task.comment || "—"}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => openReturnDialog(task)}
                      title="Вернуть в таблицу"
                    >
                      <span className="text-sm">📋</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() =>
                        deleteBacklogTask(task.id)
                      }
                      title="Удалить"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {backlog.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                >
                  <EmptyState
                    type="backlog"
                    onAction={() => {
                      const newTask = createNewTask();
                      const current = useTaskStore.getState().backlog;
                      useTaskStore.setState({ backlog: [...current, newTask] });
                    }}
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
        onClick={handleAddToBacklog}
      >
        <Plus className="size-3.5" />
        Создать задачу
      </Button>

      {/* ---- RETURN FROM BACKLOG DIALOG ---- */}
      <Dialog open={dialog.open} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="sm:max-w-md">
          {/* Header */}
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

          {/* Form fields */}
          <div className="grid gap-3 py-1">
            {/* Task number + Name */}
            <div className="grid grid-cols-[100px_1fr] gap-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">№ Задачи</label>
                <Input
                  value={dialog.num}
                  onChange={(e) => setDialog(prev => ({ ...prev, num: e.target.value }))}
                  placeholder="Номер..."
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Наименование</label>
                <Input
                  value={dialog.name}
                  onChange={(e) => setDialog(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Название задачи..."
                  className="h-9 text-sm"
                />
              </div>
            </div>

            {/* Plan + Fact */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">План, ч</label>
                <Input
                  value={dialog.planH}
                  onChange={(e) => setDialog(prev => ({ ...prev, planH: e.target.value }))}
                  placeholder="0 или формула (2+3)"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Факт, ч</label>
                <Input
                  value={dialog.factH}
                  onChange={(e) => setDialog(prev => ({ ...prev, factH: e.target.value }))}
                  placeholder="0 или формула (2+3)"
                  className="h-9 text-sm"
                />
              </div>
            </div>

            {/* Month + Priority + Status */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Месяц</label>
                <Select
                  value={String(dialog.month)}
                  onValueChange={(v) => setDialog(prev => ({ ...prev, month: Number(v) }))}
                >
                  <SelectTrigger className="h-9 text-sm w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={m} value={String(i)} className="text-sm">
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Приоритет</label>
                <Select
                  value={dialog.priority}
                  onValueChange={(v) => setDialog(prev => ({ ...prev, priority: v as Priority }))}
                >
                  <SelectTrigger className="h-9 text-sm w-full" style={{ color: PCOL[dialog.priority] || undefined }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {priorityValues.map((p) => (
                      <SelectItem key={p} value={p} className="text-sm" style={{ color: PCOL[p] }}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Статус</label>
                <Select
                  value={dialog.status}
                  onValueChange={(v) => setDialog(prev => ({ ...prev, status: v as Status }))}
                >
                  <SelectTrigger className="h-9 text-sm w-full" style={{ color: scolText(dialog.status, isDark) || undefined }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusValues.map((s) => (
                      <SelectItem key={s} value={s} className="text-sm" style={{ color: scolText(s, isDark) || "#888" }}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button
              onClick={handleReturnToTable}
              className="h-12 gap-2 text-base bg-[var(--tracker-accent)] text-white hover:bg-[var(--tracker-accent-hover)]"
            >
              <span>📋</span>
              В таблицу
            </Button>
            <Button className="h-12 text-base" variant="outline" onClick={closeDialog}>
              Отмена
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ================================================================ */
/*  DASHBOARD VIEW                                                   */
/* ================================================================ */

interface DashboardViewProps {
  data: {
    total: number;
    completed: number;
    planH: number;
    factH: number;
    statusCounts: Record<string, number>;
  };
  monthBudget: string;
  onBudgetChange: (v: string) => void;
}

function DashboardView({ data, monthBudget, onBudgetChange }: DashboardViewProps) {
  // Evaluate budget formula
  const budgetValue = evalExpr(monthBudget);
  const budgetDisplay = isNaN(budgetValue) || budgetValue <= 0 ? 0 : budgetValue;

  // Team load percentage
  const teamLoad = budgetDisplay > 0 ? Math.min(100, Math.round((data.factH / budgetDisplay) * 100)) : 0;
  const isOverBudget = teamLoad > 100;

  // Accuracy: how close fact is to plan
  const accuracy = data.planH > 0 ? Math.min(100, Math.round((data.planH / data.factH) * 100)) : 0;

  const kpiCards = [
    {
      label: "Всего задач",
      value: data.total,
      icon: "📋",
      color: "text-[var(--tracker-accent-fg)]",
    },
    {
      label: "Завершено",
      value: data.completed,
      icon: "✅",
      color: "text-green-600 dark:text-green-400",
    },
    {
      label: "План, ч",
      value: fmt2(data.planH),
      icon: "📝",
      color: "text-amber-600 dark:text-amber-400",
    },
    {
      label: "Факт, ч",
      value: fmt2(data.factH),
      icon: "⏱",
      color: "text-[var(--tracker-accent-fg)]",
    },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpiCards.map((kpi) => (
          <Card key={kpi.label} className="py-4">
            <CardContent className="flex items-center gap-3 px-4 py-0">
              <span className="text-2xl">{kpi.icon}</span>
              <div>
                <p className="text-sm text-muted-foreground">
                  {kpi.label}
                </p>
                <p
                  className={`text-2xl font-bold ${kpi.color}`}
                >
                  {kpi.value}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Team Load & Budget */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Team Load */}
        <Card className="py-4">
          <CardContent className="space-y-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="flex size-8 items-center justify-center rounded-lg"
                  style={{ backgroundColor: isOverBudget ? "rgba(239,68,68,.1)" : teamLoad >= 80 ? "rgba(234,179,8,.1)" : "rgba(34,197,94,.1)" }}
                >
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke={isOverBudget ? "#ef4444" : teamLoad >= 80 ? "#eab308" : "#22c55e"} strokeWidth="2">
                    <rect x="2" y="6" width="18" height="12" rx="2" />
                    <rect x="4" y="8" width="10" height="8" rx="1" fill={isOverBudget ? "#ef4444" : teamLoad >= 80 ? "#eab308" : "#22c55e"} opacity="0.3" />
                    <line x1="22" y1="12" x2="22" y2="18" />
                    <line x1="22" y1="9" x2="22" y2="11" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium">Загрузка команды</p>
                  <p className="text-xs text-muted-foreground">факт / бюджет</p>
                </div>
              </div>
              <span className={`text-2xl font-bold ${isOverBudget ? "text-red-500" : teamLoad >= 80 ? "text-amber-500" : "text-green-600"}`}>
                {teamLoad}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(teamLoad, 100)}%`,
                  backgroundColor: isOverBudget ? "#ef4444" : teamLoad >= 80 ? "#eab308" : "#22c55e",
                }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{fmt2(data.factH)} ч факт</span>
              <span>{fmt2(budgetDisplay)} ч / мес</span>
            </div>
          </CardContent>
        </Card>

        {/* Accuracy & Budget Input */}
        <Card className="py-4">
          <CardContent className="space-y-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-lg bg-blue-500/10">
                  <span className="text-lg">🎯</span>
                </div>
                <div>
                  <p className="text-sm font-medium">Точность</p>
                  <p className="text-xs text-muted-foreground">план / факт</p>
                </div>
              </div>
              <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {accuracy}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-500"
                style={{ width: `${Math.min(accuracy, 100)}%` }}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Бюджет:</span>
              <Input
                className="h-7 text-sm"
                value={monthBudget}
                onChange={(e) => onBudgetChange(e.target.value)}
                placeholder="напр. 10+15"
              />
              <span className="text-xs font-medium whitespace-nowrap">
                = {fmt2(budgetDisplay)} ч/мес
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Status Distribution */}
      <Card className="py-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Распределение по статусам
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Object.values(STATUSES).map((s) => {
              const count = data.statusCounts[s] || 0;
              if (count === 0) return null;
              return (
                <div
                  key={s}
                  className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2"
                >
                  <span
                    className="inline-block size-3 shrink-0 rounded-full"
                    style={{
                      backgroundColor: SCOL[s] || "#888",
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{s}</p>
                    <p className="text-xs text-muted-foreground">
                      {count}{" "}
                      {count === 1
                        ? "задача"
                        : count < 5
                          ? "задачи"
                          : "задач"}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="ml-auto text-xs"
                  >
                    {count}
                  </Badge>
                </div>
              );
            })}
          </div>
          {Object.keys(data.statusCounts).length === 0 && (
            <EmptyState type="dashboard" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ================================================================ */
/*  QUESTIONS VIEW                                                   */
/* ================================================================ */

interface QuestionsViewProps {
  questions: Question[];
  newQuestionText: string;
  newQuestionAuthor: string;
  setNewQuestionText: (v: string) => void;
  setNewQuestionAuthor: (v: string) => void;
  addQuestion: () => void;
  removeQuestion: (id: string) => void;
  answeringId: string | null;
  answerText: string;
  setAnsweringId: (id: string | null) => void;
  setAnswerText: (v: string) => void;
  answerQuestion: (questionId: string, answer: string) => void;
}

function QuestionsView({
  questions,
  newQuestionText,
  newQuestionAuthor,
  setNewQuestionText,
  setNewQuestionAuthor,
  addQuestion,
  removeQuestion,
  answeringId,
  answerText,
  setAnsweringId,
  setAnswerText,
  answerQuestion,
}: QuestionsViewProps) {
  return (
    <div className="space-y-4">
      {/* Add question form */}
      <Card className="py-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Добавить вопрос
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="Текст вопроса..."
            value={newQuestionText}
            onChange={(e) => setNewQuestionText(e.target.value)}
            className="min-h-[60px] resize-y"
          />
          <div className="flex items-center gap-2">
            <Input
              placeholder="Ваше имя"
              value={newQuestionAuthor}
              onChange={(e) =>
                setNewQuestionAuthor(e.target.value)
              }
              className="h-8 w-48"
            />
            <Button
              size="sm"
              className="h-8 gap-1.5 bg-[var(--tracker-accent)] text-white hover:bg-[var(--tracker-accent-hover)]"
              onClick={addQuestion}
            >
              <Plus className="size-3.5" />
              Отправить
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Questions list */}
      <div className="space-y-2">
        {questions.map((q) => (
          <Card key={q.id} className="py-3">
            <CardContent className="px-4 py-0">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-lg">❓</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{q.text}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    — {q.author}
                    {q.questionDate && (
                      <span className="ml-2">
                        {new Date(q.questionDate).toLocaleDateString("ru-RU", {
                          day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
                        })}
                      </span>
                    )}
                  </p>
                  {q.answer && (
                    <div className="mt-2 rounded-lg bg-muted/50 px-3 py-2">
                      <p className="text-sm text-foreground">{q.answer}</p>
                      {q.answerDate && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {new Date(q.answerDate).toLocaleDateString("ru-RU", {
                            day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
                          })}
                        </p>
                      )}
                    </div>
                  )}
                  {answeringId === q.id ? (
                    <div className="mt-2 space-y-2">
                      <Textarea
                        placeholder="Ваш ответ..."
                        value={answerText}
                        onChange={(e) => setAnswerText(e.target.value)}
                        className="min-h-[50px] resize-y"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="h-7 gap-1 bg-[var(--tracker-accent)] text-white hover:bg-[var(--tracker-accent-hover)]"
                          onClick={() => answerQuestion(q.id, answerText)}
                          disabled={!answerText.trim()}
                        >
                          <Send className="size-3" />
                          Ответить
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7"
                          onClick={() => setAnsweringId(null)}
                        >
                          Отмена
                        </Button>
                      </div>
                    </div>
                  ) : !q.answer && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 h-7 gap-1 text-xs"
                      onClick={() => { setAnsweringId(q.id); setAnswerText(""); }}
                    >
                      <MessageSquare className="size-3" />
                      Ответить
                    </Button>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="mt-0.5 h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeQuestion(q.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {questions.length === 0 && (
          <EmptyState type="questions" />
        )}
      </div>
    </div>
  );
}

/* ================================================================ */
/*  SLIDES VIEW                                                      */
/* ================================================================ */

interface SlidesViewProps {
  slides: SlideData[];
  currentSlide: number;
  setCurrentSlide: (i: number) => void;
  accentHex: string;
  presBg: PresBgSettings;
  onExportHTML: () => void;
  onCreateNew: () => void;
  hasData: boolean;
}

function SlidesView({
  slides,
  currentSlide,
  setCurrentSlide,
  accentHex,
  presBg,
  onExportHTML,
  onCreateNew,
  hasData,
}: SlidesViewProps) {
  const { toast } = useToast();

  if (slides.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <Presentation className="size-16 text-muted-foreground/30" />
        <p className="text-lg text-muted-foreground">
          Презентация не создана
        </p>
        <p className="text-sm text-muted-foreground">
          Перейдите в таблицу и нажмите «Презентация» для создания
        </p>
        <div className="flex gap-2">
          <Button
            onClick={onCreateNew}
            className="gap-1.5 bg-[var(--tracker-accent)] text-white hover:bg-[var(--tracker-accent-hover)]"
            disabled={!hasData}
          >
            <Presentation className="size-4" />
            Создать презентацию
          </Button>
        </div>
      </div>
    );
  }

  const slide = slides[currentSlide];
  if (!slide) return null;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentSlide(Math.max(0, currentSlide - 1))}
            disabled={currentSlide === 0}
            className="gap-1.5"
          >
            <ChevronLeft className="size-4" />
            Назад
          </Button>
          <span className="text-sm text-muted-foreground">
            {currentSlide + 1} / {slides.length}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentSlide(Math.min(slides.length - 1, currentSlide + 1))}
            disabled={currentSlide === slides.length - 1}
            className="gap-1.5"
          >
            Далее
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              toast({
                title: "✨ AI анализ",
                description: "Функция будет доступна",
              });
            }}
          >
            <Sparkles className="size-3.5" />
            AI анализ
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={onExportHTML}
          >
            <Download className="size-3.5" />
            Скачать HTML
          </Button>
        </div>
      </div>

      {/* Slide indicators */}
      <div className="flex gap-1.5 justify-center">
        {slides.map((s, i) => (
          <button
            key={i}
            onClick={() => setCurrentSlide(i)}
            className={`size-2 rounded-full transition-colors ${
              i === currentSlide
                ? "bg-[var(--tracker-accent)]"
                : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
            }`}
          />
        ))}
      </div>

      {/* Slide preview */}
      <SlidePreview slide={slide} accentHex={accentHex} presBg={presBg} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Slide Preview Card                                                */
/* ------------------------------------------------------------------ */

function SlidePreview({ slide, accentHex, presBg }: { slide: SlideData; accentHex: string; presBg: PresBgSettings }) {
  const c = slide.content;
  const [r, g, b] = hexToRgb(accentHex);
  const accentSoft = `rgba(${r}, ${g}, ${b}, 0.08)`;
  const accentMed = `rgba(${r}, ${g}, ${b}, 0.15)`;

  // Generate deterministic emoji positions for slide background
  const emojiStr = presBg.emojis;
  const bgEmojis = useMemo(() => {
    if (!emojiStr || presBg.emojiCount === 0) return [];
    const list = emojiStr.split(" ").filter(Boolean);
    if (list.length === 0) return [];
    const result: { emoji: string; x: number; y: number; size: number; opacity: number; rotate: number }[] = [];
    let seed = 42;
    const rand = () => {
      seed = (seed * 16807 + 0) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < presBg.emojiCount; i++) {
      result.push({
        emoji: list[Math.floor(rand() * list.length)],
        x: rand() * 100,
        y: rand() * 100,
        size: presBg.emojiMinSize + rand() * (presBg.emojiMaxSize - presBg.emojiMinSize),
        opacity: 0.12 + rand() * 0.25,
        rotate: Math.floor(rand() * 40 - 20),
      });
    }
    return result;
  }, [emojiStr, presBg.emojiCount, presBg.emojiMinSize, presBg.emojiMaxSize]);

  const patternCSS = useMemo(() => {
    if (presBg.pattern === "none") return {};
    const sz = presBg.patternSize;
    const op = presBg.patternOpacity / 100;
    const col = `rgba(${r},${g},${b},${op})`;
    switch (presBg.pattern) {
      case "grid":
        return { backgroundImage: `linear-gradient(${col} 1px, transparent 1px), linear-gradient(90deg, ${col} 1px, transparent 1px)`, backgroundSize: `${sz}px ${sz}px` };
      case "diagonal":
        return { backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent ${sz / 2}px, ${col} ${sz / 2}px, ${col} ${sz / 2 + 1}px)`, backgroundSize: `${sz}px ${sz}px` };
      case "diamond":
        return { backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent ${sz / 2 - 1}px, ${col} ${sz / 2 - 1}px, ${col} ${sz / 2 + 1}px), repeating-linear-gradient(-45deg, transparent, transparent ${sz / 2 - 1}px, ${col} ${sz / 2 - 1}px, ${col} ${sz / 2 + 1}px)`, backgroundSize: `${sz}px ${sz}px` };
      case "waves":
        return { backgroundImage: `url("data:image/svg+xml,%3Csvg width='${sz}' height='${sz / 2}' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 ${sz / 4} Q ${sz / 4} 0 ${sz / 2} ${sz / 4} T ${sz} ${sz / 4}' fill='none' stroke='rgba(${r},${g},${b},${op})' stroke-width='1'/%3E%3C/svg%3E")`, backgroundSize: `${sz}px ${sz / 2}px` };
      case "zigzag":
        return { backgroundImage: `url("data:image/svg+xml,%3Csvg width='${sz}' height='${sz / 2}' xmlns='http://www.w3.org/2000/svg'%3E%3Cpolyline points='0,${sz / 2} ${sz / 4},0 ${sz / 2},${sz / 2} ${sz * 3 / 4},0 ${sz},${sz / 2}' fill='none' stroke='rgba(${r},${g},${b},${op})' stroke-width='1'/%3E%3C/svg%3E")`, backgroundSize: `${sz}px ${sz / 2}px` };
      default:
        return {};
    }
  }, [presBg.pattern, presBg.patternSize, presBg.patternOpacity, r, g, b]);

  const hasBg = presBg.pattern !== "none" || bgEmojis.length > 0;

  return (
    <div
      className="mx-auto w-full max-w-[960px] rounded-2xl border p-8 shadow-lg min-h-[480px] relative overflow-hidden"
      style={{
        background: `linear-gradient(135deg, rgba(${r},${g},${b},0.04) 0%, rgba(${r},${g},${b},0.01) 100%)`,
        borderColor: accentSoft,
      }}
    >
      {/* Background decorations */}
      {hasBg && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
          {presBg.pattern !== "none" && (
            <div className="absolute inset-0" style={patternCSS} />
          )}
          {bgEmojis.map((e, i) => (
            <span
              key={i}
              className="absolute pointer-events-none select-none"
              style={{
                left: `${e.x}%`,
                top: `${e.y}%`,
                fontSize: e.size,
                opacity: e.opacity,
                transform: `rotate(${e.rotate}deg)`,
              }}
            >
              {e.emoji}
            </span>
          ))}
        </div>
      )}

      {/* Slide content (above background) */}
      <div className="relative z-10">
      {/* Title slide */}
      {slide.type === "title" && (
        <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
          <div
            className="mb-6 size-16 rounded-2xl flex items-center justify-center text-3xl"
            style={{ backgroundColor: accentSoft }}
          >
            📊
          </div>
          <h2
            className="text-4xl font-bold mb-2"
            style={{ color: accentHex }}
          >
            {String(c.month)}
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Отчёт по задачам
          </p>
          <div className="flex gap-8">
            <div className="text-center">
              <p className="text-3xl font-bold" style={{ color: accentHex }}>
                {Number(c.total)}
              </p>
              <p className="text-sm text-muted-foreground">Всего задач</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                {Number(c.completed)}
              </p>
              <p className="text-sm text-muted-foreground">Завершено</p>
            </div>
            <div className="text-center">
              <div className="relative">
                <svg width="80" height="80" className="transform -rotate-90">
                  <circle
                    cx="40"
                    cy="40"
                    r="34"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="6"
                    className="text-muted/30"
                  />
                  <circle
                    cx="40"
                    cy="40"
                    r="34"
                    fill="none"
                    stroke={accentHex}
                    strokeWidth="6"
                    strokeDasharray={`${2 * Math.PI * 34}`}
                    strokeDashoffset={`${2 * Math.PI * 34 * (1 - Number(c.pct) / 100)}`}
                    strokeLinecap="round"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-lg font-bold" style={{ color: accentHex }}>
                  {Number(c.pct)}%
                </span>
              </div>
              <p className="text-sm text-muted-foreground">Выполнение</p>
            </div>
          </div>
        </div>
      )}

      {/* KPI slide */}
      {slide.type === "kpi" && (
        <div className="space-y-6">
          <h3 className="text-2xl font-bold" style={{ color: accentHex }}>
            Ключевые показатели
          </h3>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: "Всего задач", value: String(c.total), icon: "📋" },
              { label: "Завершено", value: String(c.completed), icon: "✅" },
              { label: "План, часов", value: String(c.planH), icon: "📝" },
              { label: "Факт, часов", value: String(c.factH), icon: "⏱" },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="rounded-xl p-5 border"
                style={{
                  backgroundColor: accentSoft,
                  borderColor: accentMed,
                }}
              >
                <span className="text-2xl">{kpi.icon}</span>
                <p className="text-sm text-muted-foreground mt-2">{kpi.label}</p>
                <p className="text-3xl font-bold mt-1" style={{ color: accentHex }}>
                  {kpi.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Statuses slide */}
      {slide.type === "statuses" && (
        <div className="space-y-6">
          <h3 className="text-2xl font-bold" style={{ color: accentHex }}>
            Распределение по статусам
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Object.entries(c.statusCounts as Record<string, number>).map(([status, count]) => (
              <div
                key={status}
                className="rounded-xl p-4 border"
                style={{ backgroundColor: accentSoft, borderColor: accentMed }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="size-3 rounded-full"
                    style={{ backgroundColor: SCOL[status as keyof typeof SCOL] || "#888" }}
                  />
                  <span className="text-sm font-medium truncate">{status}</span>
                </div>
                <p className="text-2xl font-bold" style={{ color: accentHex }}>{count}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completed tasks slide */}
      {slide.type === "completed" && (
        <div className="space-y-6">
          <h3 className="text-2xl font-bold" style={{ color: accentHex }}>
            ✅ Завершённые задачи {Number(c.total) > 8 ? `(показано 8 из ${c.total})` : ""}
          </h3>
          <div className="grid gap-3">
            {(c.tasks as Task[]).map((task) => (
              <div
                key={task.id}
                className="rounded-xl p-4 border flex items-start gap-3"
                style={{ backgroundColor: accentSoft, borderColor: accentMed }}
              >
                <span
                  className="size-2 rounded-full mt-2 shrink-0"
                  style={{ backgroundColor: "#30ab50" }}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{task.name || "Без названия"}</p>
                  <div className="flex gap-3 mt-1 text-sm text-muted-foreground">
                    {task.num && <span>#{task.num}</span>}
                    <span>{task.priority}</span>
                  </div>
                </div>
                <Badge
                  className="shrink-0 text-xs"
                  style={{
                    backgroundColor: `${SCOL[task.status] || "#888"}20`,
                    color: SCOL[task.status] || "#888",
                    borderColor: `${SCOL[task.status] || "#888"}40`,
                  }}
                >
                  {task.status}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* In-progress tasks slide */}
      {slide.type === "inprogress" && (
        <div className="space-y-6">
          <h3 className="text-2xl font-bold" style={{ color: accentHex }}>
            🔄 В работе {Number(c.total) > 8 ? `(показано 8 из ${c.total})` : ""}
          </h3>
          <div className="grid gap-3">
            {(c.tasks as Task[]).map((task) => (
              <div
                key={task.id}
                className="rounded-xl p-4 border flex items-start gap-3"
                style={{ backgroundColor: accentSoft, borderColor: accentMed }}
              >
                <span
                  className="size-2 rounded-full mt-2 shrink-0"
                  style={{ backgroundColor: SCOL[task.status] || "#888" }}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{task.name || "Без названия"}</p>
                  <div className="flex gap-3 mt-1 text-sm text-muted-foreground">
                    {task.num && <span>#{task.num}</span>}
                    <span>{task.priority}</span>
                    {task.planH && <span>План: {task.planH} ч</span>}
                  </div>
                </div>
                <Badge
                  className="shrink-0 text-xs"
                  style={{
                    backgroundColor: `${SCOL[task.status] || "#888"}20`,
                    color: SCOL[task.status] || "#888",
                    borderColor: `${SCOL[task.status] || "#888"}40`,
                  }}
                >
                  {task.status}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Table slide */}
      {slide.type === "table" && (
        <div className="space-y-4">
          <h3 className="text-2xl font-bold" style={{ color: accentHex }}>
            📋 Полный список задач
          </h3>
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: accentMed }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: accentHex }}>
                  <th className="px-3 py-2 text-left text-white font-medium text-xs">#</th>
                  <th className="px-3 py-2 text-left text-white font-medium text-xs">Наименование</th>
                  <th className="px-3 py-2 text-right text-white font-medium text-xs">План</th>
                  <th className="px-3 py-2 text-right text-white font-medium text-xs">Факт</th>
                  <th className="px-3 py-2 text-center text-white font-medium text-xs">Приоритет</th>
                  <th className="px-3 py-2 text-center text-white font-medium text-xs">Статус</th>
                </tr>
              </thead>
              <tbody>
                {(c.rows as Task[]).map((task, idx) => (
                  <tr
                    key={task.id}
                    style={{ backgroundColor: idx % 2 === 0 ? "transparent" : accentSoft }}
                  >
                    <td className="px-3 py-2 text-xs text-muted-foreground">{idx + 1}</td>
                    <td className="px-3 py-2 text-xs max-w-[260px] truncate">{task.name || "—"}</td>
                    <td className="px-3 py-2 text-xs text-right">{task.planH || "—"}</td>
                    <td className="px-3 py-2 text-xs text-right">{task.factH || "—"}</td>
                    <td className="px-3 py-2 text-xs text-center" style={{ color: PCOL[task.priority] }}>
                      {task.priority}
                    </td>
                    <td className="px-3 py-2 text-xs text-center" style={{ color: SCOL[task.status] || "#888" }}>
                      {task.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {Number(c.total) > 15 && (
            <p className="text-xs text-muted-foreground text-center">
              Показано 15 из {c.total} задач
            </p>
          )}
        </div>
      )}

      {/* Summary slide */}
      {slide.type === "summary" && (
        <div className="space-y-6">
          <h3 className="text-2xl font-bold" style={{ color: accentHex }}>
            📝 Итоги
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div
              className="rounded-xl p-5 border"
              style={{ backgroundColor: accentSoft, borderColor: accentMed }}
            >
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <span className="text-green-500">✅</span> Достижения
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Выполнен план задач на текущий период</li>
                <li>Успешно завершены приоритетные задачи</li>
              </ul>
            </div>
            <div
              className="rounded-xl p-5 border"
              style={{ backgroundColor: accentSoft, borderColor: accentMed }}
            >
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <span className="text-amber-500">⚠️</span> Риски
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Некоторые задачи перевыполнены по часам</li>
                <li>Необходима корректировка сроков</li>
              </ul>
            </div>
            <div
              className="rounded-xl p-5 border"
              style={{ backgroundColor: accentSoft, borderColor: accentMed }}
            >
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <span className="text-blue-500">🔄</span> В работе
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Задачи перенесены на следующий месяц</li>
                <li>Беклог требует планирования</li>
              </ul>
            </div>
            <div
              className="rounded-xl p-5 border"
              style={{ backgroundColor: accentSoft, borderColor: accentMed }}
            >
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <span className="text-purple-500">➡️</span> Следующие шаги
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Распределить задачи из беклога</li>
                <li>Скорректировать план часов</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Build standalone HTML from slides                                  */
/* ------------------------------------------------------------------ */

function buildSlidesHTML(slides: SlideData[], presBg: PresBgSettings): string {
  const accentHex = String(slides[0]?.content.accent || "#5B9BD5");
  const [r, g, b] = hexToRgb(accentHex);

  // Build background CSS for slides
  const bgCSS = (() => {
    const sz = presBg.patternSize;
    const op = (presBg.patternOpacity / 100).toFixed(2);
    const col = `rgba(${r},${g},${b},${op})`;
    switch (presBg.pattern) {
      case "grid":
        return `.slide .bg-pat{position:absolute;inset:0;pointer-events:none;border-radius:16px;background-image:linear-gradient(${col} 1px,transparent 1px),linear-gradient(90deg,${col} 1px,transparent 1px);background-size:${sz}px ${sz}px}`;
      case "diagonal":
        return `.slide .bg-pat{position:absolute;inset:0;pointer-events:none;border-radius:16px;background-image:repeating-linear-gradient(45deg,transparent,transparent ${sz / 2}px,${col} ${sz / 2}px,${col} ${sz / 2 + 1}px);background-size:${sz}px ${sz}px}`;
      case "diamond":
        return `.slide .bg-pat{position:absolute;inset:0;pointer-events:none;border-radius:16px;background-image:repeating-linear-gradient(45deg,transparent,transparent ${sz / 2 - 1}px,${col} ${sz / 2 - 1}px,${col} ${sz / 2 + 1}px),repeating-linear-gradient(-45deg,transparent,transparent ${sz / 2 - 1}px,${col} ${sz / 2 - 1}px,${col} ${sz / 2 + 1}px);background-size:${sz}px ${sz}px}`;
      case "waves":
        return `.slide .bg-pat{position:absolute;inset:0;pointer-events:none;border-radius:16px;background-image:url("data:image/svg+xml,%3Csvg width='${sz}' height='${sz / 2}' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 ${sz / 4} Q ${sz / 4} 0 ${sz / 2} ${sz / 4} T ${sz} ${sz / 4}' fill='none' stroke='rgba(${r},${g},${b},${op})' stroke-width='1'/%3E%3C/svg%3E");background-size:${sz}px ${sz / 2}px}`;
      case "zigzag":
        return `.slide .bg-pat{position:absolute;inset:0;pointer-events:none;border-radius:16px;background-image:url("data:image/svg+xml,%3Csvg width='${sz}' height='${sz / 2}' xmlns='http://www.w3.org/2000/svg'%3E%3Cpolyline points='0,${sz / 2} ${sz / 4},0 ${sz / 2},${sz / 2} ${sz * 3 / 4},0 ${sz},${sz / 2}' fill='none' stroke='rgba(${r},${g},${b},${op})' stroke-width='1'/%3E%3C/svg%3E");background-size:${sz}px ${sz / 2}px`;
      default:
        return "";
    }
  })();

  // Build emoji CSS and HTML for slides
  const emojiList = presBg.emojis.split(" ").filter(Boolean);
  const emojiLayerCSS = (() => {
    if (emojiList.length === 0 || presBg.emojiCount === 0) return { css: "", tags: "" };
    let seed = 42;
    const rand = () => {
      seed = (seed * 16807 + 0) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    let css = ".slide .bg-emoji{position:absolute;inset:0;pointer-events:none;overflow:hidden;border-radius:16px}\n";
    const tags: string[] = [];
    for (let i = 0; i < presBg.emojiCount; i++) {
      const emoji = emojiList[Math.floor(rand() * emojiList.length)];
      const x = (rand() * 100).toFixed(1);
      const y = (rand() * 100).toFixed(1);
      const size = Math.round(presBg.emojiMinSize + rand() * (presBg.emojiMaxSize - presBg.emojiMinSize));
      const opacity = (0.12 + rand() * 0.25).toFixed(2);
      const rotate = Math.floor(rand() * 40 - 20);
      css += `.slide .bg-emoji .e${i}{position:absolute;left:${x}%;top:${y}%;font-size:${size}px;opacity:${opacity};transform:rotate(${rotate}deg)}\n`;
      tags.push(`<span class="e${i}">${emoji}</span>`);
    }
    return { css, tags: tags.join("") };
  })();

  const slidesHTML = slides.map((slide) => {
    const c = slide.content;
    const accentSoft = `rgba(${r},${g},${b},0.08)`;
    const accentMed = `rgba(${r},${g},${b},0.15)`;

    let inner = "";
    if (slide.type === "title") {
      const pct = Number(c.pct) || 0;
      const circ = 2 * Math.PI * 34;
      inner = `
        <div class="slide-inner">
          <div class="icon-box">📊</div>
          <h2 style="color:${accentHex}">${c.month}</h2>
          <p class="subtitle">Отчёт по задачам</p>
          <div class="stats">
            <div><p class="num" style="color:${accentHex}">${c.total}</p><p>Всего задач</p></div>
            <div><p class="num" style="color:#30ab50">${c.completed}</p><p>Завершено</p></div>
            <div class="circle-wrap">
              <svg width="80" height="80" class="rot"><circle cx="40" cy="40" r="34" fill="none" stroke="#e0e0e0" stroke-width="6"/><circle cx="40" cy="40" r="34" fill="none" stroke="${accentHex}" stroke-width="6" stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - pct / 100)}" stroke-linecap="round"/></svg>
              <span class="pct" style="color:${accentHex}">${pct}%</span>
            </div>
          </div>
        </div>`;
    } else if (slide.type === "summary") {
      inner = `
        <div class="slide-inner summary">
          <h3 style="color:${accentHex}">📝 Итоги</h3>
          <div class="grid2">
            <div class="card"><h4>✅ Достижения</h4><ul><li>Выполнен план задач</li></ul></div>
            <div class="card"><h4>⚠️ Риски</h4><ul><li>Перерасход по часам</li></ul></div>
            <div class="card"><h4>🔄 В работе</h4><ul><li>Задачи перенесены</li></ul></div>
            <div class="card"><h4>➡️ Следующие шаги</h4><ul><li>Планирование беклога</li></ul></div>
          </div>
        </div>`;
    } else if (slide.type === "kpi") {
      const kpis = [
        { l: "Всего задач", v: c.total, i: "📋" },
        { l: "Завершено", v: c.completed, i: "✅" },
        { l: "План, часов", v: c.planH, i: "📝" },
        { l: "Факт, часов", v: c.factH, i: "⏱" },
      ];
      inner = `<div class="slide-inner"><h3 style="color:${accentHex}">Ключевые показатели</h3><div class="kpi-grid">${kpis.map(k => `<div class="kpi-card"><span class="kpi-icon">${k.i}</span><p class="kpi-label">${k.l}</p><p class="kpi-val" style="color:${accentHex}">${k.v}</p></div>`).join("")}</div></div>`;
    } else if (slide.type === "table") {
      const tasks = (c.tasks as Task[] || []).slice(0, 15);
      inner = `<div class="slide-inner"><h3 style="color:${accentHex}">📋 Полный список</h3><table class="s-table"><thead><tr style="background:${accentHex}"><th>#</th><th>Наименование</th><th>План</th><th>Факт</th><th>Приоритет</th><th>Статус</th></tr></thead><tbody>${tasks.map((t, i) => `<tr style="background:${i % 2 ? accentSoft : "transparent"}"><td>${i + 1}</td><td>${t.name || "—"}</td><td>${t.planH || "—"}</td><td>${t.factH || "—"}</td><td style="color:${PCOL[t.priority] || "#888"}">${t.priority}</td><td style="color:${SCOL[t.status] || "#888"}">${t.status}</td></tr>`).join("")}</tbody></table></div>`;
    } else if (slide.type === "statuses") {
      const statusCounts = c.statusCounts as Record<string, number> || {};
      const maxVal = Math.max(...Object.values(statusCounts), 1);
      const rows = Object.entries(statusCounts).map(([status, count]) => {
        const pct = Math.round((count / maxVal) * 100);
        return `<div class="status-row"><span class="status-name">${status}</span><div class="status-bar-bg"><div class="status-bar" style="width:${pct}%;background:${accentHex}"></div></div><span class="status-count">${count}</span></div>`;
      }).join("");
      inner = `<div class="slide-inner"><h3 style="color:${accentHex}">📊 Статусы</h3><div class="status-list">${rows}</div></div>`;
    } else if (slide.type === "completed" || slide.type === "inprogress") {
      const tasks = (c.tasks as Task[] || []).slice(0, 10);
      const title = slide.type === "completed" ? "✅ Завершённые задачи" : "🔄 Задачи в работе";
      inner = `<div class="slide-inner"><h3 style="color:${accentHex}">${title}</h3><table class="s-table"><thead><tr style="background:${accentHex}"><th>#</th><th>Наименование</th><th>Приоритет</th></tr></thead><tbody>${tasks.map((t, i) => `<tr style="background:${i % 2 ? accentSoft : "transparent"}"><td>${i + 1}</td><td>${t.name || "—"}</td><td style="color:${PCOL[t.priority] || "#888"}">${t.priority}</td></tr>`).join("")}</tbody></table></div>`;
    } else {
      inner = `<div class="slide-inner"><h3 style="color:${accentHex}">${slide.type}</h3><p>Slide content</p></div>`;
    }

    return `<div class="slide">${bgCSS ? '<div class="bg-pat"></div>' : ''}${emojiLayerCSS.tags ? `<div class="bg-emoji">${emojiLayerCSS.tags}</div>` : ''}${inner}</div>`;
  }).join("");

  return `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Презентация</title><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8f9fa;color:#1a1a2e}
.slide{width:960px;min-height:540px;margin:40px auto;padding:48px;border-radius:16px;border:1px solid rgba(${r},${g},${b},0.15);background:linear-gradient(135deg,rgba(${r},${g},${b},0.04),rgba(${r},${g},${b},0.01));box-shadow:0 4px 24px rgba(0,0,0,0.06)}
.slide-inner{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:440px}
h2{font-size:2.5rem;font-weight:800;margin-bottom:4px}
h3{font-size:1.5rem;font-weight:700;margin-bottom:24px}
.subtitle{font-size:1rem;color:#888;margin-bottom:32px}
.stats{display:flex;gap:32px}
.stats>div{text-align:center}
.num{font-size:2rem;font-weight:800}
.stats p:last-child{font-size:0.85rem;color:#888}
.icon-box{width:64px;height:64px;border-radius:16px;background:rgba(${r},${g},${b},0.08);display:flex;align-items:center;justify-content:center;font-size:2rem;margin-bottom:24px}
.circle-wrap{position:relative;display:flex;align-items:center;justify-content:center}
.rot{transform:rotate(-90deg)}
.pct{position:absolute;font-size:1.1rem;font-weight:700}
.kpi-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;width:100%}
.kpi-card{padding:20px;border-radius:12px;border:1px solid rgba(${r},${g},${b},0.15);background:rgba(${r},${g},${b},0.08)}
.kpi-icon{font-size:1.5rem}
.kpi-label{font-size:0.85rem;color:#888;margin-top:8px}
.kpi-val{font-size:1.8rem;font-weight:800;margin-top:4px}
.s-table{width:100%;border-collapse:collapse;font-size:0.85rem}
.s-table th{padding:8px 12px;text-align:left;color:#fff;font-weight:600}
.s-table td{padding:8px 12px}
.card{padding:20px;border-radius:12px;border:1px solid rgba(${r},${g},${b},0.15);background:rgba(${r},${g},${b},0.08)}
.card h4{margin-bottom:8px}
.card ul{padding-left:20px;color:#888;font-size:0.9rem}
.card li{margin-bottom:4px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;width:100%}
.status-list{width:100%;max-width:600px}
.status-row{display:flex;align-items:center;gap:12px;margin-bottom:8px}
.status-name{min-width:120px;font-size:0.9rem}
.status-bar-bg{flex:1;height:20px;background:rgba(0,0,0,0.06);border-radius:4px;overflow:hidden}
.status-bar{height:100%;border-radius:4px}
.status-count{min-width:30px;font-size:0.9rem;font-weight:600;text-align:right}
.summary .slide-inner{justify-content:flex-start;align-items:flex-start}
.slide-inner{position:relative;z-index:1}
${bgCSS}
${emojiLayerCSS.css}
@media print{.slide{box-shadow:none;border:1px solid #ddd;margin:0;page-break-after:always}}
</style></head><body>${slidesHTML}</body></html>`;
}

/* ================================================================ */
/*  CHAT VIEW COMPONENT                                                */
/* ================================================================ */

interface ChatMessage {
  role: "user" | "gemini" | "error";
  text: string;
}

interface ChatViewProps {
  apiKeyRef: React.MutableRefObject<string>;
  apiKeyDialogOpen: boolean;
  setApiKeyDialogOpen: (v: boolean) => void;
  chatModel: string;
  setChatModel: (v: string) => void;
  rows: Task[];
  month: number;
  allData: Record<number, Task[]>;
  backlog: Task[];
  totalFactMap: Record<string, number>;
}

function ChatView({
  apiKeyRef,
  apiKeyDialogOpen,
  setApiKeyDialogOpen,
  chatModel,
  setChatModel,
  rows,
  month,
  allData,
  backlog,
  totalFactMap,
}: ChatViewProps) {
  const [input, setInput] = useState("");
  const [log, setLog] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [includeData, setIncludeData] = useState(true);
  const [compareMonth, setCompareMonth] = useState(-1);
  const endRef = useRef<HTMLDivElement>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");

  /* Auto-scroll to bottom */
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log, busy]);

  /* Build context data for AI */
  const buildMonthBlock = useCallback(
    (mi: number, mRows: Task[]) => {
      const tasks = (mRows || []).filter((r) => r.num || r.name);
      if (!tasks.length) return `[${MONTHS[mi]}: нет данных]`;
      const { totPlan: totP, totFact: totF } = getRowsMetrics(tasks, null);
      const done = tasks.filter(
        (r) => r.status === STATUSES.DONE || r.status === STATUSES.COMPLETED
      ).length;
      const lines = tasks
        .map((r) => {
          const { plan, fact } = getTaskMetrics(r, null);
          return `  №${r.num || "—"} "${r.name}" план:${plan}ч факт:${fact}ч статус:${r.status} приоритет:${r.priority}${r.comment ? ` коммент:"${r.comment}"` : ""}`;
        })
        .join("\n");
      return `[${MONTHS[mi]}] Задач: ${tasks.length}, завершено: ${done}, план: ${totP}ч, факт: ${totF}ч\nЗадачи:\n${lines}`;
    },
    []
  );

  const buildContext = useCallback(() => {
    if (!includeData) return "";
    const curRows = rows || [];
    const tasks = curRows.filter((r) => r.num || r.name);
    if (!tasks.length && compareMonth < 0) return "";

    let ctx = "\n\n[КОНТЕКСТ — ДАННЫЕ ТРЕКЕРА]\n";

    if (compareMonth >= 0 && compareMonth !== month) {
      ctx += "Режим: сравнение двух месяцев\n\n";
      ctx += buildMonthBlock(month, rows) + "\n\n";
      ctx += buildMonthBlock(compareMonth, allData[compareMonth]) + "\n";
    } else {
      const rm = getRowsMetrics(tasks, totalFactMap);
      const done = tasks.filter(
        (r) => r.status === STATUSES.DONE || r.status === STATUSES.COMPLETED
      ).length;
      const taskLines = tasks
        .map((r) => {
          const m = getTaskMetrics(r, totalFactMap);
          return `  №${r.num || "—"} "${r.name}" план:${m.plan}ч факт:${m.fact}ч итого:${fmt2(m.totalH)}ч статус:${r.status} приоритет:${r.priority}${r.comment ? ` коммент:"${r.comment}"` : ""}`;
        })
        .join("\n");
      ctx += `Текущий месяц: ${MONTHS[month]}\nЗадач: ${tasks.length}, завершено: ${done}, план: ${rm.totPlan}ч, факт: ${rm.totFact}ч\n\nЗадачи ${MONTHS[month]}:\n${taskLines}`;
      if (backlog && backlog.length > 0) {
        ctx += `\n\nБеклог (${backlog.length} задач):\n${backlog
          .slice(0, 10)
          .map(
            (r) =>
              `  №${r.num || "—"} "${r.name}" статус:${r.status} приоритет:${r.priority}`
          )
          .join("\n")}${backlog.length > 10 ? `\n  ...и ещё ${backlog.length - 10}` : ""}`;
      }
      let totalAll = 0;
      let factAll = 0;
      let doneAll = 0;
      for (let mi = 0; mi < 12; mi++) {
        const mr = allData[mi] || [];
        const t = mr.filter((r) => r.num || r.name);
        totalAll += t.length;
        const _yrm = getRowsMetrics(t, null);
        factAll += _yrm.totFact;
        doneAll += t.filter(
          (r) => r.status === STATUSES.DONE || r.status === STATUSES.COMPLETED
        ).length;
      }
      ctx += `\n\nИтого по году: ${totalAll} задач, ${doneAll} завершено, ${fmt2(factAll)}ч факт.`;
    }

    ctx += "\n[/КОНТЕКСТ]";
    return ctx;
  }, [includeData, rows, month, allData, backlog, totalFactMap, compareMonth, buildMonthBlock]);

  /* Send message */
  const send = useCallback(async () => {
    if (!input.trim() || busy) return;
    const apiKey = apiKeyRef.current;
    if (!apiKey) {
      setApiKeyDialogOpen(true);
      return;
    }

    const msg = input.trim();
    setInput("");
    const newLog: ChatMessage[] = [...log, { role: "user", text: msg }];
    setLog(newLog);
    setBusy(true);

    try {
      const ctx = buildContext();
      const sysPrompt = ctx
        ? `Ты — AI-помощник менеджера проектов. Отвечай на русском. У тебя есть доступ к данным трекера задач. Используй эти данные для ответов, анализа и рекомендаций. Будь конкретен, приводи цифры из данных.${compareMonth >= 0 && compareMonth !== month ? " При сравнении месяцев выделяй ключевые отличия в нагрузке, прогрессе и статусах задач." : ""}${ctx}`
        : "";

      /* Build multi-turn contents */
      const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
      const prev = newLog.filter(
        (m) => m.role === "user" || m.role === "gemini"
      );
      prev.forEach((m) => {
        if (m.role === "user") {
          const isFirst = !contents.length;
          const text = isFirst && sysPrompt
            ? sysPrompt + "\n\nВопрос пользователя: " + m.text
            : m.text;
          contents.push({ role: "user", parts: [{ text }] });
        } else if (m.role === "gemini") {
          contents.push({ role: "model", parts: [{ text: m.text }] });
        }
      });
      if (!contents.length) {
        contents.push({ role: "user", parts: [{ text: msg }] });
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: contents,
          apiKey,
          model: chatModel,
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const aiText = (data.text || "").trim();
      setLog((l) => [...l, { role: "gemini", text: aiText }]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Неизвестная ошибка";
      setLog((l) => [...l, { role: "error", text: message }]);
    }
    setBusy(false);
  }, [input, busy, apiKeyRef, chatModel, buildContext, log, setApiKeyDialogOpen]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    },
    [send]
  );

  const handleSaveApiKey = useCallback(() => {
    if (apiKeyInput.trim()) {
      apiKeyRef.current = apiKeyInput.trim();
      setApiKeyDialogOpen(false);
      setApiKeyInput("");
    }
  }, [apiKeyInput, apiKeyRef, setApiKeyDialogOpen]);

  const taskCount = (rows || []).filter((r) => r.num || r.name).length;
  const isComparing = compareMonth >= 0 && compareMonth !== month;

  return (
    <div className="flex flex-col gap-4" style={{ height: "calc(100vh - 220px)", minHeight: 400 }}>
      {/* API Key Dialog */}
      <Dialog open={apiKeyDialogOpen} onOpenChange={setApiKeyDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              <KeyRound className="size-5 inline mr-2 text-[var(--tracker-accent)]" />
              Gemini API ключ
            </DialogTitle>
            <DialogDescription>
              Введите ваш API ключ Google Gemini для доступа к AI-помощнику. Ключ хранится только в памяти сессии и не сохраняется.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Input
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="AIzaSy..."
              className="font-mono text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveApiKey();
              }}
            />
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Модель</label>
              <Select value={chatModel} onValueChange={setChatModel}>
                <SelectTrigger className="h-9 flex-1 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gemini-2.0-flash">gemini-2.0-flash</SelectItem>
                  <SelectItem value="gemini-2.5-flash-preview-05-20">gemini-2.5-flash</SelectItem>
                  <SelectItem value="gemini-2.5-pro-preview-05-06">gemini-2.5-pro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApiKeyDialogOpen(false)}>
              Отмена
            </Button>
            <Button
              onClick={handleSaveApiKey}
              disabled={!apiKeyInput.trim()}
              className="bg-[var(--tracker-accent)] text-white hover:bg-[var(--tracker-accent-hover)]"
            >
              <Check className="size-4 mr-1.5" />
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <Button
          variant="outline"
          size="sm"
          className={`gap-1.5 h-8 ${includeData ? "border-[var(--tracker-accent)] bg-[var(--tracker-accent-soft)] text-[var(--tracker-accent-fg)]" : ""}`}
          onClick={() => setIncludeData((d) => !d)}
        >
          <MessageSquare className="size-3.5" />
          {includeData ? "Данные: ВКЛ" : "Данные: ВЫКЛ"}
          {includeData && taskCount > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs bg-[var(--tracker-accent)]/20 text-[var(--tracker-accent-fg)]">
              {taskCount}
            </Badge>
          )}
        </Button>

        {includeData && (
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1">
            <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">
              ⇄ Сравнить с:
            </span>
            <Select
              value={String(compareMonth)}
              onValueChange={(v) => {
                setCompareMonth(Number(v));
                setLog([]);
              }}
            >
              <SelectTrigger className="h-7 w-auto text-xs">
                <SelectValue placeholder="— нет —" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="-1">— нет —</SelectItem>
                {MONTHS.map((m, i) => (
                  <SelectItem key={i} value={String(i)} disabled={i === month}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isComparing && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => {
                  setCompareMonth(-1);
                  setLog([]);
                }}
              >
                <X className="size-3" />
              </Button>
            )}
          </div>
        )}

        {/* Settings key button */}
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 h-8 ml-auto"
          onClick={() => setApiKeyDialogOpen(true)}
        >
          <KeyRound className="size-3.5" />
          API ключ
        </Button>

        {log.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 h-8 text-muted-foreground"
            onClick={() => setLog([])}
          >
            <Trash2 className="size-3.5" />
            Очистить
          </Button>
        )}
      </div>

      {/* Context info banner */}
      {includeData && (taskCount > 0 || isComparing) && (
        <div
          className={`rounded-lg px-4 py-2 text-xs leading-relaxed shrink-0 ${
            isComparing
              ? "bg-[var(--tracker-accent-soft)] border border-[var(--tracker-accent)]/40 text-[var(--tracker-accent-fg)]"
              : "bg-muted/60 text-muted-foreground"
          }`}
        >
          {isComparing ? (
            <>
              ⇄ Режим сравнения:{" "}
              <b>{MONTHS[month]}</b> vs <b>{MONTHS[compareMonth]}</b>.
              Спросите: «Сравни загрузку», «Что изменилось?»
            </>
          ) : (
            <>
              📋 AI видит данные <b>{MONTHS[month]}</b>: {taskCount} задач,{" "}
              {(rows || []).filter(
                (r) => r.status === STATUSES.DONE || r.status === STATUSES.COMPLETED
              ).length}{" "}
              завершено
              {backlog && backlog.length > 0 && (
                <>, 📦 беклог: {backlog.length}</>
              )}
            </>
          )}
        </div>
      )}

      {/* Chat messages */}
      <div className="flex-1 flex flex-col gap-3 overflow-y-auto rounded-xl border border-border bg-card p-4 min-h-0">
        {!log.length && !busy && (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <div className="text-5xl mb-3">💬</div>
            <div className="text-lg font-medium mb-2">
              Чат с AI — задайте вопрос
            </div>
            {includeData && taskCount > 0 && (
              <div className="text-sm text-center max-w-md leading-relaxed">
                AI знает ваши задачи за {MONTHS[month]}. Попробуйте: «Какие задачи в зоне
                риска?», «Составь отчёт», «Что можно оптимизировать?»
              </div>
            )}
          </div>
        )}

        {log.map((m, i) => (
          <div
            key={i}
            className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
          >
            <div className="text-xs text-muted-foreground mb-1">
              {m.role === "user"
                ? "Вы"
                : m.role === "error"
                  ? "⚠ Ошибка"
                  : "✦ AI"}
            </div>
            <div
              className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words max-w-[75%] ${
                m.role === "user"
                  ? "rounded-tr-sm bg-[var(--tracker-accent-soft)] text-foreground"
                  : m.role === "error"
                    ? "rounded-tl-sm bg-destructive/10 text-destructive border border-destructive/20"
                    : "rounded-tl-sm bg-muted/50 text-foreground"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex items-center gap-2.5 px-1 py-2">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="size-2 rounded-full bg-[var(--tracker-accent)] animate-pulse"
                  style={{ animationDelay: `${i * 150}ms`, opacity: 0.4 + i * 0.2 }}
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground">
              Думает...
            </span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input area */}
      <div className="flex gap-3 shrink-0">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            includeData && taskCount > 0
              ? "Спросите о задачах..."
              : "Введите запрос..."
          }
          rows={2}
          className="flex-1 resize-none text-sm leading-relaxed"
        />
        <Button
          onClick={send}
          disabled={busy || !input.trim()}
          className={`self-stretch min-w-[120px] gap-2 ${
            busy || !input.trim()
              ? "bg-muted text-muted-foreground"
              : "bg-[var(--tracker-accent)] text-white hover:bg-[var(--tracker-accent-hover)]"
          }`}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
          Отправить
        </Button>
      </div>

      {/* Footer hint */}
      <div className="text-xs text-muted-foreground shrink-0">
        Enter — отправить · Shift+Enter — перенос
        {includeData ? " · 📊 Данные таблицы передаются AI" : ""}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Design View                                                        */
/* ------------------------------------------------------------------ */

interface DesignViewProps {
  themeId: string;
  customColor: string;
  customDark: boolean;
  accentHex: string;
  onSetTheme: (hex: string) => void;
  onSetCustomColor: (color: string, dark: boolean) => void;
  presBg: PresBgSettings;
  onSetPresBg: (bg: Partial<PresBgSettings>) => void;
  toast: ReturnType<typeof useToast>["toast"];
}

function DesignView({
  themeId,
  customColor,
  customDark,
  accentHex,
  onSetTheme,
  onSetCustomColor,
  presBg,
  onSetPresBg,
  toast,
}: DesignViewProps) {
  const [hexInput, setHexInput] = useState(accentHex);
  const [localDark, setLocalDark] = useState(customDark);
  const [colorInput, setColorInput] = useState(accentHex);
  const [emojiCat, setEmojiCat] = useState(0);

  // Sync local state when accentHex changes externally
  useEffect(() => {
    setHexInput(accentHex);
    setColorInput(accentHex);
  }, [accentHex]);

  useEffect(() => {
    setLocalDark(customDark);
  }, [customDark]);

  const isActivePreset = (hex: string) =>
    themeId === hex && !customColor;

  const handleToggleDark = (dark: boolean) => {
    setLocalDark(dark);
    const color = useTaskStore.getState().customColor || useTaskStore.getState().themeId || "#5B9BD5";
    onSetCustomColor(color, dark);
  };

  const handleSelectPreset = (hex: string) => {
    onSetTheme(hex);
    setHexInput(hex);
    setColorInput(hex);
  };

  // Only update local preview while dragging — do NOT apply theme
  const handleNativeColorInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setColorInput(val);
    setHexInput(val);
  };

  // Apply color to store only when user finishes picking (mouse up / blur)
  const commitCustomColor = (val: string) => {
    if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
      const currentDark = useTaskStore.getState().customDark;
      onSetCustomColor(val, currentDark);
    }
  };

  const handleNativeColorMouseUp = (e: React.ChangeEvent<HTMLInputElement>) => {
    commitCustomColor(e.target.value);
  };
  const handleNativeColorBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    commitCustomColor(e.target.value);
  };

  const handleHexInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setHexInput(val);
  };

  const handleHexInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    commitCustomColor(e.target.value);
  };

  const handleHexInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      commitCustomColor((e.target as HTMLInputElement).value);
      (e.target as HTMLInputElement).blur();
    }
  };

  // Derive palette colors from accent using full theme system
  const derivedColors = useMemo(() => {
    const th = createTheme(accentHex, localDark);
    return [
      { label: "Акцент", color: th.accent, textColor: "#ffffff" },
      { label: "Мягкий", color: th.accentSoft, textColor: th.accent },
      { label: "Фон", color: th.bgMain, textColor: th.textMain },
      { label: "Карточка", color: th.bgCard, textColor: th.textMain },
      { label: "Приглуш.", color: th.textMuted, textColor: th.bgMain },
      { label: "Рамка", color: th.border, textColor: th.textMain },
    ];
  }, [accentHex, localDark]);

  return (
    <>
    <div className="grid gap-6 md:grid-cols-2">
      {/* ---- Left column ---- */}
      <div className="space-y-6">
        {/* Mode Toggle */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">🌓 Режим</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Button
                variant={!localDark ? "default" : "outline"}
                size="sm"
                className="flex-1 gap-2"
                onClick={() => handleToggleDark(false)}
              >
                <span className="size-4 rounded-full border-2 border-amber-300 bg-white" />
                Светлая тема
              </Button>
              <Button
                variant={localDark ? "default" : "outline"}
                size="sm"
                className="flex-1 gap-2"
                onClick={() => handleToggleDark(true)}
              >
                <span className="size-4 rounded-full border-2 border-zinc-600 bg-zinc-900" />
                Тёмная тема
              </Button>
            </div>
            <Separator />
            <p className="text-xs text-muted-foreground">Нейтральные серые пресеты</p>
            <div className="flex gap-2">
              {NEUTRAL_COLORS.map((c) => (
                <button
                  key={c.hex}
                  title={c.label}
                  onClick={() => handleSelectPreset(c.hex)}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium border transition-all hover:scale-[1.02] ${
                    isActivePreset(c.hex)
                      ? "border-foreground ring-2 ring-foreground/20"
                      : "border-transparent hover:border-muted-foreground/30"
                  }`}
                  style={{ backgroundColor: c.hex + "18", color: c.hex }}
                >
                  <span className="size-3 rounded-full" style={{ backgroundColor: c.hex }} />
                  {c.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Color Picker */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">🎨 Свой цвет</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={colorInput}
                onInput={handleNativeColorInput}
                onChange={handleNativeColorMouseUp}
                onBlur={handleNativeColorBlur}
                className="h-10 w-14 rounded-lg border cursor-pointer bg-transparent"
              />
              <Input
                value={hexInput}
                onChange={handleHexInputChange}
                onBlur={handleHexInputBlur}
                onKeyDown={handleHexInputKeyDown}
                className="flex-1 h-10 font-mono text-sm"
                placeholder="#RRGGBB"
                maxLength={7}
              />
            </div>
          </CardContent>
        </Card>

        {/* Preset Palette */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">🎯 Палитра</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-3">
              {PALETTE_COLORS.map((c) => (
                <button
                  key={c.hex}
                  onClick={() => handleSelectPreset(c.hex)}
                  className={`group flex flex-col items-center gap-1.5 rounded-xl p-3 border-2 transition-all hover:scale-105 ${
                    isActivePreset(c.hex)
                      ? "border-foreground ring-2 ring-foreground/20 bg-muted/50"
                      : "border-transparent hover:border-muted-foreground/20 hover:bg-muted/30"
                  }`}
                >
                  <span
                    className={`size-10 rounded-lg shadow-sm transition-transform ${
                      isActivePreset(c.hex) ? "ring-2 ring-white scale-110" : ""
                    }`}
                    style={{ backgroundColor: c.hex }}
                  />
                  <span className="text-xs font-medium text-foreground/80 group-hover:text-foreground">
                    {c.label}
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {c.hex}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ---- Right column ---- */}
      <div className="space-y-6">
        {/* Theme Preview - derived colors */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">✨ Производные цвета</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              {derivedColors.map((item) => (
                <div
                  key={item.label}
                  className="flex flex-col items-center gap-2 rounded-xl p-3 border transition-all hover:scale-[1.02]"
                  style={{
                    backgroundColor: item.color,
                    color: item.textColor,
                    borderColor: (item as { border?: string }).border || "transparent",
                  }}
                >
                  <div
                    className="size-12 rounded-lg w-full"
                    style={{ backgroundColor: item.color, minHeight: 48 }}
                  />
                  <span className="text-xs font-semibold mt-1">{item.label}</span>
                  <span
                    className="text-[10px] font-mono opacity-60"
                    style={{ color: item.textColor }}
                  >
                    {typeof item.color === "string" && item.color.startsWith("rgba")
                      ? item.color
                      : item.color}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Preview Card — mini task card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">👁️ Предпросмотр</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="rounded-xl border p-4 space-y-3"
              style={{
                backgroundColor: localDark ? "#18181b" : "#ffffff",
                borderColor: localDark ? "#27272a" : "#e4e4e7",
              }}
            >
              {/* Mini task row header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: accentHex }}
                  />
                  <span
                    className="text-sm font-semibold"
                    style={{ color: localDark ? "#fafafa" : "#09090b" }}
                  >
                    Пример задачи
                  </span>
                </div>
                <span
                  className="rounded-md px-2 py-0.5 text-xs font-medium"
                  style={{
                    backgroundColor: accentHex + "20",
                    color: accentHex,
                  }}
                >
                  В работе
                </span>
              </div>

              <div className="h-px" style={{ backgroundColor: localDark ? "#27272a" : "#e4e4e7" }} />

              {/* Mini detail rows */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: localDark ? "#a1a1aa" : "#71717a" }}>План (ч)</span>
                  <span className="text-sm font-mono font-medium" style={{ color: localDark ? "#fafafa" : "#09090b" }}>24.0</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: localDark ? "#a1a1aa" : "#71717a" }}>Факт (ч)</span>
                  <span className="text-sm font-mono font-medium" style={{ color: accentHex }}>18.5</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: localDark ? "#a1a1aa" : "#71717a" }}>Приоритет</span>
                  <span
                    className="rounded-md px-2 py-0.5 text-xs font-medium"
                    style={{ backgroundColor: accentHex, color: "#ffffff" }}
                  >
                    Высокий
                  </span>
                </div>
              </div>

              {/* Mini progress bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: localDark ? "#a1a1aa" : "#71717a" }}>Прогресс</span>
                  <span className="text-xs font-mono" style={{ color: accentHex }}>77%</span>
                </div>
                <div
                  className="h-2 rounded-full overflow-hidden"
                  style={{ backgroundColor: accentHex + "20" }}
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: "77%", backgroundColor: accentHex }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>

    {/* ---- Presentation Background Settings ---- */}
    <Card className="mt-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">🎨 Фон презентации</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Emoji Picker */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Эмодзи для фона</p>
          <Input
            value={presBg.emojis}
            onChange={(e) => onSetPresBg({ emojis: e.target.value })}
            className="text-sm font-mono"
            placeholder="Вставьте эмодзи..."
          />
          {/* Category tabs */}
          <div className="flex flex-wrap gap-1">
            {EMOJI_CATS.map((cat, i) => (
              <Button
                key={cat.name}
                variant={emojiCat === i ? "default" : "outline"}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setEmojiCat(i)}
              >
                {cat.name}
              </Button>
            ))}
          </div>
          {/* Emoji items from selected category */}
          <div className="flex flex-wrap gap-1">
            {EMOJI_CATS[emojiCat].items.split(" ").filter(Boolean).map((emoji) => {
              const isSelected = presBg.emojis.includes(emoji);
              return (
                <button
                  key={emoji}
                  onClick={() => {
                    const current = presBg.emojis;
                    if (isSelected) {
                      onSetPresBg({ emojis: current.replace(emoji, "").replace(/\s+/g, " ").trim() });
                    } else {
                      onSetPresBg({ emojis: (current + " " + emoji).trim() });
                    }
                  }}
                  className={`size-8 flex items-center justify-center rounded-lg text-lg transition-all hover:scale-110 ${
                    isSelected
                      ? "bg-[var(--tracker-accent-soft)] ring-2 ring-[var(--tracker-accent)]"
                      : "bg-muted/50 hover:bg-muted"
                  }`}
                >
                  {emoji}
                </button>
              );
            })}
          </div>
        </div>

        <Separator />

        {/* Pattern Selector */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Узор фона</p>
          <div className="flex flex-wrap gap-1.5">
            {PATTERN_OPTIONS.map((p) => (
              <Button
                key={p.key}
                variant={presBg.pattern === p.key ? "default" : "outline"}
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={() => onSetPresBg({ pattern: p.key as PresBgSettings["pattern"] })}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>

        <Separator />

        {/* Sliders */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Pattern Size */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Размер узора</p>
              <span className="text-xs font-mono text-muted-foreground">{presBg.patternSize}px</span>
            </div>
            <Slider
              value={[presBg.patternSize]}
              onValueChange={([v]) => onSetPresBg({ patternSize: v })}
              min={10}
              max={100}
              step={5}
            />
          </div>

          {/* Pattern Opacity */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Прозрачность узора</p>
              <span className="text-xs font-mono text-muted-foreground">{presBg.patternOpacity}%</span>
            </div>
            <Slider
              value={[presBg.patternOpacity]}
              onValueChange={([v]) => onSetPresBg({ patternOpacity: v })}
              min={1}
              max={30}
              step={1}
            />
          </div>

          {/* Emoji Count */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Количество эмодзи</p>
              <span className="text-xs font-mono text-muted-foreground">{presBg.emojiCount}</span>
            </div>
            <Slider
              value={[presBg.emojiCount]}
              onValueChange={([v]) => onSetPresBg({ emojiCount: v })}
              min={0}
              max={60}
              step={1}
            />
          </div>

          {/* Emoji Min Size */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Мин. размер эмодзи</p>
              <span className="text-xs font-mono text-muted-foreground">{presBg.emojiMinSize}px</span>
            </div>
            <Slider
              value={[presBg.emojiMinSize]}
              onValueChange={([v]) => onSetPresBg({ emojiMinSize: v })}
              min={8}
              max={60}
              step={2}
            />
          </div>

          {/* Emoji Max Size */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Макс. размер эмодзи</p>
              <span className="text-xs font-mono text-muted-foreground">{presBg.emojiMaxSize}px</span>
            </div>
            <Slider
              value={[presBg.emojiMaxSize]}
              onValueChange={([v]) => onSetPresBg({ emojiMaxSize: v })}
              min={12}
              max={80}
              step={2}
            />
          </div>
        </div>

        {/* Live Preview */}
        <Separator />
        <div className="space-y-2">
          <p className="text-sm font-medium">Предпросмотр фона</p>
          <div
            className="relative rounded-xl border overflow-hidden"
            style={{ height: 160 }}
          >
            <SlideBgPreview presBg={presBg} accentHex={accentHex} />
          </div>
        </div>
      </CardContent>
    </Card>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Slide Background Preview (for DesignView)                           */
/* ------------------------------------------------------------------ */

function SlideBgPreview({ presBg, accentHex }: { presBg: PresBgSettings; accentHex: string }) {
  const [r, g, b] = hexToRgb(accentHex);
  const emojiStr = presBg.emojis;

  const emojis = useMemo(() => {
    if (!emojiStr || presBg.emojiCount === 0) return [];
    const list = emojiStr.split(" ").filter(Boolean);
    if (list.length === 0) return [];
    const result: { emoji: string; x: number; y: number; size: number; opacity: number; rotate: number }[] = [];
    let seed = 42;
    const rand = () => {
      seed = (seed * 16807 + 0) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < presBg.emojiCount; i++) {
      result.push({
        emoji: list[Math.floor(rand() * list.length)],
        x: rand() * 100,
        y: rand() * 100,
        size: presBg.emojiMinSize + rand() * (presBg.emojiMaxSize - presBg.emojiMinSize),
        opacity: 0.15 + rand() * 0.35,
        rotate: Math.floor(rand() * 40 - 20),
      });
    }
    return result;
  }, [emojiStr, presBg.emojiCount, presBg.emojiMinSize, presBg.emojiMaxSize]);

  const patternCSS = useMemo(() => {
    if (presBg.pattern === "none") return {};
    const sz = presBg.patternSize;
    const op = presBg.patternOpacity / 100;
    const col = `rgba(${r},${g},${b},${op})`;
    switch (presBg.pattern) {
      case "grid":
        return { backgroundImage: `linear-gradient(${col} 1px, transparent 1px), linear-gradient(90deg, ${col} 1px, transparent 1px)`, backgroundSize: `${sz}px ${sz}px` };
      case "diagonal":
        return { backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent ${sz / 2}px, ${col} ${sz / 2}px, ${col} ${sz / 2 + 1}px)`, backgroundSize: `${sz}px ${sz}px` };
      case "diamond":
        return { backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent ${sz / 2 - 1}px, ${col} ${sz / 2 - 1}px, ${col} ${sz / 2 + 1}px), repeating-linear-gradient(-45deg, transparent, transparent ${sz / 2 - 1}px, ${col} ${sz / 2 - 1}px, ${col} ${sz / 2 + 1}px)`, backgroundSize: `${sz}px ${sz}px` };
      case "waves":
        return { backgroundImage: `url("data:image/svg+xml,%3Csvg width='${sz}' height='${sz / 2}' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 ${sz / 4} Q ${sz / 4} 0 ${sz / 2} ${sz / 4} T ${sz} ${sz / 4}' fill='none' stroke='rgba(${r},${g},${b},${op})' stroke-width='1'/%3E%3C/svg%3E")`, backgroundSize: `${sz}px ${sz / 2}px` };
      case "zigzag":
        return { backgroundImage: `url("data:image/svg+xml,%3Csvg width='${sz}' height='${sz / 2}' xmlns='http://www.w3.org/2000/svg'%3E%3Cpolyline points='0,${sz / 2} ${sz / 4},0 ${sz / 2},${sz / 2} ${sz * 3 / 4},0 ${sz},${sz / 2}' fill='none' stroke='rgba(${r},${g},${b},${op})' stroke-width='1'/%3E%3C/svg%3E")`, backgroundSize: `${sz}px ${sz / 2}px` };
      default:
        return {};
    }
  }, [presBg.pattern, presBg.patternSize, presBg.patternOpacity, r, g, b]);

  return (
    <div className="absolute inset-0 overflow-hidden rounded-xl" style={{ background: `linear-gradient(135deg, rgba(${r},${g},${b},0.04) 0%, rgba(${r},${g},${b},0.01) 100%)` }}>
      {presBg.pattern !== "none" && (
        <div className="absolute inset-0" style={patternCSS} />
      )}
      {emojis.map((e, i) => (
        <span
          key={i}
          className="absolute pointer-events-none select-none"
          style={{
            left: `${e.x}%`,
            top: `${e.y}%`,
            fontSize: e.size,
            opacity: e.opacity,
            transform: `rotate(${e.rotate}deg)`,
          }}
        >
          {e.emoji}
        </span>
      ))}
    </div>
  );
}
