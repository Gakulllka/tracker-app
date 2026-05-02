"use client";

import React, {
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
  type KeyboardEvent,
} from "react";
import { useTaskStore, PresBgSettings, DEFAULT_PRES_BG, PRES_STYLE_PRESETS, undoStore } from "@/lib/store";
import {
  PresentationSlide,
  PresentationBgLayer,
  buildTheme,
  type SlideData,
  type AiConclusion,
} from "@/lib/presentation-renderer";
import { renderPresentationHtml } from "@/lib/presentation-export";
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
  getTaskMetrics,
  getRowsMetrics,
  calcQueueMap,
  buildTotalFactMap,
  evalExpr,
  fmt2,
  R2,
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

interface QuestionAnswer {
  id: string;
  author: string;
  text: string;
  date: string;
}

interface Question {
  id: string;
  text: string;
  author: string;
  answers: QuestionAnswer[];
  questionDate?: string;
  answerDate?: string;
}

// SlideData импортируется из @/lib/presentation-renderer (см. импорты сверху)

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
  accentBg: string;
  accentFgDark: string;
  bgMain: string;
  bgCard: string;
  textMain: string;
  textMuted: string;
  border: string;
  danger: string;
}

function createTheme(baseHex: string, isDark = false): ThemeColors {
  const [h, s] = hex2hsl(baseHex);
  const sat = Math.min(s, 48);
  const acSat = isDark ? Math.min(s, 65) : Math.min(s, 56);
  const hx = (sm: number, l: number) => hsl2hex(h, sat * sm, l);
  const ac = hsl2hex(h, acSat, isDark ? 68 : 58);
  return {
    accent: ac,
    accentSoft: ac + "1c",
    accentBg: hsl2hex(h, isDark ? 24 : 20, isDark ? 19 : 95.5),
    accentFgDark: hsl2hex(h, isDark ? 38 : 46, isDark ? 82 : 32),
    bgMain: hx(isDark ? 0.42 : 0.50, isDark ? 10 : 97),
    bgCard: hx(isDark ? 0.28 : 0.30, isDark ? 15 : 99.5),
    textMain: hx(isDark ? 0.15 : 0.32, isDark ? 90 : 12),
    textMuted: hx(isDark ? 0.20 : 0.26, isDark ? 44 : 52),
    border: hx(isDark ? 0.28 : 0.38, isDark ? 20 : 90),
    danger: hsl2hex(350, isDark ? 50 : 52, isDark ? 68 : 52),
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
  s.setProperty("--tracker-accent-bg", th.accentBg);
  s.setProperty("--tracker-accent-fg-dark", th.accentFgDark);
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


// ──────────────────────────────────────────────────────────────────
//  DesignView — theme picker with named themes and live preview
// ──────────────────────────────────────────────────────────────────

const NAMED_THEMES = [
  { hex: "#9B72CF", label: "Лаванда",    desc: "Мягкий фиолетовый",     emoji: "🪻" },
  { hex: "#5B9BD5", label: "Небо",       desc: "Спокойный синий",        emoji: "🌤" },
  { hex: "#4DB6AC", label: "Нефрит",     desc: "Холодная бирюза",        emoji: "🌿" },
  { hex: "#4FC3F7", label: "Океан",      desc: "Яркий голубой",          emoji: "🌊" },
  { hex: "#66BB6A", label: "Трава",      desc: "Свежий зелёный",         emoji: "🍃" },
  { hex: "#9CCC65", label: "Мята",       desc: "Светло-зелёный",         emoji: "🍀" },
  { hex: "#D4A017", label: "Янтарь",     desc: "Тёплый золотистый",      emoji: "🌟" },
  { hex: "#E8813A", label: "Закат",      desc: "Живой оранжевый",        emoji: "🌅" },
  { hex: "#E86B6B", label: "Коралл",     desc: "Тёплый красный",         emoji: "🪸" },
  { hex: "#E07BAD", label: "Пион",       desc: "Нежно-розовый",          emoji: "🌸" },
  { hex: "#7986CB", label: "Индиго",     desc: "Глубокий синий",         emoji: "💠" },
  { hex: "#C49A6C", label: "Дюна",       desc: "Тёплый бежевый",         emoji: "🏜" },
  { hex: "#6B7280", label: "Графит",     desc: "Нейтральный серый",      emoji: "🩶" },
  { hex: "#0F766E", label: "Малахит",    desc: "Насыщенный тёмно-зелёный", emoji: "💚" },
  { hex: "#7C3AED", label: "Аметист",    desc: "Глубокий фиолетовый",    emoji: "🔮" },
  { hex: "#DB2777", label: "Рубин",      desc: "Яркий малиновый",        emoji: "💎" },
];

interface DesignViewProps {
  themeId: string;
  customColor: string;
  customDark: boolean;
  accentHex: string;
  onSetTheme: (hex: string) => void;
  onSetCustomColor: (hex: string, dark: boolean) => void;
  presBg: PresBgSettings;
  onSetPresBg: (bg: Partial<PresBgSettings>) => void;
  toast: (opts: { title: string; description?: string }) => void;
}

function ThemePreview({ hex, isDark }: { hex: string; isDark: boolean }) {
  const theme = createTheme(hex, isDark);

  const previewStyle = {
    "--p-accent": theme.accent,
    "--p-accent-soft": theme.accentSoft,
    "--p-accent-bg": theme.accentBg,
    "--p-accent-fg": theme.accentFgDark,
    "--p-bg": theme.bgMain,
    "--p-card": theme.bgCard,
    "--p-text": theme.textMain,
    "--p-muted": theme.textMuted,
    "--p-border": theme.border,
    "--p-danger": theme.danger,
  } as React.CSSProperties;

  // Sample task data for preview
  const tasks = [
    { num: "35191", name: "Разработка модуля оплаты", status: "Разработка",   priority: "Высокий",   plan: 24, fact: 18, pct: 75  },
    { num: "35204", name: "Тестирование API",          status: "Тестирование", priority: "Наивысший", plan: 16, fact: 19, pct: 119 },
    { num: "35218", name: "Документация к релизу",     status: "Согласование", priority: "Средний",   plan: 8,  fact: 3,  pct: 37  },
  ];

  const statusColor: Record<string, string> = {
    "Разработка": "#7cc3fc",
    "Тестирование": "#5719a3",
    "Согласование": "#ff9400",
  };
  const priorityColor: Record<string, string> = {
    "Высокий": "#d48040",
    "Наивысший": "#d45454",
    "Средний": "#b89830",
  };

  return (
    <div
      className="rounded-2xl overflow-hidden border select-none"
      style={{
        ...previewStyle,
        background: "var(--p-bg)",
        borderColor: "var(--p-border)",
        fontSize: "11px",
        lineHeight: "1.4",
        boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
      }}
    >
      {/* Mini header */}
      <div className="flex items-center gap-2 px-3 py-2" style={{ background: "var(--p-card)", borderBottom: "1px solid var(--p-border)" }}>
        <span style={{ color: "var(--p-accent)", opacity: 0.7, fontWeight: 700 }}>✦</span>
        <span style={{ color: "var(--p-text)", fontWeight: 600 }}>Трекер задач</span>
        <div className="ml-auto flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
          <span style={{ color: "var(--p-muted)" }}>онлайн</span>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-2 px-3 py-2.5" style={{ borderBottom: "1px solid var(--p-border)" }}>
        {[
          { label: "Задач", val: "12" },
          { label: "Завершено", val: "7" },
          { label: "План, ч", val: "48" },
        ].map(kpi => (
          <div key={kpi.label} className="rounded-lg px-2 py-1.5 text-center" style={{ background: "var(--p-card)", border: "1px solid var(--p-border)" }}>
            <div style={{ color: "var(--p-muted)", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{kpi.label}</div>
            <div style={{ color: "var(--p-accent-fg)", fontWeight: 800, fontSize: "15px", lineHeight: 1.1 }}>{kpi.val}</div>
          </div>
        ))}
      </div>

      {/* Table header */}
      <div className="grid px-3 py-1.5 gap-1" style={{ gridTemplateColumns: "2fr 1.2fr 0.8fr 0.6fr 0.6fr", background: "var(--p-accent-bg)", borderBottom: "1px solid var(--p-border)" }}>
        {["Наименование", "Статус", "Приоритет", "План", "Факт"].map(h => (
          <span key={h} style={{ color: "var(--p-accent-fg)", fontWeight: 650, fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</span>
        ))}
      </div>

      {/* Table rows */}
      {tasks.map((task, i) => {
        const isOver = task.pct > 100;
        return (
          <div
            key={task.num}
            className="grid px-3 py-2 gap-1 items-center"
            style={{
              gridTemplateColumns: "2fr 1.2fr 0.8fr 0.6fr 0.6fr",
              background: i % 2 === 0 ? "var(--p-card)" : "var(--p-bg)",
              borderBottom: "1px solid var(--p-border)",
            }}
          >
            {/* Name + num */}
            <div>
              <div style={{ color: "var(--p-text)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.name}</div>
              <div style={{ color: "var(--p-muted)", fontSize: "9px" }}>#{task.num}</div>
            </div>
            {/* Status */}
            <div>
              <span
                style={{
                  display: "inline-block",
                  background: (statusColor[task.status] || "#888") + "20",
                  color: statusColor[task.status] || "var(--p-muted)",
                  borderRadius: "999px",
                  padding: "1px 6px",
                  fontSize: "9px",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  maxWidth: "100%",
                }}
              >{task.status}</span>
            </div>
            {/* Priority */}
            <span style={{ color: priorityColor[task.priority] || "var(--p-muted)", fontWeight: 600, fontSize: "10px" }}>{task.priority}</span>
            {/* Plan */}
            <span style={{ color: "var(--p-muted)", textAlign: "right" }}>{task.plan}ч</span>
            {/* Fact */}
            <div className="flex flex-col items-end gap-0.5">
              <span style={{ color: isOver ? "var(--p-danger)" : "var(--p-text)", fontWeight: isOver ? 700 : 400, textAlign: "right" }}>{task.fact}ч</span>
              <div style={{ width: "100%", height: "3px", borderRadius: "9999px", background: "var(--p-border)", overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: "9999px", width: `${Math.min(task.pct, 100)}%`, background: isOver ? "var(--p-danger)" : "var(--p-accent)" }} />
              </div>
            </div>
          </div>
        );
      })}

      {/* Color swatches row — show derived colors */}
      <div className="px-3 py-2.5 flex items-center gap-2" style={{ background: "var(--p-card)", borderTop: "1px solid var(--p-border)" }}>
        <span style={{ color: "var(--p-muted)", fontSize: "9px", letterSpacing: "0.06em", textTransform: "uppercase" }}>Палитра темы</span>
        {[
          { color: theme.accent,      tip: "Акцент" },
          { color: theme.accentBg,    tip: "Фон акцента" },
          { color: theme.accentFgDark,tip: "Текст акцента" },
          { color: theme.bgCard,      tip: "Карточка" },
          { color: theme.bgMain,      tip: "Фон" },
          { color: theme.border,      tip: "Граница" },
          { color: theme.textMain,    tip: "Текст" },
          { color: theme.danger,      tip: "Опасность" },
        ].map(({ color, tip }) => (
          <div
            key={tip}
            title={tip}
            className="w-5 h-5 rounded-full border"
            style={{ background: color, borderColor: "var(--p-border)", flexShrink: 0 }}
          />
        ))}
      </div>
    </div>
  );
}

function DesignView({ themeId, customColor, customDark, accentHex, onSetTheme, onSetCustomColor, presBg, onSetPresBg }: DesignViewProps) {
  const [customInput, setCustomInput] = useState(customColor || themeId || "#9B72CF");
  const [darkMode, setDarkMode] = useState(customDark);
  const [previewHex, setPreviewHex] = useState(accentHex);

  // Keep previewHex in sync with external changes
  useEffect(() => { setPreviewHex(accentHex); }, [accentHex]);
  useEffect(() => { setCustomInput(customColor || themeId || "#9B72CF"); }, [customColor, themeId]);
  useEffect(() => { setDarkMode(customDark); }, [customDark]);

  const activeHex = customColor || themeId;
  const isCustom = !!customColor && !NAMED_THEMES.find(t => t.hex === customColor);

  const handleSelectTheme = (hex: string) => {
    onSetTheme(hex);
    setPreviewHex(hex);
  };

  const handleCustomChange = (hex: string) => {
    setCustomInput(hex);
    setPreviewHex(hex);
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      onSetCustomColor(hex, darkMode);
    }
  };

  const handleDarkToggle = (checked: boolean) => {
    setDarkMode(checked);
    onSetCustomColor(customColor || themeId || "#9B72CF", checked);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">

      {/* ── Left: controls ──────────────────────────────────────── */}
      <div className="space-y-6">

        {/* Section: Named themes */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold" style={{ color: "var(--tracker-text-main)" }}>Тема оформления</h3>
              <p className="text-xs mt-0.5" style={{ color: "var(--tracker-text-muted)" }}>Выберите одну из готовых тем</p>
            </div>
            <div className="flex items-center gap-2 text-xs px-3 py-1 rounded-full" style={{ background: "var(--tracker-accent-bg)", color: "var(--tracker-accent-fg-dark)" }}>
              <span style={{ fontSize: "14px" }}>
                {NAMED_THEMES.find(t => t.hex === activeHex)?.emoji || "🎨"}
              </span>
              <span className="font-semibold">
                {NAMED_THEMES.find(t => t.hex === activeHex)?.label || (isCustom ? "Свой цвет" : "Тема")}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2.5">
            {NAMED_THEMES.map(theme => {
              const isActive = activeHex === theme.hex && !isCustom;
              return (
                <button
                  key={theme.hex}
                  onClick={() => handleSelectTheme(theme.hex)}
                  onMouseEnter={() => setPreviewHex(theme.hex)}
                  onMouseLeave={() => setPreviewHex(activeHex)}
                  className="group relative flex flex-col items-center gap-2 rounded-xl p-3 border-2 transition-all"
                  style={{
                    borderColor: isActive ? "var(--tracker-accent)" : "var(--tracker-border)",
                    background: isActive ? "var(--tracker-accent-bg)" : "var(--tracker-bg-card)",
                    boxShadow: isActive ? `0 0 0 3px ${theme.hex}22` : undefined,
                  }}
                >
                  {/* Color circle */}
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-base transition-transform group-hover:scale-110"
                    style={{ background: `${theme.hex}22`, boxShadow: `inset 0 0 0 2.5px ${theme.hex}` }}
                  >
                    {theme.emoji}
                  </div>
                  <div className="text-center">
                    <div className="text-xs font-semibold" style={{ color: isActive ? "var(--tracker-accent-fg-dark)" : "var(--tracker-text-main)" }}>
                      {theme.label}
                    </div>
                    <div className="text-[9px] leading-tight mt-0.5" style={{ color: "var(--tracker-text-muted)" }}>
                      {theme.desc}
                    </div>
                  </div>
                  {isActive && (
                    <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: theme.hex }}>
                      <Check className="w-2.5 h-2.5 text-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Section: Custom colour */}
        <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-bg-card)" }}>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: "var(--tracker-text-main)" }}>Свой цвет</h3>
            <p className="text-xs mt-0.5" style={{ color: "var(--tracker-text-muted)" }}>Введите любой HEX или выберите из палитры</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <input
                type="color"
                value={customInput.match(/^#[0-9A-Fa-f]{6}$/) ? customInput : "#9B72CF"}
                onChange={e => handleCustomChange(e.target.value)}
                className="w-12 h-12 rounded-xl border-2 cursor-pointer"
                style={{ borderColor: "var(--tracker-border)", padding: "2px" }}
              />
            </div>
            <div className="flex-1">
              <input
                type="text"
                value={customInput}
                onChange={e => handleCustomChange(e.target.value)}
                maxLength={7}
                placeholder="#RRGGBB"
                className="w-full h-10 rounded-lg border px-3 text-sm font-mono bg-transparent outline-none focus:ring-2"
                style={{
                  borderColor: "var(--tracker-border)",
                  color: "var(--tracker-text-main)",
                  background: "var(--tracker-bg-main)",
                }}
              />
              {isCustom && (
                <p className="text-[10px] mt-1" style={{ color: "var(--tracker-accent-fg-dark)" }}>
                  ✓ Применён свой цвет
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Section: Dark mode */}
        <div className="rounded-xl border p-4 flex items-center justify-between" style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-bg-card)" }}>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--tracker-text-main)" }}>Тёмный режим</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--tracker-text-muted)" }}>Инвертировать яркость палитры</p>
          </div>
          <Switch checked={darkMode} onCheckedChange={handleDarkToggle} />
        </div>

        {/* Section: Presentation style */}
        <div>
          <div className="mb-3">
            <h3 className="text-sm font-semibold" style={{ color: "var(--tracker-text-main)" }}>Стиль презентации</h3>
            <p className="text-xs mt-0.5" style={{ color: "var(--tracker-text-muted)" }}>Задний фон, цветовая схема и эмодзи</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {PRES_STYLE_PRESETS.map(preset => {
              const isActive = (presBg.styleId || "dark") === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => {
                    onSetPresBg({
                      styleId: preset.id,
                      emojis: preset.defaultEmojis,
                      pattern: preset.defaultPattern,
                    });
                  }}
                  className="relative flex flex-col items-center gap-1.5 rounded-xl p-3 border-2 transition-all"
                  style={{
                    borderColor: isActive ? "var(--tracker-accent)" : "var(--tracker-border)",
                    background: isActive ? "var(--tracker-accent-bg)" : "var(--tracker-bg-card)",
                    boxShadow: isActive ? `0 0 0 3px var(--tracker-accent)22` : undefined,
                  }}
                >
                  <div
                    className="w-full h-10 rounded-lg flex items-center justify-center text-lg"
                    style={{ background: preset.bodyBg }}
                  >
                    {preset.emoji}
                  </div>
                  <div className="text-center">
                    <div className="text-xs font-semibold" style={{ color: isActive ? "var(--tracker-accent-fg-dark)" : "var(--tracker-text-main)" }}>
                      {preset.label}
                    </div>
                    <div className="text-[9px] leading-tight" style={{ color: "var(--tracker-text-muted)" }}>
                      {preset.desc}
                    </div>
                  </div>
                  {isActive && (
                    <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: "var(--tracker-accent)" }}>
                      <Check className="w-2.5 h-2.5 text-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Emoji picker for presentation */}
          <div className="mt-3 rounded-xl border p-3 space-y-2" style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-bg-card)" }}>
            <p className="text-xs font-semibold" style={{ color: "var(--tracker-text-main)" }}>Эмодзи фона</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={presBg.emojis}
                onChange={e => onSetPresBg({ emojis: e.target.value })}
                className="flex-1 h-8 rounded-lg border px-2 text-sm bg-transparent outline-none"
                style={{ borderColor: "var(--tracker-border)", color: "var(--tracker-text-main)" }}
                placeholder="🚀 ✨ 💡"
              />
              <input
                type="number"
                min={0} max={40}
                value={presBg.emojiCount}
                onChange={e => onSetPresBg({ emojiCount: Number(e.target.value) })}
                className="w-16 h-8 rounded-lg border px-2 text-sm bg-transparent outline-none text-center"
                style={{ borderColor: "var(--tracker-border)", color: "var(--tracker-text-main)" }}
              />
            </div>
            <p className="text-[10px]" style={{ color: "var(--tracker-text-muted)" }}>Эмодзи через пробел · кол-во на слайде</p>
          </div>
        </div>

      </div>

      {/* ── Right: live preview ──────────────────────────────────── */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: "var(--tracker-text-main)" }}>Предпросмотр</h3>
          <p className="text-xs mt-0.5" style={{ color: "var(--tracker-text-muted)" }}>Наведите на тему чтобы увидеть</p>
        </div>
        <ThemePreview hex={previewHex} isDark={darkMode} />
      </div>

    </div>
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
    // Clear auth cookie used by middleware
    document.cookie = "auth_token=; path=/; max-age=0; SameSite=Lax";
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

function mapQuestionFromAPI(q: {
  id: string; text: string; author: string;
  answers?: Array<{ id: string; author: string; text: string; date: string }>;
  answer?: string;
  questionDate?: string; answerDate?: string;
}): Question {
  // Support both new "answers" array and legacy "answer" string
  let answers: QuestionAnswer[] = [];
  if (q.answers && Array.isArray(q.answers)) {
    answers = q.answers;
  } else if (q.answer) {
    try {
      const parsed = JSON.parse(q.answer);
      if (Array.isArray(parsed)) answers = parsed;
      else if (typeof parsed === "string" && parsed.trim()) {
        answers = [{ id: "legacy", author: "Аноним", text: parsed, date: q.questionDate || new Date().toISOString() }];
      }
    } catch {
      if (q.answer.trim()) {
        answers = [{ id: "legacy", author: "Аноним", text: q.answer, date: q.questionDate || new Date().toISOString() }];
      }
    }
  }
  return {
    id: q.id,
    text: q.text,
    author: q.author || "Аноним",
    answers,
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
  const _rawBacklog = useTaskStore((s) => s.backlog);
  const backlog = useMemo(() => _rawBacklog.filter((t) => !t._deleted), [_rawBacklog]);
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
  const [aiConclusion, setAiConclusion] = useState<{
    achievements: string[];
    risks: string[];
    inProgress: string[];
    nextSteps: string[];
  } | null>(null);
  const [aiDraft, setAiDraft] = useState<{
    achievements: string[];
    risks: string[];
    inProgress: string[];
    nextSteps: string[];
  } | null>(null);
  const [aiConclusionBusy, setAiConclusionBusy] = useState(false);

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

  /* ---- Server Sync ---- */
  // The server is the SINGLE source of truth.
  // Flow: mount → pull from server → update local state → enable push on changes.
  // Push sends clientUpdatedAt so the server can reject stale overwrites.
  // Questions are managed via /api/question & /api/answer only (not via /sync).
  const initialLoadDoneRef = useRef(false);
  const serverUpdatedAtRef = useRef<string>("");
  const lastPullAtRef = useRef(0);
  const lastLocalChangeRef = useRef(0);
  const suppressNextPushRef = useRef(false);

  const pushToServer = useCallback(async () => {
    if (isSyncingRef.current) return;
    if (!initialLoadDoneRef.current) return;
    isSyncingRef.current = true;
    try {
      const s = useTaskStore.getState();
      // Always snapshot current live data into domainData before pushing
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
        lastPullAtRef.current = Date.now(); // mark successful write time
        setLastSync(new Date());
        setIsOnline(true);
      } else {
        setIsOnline(false);
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

      if (data.updatedAt) {
        serverUpdatedAtRef.current = data.updatedAt;
      }

      // Only apply server data if it's actually newer than our last push,
      // OR if we have no local changes pending (lastLocalChangeRef is old)
      const timeSinceLocalChange = Date.now() - lastLocalChangeRef.current;
      const serverIsNewer = data.updatedAt && data.updatedAt > (serverUpdatedAtRef.current || "");
      
      if (data.domainData && Object.keys(data.domainData).length > 0) {
        // Only suppress the VERY next push that would be triggered by setDomainData
        // Don't suppress subsequent user-driven pushes
        suppressNextPushRef.current = true;
        useTaskStore.getState().setDomainData(data.domainData);
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
      // Load shared questions
      try {
        const res = await fetch("/api/question");
        if (res.ok) {
          const data = await res.json();
          if (data.questions && Array.isArray(data.questions)) {
            setQuestions(data.questions.map(mapQuestionFromAPI));
          }
        }
      } catch { /* silent */ }
      // Minimum loading screen time
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

  // Poll questions every 8 seconds
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
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  // Push to server on every local data change — debounce 400ms
  // suppressNextPushRef is set by pullFromServer to skip the echo push
  useEffect(() => {
    if (!initialLoadDoneRef.current) return;
    if (suppressNextPushRef.current) {
      suppressNextPushRef.current = false;
      return;
    }
    // Track time of last local change (for pull conflict resolution)
    lastLocalChangeRef.current = Date.now();
    const timer = setTimeout(() => {
      pushToServer();
    }, 400);
    return () => clearTimeout(timer);
  }, [allData, backlog, pushToServer]);

  // Periodic pull every 12 seconds (multi-user sync)
  useEffect(() => {
    if (!initialLoadDoneRef.current) return;
    const interval = setInterval(() => {
      // Don't pull if we just wrote (400ms push + 200ms buffer)
      if (Date.now() - lastLocalChangeRef.current > 600) {
        pullFromServer();
      }
    }, 12_000);
    return () => clearInterval(interval);
  }, [pullFromServer]);

  // Backup push every 3 minutes (safety net)
  useEffect(() => {
    if (!initialLoadDoneRef.current) return;
    const interval = setInterval(() => {
      pushToServer();
    }, 180_000);
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
    const authorName = authData.user.displayName || authData.user.username || "Аноним";

    // Push to server first
    try {
      const res = await fetch("/api/question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: newQuestionText.trim(), author: authorName }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.question) {
          const q = data.question;
          setQuestions((prev) => [...prev, mapQuestionFromAPI(q)]);
        }
      }
    } catch { /* silent — fallback to local only */ }

    setNewQuestionText("");
    setNewQuestionAuthor("");
  }, [newQuestionText, newQuestionAuthor]);

  const addQuestionDirect = useCallback(async (text: string, author: string) => {
    if (!text.trim()) return;
    try {
      const res = await fetch("/api/question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text.trim(), author: author || "AI-ассистент" }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.question) {
          const q = data.question;
          setQuestions(prev => [...prev, mapQuestionFromAPI(q)]);
        }
      }
    } catch { /* silent */ }
  }, []);

  const removeQuestion = useCallback(async (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
    try {
      await fetch(`/api/question?id=${id}`, { method: "DELETE" });
    } catch { /* silent */ }
  }, []);

  const answerQuestion = useCallback(async (questionId: string, answerText: string, authorName: string) => {
    // Push to server
    try {
      const res = await fetch("/api/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, answer: answerText, author: authorName }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.answers) {
          setQuestions(prev => prev.map(q =>
            q.id === questionId ? { ...q, answers: data.answers, answerDate: new Date().toISOString() } : q
          ));
          return;
        }
      }
    } catch { /* silent */ }
    // Optimistic fallback
    const newEntry: QuestionAnswer = {
      id: crypto.randomUUID(),
      author: authorName,
      text: answerText,
      date: new Date().toISOString(),
    };
    setQuestions(prev => prev.map(q =>
      q.id === questionId ? { ...q, answers: [...(q.answers || []), newEntry], answerDate: new Date().toISOString() } : q
    ));
  }, []);

  const deleteAnswer = useCallback(async (questionId: string, answerId: string) => {
    try {
      await fetch(`/api/answer?questionId=${questionId}&answerId=${answerId}`, { method: "DELETE" });
    } catch { /* silent */ }
    setQuestions(prev => prev.map(q =>
      q.id === questionId ? { ...q, answers: (q.answers || []).filter(a => a.id !== answerId) } : q
    ));
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
    const html = renderPresentationHtml(slides, presBg, aiConclusion);
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
  }, [slides, currentMonth, toast, presBg, aiConclusion]);

  const handleAiAnalysis = useCallback(async () => {
    const apiKey = apiKeyRef.current;
    if (!apiKey) {
      setApiKeyDialogOpen(true);
      return;
    }
    const rows = (allData[currentMonth] || []).filter(r => r.name || r.num);
    if (rows.length === 0) return;
    setAiConclusionBusy(true);
    try {
      const summary = rows.map(r =>
        `#${r.num} "${r.name}" — статус: ${r.status}, план: ${r.planH||"—"}ч, факт: ${r.factH||"—"}ч`
      ).join("\n");
      const prompt = `Ты аналитик проекта. На основе списка задач за ${MONTHS[currentMonth]} напиши краткие выводы на русском языке. Ответь строго в формате JSON без пояснений:
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
      toast({ title: "Ошибка AI анализа", description: err instanceof Error ? err.message : "Неизвестная ошибка", variant: "destructive" });
    } finally {
      setAiConclusionBusy(false);
    }
  }, [allData, currentMonth, apiKeyRef, chatModel, setApiKeyDialogOpen, toast]);

  /* ---- Transfer ---- */
  const handleApproveDraft = useCallback(() => {
    if (!aiDraft) return;
    setAiConclusion(aiDraft);
    setAiDraft(null);
    toast({ title: "✅ AI анализ применён", description: "Тезисы добавлены в слайд «Итоги»" });
  }, [aiDraft, toast]);

  const handleDiscardDraft = useCallback(() => {
    setAiDraft(null);
  }, []);

  const handleRemoveConclusion = useCallback(() => {
    setAiConclusion(null);
  }, []);

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
      <header className="sticky top-0 z-30 backdrop-blur-md supports-[backdrop-filter]:bg-[var(--tracker-bg-card)]/90 bg-[var(--tracker-bg-card)]" style={{ borderBottom: "1px solid var(--tracker-border)", boxShadow: "0 1px 0 0 var(--tracker-border)" }}>
        <div className="flex h-12 md:h-14 items-center justify-between px-3 md:px-4 gap-2 md:gap-3">
          <h1 className="text-base md:text-xl font-bold tracking-tight whitespace-nowrap flex items-center gap-1.5 md:gap-2">
            <span style={{ color: "var(--tracker-accent)", opacity: 0.6 }}>✦</span>
            <span style={{ color: "var(--tracker-text-main)" }}>Трекер задач</span>
          </h1>

          {/* Sync status */}
          <div className="flex items-center gap-1.5 ml-2" title={isOnline ? (lastSync ? `Синхронизировано: ${lastSync.toLocaleTimeString("ru-RU")}` : "Подключение...") : "Нет подключения"}>
            <div className={`size-2 rounded-full ${isOnline ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
            <span className="text-xs text-[var(--tracker-text-muted)] hidden md:inline">{isOnline ? "Онлайн" : "Оффлайн"}</span>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* User info + Logout */}
          <div className="flex items-center gap-2">
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

          <div className="flex items-center gap-1.5">
            {/* Save/Load dropdown */}
            <span className="header-file-btn contents"><DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 border-[var(--tracker-border)] bg-transparent text-[var(--tracker-text-main)] hover:bg-[var(--tracker-accent-bg)] hover:text-[var(--tracker-accent-fg-dark)]">
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
            </DropdownMenu></span>

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

            <Separator
              orientation="vertical"
              className="header-separator mx-1 h-6 bg-[var(--tracker-border)] hidden sm:block"
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
      <main className="flex-1 w-full px-3 md:px-4 py-3 md:py-4 pb-20 md:pb-4 space-y-3 md:space-y-4">
        {/* ---- NAVIGATION TABS ---- */}
        <nav className="hidden md:flex gap-1 rounded-lg bg-muted/60 p-1">
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
                  <span className="sm:hidden text-[11px] font-semibold">{MONTHS_SHORT[i]}</span>
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
            inputEditRef={inputEditRef}
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
            setCommentArchiveDialog={setCommentArchiveDialog}
            isDark={customDark}
          />
        )}

        {view === "dashboard" && (
          <DashboardView
            data={dashboardData}
            monthBudget={monthBudget[currentMonth]}
            onBudgetChange={(v) => setMonthBudget(currentMonth, v)}
            currentMonth={currentMonth}
            backlogCount={(backlog || []).length}
            isDark={customDark}
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
            onExportHTML={handleExportSlidesHTML}
            onCreateNew={handleCreatePresentation}
            hasData={(allData[currentMonth] || []).some((r) => r.name || r.num)}
            onAiAnalysis={handleAiAnalysis}
            aiAnalysisBusy={aiConclusionBusy}
            aiDraft={aiDraft}
            aiConclusion={aiConclusion}
            onSetAiDraft={setAiDraft}
            onApproveDraft={handleApproveDraft}
            onDiscardDraft={handleDiscardDraft}
            onRemoveConclusion={handleRemoveConclusion}
            onSetAiConclusion={setAiConclusion}
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
            <DialogDescription>История комментариев и статусов задачи по неделям</DialogDescription>
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
  inputEditRef: React.RefObject<HTMLInputElement | null>;
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
  inputEditRef,
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
            className="hidden md:inline-flex h-8 gap-1.5 border-[var(--tracker-accent)]/30 text-[var(--tracker-accent-fg)] hover:bg-[var(--tracker-accent-soft)]"
            onClick={onOpenTransfer}
          >
            <ArrowRight className="size-3.5" />
            Перенести
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="hidden md:inline-flex h-8 gap-1.5 border-[var(--tracker-accent)]/30 bg-[var(--tracker-accent)]/6 text-[var(--tracker-accent-fg)] hover:bg-[var(--tracker-accent)]/14 hover:border-[var(--tracker-accent)]/50"
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
                  <span className="mobile-task-num">#{task.num || "—"}</span>
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
            onClick={() => addTask(month)}
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
      <Card className="hidden md:block max-h-[70vh] overflow-auto py-0">
        <Table className="border-collapse sticky-table-header">
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
              <TableRow className="font-semibold bg-[var(--tracker-accent-bg)] border-t-[1.5px] border-[var(--tracker-border)]">
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

function BacklogView({
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
                        onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === "Escape") stopEdit(); }}
                      />
                    ) : (
                      <span
                        onClick={() => startEdit(task.id, "name")}
                        className="cursor-pointer block text-sm rounded px-1 py-0.5 hover:bg-muted/50 overflow-hidden text-ellipsis whitespace-nowrap"
                        title={task.name}
                      >
                        {task.name || <span className="italic text-muted-foreground opacity-50">введите название...</span>}
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
                          onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === "Escape") { handleCommentSave(task, task.comment); } }}
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
                  <SelectTrigger className="h-9 text-sm w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {statusValues.map((s) => (
                      <SelectItem key={s} value={s} className="text-sm">{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Отмена</Button>
            <Button onClick={handleReturnToTable} className="bg-[var(--tracker-accent)] text-white hover:bg-[var(--tracker-accent-hover)]">
              <Check className="size-4 mr-1.5" />
              Перенести в таблицу
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ================================================================ */
/*  DASHBOARD VIEW                                                   */
/* ================================================================ */

/* ================================================================ */
/*  DASHBOARD VIEW — REDESIGNED                                      */
/* ================================================================ */

interface DashboardViewProps {
  data: {
    total: number;
    completed: number;
    planH: number;
    factH: number;
    statusCounts: Record<string, number>;
    priorityCounts: Record<string, number>;
    atRisk: Task[];
    monthlyFact: number[];
    monthlyPlan: number[];
    monthlyTotal: number[];
    monthlyCompleted: number[];
    topTasks: Task[];
  };
  monthBudget: string;
  onBudgetChange: (v: string) => void;
  currentMonth: number;
  backlogCount: number;
  isDark: boolean;
}

/* Radial progress ring */
function RadialProgress({ pct, size = 44, stroke = 4, color }: { pct: number; size?: number; stroke?: number; color: string }) {
  const r2 = (size - stroke) / 2;
  const circ = 2 * Math.PI * r2;
  const dash = Math.min(pct / 100, 1) * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r2} fill="none" stroke={color + "22"} strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r2} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash.toFixed(1)} ${circ.toFixed(1)}`} strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.7s ease" }} />
    </svg>
  );
}

/* Single horizontal status bar */
function StatusBar({ statusCounts, total }: { statusCounts: Record<string, number>; total: number }) {
  if (total === 0) return <div className="h-2 rounded-full" style={{ background: "var(--tracker-border)" }} />;
  const ordered = Object.values(STATUSES).filter(s => (statusCounts[s] || 0) > 0);
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full gap-px">
      {ordered.map(s => {
        const pct = ((statusCounts[s] || 0) / total) * 100;
        return (
          <div key={s} title={`${s}: ${statusCounts[s]}`} className="h-full transition-all duration-500"
            style={{ width: `${pct}%`, background: SCOL[s] || "#ccc", minWidth: pct > 0 ? "3px" : undefined }} />
        );
      })}
    </div>
  );
}

/* Delta badge */
function DeltaBadge({ pct }: { pct: number }) {
  const good = pct >= 80;
  const warn = pct >= 50 && pct < 80;
  const color = good ? "#0F6E56" : warn ? "#854F0B" : "#A32D2D";
  const bg    = good ? "#E1F5EE"  : warn ? "#FAEEDA"  : "#FCEBEB";
  return (
    <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full tabular-nums"
      style={{ background: bg, color }}>
      {pct}%
    </span>
  );
}

/* Inline sparkline — pure SVG, no deps */
function MiniSparkline({ values, color, height = 40 }: { values: number[]; color: string; height?: number }) {
  const nonZero = values.filter(v => v > 0);
  if (!nonZero.length) return null;
  const max = Math.max(...values, 1);
  const W = 200, H = height;
  const pts = values.map((v, i) => [
    (i / Math.max(values.length - 1, 1)) * W,
    H - (v / max) * (H - 6),
  ] as [number, number]);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height, overflow: "visible" }}>
      <path d={area} fill={color} opacity={0.1} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={3.5} fill={color} stroke="white" strokeWidth={1.5} />
    </svg>
  );
}

function DashboardView({ data, monthBudget, onBudgetChange, currentMonth, backlogCount }: DashboardViewProps) {
  const budget = evalExpr(monthBudget);
  const budgetH = isNaN(budget) || budget <= 0 ? 0 : budget;
  const completionRate = data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0;
  const planExec = data.planH > 0 ? Math.round((data.factH / data.planH) * 100) : 0;
  const budgetUsed = budgetH > 0 ? Math.round((data.factH / budgetH) * 100) : 0;
  const isOverBudget = budgetUsed > 100;
  const budgetFree = budgetH > 0 ? R2(budgetH - data.factH) : 0;

  const accentDark = "var(--tracker-accent-fg-dark)";
  const monthName = MONTHS[currentMonth];
  const yearTotalFact = R2(data.monthlyFact.reduce((a, b) => a + b, 0));
  const yearPeakFact  = R2(Math.max(...data.monthlyFact));

  const completionColor = completionRate >= 80 ? "#1D9E75" : completionRate >= 50 ? "#BA7517" : "#E24B4A";
  const planColor = planExec > 110 ? "#E24B4A" : planExec >= 90 ? "#1D9E75" : "var(--tracker-accent)";
  const budgetColor = isOverBudget ? "#E24B4A" : budgetUsed >= 85 ? "#BA7517" : "#1D9E75";

  const MONTHS_SHORT = ["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"];

  return (
    <div className="space-y-3">

      {/* ── HEADER ── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight" style={{ color: accentDark }}>{monthName}</h2>
          <p className="text-xs mt-1" style={{ color: "var(--tracker-text-muted)" }}>
            {data.total} задач · {data.completed} завершено
            {data.atRisk.length > 0 && (
              <> · <span style={{ color: "#E24B4A", fontWeight: 600 }}>⚠ {data.atRisk.length} в риске</span></>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <label className="text-xs" style={{ color: "var(--tracker-text-muted)" }}>Бюджет ч/мес:</label>
          <input type="text" value={monthBudget} onChange={e => onBudgetChange(e.target.value)}
            placeholder="160"
            className="h-8 w-20 text-center text-sm rounded-lg border bg-transparent outline-none"
            style={{ borderColor: "var(--tracker-border)", color: "var(--tracker-text-main)" }} />
          {budgetH > 0 && (
            <span className="text-xs font-medium px-2.5 py-1 rounded-full"
              style={{ background: "var(--tracker-accent-bg)", color: accentDark }}>
              {fmt2(budgetH)} ч
            </span>
          )}
        </div>
      </div>

      {/* ── ALERT BANNER ── */}
      {data.atRisk.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm"
          style={{ background: "rgba(226,75,74,0.07)", border: "1px solid rgba(226,75,74,0.2)", color: "#A32D2D" }}>
          <span className="text-base shrink-0">⚠</span>
          <span className="flex-1 text-xs">
            {data.atRisk.length} {data.atRisk.length === 1 ? "задача превышает" : "задачи превышают"} плановые часы
          </span>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0"
            style={{ background: "#E24B4A", color: "#fff" }}>
            {data.atRisk.length} в риске
          </span>
        </div>
      )}

      {/* ── KPI CARDS ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {/* Completion */}
        <div className="dash-kpi-card relative overflow-hidden" style={{ borderColor: completionColor + "30" }}>
          <div className="absolute top-3 right-3">
            <RadialProgress pct={completionRate} size={44} stroke={4} color={completionColor} />
          </div>
          <p className="dash-kpi-label">Выполнение</p>
          <p className="dash-kpi-value mt-1" style={{ color: completionColor }}>{completionRate}%</p>
          <p className="text-[11px] mt-1.5" style={{ color: "var(--tracker-text-muted)" }}>{data.completed} из {data.total} задач</p>
          <div className="mt-2.5 h-1 rounded-full overflow-hidden" style={{ background: "var(--tracker-border)" }}>
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${Math.min(completionRate, 100)}%`, background: completionColor }} />
          </div>
        </div>
        {/* Fact / Plan */}
        <div className="dash-kpi-card" style={{ borderColor: "var(--tracker-accent)" + "30" }}>
          <p className="dash-kpi-label">Факт / План</p>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="dash-kpi-value" style={{ color: accentDark }}>{fmt2(data.factH)}</span>
            <span className="text-sm" style={{ color: "var(--tracker-text-muted)" }}>/ {fmt2(data.planH)} ч</span>
          </div>
          <div className="mt-2.5 h-1 rounded-full overflow-hidden" style={{ background: "var(--tracker-border)" }}>
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${Math.min(planExec, 100)}%`, background: planColor }} />
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <DeltaBadge pct={planExec} />
            <span className="text-[11px]" style={{ color: "var(--tracker-text-muted)" }}>от плана</span>
          </div>
        </div>
        {/* Budget */}
        <div className="dash-kpi-card" style={{ borderColor: budgetColor + "30" }}>
          <p className="dash-kpi-label">Бюджет</p>
          {budgetH > 0 ? (
            <>
              <p className="dash-kpi-value mt-1" style={{ color: budgetColor }}>{budgetUsed}%</p>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--tracker-text-muted)" }}>{fmt2(data.factH)} / {fmt2(budgetH)} ч</p>
              <div className="mt-2.5 h-1 rounded-full overflow-hidden" style={{ background: "var(--tracker-border)" }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(budgetUsed, 100)}%`, background: budgetColor }} />
              </div>
              <p className="text-[11px] mt-1.5" style={{ color: budgetColor }}>
                {isOverBudget ? `+${fmt2(R2(data.factH - budgetH))} ч перебор` : `${fmt2(budgetFree)} ч свободно`}
              </p>
            </>
          ) : (
            <>
              <p className="dash-kpi-value mt-1" style={{ color: "var(--tracker-text-muted)" }}>—</p>
              <p className="text-[11px] mt-1.5" style={{ color: "var(--tracker-text-muted)" }}>Введите бюджет</p>
            </>
          )}
        </div>
        {/* Backlog */}
        <div className="dash-kpi-card">
          <p className="dash-kpi-label">Беклог</p>
          <p className="dash-kpi-value mt-1" style={{ color: accentDark }}>{backlogCount}</p>
          <p className="text-[11px] mt-1.5" style={{ color: "var(--tracker-text-muted)" }}>
            {data.atRisk.length > 0
              ? <span style={{ color: "#E24B4A" }}>⚠ {data.atRisk.length} в риске</span>
              : "задач в очереди"}
          </p>
          <div className="mt-2.5 h-1 rounded-full overflow-hidden" style={{ background: "var(--tracker-border)" }}>
            <div className="h-full rounded-full"
              style={{ width: `${Math.min(backlogCount * 7, 100)}%`, background: "var(--tracker-accent)" }} />
          </div>
        </div>
      </div>

      {/* ── STATUS + SPARKLINE ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        <div className="dash-section">
          <p className="dash-section-title">Статусы задач</p>
          <div className="mt-2.5">
            <StatusBar statusCounts={data.statusCounts} total={data.total} />
          </div>
          <div className="mt-3 space-y-2">
            {Object.values(STATUSES)
              .filter(s => (data.statusCounts[s] || 0) > 0)
              .sort((a, b) => (data.statusCounts[b] || 0) - (data.statusCounts[a] || 0))
              .slice(0, 7)
              .map(s => {
                const count = data.statusCounts[s] || 0;
                const pct = data.total > 0 ? Math.round((count / data.total) * 100) : 0;
                return (
                  <div key={s} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: SCOL[s] || "#ccc" }} />
                    <span className="text-xs flex-1 truncate" style={{ color: "var(--tracker-text-main)" }}>{s}</span>
                    <div className="w-16 h-1 rounded-full overflow-hidden shrink-0" style={{ background: "var(--tracker-border)" }}>
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: SCOL[s] || "#ccc" }} />
                    </div>
                    <span className="text-[11px] w-5 text-right font-medium tabular-nums" style={{ color: "var(--tracker-text-muted)" }}>{count}</span>
                  </div>
                );
              })}
          </div>
        </div>
        <div className="dash-section">
          <p className="dash-section-title">Динамика факт-часов</p>
          <div className="mt-2.5">
            <MiniSparkline values={data.monthlyFact} color="var(--tracker-accent)" height={52} />
          </div>
          <div className="flex justify-between mt-1 px-0.5">
            {MONTHS_SHORT.map((m, i) => (
              <span key={m} className="text-[9px] tabular-nums"
                style={{ color: i === currentMonth ? "var(--tracker-accent-fg-dark)" : "var(--tracker-text-muted)",
                  fontWeight: i === currentMonth ? 700 : 400 }}>
                {m}
              </span>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              { label: "Текущий", val: fmt2(data.factH) + " ч" },
              { label: "Пик за год", val: fmt2(yearPeakFact) + " ч" },
              { label: "Итого за год", val: fmt2(yearTotalFact) + " ч" },
            ].map(item => (
              <div key={item.label} className="rounded-lg px-2.5 py-2 text-center" style={{ background: "var(--tracker-accent-bg)" }}>
                <p className="text-[9px] uppercase tracking-wide" style={{ color: "var(--tracker-text-muted)" }}>{item.label}</p>
                <p className="text-sm font-semibold mt-0.5" style={{ color: "var(--tracker-accent-fg-dark)" }}>{item.val}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── ANNUAL CHART ── */}
      <div className="dash-section">
        <div className="flex items-center justify-between mb-2">
          <p className="dash-section-title">Годовая динамика</p>
          <div className="flex items-center gap-4 text-[11px]" style={{ color: "var(--tracker-text-muted)" }}>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-[2px] rounded" style={{ background: "var(--tracker-accent)" }} />Факт
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-[2px] rounded opacity-50" style={{ background: "var(--tracker-accent)" }} />План
            </span>
          </div>
        </div>
        {(() => {
          const maxH = Math.max(...data.monthlyFact, ...data.monthlyPlan, 1);
          const maxT = Math.max(...data.monthlyTotal, 1);
          const W = 700, H = 80, cols = 12;
          const colW = W / cols;
          const barW = colW * 0.4;
          const factPts = data.monthlyFact.map((v, i) => [i * colW + colW / 2, H - (v / maxH) * (H - 4)] as [number, number]);
          const planPts = data.monthlyPlan.map((v, i) => [i * colW + colW / 2, H - (v / maxH) * (H - 4)] as [number, number]);
          const factLine = factPts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
          const planLine = planPts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
          return (
            <svg viewBox={`0 0 ${W} ${H + 18}`} style={{ width: "100%", height: "auto", overflow: "visible" }}>
              {data.monthlyTotal.map((t, i) => {
                if (t === 0) return null;
                const bH = (t / maxT) * (H - 4);
                return <rect key={i} x={i * colW + colW / 2 - barW / 2} y={H - bH} width={barW} height={bH} rx="2"
                  fill={i === currentMonth ? "rgba(29,158,117,0.3)" : "rgba(29,158,117,0.12)"} />;
              })}
              <path d={planLine} fill="none" stroke="var(--tracker-accent)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.4" />
              <path d={factLine} fill="none" stroke="var(--tracker-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              {factPts.map((p, i) => (
                data.monthlyFact[i] > 0 && (
                  <circle key={i} cx={p[0]} cy={p[1]} r={i === currentMonth ? 4 : 2}
                    fill="var(--tracker-accent)" stroke="white" strokeWidth="1.5"
                    opacity={i === currentMonth ? 1 : 0.7} />
                )
              ))}
              {MONTHS_SHORT.map((m, i) => (
                <text key={i} x={i * colW + colW / 2} y={H + 14} textAnchor="middle" fontSize="9"
                  fill={i === currentMonth ? "var(--tracker-accent-fg-dark)" : "var(--tracker-text-muted)"}
                  fontWeight={i === currentMonth ? "700" : "400"}>
                  {m}
                </text>
              ))}
            </svg>
          );
        })()}
      </div>

      {/* ── PRIORITIES + TOP TASKS ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        <div className="dash-section">
          <p className="dash-section-title">Приоритеты</p>
          <div className="mt-3 space-y-2.5">
            {Object.values(PRIORITIES)
              .filter(p => (data.priorityCounts[p] || 0) > 0)
              .map(p => {
                const count = data.priorityCounts[p] || 0;
                const pct = data.total > 0 ? (count / data.total) * 100 : 0;
                const color = PCOL[p as Priority];
                return (
                  <div key={p} className="flex items-center gap-2.5">
                    <span className="text-xs w-24 shrink-0 truncate" style={{ color }}>{p}</span>
                    <div className="flex-1 h-[5px] rounded-full overflow-hidden" style={{ background: "var(--tracker-border)" }}>
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color + "cc" }} />
                    </div>
                    <span className="text-xs w-4 text-right font-semibold tabular-nums shrink-0" style={{ color }}>{count}</span>
                  </div>
                );
              })}
          </div>
        </div>
        <div className="dash-section">
          <p className="dash-section-title">Топ задач по часам</p>
          <div className="mt-3">
            {data.topTasks.length === 0 && (
              <p className="text-xs py-2" style={{ color: "var(--tracker-text-muted)" }}>Нет данных</p>
            )}
            {data.topTasks.map((task, i) => {
              const factVal = evalExpr(task.factH);
              const planVal = evalExpr(task.planH);
              const isOver = planVal > 0 && factVal > planVal;
              const maxFact = evalExpr(data.topTasks[0]?.factH || "0");
              const barPct = maxFact > 0 ? (factVal / maxFact) * 100 : 0;
              const barColor = isOver ? "#E24B4A" : "var(--tracker-accent)";
              return (
                <div key={task.id} className="flex items-center gap-2 py-2 border-b last:border-b-0"
                  style={{ borderColor: "var(--tracker-border)" }}>
                  <span className="text-[10px] font-semibold w-3.5 shrink-0 tabular-nums" style={{ color: "var(--tracker-text-muted)" }}>{i + 1}</span>
                  <span className="text-xs flex-1 truncate" style={{ color: "var(--tracker-text-main)" }} title={task.name}>{task.name || task.num || "—"}</span>
                  {isOver && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0" style={{ background: "#FCEBEB", color: "#A32D2D" }}>
                      +{fmt2(R2(factVal - planVal))}ч
                    </span>
                  )}
                  <div className="w-12 h-1 rounded-full overflow-hidden shrink-0" style={{ background: "var(--tracker-border)" }}>
                    <div className="h-full rounded-full" style={{ width: `${barPct}%`, background: barColor }} />
                  </div>
                  <span className="text-[11px] w-9 text-right font-medium tabular-nums shrink-0"
                    style={{ color: isOver ? "#E24B4A" : "var(--tracker-accent-fg-dark)" }}>
                    {fmt2(factVal)}ч
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── RISK ZONE ── */}
      {data.atRisk.length > 0 && (
        <div className="dash-section" style={{ borderLeftWidth: "3px", borderLeftColor: "#E24B4A", borderRadius: "14px" }}>
          <div className="flex items-center gap-2 mb-3">
            <p className="dash-section-title" style={{ color: "#A32D2D" }}>⚠ Зона риска — факт превышает план</p>
          </div>
          <div className="space-y-1.5">
            {data.atRisk.slice(0, 5).map(task => {
              const plan = evalExpr(task.planH);
              const fact = evalExpr(task.factH);
              const over = R2(fact - plan);
              const pct = Math.round((fact / plan) * 100);
              return (
                <div key={task.id} className="flex items-center gap-3 py-2 px-3 rounded-xl"
                  style={{ background: "rgba(226,75,74,0.05)", border: "1px solid rgba(226,75,74,0.15)" }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: "var(--tracker-text-main)" }}>{task.name || task.num || "—"}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--tracker-text-muted)" }}>план {fmt2(plan)} ч → факт {fmt2(fact)} ч</p>
                  </div>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                    style={{ background: "#FCEBEB", color: "#A32D2D" }}>{pct}%</span>
                  <p className="text-sm font-semibold shrink-0" style={{ color: "#E24B4A" }}>+{fmt2(over)} ч</p>
                </div>
              );
            })}
            {data.atRisk.length > 5 && (
              <p className="text-xs px-3 pt-1" style={{ color: "var(--tracker-text-muted)" }}>и ещё {data.atRisk.length - 5} задач...</p>
            )}
          </div>
        </div>
      )}

      {/* ── EMPTY STATE ── */}
      {data.total === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <span className="text-5xl mb-4">📊</span>
          <p className="text-base font-medium" style={{ color: "var(--tracker-text-main)" }}>Нет данных за этот месяц</p>
          <p className="text-sm mt-1" style={{ color: "var(--tracker-text-muted)" }}>Добавьте задачи во вкладке «Задачи»</p>
        </div>
      )}

    </div>
  );
}


/* ================================================================ */
/*  QUESTIONS VIEW                                                   */
/* ================================================================ */

interface QuestionsViewProps {
  questions: Question[];
  newQuestionText: string;
  setNewQuestionText: (v: string) => void;
  addQuestion: () => void;
  removeQuestion: (id: string) => void;
  answerQuestion: (questionId: string, answer: string, author: string) => void;
  deleteAnswer: (questionId: string, answerId: string) => void;
  currentUsername: string;
  currentMonth: number;
  addToBacklog: (task: Task) => void;
  addToTable: (month: number, task: Task) => void;
}

interface QuestionToTaskDialog {
  open: boolean;
  questionId: string;
  questionText: string;
  num: string;
  name: string;
  planH: string;
  month: number;
  priority: Priority;
  status: Status;
  target: "backlog" | "table";
}

function QuestionsView({
  questions,
  newQuestionText,
  setNewQuestionText,
  addQuestion,
  removeQuestion,
  answerQuestion,
  deleteAnswer,
  currentUsername,
  currentMonth,
  addToBacklog,
  addToTable,
}: QuestionsViewProps) {
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [answerDraft, setAnswerDraft] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [taskDialog, setTaskDialog] = useState<QuestionToTaskDialog>({
    open: false, questionId: "", questionText: "", num: "", name: "",
    planH: "", month: currentMonth, priority: PRIORITIES.MEDIUM, status: STATUSES.NEW, target: "backlog",
  });

  const openTaskDialog = useCallback((q: Question, target: "backlog" | "table") => {
    setTaskDialog({
      open: true,
      questionId: q.id,
      questionText: q.text,
      num: "",
      name: q.text.slice(0, 120),
      planH: "",
      month: currentMonth,
      priority: PRIORITIES.MEDIUM,
      status: target === "backlog" ? STATUSES.IDEA : STATUSES.NEW,
      target,
    });
  }, [currentMonth]);

  const handleCreateTask = useCallback(() => {
    if (!taskDialog.name.trim()) return;
    const task: Task = {
      id: crypto.randomUUID(),
      num: taskDialog.num,
      name: taskDialog.name,
      planH: taskDialog.planH,
      factH: "0",
      priority: taskDialog.priority,
      status: taskDialog.status,
      comment: `Создано из вопроса: ${taskDialog.questionText}`,
      commentLog: [{ date: new Date().toLocaleDateString("ru-RU"), week: "0", text: `Создано из вопроса: "${taskDialog.questionText}"`, planH: "0", factH: "0", status: taskDialog.status }],
      _ts: Date.now(),
    };
    if (taskDialog.target === "backlog") {
      addToBacklog(task);
    } else {
      addToTable(taskDialog.month, task);
    }
    setTaskDialog(d => ({ ...d, open: false }));
  }, [taskDialog, addToBacklog, addToTable]);

  const statusValues = Object.values(STATUSES);
  const priorityValues = Object.values(PRIORITIES);

  const answered = questions.filter(q => (q.answers || []).length > 0);
  const unanswered = questions.filter(q => !(q.answers || []).length);

  const fmtDate = (iso?: string) => iso
    ? new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <div className="space-y-4">

      {/* ── Create task from question dialog ──────────────────────── */}
      <Dialog open={taskDialog.open} onOpenChange={open => { if (!open) setTaskDialog(d => ({ ...d, open: false })); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>📋</span>
              {taskDialog.target === "backlog" ? "Добавить в беклог" : "Добавить в таблицу"}
            </DialogTitle>
            <DialogDescription className="text-xs line-clamp-2">
              Вопрос: «{taskDialog.questionText}»
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="grid grid-cols-[90px_1fr] gap-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">№ задачи</label>
                <Input value={taskDialog.num} onChange={e => setTaskDialog(d => ({ ...d, num: e.target.value }))} placeholder="—" className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Наименование</label>
                <Input value={taskDialog.name} onChange={e => setTaskDialog(d => ({ ...d, name: e.target.value }))} placeholder="Название задачи" className="h-9 text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">План, ч</label>
                <Input value={taskDialog.planH} onChange={e => setTaskDialog(d => ({ ...d, planH: e.target.value }))} placeholder="0" className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Приоритет</label>
                <Select value={taskDialog.priority} onValueChange={v => setTaskDialog(d => ({ ...d, priority: v as Priority }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {priorityValues.map(p => <SelectItem key={p} value={p} className="text-sm"><span style={{ color: PCOL[p] }}>{p}</span></SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {taskDialog.target === "table" && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Месяц</label>
                  <Select value={String(taskDialog.month)} onValueChange={v => setTaskDialog(d => ({ ...d, month: Number(v) }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m, i) => <SelectItem key={i} value={String(i)} className="text-sm">{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Статус</label>
                  <Select value={taskDialog.status} onValueChange={v => setTaskDialog(d => ({ ...d, status: v as Status }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {statusValues.map(s => <SelectItem key={s} value={s} className="text-sm">{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaskDialog(d => ({ ...d, open: false }))}>Отмена</Button>
            <Button
              disabled={!taskDialog.name.trim()}
              onClick={handleCreateTask}
              className="bg-[var(--tracker-accent)] text-white"
            >
              <Check className="size-4 mr-1.5" />
              {taskDialog.target === "backlog" ? "В беклог" : "В таблицу"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add question form ──────────────────────────────────────── */}
      <Card className="py-4">
        <CardContent className="px-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold" style={{ color: "var(--tracker-text-main)" }}>Новый вопрос</span>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--tracker-accent-bg)", color: "var(--tracker-accent-fg-dark)" }}>
              {currentUsername}
            </span>
          </div>
          <Textarea
            placeholder="Введите вопрос для команды..."
            value={newQuestionText}
            onChange={e => setNewQuestionText(e.target.value)}
            className="min-h-[60px] resize-none text-sm"
            onKeyDown={e => { if (e.key === "Enter" && e.ctrlKey) addQuestion(); }}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: "var(--tracker-text-muted)" }}>Ctrl+Enter — отправить</span>
            <Button
              size="sm"
              disabled={!newQuestionText.trim()}
              className="h-8 gap-1.5 bg-[var(--tracker-accent)] text-white"
              onClick={addQuestion}
            >
              <Plus className="size-3.5" />
              Задать вопрос
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Stats ─────────────────────────────────────────────────── */}
      {questions.length > 0 && (
        <div className="flex items-center gap-3 text-xs" style={{ color: "var(--tracker-text-muted)" }}>
          <span>Всего: <b style={{ color: "var(--tracker-text-main)" }}>{questions.length}</b></span>
          <span className="w-px h-3" style={{ background: "var(--tracker-border)" }} />
          <span>Открытых: <b style={{ color: "#f59e0b" }}>{unanswered.length}</b></span>
          <span className="w-px h-3" style={{ background: "var(--tracker-border)" }} />
          <span>Отвеченных: <b style={{ color: "#22c55e" }}>{answered.length}</b></span>
        </div>
      )}

      {/* ── Questions list ─────────────────────────────────────────── */}
      <div className="space-y-3">
        {questions.length === 0 && <EmptyState type="questions" />}

        {questions.map(q => {
          const answers = q.answers || [];
          const isAnswered = answers.length > 0;
          const isExpanded = expandedId === q.id;
          const isAnswering = answeringId === q.id;

          return (
            <div
              key={q.id}
              className="rounded-xl border overflow-hidden transition-shadow"
              style={{
                borderColor: isAnswered ? "var(--tracker-border)" : "color-mix(in srgb, #f59e0b 35%, var(--tracker-border))",
                background: "var(--tracker-bg-card)",
                borderLeft: isAnswered ? `3px solid #22c55e` : `3px solid #f59e0b`,
              }}
            >
              {/* Question header */}
              <div className="px-4 py-3">
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div
                    className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold mt-0.5"
                    style={{ background: "var(--tracker-accent-bg)", color: "var(--tracker-accent-fg-dark)" }}
                  >
                    {(q.author || "?")[0].toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Author + date */}
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold" style={{ color: "var(--tracker-accent-fg-dark)" }}>
                        {q.author}
                      </span>
                      {q.questionDate && (
                        <span className="text-[10px]" style={{ color: "var(--tracker-text-muted)" }}>
                          {fmtDate(q.questionDate)}
                        </span>
                      )}
                      {isAnswered
                        ? <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(34,197,94,0.12)", color: "#22c55e" }}>✓ {answers.length} {answers.length === 1 ? "ответ" : "ответа"}</span>
                        : <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(245,158,11,0.12)", color: "#f59e0b" }}>⏳ Открытый</span>
                      }
                    </div>

                    {/* Question text */}
                    <p className="text-sm leading-relaxed" style={{ color: "var(--tracker-text-main)" }}>
                      {q.text}
                    </p>

                    {/* Actions row */}
                    <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                      {/* Answer */}
                      <button
                        onClick={() => { setAnsweringId(isAnswering ? null : q.id); setAnswerDraft(""); }}
                        className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-colors hover:bg-[var(--tracker-accent-bg)]"
                        style={{ borderColor: "var(--tracker-border)", color: "var(--tracker-text-muted)" }}
                      >
                        <MessageSquare className="size-3" />
                        Ответить
                      </button>

                      {/* Show answers history */}
                      {isAnswered && (
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : q.id)}
                          className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-colors hover:bg-[var(--tracker-accent-bg)]"
                          style={{ borderColor: "var(--tracker-border)", color: "var(--tracker-text-muted)" }}
                        >
                          {isExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                          {isExpanded ? "Скрыть" : `История (${answers.length})`}
                        </button>
                      )}

                      {/* Create task dropdown */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-colors hover:bg-[var(--tracker-accent-bg)]"
                            style={{ borderColor: "var(--tracker-border)", color: "var(--tracker-text-muted)" }}
                          >
                            <Plus className="size-3" />
                            Создать задачу
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-48">
                          <DropdownMenuItem onClick={() => openTaskDialog(q, "backlog")} className="gap-2 text-sm">
                            <span>📦</span> В беклог
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openTaskDialog(q, "table")} className="gap-2 text-sm">
                            <span>📋</span> В таблицу задач
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      {/* Delete question */}
                      <button
                        onClick={() => removeQuestion(q.id)}
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors hover:bg-red-50 hover:text-red-500 ml-auto"
                        style={{ color: "var(--tracker-text-muted)" }}
                        title="Удалить вопрос"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Answer form */}
                {isAnswering && (
                  <div className="mt-3 ml-11 space-y-2">
                    <Textarea
                      placeholder={`Ответ от ${currentUsername}...`}
                      value={answerDraft}
                      onChange={e => setAnswerDraft(e.target.value)}
                      className="min-h-[70px] resize-none text-sm"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={!answerDraft.trim()}
                        className="h-7 gap-1 bg-[var(--tracker-accent)] text-white text-xs"
                        onClick={() => {
                          answerQuestion(q.id, answerDraft, currentUsername);
                          setAnsweringId(null);
                          setAnswerDraft("");
                          setExpandedId(q.id); // auto-expand after answering
                        }}
                      >
                        <Send className="size-3" />
                        Отправить ответ
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAnsweringId(null)}>
                        Отмена
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Answers history */}
              {isExpanded && answers.length > 0 && (
                <div
                  className="border-t divide-y"
                  style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-bg-main)" }}
                >
                  {answers.map((ans, ai) => (
                    <div key={ans.id} className="px-4 py-3 flex gap-3 items-start group">
                      {/* Avatar */}
                      <div
                        className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold"
                        style={{ background: "color-mix(in srgb, #22c55e 15%, var(--tracker-accent-bg))", color: "#22c55e" }}
                      >
                        {(ans.author || "?")[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold" style={{ color: "var(--tracker-text-main)" }}>
                            {ans.author}
                          </span>
                          <span className="text-[10px]" style={{ color: "var(--tracker-text-muted)" }}>
                            {fmtDate(ans.date)}
                          </span>
                          {ai === answers.length - 1 && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e" }}>
                              последний
                            </span>
                          )}
                        </div>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--tracker-text-main)" }}>
                          {ans.text}
                        </p>
                      </div>
                      {/* Delete answer */}
                      <button
                        onClick={() => deleteAnswer(q.id, ans.id)}
                        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-50 hover:text-red-500"
                        style={{ color: "var(--tracker-text-muted)" }}
                        title="Удалить ответ"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Latest answer preview (when collapsed) */}
              {isAnswered && !isExpanded && answers.length > 0 && (
                <div
                  className="px-4 py-2.5 border-t flex items-start gap-3"
                  style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-bg-main)" }}
                >
                  <div
                    className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold mt-0.5"
                    style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}
                  >
                    {(answers[answers.length - 1].author || "?")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-semibold mr-1.5" style={{ color: "#22c55e" }}>
                      {answers[answers.length - 1].author}
                    </span>
                    <span className="text-xs line-clamp-1" style={{ color: "var(--tracker-text-muted)" }}>
                      {answers[answers.length - 1].text}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


/* ================================================================ */
/*  SLIDES VIEW                                                      */
/* ================================================================ */

/* ================================================================ */
/*  SLIDES VIEW — REDESIGNED                                         */
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
  onAiAnalysis: () => void;
  aiAnalysisBusy: boolean;
  // NEW: two-stage AI flow
  aiDraft: { achievements: string[]; risks: string[]; inProgress: string[]; nextSteps: string[] } | null;
  aiConclusion: { achievements: string[]; risks: string[]; inProgress: string[]; nextSteps: string[] } | null;
  onSetAiDraft: (v: { achievements: string[]; risks: string[]; inProgress: string[]; nextSteps: string[] } | null) => void;
  onApproveDraft: () => void;
  onDiscardDraft: () => void;
  onRemoveConclusion: () => void;
  onSetAiConclusion: (v: { achievements: string[]; risks: string[]; inProgress: string[]; nextSteps: string[] } | null) => void;
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
  onAiAnalysis,
  aiAnalysisBusy,
  aiDraft,
  aiConclusion,
  onSetAiDraft,
  onApproveDraft,
  onDiscardDraft,
  onRemoveConclusion,
  onSetAiConclusion,
}: SlidesViewProps) {

  const AI_SECTION_LABELS: Record<string, string> = {
    achievements: "✅ Достижения",
    risks: "⚠️ Риски",
    inProgress: "⚙️ В процессе",
    nextSteps: "🎯 Следующие шаги",
  };

  if (slides.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <Presentation className="size-16 text-muted-foreground/30" />
        <p className="text-lg text-muted-foreground">Презентация не создана</p>
        <p className="text-sm text-muted-foreground">Перейдите в таблицу и нажмите «Презентация» для создания</p>
        <Button onClick={onCreateNew}
          className="gap-1.5 bg-[var(--tracker-accent)] text-white hover:bg-[var(--tracker-accent-hover)]"
          disabled={!hasData}>
          <Presentation className="size-4" />
          Создать презентацию
        </Button>
      </div>
    );
  }

  const slide = slides[currentSlide];
  if (!slide) return null;

  return (
    <div className="space-y-4">

      {/* ── TOOLBAR ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm"
            onClick={() => setCurrentSlide(Math.max(0, currentSlide - 1))}
            disabled={currentSlide === 0} className="gap-1.5">
            <ChevronLeft className="size-4" />Назад
          </Button>
          <span className="text-sm text-muted-foreground tabular-nums">
            {currentSlide + 1} / {slides.length}
          </span>
          <Button variant="outline" size="sm"
            onClick={() => setCurrentSlide(Math.min(slides.length - 1, currentSlide + 1))}
            disabled={currentSlide === slides.length - 1} className="gap-1.5">
            Далее<ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onAiAnalysis} disabled={aiAnalysisBusy}>
            {aiAnalysisBusy
              ? <><Loader2 className="size-3.5 animate-spin" />Анализирую...</>
              : <><Sparkles className="size-3.5" />AI анализ</>}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onExportHTML}>
            <Download className="size-3.5" />Скачать HTML
          </Button>
        </div>
      </div>

      {/* ── SLIDE DOTS ── */}
      <div className="flex gap-1.5 justify-center flex-wrap">
        {slides.map((s, i) => (
          <button key={i} onClick={() => setCurrentSlide(i)} title={s.type}
            className={`h-2 rounded-full transition-all ${
              i === currentSlide ? "w-7 bg-[var(--tracker-accent)]" : "w-2 bg-muted-foreground/25 hover:bg-muted-foreground/40"
            }`} />
        ))}
      </div>

      {/* ── SLIDE PREVIEW ── */}
      <SlidePreview slide={slide} accentHex={accentHex} presBg={presBg} aiConclusion={aiConclusion} />

      {/* ── AI DRAFT PANEL (Step 2 — editable buffer) ── */}
      {aiDraft && (
        <div className="rounded-2xl border-2 p-5 space-y-4"
          style={{ borderColor: "var(--tracker-accent)", background: "var(--tracker-accent-bg)" }}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--tracker-accent-fg-dark)" }}>
                <Sparkles className="size-4" />AI черновик
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--tracker-text-muted)" }}>
                Проверьте и отредактируйте тезисы перед добавлением в презентацию
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={onDiscardDraft}>
                <X className="size-3" />Отклонить
              </Button>
              <Button size="sm" className="h-8 gap-1.5 text-xs bg-[var(--tracker-accent)] text-white" onClick={onApproveDraft}>
                <Check className="size-3" />Применить в презентацию
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(["achievements", "risks", "inProgress", "nextSteps"] as const).map(key => (
              <div key={key} className="space-y-1.5">
                <p className="text-xs font-semibold" style={{ color: "var(--tracker-accent-fg-dark)" }}>
                  {AI_SECTION_LABELS[key]}
                </p>
                {aiDraft[key].map((item, i) => (
                  <div key={i} className="flex gap-1.5">
                    <input type="text" value={item}
                      onChange={e => {
                        const updated = [...aiDraft[key]];
                        updated[i] = e.target.value;
                        onSetAiDraft({ ...aiDraft, [key]: updated });
                      }}
                      className="flex-1 h-8 rounded-lg border px-2 text-xs bg-transparent outline-none focus:ring-1"
                      style={{ borderColor: "var(--tracker-border)", color: "var(--tracker-text-main)", background: "var(--tracker-bg-card)" }} />
                    <button onClick={() => {
                      const updated = aiDraft[key].filter((_, j) => j !== i);
                      onSetAiDraft({ ...aiDraft, [key]: updated });
                    }} className="w-7 h-8 flex items-center justify-center rounded-lg" style={{ color: "var(--tracker-text-muted)" }}>
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ))}
                <button onClick={() => onSetAiDraft({ ...aiDraft, [key]: [...aiDraft[key], ""] })}
                  className="text-xs px-2 py-1 rounded-lg border border-dashed transition-colors"
                  style={{ borderColor: "var(--tracker-border)", color: "var(--tracker-text-muted)" }}>
                  + добавить
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── APPROVED AI PANEL (Step 3 — injected) ── */}
      {aiConclusion && !aiDraft && (
        <div className="rounded-2xl border p-4 space-y-3"
          style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-bg-card)" }}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--tracker-text-main)" }}>
                <Check className="size-4 text-green-600" />AI анализ применён
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--tracker-text-muted)" }}>
                Тезисы включены в слайд «Итоги»
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs"
                onClick={() => onSetAiDraft({ ...aiConclusion })}>
                <span className="text-xs">✏️</span>Редактировать
              </Button>
              <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground"
                onClick={onRemoveConclusion}>
                Удалить
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(["achievements", "risks", "inProgress", "nextSteps"] as const).map(key => (
              <div key={key}>
                <p className="text-[10px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--tracker-text-muted)" }}>
                  {AI_SECTION_LABELS[key]}
                </p>
                <ul className="space-y-0.5">
                  {(aiConclusion[key] || []).map((item, i) => (
                    <li key={i} className="text-xs flex gap-1.5 items-start" style={{ color: "var(--tracker-text-main)" }}>
                      <span style={{ color: "var(--tracker-accent)", marginTop: "2px" }}>·</span>{item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Slide Preview Card — тонкий wrapper над единым рендером         */
/* ------------------------------------------------------------------ */
/*
 *  Phase 1 (WYSIWYG): теперь и превью, и экспорт используют ОДИН и
 *  тот же React-компонент <PresentationSlide /> из
 *  src/lib/presentation-renderer.tsx. Старые ~720 строк дублей
 *  удалены — buildSlidesHTML заменён renderPresentationHtml.
 */

function SlidePreview({
  slide,
  accentHex,
  presBg,
  aiConclusion,
}: {
  slide: SlideData;
  accentHex: string;
  presBg: PresBgSettings;
  aiConclusion?: AiConclusion | null;
}) {
  const theme = useMemo(() => buildTheme(accentHex, presBg), [accentHex, presBg]);
  const [r, g, b] = theme.rgb;

  return (
    <div
      className="mx-auto w-full max-w-[1200px] rounded-2xl border shadow-lg relative overflow-hidden"
      style={{
        background: theme.bodyBg,
        borderColor: `rgba(${r},${g},${b},.15)`,
        aspectRatio: "16 / 9",
      }}
    >
      <PresentationBgLayer theme={theme} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: "32px 48px",
          zIndex: 1,
        }}
      >
        <PresentationSlide slide={slide} theme={theme} aiConclusion={aiConclusion} />
      </div>
    </div>
  );
}

/* ================================================================ */
/*  CHAT VIEW COMPONENT                                              */
/* ================================================================ */

interface ChatMessage {
  role: "user" | "ai" | "error" | "system";
  text: string;
  timestamp?: number;
  suggestedQuestions?: string[];
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
  questions: Question[];
  addQuestion: (text: string, author: string) => void;
  isDark: boolean;
}

/* Minimal markdown renderer: bold, bullets, headers */
function AiText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1 text-sm leading-relaxed">
      {lines.map((line, i) => {
        if (line.startsWith("### ")) {
          return <p key={i} className="font-bold text-sm mt-2 mb-0.5" style={{ color: "var(--tracker-accent-fg-dark)" }}>{line.slice(4)}</p>;
        }
        if (line.startsWith("## ")) {
          return <p key={i} className="font-bold text-base mt-2" style={{ color: "var(--tracker-accent-fg-dark)" }}>{line.slice(3)}</p>;
        }
        if (line.startsWith("- ") || line.startsWith("• ")) {
          const content = line.slice(2);
          return (
            <div key={i} className="flex gap-2 items-start">
              <span className="mt-[3px] shrink-0 w-1.5 h-1.5 rounded-full inline-block" style={{ background: "var(--tracker-accent)", marginTop: "6px" }} />
              <span>{renderBold(content)}</span>
            </div>
          );
        }
        if (line.startsWith("**") && line.endsWith("**") && line.length > 4) {
          return <p key={i} className="font-semibold">{line.slice(2, -2)}</p>;
        }
        if (line === "") return <div key={i} className="h-1" />;
        return <p key={i}>{renderBold(line)}</p>;
      })}
    </div>
  );
}

function renderBold(text: string): React.ReactNode {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return parts.map((p, i) => i % 2 === 1 ? <strong key={i}>{p}</strong> : p);
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
  questions,
  addQuestion,
  isDark,
}: ChatViewProps) {
  const [input, setInput] = useState("");
  const [log, setLog] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [creatingQuestion, setCreatingQuestion] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /* Auto-scroll */
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log, busy]);

  /* ── Build rich system context ───────────────────────────────── */
  const buildContext = useCallback((): string => {
    const now = new Date();
    const lines: string[] = [];

    lines.push(`Дата: ${now.toLocaleDateString("ru-RU")}, текущий месяц трекера: ${MONTHS[month]}`);
    lines.push("");

    // All 12 months summary table
    lines.push("=== ГОД — СВОДКА ПО ВСЕМ МЕСЯЦАМ ===");
    for (let mi = 0; mi < 12; mi++) {
      const mRows = (allData[mi] || []).filter(r => !r._deleted && (r.name || r.num));
      if (!mRows.length) continue;
      const done = mRows.filter(r => r.status === STATUSES.DONE || r.status === STATUSES.COMPLETED).length;
      const planH = R2(mRows.reduce((s, r) => s + evalExpr(r.planH), 0));
      const factH = R2(mRows.reduce((s, r) => s + evalExpr(r.factH), 0));
      const overBudget = mRows.filter(r => evalExpr(r.factH) > evalExpr(r.planH) && evalExpr(r.planH) > 0).length;
      lines.push(`${MONTHS[mi]}: задач=${mRows.length} завершено=${done} план=${planH}ч факт=${factH}ч превышений=${overBudget}`);
    }
    lines.push("");

    // Current month detailed
    const curRows = (allData[month] || []).filter(r => !r._deleted && (r.name || r.num));
    lines.push(`=== ДЕТАЛИ: ${MONTHS[month].toUpperCase()} ===`);
    lines.push(`Всего задач: ${curRows.length}`);
    if (curRows.length) {
      lines.push("Список задач:");
      for (const r of curRows) {
        const plan = evalExpr(r.planH);
        const fact = evalExpr(r.factH);
        const over = plan > 0 && fact > plan ? ` ПРЕВЫШЕНИЕ+${R2(fact-plan)}ч` : "";
        lines.push(`  №${r.num||"—"} "${r.name}" | статус:${r.status} приоритет:${r.priority} план:${plan}ч факт:${fact}ч${over}${r.comment ? ` | коммент:"${r.comment}"` : ""}`);
      }
    }
    lines.push("");

    // Priority distribution
    const prioCounts: Record<string, number> = {};
    curRows.forEach(r => { prioCounts[r.priority] = (prioCounts[r.priority] || 0) + 1; });
    lines.push("Приоритеты: " + Object.entries(prioCounts).map(([p, c]) => `${p}:${c}`).join(", "));

    // Status distribution
    const statCounts: Record<string, number> = {};
    curRows.forEach(r => { statCounts[r.status] = (statCounts[r.status] || 0) + 1; });
    lines.push("Статусы: " + Object.entries(statCounts).map(([s, c]) => `${s}:${c}`).join(", "));
    lines.push("");

    // Backlog
    const bl = (backlog || []).filter(r => !r._deleted);
    if (bl.length) {
      lines.push(`=== БЕКЛОГ (${bl.length} задач) ===`);
      bl.slice(0, 15).forEach((r, i) => {
        lines.push(`  ${i+1}. №${r.num||"—"} "${r.name}" план:${evalExpr(r.planH)}ч приоритет:${r.priority}${r.comment ? ` | "${r.comment}"` : ""}`);
      });
      if (bl.length > 15) lines.push(`  ...и ещё ${bl.length - 15} задач`);
      lines.push("");
    }

    // Questions
    if (questions && questions.length) {
      lines.push(`=== ВОПРОСЫ/ПРОБЛЕМЫ (${questions.length}) ===`);
      questions.slice(0, 10).forEach((q, i) => {
        lines.push(`  ${i+1}. [${(q.answers||[]).length > 0 ? "✅ отвечен" : "⏳ открытый"}] "${q.text}" — автор: ${q.author || "аноним"}`);
        if (q.answer) lines.push(`     Ответ: "${q.answer}"`);
      });
      if (questions.length > 10) lines.push(`  ...и ещё ${questions.length - 10} вопросов`);
      lines.push("");
    }

    // At-risk tasks across all months
    const atRisk: string[] = [];
    for (let mi = 0; mi < 12; mi++) {
      const mRows = (allData[mi] || []).filter(r => !r._deleted);
      mRows.forEach(r => {
        const p = evalExpr(r.planH), f = evalExpr(r.factH);
        if (p > 0 && f > p && r.status !== STATUSES.DONE && r.status !== STATUSES.COMPLETED) {
          atRisk.push(`${MONTHS[mi]}: №${r.num||"—"} "${r.name}" план:${p}ч факт:${f}ч (+${R2(f-p)}ч)`);
        }
      });
    }
    if (atRisk.length) {
      lines.push(`=== ЗОНА РИСКА (${atRisk.length} задач по всем месяцам) ===`);
      atRisk.slice(0, 10).forEach(l => lines.push("  " + l));
      if (atRisk.length > 10) lines.push(`  ...и ещё ${atRisk.length - 10}`);
    }

    return lines.join("\n");
  }, [allData, month, backlog, questions, totalFactMap]);

  const buildSystemPrompt = useCallback((): string => {
    const ctx = buildContext();
    return `Ты — AI-ассистент менеджера проектов в трекере задач. Отвечай ТОЛЬКО на русском языке.

Твои возможности:
- Анализировать задачи любого месяца и сравнивать периоды
- Выявлять проблемы: превышение плана, накопленный беклог, незакрытые вопросы
- Давать конкретные рекомендации с цифрами из данных
- Предлагать вопросы для команды на основе анализа (формат: "Вопросы для команды: ...")
- Составлять краткие отчёты по месяцу

Правила ответов:
- Всегда опирайся на конкретные данные — числа, названия задач, статусы
- Используй **жирный** для ключевых цифр и выводов
- Структурируй длинные ответы через заголовки ### и списки -
- Если предлагаешь вопросы для команды, выдели их блоком "### Предлагаемые вопросы:"
- Будь кратким, избегай воды

--- ДАННЫЕ ТРЕКЕРА ---
${ctx}
--- /ДАННЫЕ ---`;
  }, [buildContext]);

  /* ── Parse suggested questions from AI response ─────────────── */
  const extractSuggestedQuestions = (text: string): string[] => {
    const block = text.match(/###\s*Предлагаемые вопросы[:\s]*([\s\S]*?)(?:\n###|\n---|\n\n\n|$)/i);
    if (!block) return [];
    return block[1]
      .split("\n")
      .map(l => l.replace(/^[-•\d.]\s*/, "").trim())
      .filter(l => l.length > 10 && l.length < 200)
      .slice(0, 5);
  };

  /* ── Send message ────────────────────────────────────────────── */
  const send = useCallback(async (overrideText?: string) => {
    const msg = (overrideText ?? input).trim();
    if (!msg || busy) return;
    const apiKey = apiKeyRef.current;
    if (!apiKey) { setApiKeyDialogOpen(true); return; }

    if (!overrideText) setInput("");

    const newLog: ChatMessage[] = [...log, { role: "user", text: msg, timestamp: Date.now() }];
    setLog(newLog);
    setBusy(true);

    try {
      const sysPrompt = buildSystemPrompt();

      // Build Gemini contents with full system context injected into first user message
      const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
      newLog.filter(m => m.role === "user" || m.role === "ai").forEach((m, idx) => {
        if (m.role === "user") {
          const text = idx === 0 ? sysPrompt + "\n\nПервый вопрос пользователя: " + m.text : m.text;
          contents.push({ role: "user", parts: [{ text }] });
        } else {
          contents.push({ role: "model", parts: [{ text: m.text }] });
        }
      });

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: contents, apiKey, model: chatModel }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const aiText = (data.text || "").trim();
      const suggested = extractSuggestedQuestions(aiText);
      setLog(l => [...l, { role: "ai", text: aiText, timestamp: Date.now(), suggestedQuestions: suggested }]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Неизвестная ошибка";
      setLog(l => [...l, { role: "error", text: message, timestamp: Date.now() }]);
    }
    setBusy(false);
  }, [input, busy, log, apiKeyRef, chatModel, buildSystemPrompt, setApiKeyDialogOpen]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }, [send]);

  const handleSaveApiKey = useCallback(() => {
    if (apiKeyInput.trim()) {
      apiKeyRef.current = apiKeyInput.trim();
      setApiKeyDialogOpen(false);
      setApiKeyInput("");
    }
  }, [apiKeyInput, apiKeyRef, setApiKeyDialogOpen]);

  /* ── Quick actions ───────────────────────────────────────────── */
  const quickActions = useMemo(() => {
    const curRows = (allData[month] || []).filter(r => !r._deleted && (r.name || r.num));
    const atRiskCount = curRows.filter(r => evalExpr(r.factH) > evalExpr(r.planH) && evalExpr(r.planH) > 0).length;
    const backlogCount = (backlog || []).filter(r => !r._deleted).length;
    const unansweredCount = questions.filter(q => !(q.answers || []).length).length;
    return [
      { label: "📊 Отчёт за месяц", text: `Составь краткий отчёт по задачам за ${MONTHS[month]}: выполнение, ключевые результаты, проблемы.` },
      { label: "⚠️ Зона риска" + (atRiskCount > 0 ? ` (${atRiskCount})` : ""), text: `Проанализируй задачи которые превышают план по часам в ${MONTHS[month]}. Что может быть причиной и как скорректировать?` },
      { label: "💡 Предложи вопросы для команды", text: `На основе данных трекера за ${MONTHS[month]} предложи 5 ключевых вопросов для обсуждения с командой. Оформи их в блоке "### Предлагаемые вопросы:".` },
      ...(backlogCount > 0 ? [{ label: `📦 Беклог (${backlogCount})`, text: `Проанализируй беклог. Какие задачи приоритетнее всего перенести в следующий месяц? Почему?` }] : []),
      ...(unansweredCount > 0 ? [{ label: `❓ Открытые вопросы (${unansweredCount})`, text: `Посмотри на открытые вопросы в трекере. Какие из них наиболее критичны для команды, исходя из задач?` }] : []),
      { label: "📅 Сравни два месяца", text: `Сравни ${MONTHS[month]} с предыдущим месяцем: загрузка, выполнение задач, динамика часов.` },
      { label: "🎯 Рекомендации", text: `Какие 3-5 конкретных улучшений ты бы порекомендовал на основе данных трекера?` },
    ];
  }, [allData, month, backlog, questions]);

  const taskCount = (rows || []).filter(r => r.name || r.num).length;
  const hasKey = !!apiKeyRef.current;

  return (
    <div className="flex flex-col gap-3" style={{ height: "calc(100vh - 200px)", minHeight: 500 }}>

      {/* ── API Key Dialog ──────────────────────────────────────── */}
      <Dialog open={apiKeyDialogOpen} onOpenChange={setApiKeyDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              <KeyRound className="size-5 inline mr-2 text-[var(--tracker-accent)]" />
              Gemini API ключ
            </DialogTitle>
            <DialogDescription>
              Введите ваш API ключ Google Gemini. Хранится только в памяти сессии.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <Input
              value={apiKeyInput}
              onChange={e => setApiKeyInput(e.target.value)}
              placeholder="AIzaSy..."
              className="font-mono text-sm"
              onKeyDown={e => { if (e.key === "Enter") handleSaveApiKey(); }}
              autoFocus
            />
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium whitespace-nowrap">Модель</label>
              <Select value={chatModel} onValueChange={setChatModel}>
                <SelectTrigger className="h-9 flex-1 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gemini-2.5-flash">Gemini 2.5 Flash</SelectItem>
                  <SelectItem value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</SelectItem>
                  <SelectItem value="gemini-3-flash-preview">Gemini 3 Flash</SelectItem>
                  <SelectItem value="gemini-3.1-flash-lite-preview">Gemini 3.1 Flash Lite</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Получить ключ: <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="underline" style={{ color: "var(--tracker-accent)" }}>aistudio.google.com/apikey</a>
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApiKeyDialogOpen(false)}>Отмена</Button>
            <Button onClick={handleSaveApiKey} disabled={!apiKeyInput.trim()} className="bg-[var(--tracker-accent)] text-white">
              <Check className="size-4 mr-1.5" />Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create question dialog ──────────────────────────────── */}
      <Dialog open={!!creatingQuestion} onOpenChange={open => { if (!open) setCreatingQuestion(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>❓ Создать вопрос</DialogTitle>
            <DialogDescription>Вопрос будет добавлен в список вопросов команды</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Textarea
              value={creatingQuestion || ""}
              onChange={e => setCreatingQuestion(e.target.value)}
              rows={3}
              className="text-sm resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatingQuestion(null)}>Отмена</Button>
            <Button
              onClick={() => {
                if (creatingQuestion?.trim()) {
                  addQuestion(creatingQuestion.trim(), "AI-ассистент");
                  setCreatingQuestion(null);
                }
              }}
              className="bg-[var(--tracker-accent)] text-white"
            >
              <Check className="size-4 mr-1.5" />Добавить вопрос
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 shrink-0 flex-wrap">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs" style={{ background: "var(--tracker-accent-bg)", color: "var(--tracker-accent-fg-dark)" }}>
            <span className="font-semibold">✦ AI</span>
            <span className="opacity-60">·</span>
            <span>{MONTHS[month]}</span>
            <span className="opacity-60">·</span>
            <span>{taskCount} задач</span>
            {(backlog || []).filter(r => !r._deleted).length > 0 && (
              <><span className="opacity-60">·</span><span>беклог: {(backlog || []).filter(r => !r._deleted).length}</span></>
            )}
            {questions.length > 0 && (
              <><span className="opacity-60">·</span><span>вопросы: {questions.length}</span></>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Select value={chatModel} onValueChange={setChatModel}>
            <SelectTrigger className="h-7 w-auto text-[11px] px-2 gap-1 border-[var(--tracker-border)]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gemini-2.5-flash" className="text-xs">2.5 Flash</SelectItem>
              <SelectItem value="gemini-2.5-flash-lite" className="text-xs">2.5 Flash Lite</SelectItem>
              <SelectItem value="gemini-3-flash-preview" className="text-xs">3 Flash</SelectItem>
              <SelectItem value="gemini-3.1-flash-lite-preview" className="text-xs">3.1 Flash Lite</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs px-2" onClick={() => setApiKeyDialogOpen(true)}>
            <KeyRound className="size-3" />
            {hasKey ? "Ключ ✓" : "API ключ"}
          </Button>
          {log.length > 0 && (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => setLog([])} title="Очистить чат">
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* ── Quick action chips ───────────────────────────────────── */}
      {log.length === 0 && (
        <div className="flex gap-2 flex-wrap shrink-0">
          {quickActions.map((qa, i) => (
            <button
              key={i}
              onClick={() => { if (hasKey) send(qa.text); else setApiKeyDialogOpen(true); }}
              disabled={busy}
              className="text-xs px-3 py-1.5 rounded-full border transition-colors hover:border-[var(--tracker-accent)] hover:bg-[var(--tracker-accent-bg)] disabled:opacity-50"
              style={{ borderColor: "var(--tracker-border)", color: "var(--tracker-text-main)", background: "var(--tracker-bg-card)" }}
            >
              {qa.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Messages ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col gap-3 overflow-y-auto rounded-xl border p-4 min-h-0"
        style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-bg-main)" }}>

        {/* Empty state */}
        {!log.length && !busy && (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: "var(--tracker-accent-bg)" }}>
              <span className="text-2xl">✦</span>
            </div>
            <p className="text-base font-semibold mb-1" style={{ color: "var(--tracker-text-main)" }}>
              AI-ассистент менеджера
            </p>
            <p className="text-sm max-w-sm" style={{ color: "var(--tracker-text-muted)" }}>
              {hasKey
                ? `Знаю все данные трекера. Нажмите быстрое действие или задайте свой вопрос.`
                : "Нажмите «API ключ» чтобы подключить Gemini."}
            </p>
          </div>
        )}

        {log.map((m, i) => (
          <div key={i} className={`flex flex-col gap-1 ${m.role === "user" ? "items-end" : "items-start"}`}>
            <span className="text-[10px] font-medium px-1" style={{ color: "var(--tracker-text-muted)" }}>
              {m.role === "user" ? "Вы" : m.role === "error" ? "⚠ Ошибка" : "✦ AI-ассистент"}
            </span>
            <div
              className={`rounded-2xl px-4 py-3 max-w-[85%] ${
                m.role === "user"
                  ? "rounded-tr-sm"
                  : m.role === "error"
                  ? "rounded-tl-sm border"
                  : "rounded-tl-sm"
              }`}
              style={
                m.role === "user"
                  ? { background: "var(--tracker-accent-bg)", color: "var(--tracker-text-main)", border: "1px solid var(--tracker-border)" }
                  : m.role === "error"
                  ? { background: "rgba(239,68,68,0.07)", color: "#ef4444", borderColor: "rgba(239,68,68,0.3)" }
                  : { background: "var(--tracker-bg-card)", color: "var(--tracker-text-main)", border: "1px solid var(--tracker-border)", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }
              }
            >
              {m.role === "ai" ? <AiText text={m.text} /> : (
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.text}</p>
              )}

              {/* Suggested questions buttons */}
              {m.role === "ai" && m.suggestedQuestions && m.suggestedQuestions.length > 0 && (
                <div className="mt-3 pt-3 border-t space-y-1.5" style={{ borderColor: "var(--tracker-border)" }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--tracker-text-muted)" }}>
                    Добавить в вопросы команды:
                  </p>
                  {m.suggestedQuestions.map((q, qi) => (
                    <button
                      key={qi}
                      onClick={() => setCreatingQuestion(q)}
                      className="flex items-start gap-2 w-full text-left text-xs px-3 py-2 rounded-lg border transition-colors hover:bg-[var(--tracker-accent-bg)] group"
                      style={{ borderColor: "var(--tracker-border)", color: "var(--tracker-text-main)" }}
                    >
                      <span className="shrink-0 mt-0.5" style={{ color: "var(--tracker-accent)" }}>+</span>
                      <span className="flex-1">{q}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* "Create question" button for any AI response */}
              {m.role === "ai" && (!m.suggestedQuestions || m.suggestedQuestions.length === 0) && (
                <div className="mt-2.5 flex items-center gap-2">
                  <button
                    onClick={() => setCreatingQuestion(m.text.slice(0, 200))}
                    className="text-[10px] flex items-center gap-1 transition-colors hover:opacity-80"
                    style={{ color: "var(--tracker-text-muted)" }}
                    title="Создать вопрос из этого ответа"
                  >
                    <span style={{ color: "var(--tracker-accent)" }}>+</span>
                    создать вопрос
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {busy && (
          <div className="flex items-start gap-1">
            <div className="rounded-2xl rounded-tl-sm px-4 py-3 border" style={{ background: "var(--tracker-bg-card)", borderColor: "var(--tracker-border)" }}>
              <div className="flex gap-1.5 items-center h-5">
                {[0, 1, 2].map(i => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full animate-bounce"
                    style={{ background: "var(--tracker-accent)", animationDelay: `${i * 120}ms`, opacity: 0.7 }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* ── Input ────────────────────────────────────────────────── */}
      <div className="flex gap-2 shrink-0">
        <div className="flex-1 flex items-end gap-2 rounded-xl border px-3 py-2"
          style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-bg-card)" }}>
          <Textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={hasKey ? "Спросите что угодно о задачах, беклоге, вопросах..." : "Сначала введите API ключ →"}
            rows={1}
            className="flex-1 resize-none border-0 bg-transparent p-0 text-sm focus-visible:ring-0 shadow-none"
            style={{ color: "var(--tracker-text-main)" }}
          />
          <Button
            onClick={() => send()}
            disabled={busy || !input.trim()}
            size="icon"
            className="h-8 w-8 shrink-0 rounded-lg"
            style={{
              background: busy || !input.trim() ? "var(--tracker-border)" : "var(--tracker-accent)",
              color: "#fff"
            }}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>
      </div>

      <p className="text-[10px] shrink-0 text-center" style={{ color: "var(--tracker-text-muted)" }}>
        Enter — отправить · Shift+Enter — перенос · AI видит все 12 месяцев, беклог и вопросы
      </p>
    </div>
  );
}

