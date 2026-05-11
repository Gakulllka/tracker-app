import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Task, Domain, AllData, Status, Priority, PRIORITIES, STATUSES, MONTHS, PRIO_START, STATUS_ORDER } from "./types";
import { createNewTask } from "./metrics";
import { createUndoHelpers } from "./undo";

const undoHelpers = createUndoHelpers();

function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}


function makeSystemLog(text: string): { date: string; week: string; text: string; planH: string; factH: string; status: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`,
    week: String(getWeekNumber(now)),
    text,
    planH: "—",
    factH: "—",
    status: "—",
  };
}

function getStateSnapshot() {
  const s = useTaskStore.getState();
  return { allData: s.allData, backlog: s.backlog };
}

export interface PresBgSettings {
  emojis: string;
  emojiCount: number;
  emojiMinSize: number;
  emojiMaxSize: number;
  pattern: "none" | "grid" | "diagonal" | "diamond" | "waves" | "zigzag";
  patternSize: number;
  patternOpacity: number;
  styleId: "dark" | "spring" | "ocean" | "night" | "fire" | "minimal";
  /** Phase 5: режим анимации эмодзи. */
  emojiAnim?: "off" | "drift" | "fall";
  /** Phase 5: скорость анимации, 0.25..2 (1 = базовая). */
  emojiSpeed?: number;
  /** Phase 5: прозрачность эмодзи, 5..50 (% числом). Если undefined — рандомная как раньше (для совместимости со старым state). */
  emojiOpacity?: number;
}

export interface PresStylePreset {
  id: PresBgSettings["styleId"];
  label: string;
  emoji: string;
  desc: string;
  bodyBg: string;
  overlayBg: string;
  cardColors: string[];
  defaultEmojis: string;
  defaultPattern: PresBgSettings["pattern"];
  textColor: string;
  mutedColor: string;
}

export const PRES_STYLE_PRESETS: PresStylePreset[] = [
  {
    id: "dark",
    label: "Тёмный",
    emoji: "🌑",
    desc: "Тёмный фон, яркий акцент",
    bodyBg: "#0d1117",
    overlayBg: "radial-gradient(ellipse 80% 60% at 20% 20%,rgba(91,155,213,.18),transparent 60%),radial-gradient(ellipse 70% 70% at 80% 80%,rgba(91,155,213,.12),transparent 60%),linear-gradient(160deg,#080d14 0%,#111827 40%,#0d1117 100%)",
    cardColors: ["rgba(30,50,80,.7)", "rgba(20,40,70,.6)", "rgba(15,35,65,.65)"],
    defaultEmojis: "🚀 ✨ 💡 🎯",
    defaultPattern: "grid",
    textColor: "#e2e8f0",
    mutedColor: "rgba(148,163,184,.55)",
  },
  {
    id: "spring",
    label: "Весна",
    emoji: "🌿",
    desc: "Зелёный, природа, свежесть",
    bodyBg: "#0a1a0f",
    overlayBg: "radial-gradient(ellipse 80% 60% at 20% 20%,rgba(52,211,153,.18),transparent 60%),radial-gradient(ellipse 70% 70% at 80% 80%,rgba(134,239,172,.12),transparent 60%),linear-gradient(160deg,#071510 0%,#0d2118 40%,#081a10 100%)",
    cardColors: ["rgba(4,108,78,.6)", "rgba(21,128,61,.5)", "rgba(63,98,18,.55)"],
    defaultEmojis: "🌿 🍃 🌱 🌸 🍀",
    defaultPattern: "grid",
    textColor: "#d1fae5",
    mutedColor: "rgba(167,243,208,.55)",
  },
  {
    id: "ocean",
    label: "Океан",
    emoji: "🌊",
    desc: "Глубокий синий, волны",
    bodyBg: "#070e1a",
    overlayBg: "radial-gradient(ellipse 80% 60% at 20% 20%,rgba(56,189,248,.18),transparent 60%),radial-gradient(ellipse 70% 70% at 80% 80%,rgba(14,165,233,.12),transparent 60%),linear-gradient(160deg,#04090f 0%,#0c1829 40%,#060d1a 100%)",
    cardColors: ["rgba(7,50,90,.65)", "rgba(10,70,130,.55)", "rgba(5,60,110,.6)"],
    defaultEmojis: "🌊 💧 🐬 ⛵ 🐟",
    defaultPattern: "waves",
    textColor: "#e0f2fe",
    mutedColor: "rgba(186,230,253,.55)",
  },
  {
    id: "night",
    label: "Ночь",
    emoji: "🌙",
    desc: "Фиолетовое небо, звёзды",
    bodyBg: "#07050f",
    overlayBg: "radial-gradient(ellipse 80% 60% at 20% 20%,rgba(139,92,246,.18),transparent 60%),radial-gradient(ellipse 70% 70% at 80% 80%,rgba(167,139,250,.12),transparent 60%),linear-gradient(160deg,#05030c 0%,#0f0a1e 40%,#070510 100%)",
    cardColors: ["rgba(50,20,90,.65)", "rgba(60,30,110,.55)", "rgba(40,15,80,.6)"],
    defaultEmojis: "🌙 ⭐ ✨ 🔮 💫",
    defaultPattern: "diamond",
    textColor: "#ede9fe",
    mutedColor: "rgba(221,214,254,.55)",
  },
  {
    id: "fire",
    label: "Огонь",
    emoji: "🔥",
    desc: "Янтарный, энергичный",
    bodyBg: "#120800",
    overlayBg: "radial-gradient(ellipse 80% 60% at 20% 20%,rgba(251,191,36,.18),transparent 60%),radial-gradient(ellipse 70% 70% at 80% 80%,rgba(245,158,11,.12),transparent 60%),linear-gradient(160deg,#0d0500 0%,#1c0f00 40%,#100700 100%)",
    cardColors: ["rgba(90,55,5,.65)", "rgba(120,70,5,.55)", "rgba(75,45,5,.6)"],
    defaultEmojis: "🔥 ⚡ 💥 🎯 🏆",
    defaultPattern: "zigzag",
    textColor: "#fef3c7",
    mutedColor: "rgba(253,230,138,.55)",
  },
  {
    id: "minimal",
    label: "Минимал",
    emoji: "⬜",
    desc: "Светлый, чистый, деловой",
    bodyBg: "#f8fafc",
    overlayBg: "linear-gradient(160deg,#f8fafc 0%,#f1f5f9 100%)",
    cardColors: ["rgba(241,245,249,1)", "rgba(248,250,252,1)", "rgba(226,232,240,1)"],
    defaultEmojis: "📊 📈 🎯 💡 ✅",
    defaultPattern: "none",
    textColor: "#1e293b",
    mutedColor: "rgba(100,116,139,.7)",
  },
];

export const DEFAULT_PRES_BG: PresBgSettings = {
  emojis: "🚀 ✨ 💡 🎯",
  emojiCount: 20,
  emojiMinSize: 14,
  emojiMaxSize: 30,
  pattern: "grid",
  patternSize: 40,
  patternOpacity: 5,
  styleId: "dark",
  emojiAnim: "drift",
  emojiSpeed: 1,
  emojiOpacity: 25,
};

/* ================================================================ *
 *  Phase 2 (multi-year): добавлено хранение задач по ключам YYYY-MM. *
 *                                                                    *
 *  ─ allData (Record<number, Task[]>) — это СРЕЗ задач выбранного    *
 *    года (currentYear). Все компоненты читают именно его, как       *
 *    раньше. Поэтому 100+ мест UI-кода не правятся.                  *
 *                                                                    *
 *  ─ dataByYearMonth (Record<MonthKey, Task[]>) — это полная база,   *
 *    содержит данные ВСЕХ годов. Это поле и попадает в БД.           *
 *                                                                    *
 *  ─ MonthKey = "YYYY-MM" (например "2025-10").                      *
 *                                                                    *
 *  При смене года вызывается selectYear(year): из dataByYearMonth    *
 *  собирается новый allData[0..11] для UI.                           *
 *                                                                    *
 *  При любой мутации задач — withDomainSync пишет одновременно и в   *
 *  allData[m], и в dataByYearMonth[currentYear-m].                   *
 *                                                                    *
 *  Миграция: если dataByYearMonth отсутствует (старый стейт), но     *
 *  есть allData со старыми числовыми ключами — считаем, что эти      *
 *  данные принадлежат текущему году и конвертим один раз в           *
 *  onRehydrateStorage.                                                *
 * ================================================================ */

/** Год + месяц как строка "YYYY-MM" (zero-padded). */
export type MonthKey = string;

/** Constructs "2025-10" from (2025, 9). Внимание: month 0..11. */
export function monthKey(year: number, month: number): MonthKey {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

/** Парсит "2025-10" → { year: 2025, month: 9 }. Возвращает null если невалидно. */
export function parseMonthKey(key: MonthKey): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  if (Number.isNaN(year) || Number.isNaN(month) || month < 0 || month > 11) return null;
  return { year, month };
}

/** Из полного dataByYearMonth собирает срез для одного года. */
export function buildAllDataForYear(
  dataByYearMonth: Record<MonthKey, Task[]>,
  year: number,
): AllData {
  const out: AllData = {};
  for (let m = 0; m < 12; m++) {
    const key = monthKey(year, m);
    out[m] = dataByYearMonth[key] || [];
  }
  // Если ровно ничего не было за этот год — обеспечим хотя бы пустой
  // первый месяц с одной чистой задачей (как initAllData).
  const isEmpty = Object.values(out).every((arr) => arr.length === 0);
  if (isEmpty) {
    out[0] = [createNewTask()];
  }
  return out;
}

/** Список годов, в которых есть хоть одна задача. Текущий год всегда включён. */
export function listYearsWithData(dataByYearMonth: Record<MonthKey, Task[]>): number[] {
  const years = new Set<number>();
  years.add(new Date().getFullYear());
  for (const [k, tasks] of Object.entries(dataByYearMonth)) {
    if (!tasks || tasks.length === 0) continue;
    const parsed = parseMonthKey(k);
    if (parsed) years.add(parsed.year);
  }
  return Array.from(years).sort((a, b) => b - a);
}

/** Per-domain isolated data */
export interface DomainData {
  /** Срез текущего года для UI (Record<0..11, Task[]>). Производное от dataByYearMonth. */
  allData: AllData;
  /** Беклог — глобальный для домена, без привязки к году. */
  backlog: Task[];
  /** Полная база задач — здесь живут все года. Это и шлётся на сервер. */
  dataByYearMonth?: Record<MonthKey, Task[]>;
  /** Phase 7.2: плановое количество часов на (домен, месяц, год).
   *  Ключ — MonthKey "YYYY-MM". Значение — числo часов плана.
   *  Если ключа нет → дефолт 80. */
  monthlyPlanByYearMonth?: Record<MonthKey, number>;
}

interface AppState {
  // Data — live derived values for the active domain
  allData: AllData;
  backlog: Task[];
  // Isolated data keyed by domain ID
  domainData: Record<string, DomainData>;
  domains: Domain[];
  activeDomainId: string;

  // UI state
  currentMonth: number;
  /** Phase 2: год активного «среза» allData. По умолчанию — текущий год. */
  currentYear: number;
  view: "table" | "backlog" | "dashboard" | "slides" | "chat" | "design" | "questions";
  /** Phase 3: активный под-таб внутри Презентации. */
  presSubTab: "slides" | "design" | "ai";
  clientMode: boolean;

  // Theme
  themeId: string;
  customColor: string;
  customDark: boolean;

  // Presentation background
  presBg: PresBgSettings;

  // Phase 7.2: monthBudget (Record<0..11, string>) удалён.
  // Заменён на monthlyPlanByYearMonth внутри DomainData.

  // Filters
  filterStatuses: Set<Status>;
  filterPriorities: Set<Priority>;
  sortKey: string;
  sortDir: number;
  searchQuery: string;

  // Undo version counter (triggers re-renders)
  undoVersion: number;

  // Actions - Data
  setAllData: (data: AllData) => void;
  setDomainData: (newDomainData: Record<string, DomainData>) => void;
  setCurrentMonth: (m: number) => void;
  /** Phase 2: переключиться на другой год (пересчитывает allData-срез). */
  setCurrentYear: (year: number) => void;
  /** Phase 2: список годов, в которых есть данные у активного домена. */
  getAvailableYears: () => number[];
  setView: (v: AppState["view"]) => void;
  /** Phase 3: переключение под-таба Презентации. */
  setPresSubTab: (v: AppState["presSubTab"]) => void;

  // Task CRUD
  updateTask: (month: number, taskId: string, key: keyof Task, value: unknown) => void;
  archiveComment: (month: number, taskId: string) => void;
  addTask: (month: number) => void;
  deleteTask: (month: number, taskId: string) => void;
  moveTasks: (taskId: string, fromMonth: number, toMonth: number) => void;
  reorderTask: (month: number, fromId: string, toId: string) => void;
  sortMonthTasks: (month: number, key: "priority" | "status") => void;

  // Backlog
  moveToBacklog: (month: number, taskId: string) => void;
  returnFromBacklog: (taskId: string, targetMonth: number) => void;
  returnFromBacklogWithEdits: (taskId: string, targetMonth: number, edits: { num: string; name: string; planH: string; factH: string; priority: Priority; status: Status }) => void;
  deleteBacklogTask: (taskId: string) => void;
  updateBacklogTask: (taskId: string, key: keyof Task, value: unknown) => void;
  reorderBacklog: (fromId: string, toId: string) => void;

  // Domain
  addDomain: (name: string) => void;
  renameDomain: (id: string, name: string) => void;
  deleteDomain: (id: string) => void;
  setActiveDomain: (id: string) => void;

  // Theme
  setTheme: (themeId: string) => void;
  setCustomColor: (color: string, dark: boolean) => void;
  /** Phase 7: переключить только тёмную тему (без смены акцента). */
  setCustomDark: (dark: boolean) => void;

  // Presentation background
  setPresBg: (bg: Partial<PresBgSettings>) => void;

  // Per-month budget
  /** Phase 7.2: записать план часов на (текущий домен, монтикей).
   *  Если hours = 0 или NaN — ключ удаляется (вернётся дефолт 80). */
  setMonthlyPlan: (monthKey: MonthKey, hours: number) => void;

  // Filters
  toggleStatusFilter: (s: Status) => void;
  togglePriorityFilter: (p: Priority) => void;
  setSortKey: (key: string) => void;
  setSearchQuery: (q: string) => void;
  clearFilters: () => void;

  // Client mode
  toggleClientMode: () => void;

  // Setters (for import)
  setBacklog: (backlog: Task[]) => void;
  setDomains: (domains: Domain[]) => void;
  setActiveDomainId: (id: string) => void;
  setThemeId: (id: string) => void;

  // Batch operations
  addTasksToMonth: (month: number, tasks: Task[]) => void;
  transferIncompleteTasks: (fromMonth: number, toMonth: number) => number;

  // Undo / Redo
  snapshot: () => void;
  undo: () => void;
  redo: () => void;

  // Bulk operations
  moveTasksBetweenMonths: (fromMonth: number, toMonth: number) => void;
  clearMonth: (month: number) => void;

  // Import / Export
  exportJSON: () => string;
  importJSON: (json: string) => boolean;
}

const DEFAULT_DOMAIN: Domain = { id: "default", name: "По умолчанию" };

const initAllData = (): AllData => {
  const data: AllData = {};
  for (let i = 0; i < 12; i++) data[i] = [createNewTask()];
  return data;
};

/**
 * Helper: wrap a mutation patch so it also syncs the live allData/backlog
 * into domainData[activeDomainId]. This keeps domainData in sync with
 * every mutation without changing how components consume the store.
 *
 * Phase 2: дополнительно записываем срез allData в dataByYearMonth
 * под ключами текущего года. dataByYearMonth — единственный источник
 * правды для БД.
 */
function withDomainSync(
  state: Pick<AppState, "activeDomainId" | "domainData" | "allData" | "backlog" | "currentYear">,
  patch: { allData?: AllData; backlog?: Task[] },
): { allData: AllData; backlog: Task[]; domainData: Record<string, DomainData> } {
  const newAllData = patch.allData ?? state.allData;
  const newBacklog = patch.backlog ?? state.backlog;
  const year = state.currentYear;

  // Берём существующий dataByYearMonth этого домена (если был),
  // обновляем 12 ключей текущего года из newAllData.
  const existingDomain = state.domainData[state.activeDomainId];
  const existingByKey: Record<MonthKey, Task[]> = existingDomain?.dataByYearMonth ?? {};
  const updatedByKey: Record<MonthKey, Task[]> = { ...existingByKey };
  for (let m = 0; m < 12; m++) {
    const key = monthKey(year, m);
    updatedByKey[key] = newAllData[m] || [];
  }

  return {
    allData: newAllData,
    backlog: newBacklog,
    domainData: {
      ...state.domainData,
      [state.activeDomainId]: {
        allData: newAllData,
        backlog: newBacklog,
        dataByYearMonth: updatedByKey,
      },
    },
  };
}

export const useTaskStore = create<AppState>()(
  persist(
    (set, get) => ({
      allData: initAllData(),
      backlog: [] as Task[],
      domainData: {} as Record<string, DomainData>,
      domains: [DEFAULT_DOMAIN],
      activeDomainId: "default",
      currentMonth: new Date().getMonth(),
      currentYear: new Date().getFullYear(),
      view: "table",
      presSubTab: "slides",
      clientMode: false,
      themeId: "#9B72CF",
      customColor: "",
      customDark: false,
      presBg: DEFAULT_PRES_BG,
      filterStatuses: new Set(),
      filterPriorities: new Set(),
      sortKey: "",
      sortDir: 1,
      searchQuery: "",
      undoVersion: 0,

      setAllData: (data) => set(state => withDomainSync(state, { allData: data })),

      /** Replace all domainData (used by server sync pull). Merges with
       *  local domains not present on the server, then derives live
       *  allData/backlog for the active domain.
       *
       *  Phase 2: сервер хранит данные в `allData` как Record<string, Task[]>.
       *  Ключи могут быть либо MonthKey ("2025-10"), либо legacy ("0".."11").
       *  Если в ключах есть хотя бы один MonthKey → считаем это формат
       *  dataByYearMonth. Иначе — legacy allData текущего года.
       */
      setDomainData: (newDomainData) => set(state => {
        const merged: Record<string, DomainData> = {};

        // Сначала нормализуем входящие домены: если allData содержит
        // ключи в формате YYYY-MM, переносим в dataByYearMonth.
        for (const [id, dd] of Object.entries(newDomainData)) {
          const keys = Object.keys(dd.allData ?? {});
          const hasMonthKey = keys.some(k => /^\d{4}-\d{2}$/.test(k));

          if (hasMonthKey) {
            // server format = dataByYearMonth shoved into allData
            const byKey = dd.allData as unknown as Record<MonthKey, Task[]>;
            merged[id] = {
              ...dd,
              allData: buildAllDataForYear(byKey, state.currentYear),
              dataByYearMonth: byKey,
              backlog: dd.backlog ?? [],
            };
          } else if (dd.dataByYearMonth) {
            // explicit field
            merged[id] = {
              ...dd,
              allData: buildAllDataForYear(dd.dataByYearMonth, state.currentYear),
            };
          } else {
            // legacy: allData = Record<0..11, Task[]> текущего года
            const byKey: Record<MonthKey, Task[]> = {};
            for (let m = 0; m < 12; m++) {
              const tasks = (dd.allData as Record<string | number, Task[]>)?.[m] || [];
              if (tasks.length > 0) {
                byKey[monthKey(state.currentYear, m)] = tasks;
              }
            }
            merged[id] = {
              ...dd,
              dataByYearMonth: byKey,
            };
          }
        }

        // Keep local domain entries not on server
        for (const [id, dd] of Object.entries(state.domainData)) {
          if (!merged[id]) merged[id] = dd;
        }

        const current = merged[state.activeDomainId] || { allData: initAllData(), backlog: [], dataByYearMonth: {} };
        return {
          domainData: merged,
          allData: current.allData,
          backlog: current.backlog,
        };
      }),

      setCurrentMonth: (m) => set({ currentMonth: m, searchQuery: "" }),

      /** Phase 2: переключение активного года.
       *
       *  Перед сменой года ФИКСИРУЕМ текущий срез allData в
       *  dataByYearMonth под уходящим годом (на случай, если в нём
       *  были изменения, не дошедшие до dataByYearMonth — теоретически
       *  withDomainSync уже всё пишет, но это страховка). Потом
       *  подменяем allData на срез нового года.
       */
      setCurrentYear: (year) => set(state => {
        const dom = state.domainData[state.activeDomainId];
        const existingByKey: Record<MonthKey, Task[]> = dom?.dataByYearMonth ?? {};

        // 1. Save current year's allData into dataByYearMonth
        const updatedByKey: Record<MonthKey, Task[]> = { ...existingByKey };
        for (let m = 0; m < 12; m++) {
          const key = monthKey(state.currentYear, m);
          updatedByKey[key] = state.allData[m] || [];
        }

        // 2. Build new allData slice for the requested year
        const newAllData = buildAllDataForYear(updatedByKey, year);

        return {
          currentYear: year,
          allData: newAllData,
          searchQuery: "",
          domainData: {
            ...state.domainData,
            [state.activeDomainId]: {
              ...(dom || { backlog: [] }),
              allData: newAllData,
              backlog: dom?.backlog ?? state.backlog,
              dataByYearMonth: updatedByKey,
            },
          },
        };
      }),

      /** Phase 2: какие годы есть в активном домене. */
      getAvailableYears: () => {
        const state = get();
        const dom = state.domainData[state.activeDomainId];
        const byKey = dom?.dataByYearMonth || {};
        return listYearsWithData(byKey);
      },

      setView: (v) => set({ view: v }),
      setPresSubTab: (v) => set({ presSubTab: v }),

      updateTask: (month, taskId, key, value) => set(state => {
        const rows = state.allData[month] || [];
        // If setting status to POSTPONED — move to backlog automatically
        if (key === "status" && value === STATUSES.POSTPONED) {
          const task = rows.find(r => r.id === taskId);
          if (!task) return state;
          const newAllData = {
            ...state.allData,
            [month]: rows.filter(r => r.id !== taskId),
          };
          const backlogEntry = {
            ...task,
            status: STATUSES.POSTPONED,
            _ts: Date.now(),
            commentLog: [...(task.commentLog || []), makeSystemLog("📦 Отложена → перемещена в беклог")],
          };
          return withDomainSync(state, { allData: newAllData, backlog: [...state.backlog, backlogEntry] });
        }
        const newAllData = {
          ...state.allData,
          [month]: rows.map(r => r.id === taskId ? { ...r, [key]: value, _ts: Date.now() } : r),
        };
        return withDomainSync(state, { allData: newAllData });
      }),

      archiveComment: (month, taskId) => set(state => {
        const rows = state.allData[month] || [];
        const newAllData = {
          ...state.allData,
          [month]: rows.map(r => {
            if (r.id !== taskId || !r.comment) return r;
            const now = new Date();
            const pad = (n: number) => String(n).padStart(2, "0");
            const dateStr = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;
            const weekNum = getWeekNumber(now);
            const logEntry = {
              date: dateStr,
              week: `${weekNum}`,
              text: r.comment,
              planH: r.planH,
              factH: r.factH,
              status: r.status,
            };
            return {
              ...r,
              comment: "",
              commentLog: [...(r.commentLog || []), logEntry],
            };
          }),
        };
        return withDomainSync(state, { allData: newAllData });
      }),

      addTask: (month) => {
        undoHelpers.snapshot(getStateSnapshot);
        set(state => {
          const newAllData = {
            ...state.allData,
            [month]: [...(state.allData[month] || []), { ...createNewTask(), _ts: Date.now() }],
          };
          return withDomainSync(state, { allData: newAllData });
        });
      },

      deleteTask: (month, taskId) => {
        undoHelpers.snapshot(getStateSnapshot);
        set(state => {
          const now = Date.now();
          const newAllData = {
            ...state.allData,
            [month]: (state.allData[month] || []).map(r =>
              r.id === taskId ? { ...r, _deleted: true, _ts: now } : r
            ),
          };
          return withDomainSync(state, { allData: newAllData });
        });
      },

      moveTasks: (taskId, fromMonth, toMonth) => {
        undoHelpers.snapshot(getStateSnapshot);
        set(state => {
          const fromRows = state.allData[fromMonth] || [];
          const task = fromRows.find(r => r.id === taskId);
          if (!task) return state;
          const toRows = state.allData[toMonth] || [];
          const newAllData = {
            ...state.allData,
            [fromMonth]: fromRows.filter(r => r.id !== taskId),
            [toMonth]: [...toRows, task],
          };
          return withDomainSync(state, { allData: newAllData });
        });
      },

      reorderTask: (month, fromId, toId) => {
        undoHelpers.snapshot(getStateSnapshot);
        set(state => {
          const rows = [...(state.allData[month] || [])];
          const fi = rows.findIndex(r => r.id === fromId);
          const ti = rows.findIndex(r => r.id === toId);
          if (fi < 0 || ti < 0) return state;
          const [item] = rows.splice(fi, 1);
          rows.splice(ti, 0, item);
          const newAllData = { ...state.allData, [month]: rows };
          return withDomainSync(state, { allData: newAllData });
        });
      },

      sortMonthTasks: (month, key) => {
        undoHelpers.snapshot(getStateSnapshot);
        set(state => {
          const rows = [...(state.allData[month] || [])];
          if (key === "priority") {
            rows.sort((a, b) => PRIO_START[a.priority] - PRIO_START[b.priority]);
          } else {
            rows.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
          }
          const newAllData = { ...state.allData, [month]: rows };
          return withDomainSync(state, { allData: newAllData });
        });
      },

      moveToBacklog: (month, taskId) => {
        undoHelpers.snapshot(getStateSnapshot);
        set(state => {
          const rows = state.allData[month] || [];
          const task = rows.find(r => r.id === taskId);
          if (!task) return state;
          const newAllData = {
            ...state.allData,
            [month]: rows.filter(r => r.id !== taskId),
          };
          const backlogEntry = {
            ...task,
            priority: PRIORITIES.QUEUE,
            status: STATUSES.IDEA,
            _ts: Date.now(),
            commentLog: [...(task.commentLog || []), makeSystemLog("📦 Задача добавлена в беклог")],
          };
          const newBacklog = [...state.backlog, backlogEntry];
          return withDomainSync(state, { allData: newAllData, backlog: newBacklog });
        });
      },

      returnFromBacklog: (taskId, targetMonth) => {
        undoHelpers.snapshot(getStateSnapshot);
        set(state => {
          const task = state.backlog.find(t => t.id === taskId);
          if (!task) return state;
          const clean: Task = {
            id: task.id,
            num: task.num,
            name: task.name,
            planH: task.planH,
            factH: task.factH,
            priority: task.priority,
            status: task.status,
            comment: task.comment,
            commentLog: [...(task.commentLog || []), makeSystemLog(`📋 Возвращена в таблицу (${MONTHS[targetMonth]})`)],
          };
          const existing = state.allData[targetMonth] || [];
          const isEmpty = existing.length === 1 && !existing[0].num && !existing[0].name;
          const newAllData = {
            ...state.allData,
            [targetMonth]: isEmpty ? [clean] : [...existing, clean],
          };
          const newBacklog = state.backlog.filter(t => t.id !== taskId);
          return withDomainSync(state, { allData: newAllData, backlog: newBacklog });
        });
      },

      returnFromBacklogWithEdits: (taskId, targetMonth, edits) => {
        undoHelpers.snapshot(getStateSnapshot);
        set(state => {
          const task = state.backlog.find(t => t.id === taskId);
          if (!task) return state;
          const clean: Task = {
            id: task.id,
            num: edits.num,
            name: edits.name,
            planH: edits.planH,
            factH: edits.factH,
            priority: edits.priority,
            status: edits.status,
            comment: task.comment,
            commentLog: [...(task.commentLog || []), makeSystemLog(`📋 Возвращена в таблицу (${MONTHS[targetMonth]})`)],
          };
          const existing = state.allData[targetMonth] || [];
          const isEmpty = existing.length === 1 && !existing[0].num && !existing[0].name;
          const newAllData = {
            ...state.allData,
            [targetMonth]: isEmpty ? [clean] : [...existing, clean],
          };
          const newBacklog = state.backlog.filter(t => t.id !== taskId);
          return withDomainSync(state, { allData: newAllData, backlog: newBacklog });
        });
      },

      deleteBacklogTask: (taskId) => {
        undoHelpers.snapshot(getStateSnapshot);
        set(state => {
          const now = Date.now();
          const newBacklog = state.backlog.map(t =>
            t.id === taskId ? { ...t, _deleted: true, _ts: now } : t
          );
          return withDomainSync(state, { backlog: newBacklog });
        });
      },

      reorderBacklog: (fromId, toId) => {
        undoHelpers.snapshot(getStateSnapshot);
        set(state => {
          const fromIdx = state.backlog.findIndex(t => t.id === fromId);
          const toIdx = state.backlog.findIndex(t => t.id === toId);
          if (fromIdx === -1 || toIdx === -1) return state;
          const newBacklog = [...state.backlog];
          const [moved] = newBacklog.splice(fromIdx, 1);
          newBacklog.splice(toIdx, 0, moved);
          return withDomainSync(state, { backlog: newBacklog });
        });
      },

      updateBacklogTask: (taskId, key, value) => {
        undoHelpers.snapshot(getStateSnapshot);
        set(state => {
          const newBacklog = state.backlog.map(t =>
            t.id === taskId ? { ...t, [key]: value, _ts: Date.now() } : t
          );
          return withDomainSync(state, { backlog: newBacklog });
        });
      },

      addDomain: (name) => {
        const id = "dom_" + Date.now();
        set(state => {
          // Save current domain data first — Phase 2 with dataByYearMonth
          const currentDom = state.domainData[state.activeDomainId];
          const currentByKey: Record<MonthKey, Task[]> = currentDom?.dataByYearMonth ?? {};
          const updatedCurrentByKey: Record<MonthKey, Task[]> = { ...currentByKey };
          for (let m = 0; m < 12; m++) {
            updatedCurrentByKey[monthKey(state.currentYear, m)] = state.allData[m] || [];
          }
          const savedDomainData = {
            ...state.domainData,
            [state.activeDomainId]: {
              allData: state.allData,
              backlog: state.backlog,
              dataByYearMonth: updatedCurrentByKey,
            },
          };
          // Initialize new domain — пустой во всех годах
          const newEntry: DomainData = {
            allData: initAllData(),
            backlog: [],
            dataByYearMonth: {},
          };
          return {
            domains: [...state.domains, { id, name }],
            activeDomainId: id,
            domainData: { ...savedDomainData, [id]: newEntry },
            allData: newEntry.allData,
            backlog: newEntry.backlog,
            searchQuery: "",
          };
        });
      },

      renameDomain: (id, name) => set(state => ({
        domains: state.domains.map(d => d.id === id ? { ...d, name } : d),
      })),

      deleteDomain: (id) => set(state => {
        if (state.domains.length <= 1) return state;
        const remaining = state.domains.filter(d => d.id !== id);
        const isCurrent = state.activeDomainId === id;
        // Remove deleted domain's data
        const newDomainData = { ...state.domainData };
        delete newDomainData[id];
        if (isCurrent) {
          const newActiveId = remaining[0].id;
          const newDom = newDomainData[newActiveId];
          let newAllData: AllData;
          let newBacklog: Task[];
          if (newDom) {
            newAllData = newDom.dataByYearMonth
              ? buildAllDataForYear(newDom.dataByYearMonth, state.currentYear)
              : newDom.allData;
            newBacklog = newDom.backlog;
          } else {
            newAllData = initAllData();
            newBacklog = [];
            newDomainData[newActiveId] = { allData: newAllData, backlog: newBacklog, dataByYearMonth: {} };
          }
          return {
            domains: remaining,
            activeDomainId: newActiveId,
            domainData: newDomainData,
            allData: newAllData,
            backlog: newBacklog,
            searchQuery: "",
          };
        }
        // Save current domain data — Phase 2 with dataByYearMonth
        const currentDom = state.domainData[state.activeDomainId];
        const currentByKey: Record<MonthKey, Task[]> = currentDom?.dataByYearMonth ?? {};
        const updatedCurrentByKey: Record<MonthKey, Task[]> = { ...currentByKey };
        for (let m = 0; m < 12; m++) {
          updatedCurrentByKey[monthKey(state.currentYear, m)] = state.allData[m] || [];
        }
        return {
          domains: remaining,
          domainData: {
            ...newDomainData,
            [state.activeDomainId]: {
              allData: state.allData,
              backlog: state.backlog,
              dataByYearMonth: updatedCurrentByKey,
            },
          },
        };
      }),

      setActiveDomain: (id) => set(state => {
        // Save current domain data — Phase 2: с актуализацией dataByYearMonth
        // под текущий год.
        const currentDom = state.domainData[state.activeDomainId];
        const currentByKey: Record<MonthKey, Task[]> = currentDom?.dataByYearMonth ?? {};
        const updatedCurrentByKey: Record<MonthKey, Task[]> = { ...currentByKey };
        for (let m = 0; m < 12; m++) {
          updatedCurrentByKey[monthKey(state.currentYear, m)] = state.allData[m] || [];
        }
        const updatedDomainData = {
          ...state.domainData,
          [state.activeDomainId]: {
            allData: state.allData,
            backlog: state.backlog,
            dataByYearMonth: updatedCurrentByKey,
          },
        };

        // Load new domain — пересобираем allData как срез нового домена
        // под currentYear. Если у нового домена нет dataByYearMonth (старый
        // формат, миграция уже была в onRehydrateStorage, но защитимся), —
        // используем legacy allData как есть.
        const newDom = updatedDomainData[id];
        let newAllData: AllData;
        let newBacklog: Task[];
        if (newDom) {
          if (newDom.dataByYearMonth) {
            newAllData = buildAllDataForYear(newDom.dataByYearMonth, state.currentYear);
          } else {
            newAllData = newDom.allData;
          }
          newBacklog = newDom.backlog;
        } else {
          newAllData = initAllData();
          newBacklog = [];
          updatedDomainData[id] = { allData: newAllData, backlog: newBacklog, dataByYearMonth: {} };
        }

        return {
          activeDomainId: id,
          domainData: updatedDomainData,
          allData: newAllData,
          backlog: newBacklog,
          searchQuery: "",
        };
      }),

      setTheme: (themeId) => set({ themeId, customColor: "" }),
      setCustomColor: (color, dark) => set({ customColor: color, customDark: dark, themeId: "custom" }),
      setCustomDark: (dark) => set({ customDark: dark }),
      setPresBg: (bg) => set((s) => ({ presBg: { ...s.presBg, ...bg } })),

      /** Phase 7.2: записать план часов в monthlyPlanByYearMonth активного домена. */
      setMonthlyPlan: (monthKey, hours) => set((s) => {
        const dom = s.domainData[s.activeDomainId];
        if (!dom) return s;
        const existing = dom.monthlyPlanByYearMonth || {};
        const next: Record<MonthKey, number> = { ...existing };
        if (!hours || isNaN(hours) || hours <= 0) {
          delete next[monthKey];
        } else {
          next[monthKey] = hours;
        }
        return {
          domainData: {
            ...s.domainData,
            [s.activeDomainId]: {
              ...dom,
              monthlyPlanByYearMonth: next,
            },
          },
        };
      }),

      toggleStatusFilter: (s) => set(state => {
        const next = new Set(state.filterStatuses);
        if (next.has(s)) { next.delete(s); } else { next.add(s); }
        return { filterStatuses: next };
      }),

      togglePriorityFilter: (p) => set(state => {
        const next = new Set(state.filterPriorities);
        if (next.has(p)) { next.delete(p); } else { next.add(p); }
        return { filterPriorities: next };
      }),

      setSortKey: (key) => set(state => ({
        sortKey: state.sortKey === key ? key : key,
        sortDir: state.sortKey === key ? -state.sortDir : 1,
      })),

      setSearchQuery: (q) => set({ searchQuery: q }),

      clearFilters: () => set({ filterStatuses: new Set(), filterPriorities: new Set(), sortKey: "" }),

      toggleClientMode: () => set(state => ({ clientMode: !state.clientMode })),

      // Setters
      setBacklog: (backlog) => set(state => withDomainSync(state, { backlog })),
      setDomains: (domains) => set(state => {
        const newActiveId = domains.some(d => d.id === state.activeDomainId)
          ? state.activeDomainId
          : (domains[0]?.id || "default");
        // Save current domain data with dataByYearMonth synced
        const currentDom = state.domainData[state.activeDomainId];
        const currentByKey: Record<MonthKey, Task[]> = currentDom?.dataByYearMonth ?? {};
        const updatedCurrentByKey: Record<MonthKey, Task[]> = { ...currentByKey };
        for (let m = 0; m < 12; m++) {
          updatedCurrentByKey[monthKey(state.currentYear, m)] = state.allData[m] || [];
        }
        const savedDomainData = {
          ...state.domainData,
          [state.activeDomainId]: {
            allData: state.allData,
            backlog: state.backlog,
            dataByYearMonth: updatedCurrentByKey,
          },
        };
        const newDom = savedDomainData[newActiveId];
        let newAllData: AllData;
        let newBacklog: Task[];
        if (newDom) {
          newAllData = newDom.dataByYearMonth
            ? buildAllDataForYear(newDom.dataByYearMonth, state.currentYear)
            : newDom.allData;
          newBacklog = newDom.backlog;
        } else {
          newAllData = initAllData();
          newBacklog = [];
          savedDomainData[newActiveId] = { allData: newAllData, backlog: newBacklog, dataByYearMonth: {} };
        }
        return {
          domains,
          activeDomainId: newActiveId,
          domainData: savedDomainData,
          allData: newAllData,
          backlog: newBacklog,
        };
      }),
      setActiveDomainId: (id) => set(state => {
        // Same logic as setActiveDomain — Phase 2 aware.
        const currentDom = state.domainData[state.activeDomainId];
        const currentByKey: Record<MonthKey, Task[]> = currentDom?.dataByYearMonth ?? {};
        const updatedCurrentByKey: Record<MonthKey, Task[]> = { ...currentByKey };
        for (let m = 0; m < 12; m++) {
          updatedCurrentByKey[monthKey(state.currentYear, m)] = state.allData[m] || [];
        }
        const savedDomainData = {
          ...state.domainData,
          [state.activeDomainId]: {
            allData: state.allData,
            backlog: state.backlog,
            dataByYearMonth: updatedCurrentByKey,
          },
        };
        const newDom = savedDomainData[id];
        let newAllData: AllData;
        let newBacklog: Task[];
        if (newDom) {
          newAllData = newDom.dataByYearMonth
            ? buildAllDataForYear(newDom.dataByYearMonth, state.currentYear)
            : newDom.allData;
          newBacklog = newDom.backlog;
        } else {
          newAllData = initAllData();
          newBacklog = [];
          savedDomainData[id] = { allData: newAllData, backlog: newBacklog, dataByYearMonth: {} };
        }
        return {
          activeDomainId: id,
          domainData: savedDomainData,
          allData: newAllData,
          backlog: newBacklog,
        };
      }),
      setThemeId: (id) => set({ themeId: id }),

      // Batch operations
      addTasksToMonth: (month, tasks) => {
        undoHelpers.snapshot(getStateSnapshot);
        set(state => {
          const newAllData = {
            ...state.allData,
            [month]: [...(state.allData[month] || []), ...tasks.map(t => ({ ...t, _ts: t._ts ?? Date.now() }))],
          };
          return withDomainSync(state, { allData: newAllData });
        });
      },
      transferIncompleteTasks: (fromMonth, toMonth) => {
        const state = get();
        const fromRows = state.allData[fromMonth] || [];
        const incomplete = fromRows.filter(
          r => r.status !== STATUSES.DONE && r.status !== STATUSES.COMPLETED && r.status !== STATUSES.CANCEL
        );
        if (incomplete.length === 0) return 0;
        const transferred = incomplete.map(r => ({ ...r, id: crypto.randomUUID(), factH: "0", commentLog: [], _ts: Date.now() }));
        undoHelpers.snapshot(getStateSnapshot);
        const newAllData = {
          ...state.allData,
          [toMonth]: [...(state.allData[toMonth] || []), ...transferred],
        };
        set(state => withDomainSync(state, { allData: newAllData }));
        return transferred.length;
      },

      // Undo / Redo
      snapshot: () => undoHelpers.snapshot(getStateSnapshot),
      undo: () => {
        const prev = undoHelpers.undo(getStateSnapshot);
        if (prev) {
          set(state => ({
            ...withDomainSync(state, { allData: prev.allData, backlog: prev.backlog }),
            undoVersion: state.undoVersion + 1,
          }));
        }
      },
      redo: () => {
        const next = undoHelpers.redo(getStateSnapshot);
        if (next) {
          set(state => ({
            ...withDomainSync(state, { allData: next.allData, backlog: next.backlog }),
            undoVersion: state.undoVersion + 1,
          }));
        }
      },

      // Bulk operations
      moveTasksBetweenMonths: (fromMonth, toMonth) => {
        undoHelpers.snapshot(getStateSnapshot);
        set(state => {
          const fromRows = state.allData[fromMonth] || [];
          const toRows = state.allData[toMonth] || [];
          if (fromRows.length === 0) return state;
          const newAllData = {
            ...state.allData,
            [fromMonth]: [createNewTask()],
            [toMonth]: [...toRows, ...fromRows],
          };
          return withDomainSync(state, { allData: newAllData });
        });
      },

      clearMonth: (month) => {
        undoHelpers.snapshot(getStateSnapshot);
        set(state => {
          const newAllData = {
            ...state.allData,
            [month]: [createNewTask()],
          };
          return withDomainSync(state, { allData: newAllData });
        });
      },

      // Export / Import
      exportJSON: () => {
        const state = get();
        return JSON.stringify({
          allData: state.allData,
          backlog: state.backlog,
          currentMonth: state.currentMonth,
        }, null, 2);
      },

      importJSON: (json: string) => {
        try {
          const data = JSON.parse(json);
          if (data.allData) {
            set(state => ({
              ...withDomainSync(state, {
                allData: data.allData,
                backlog: data.backlog || [],
              }),
              currentMonth: data.currentMonth ?? state.currentMonth,
            }));
            return true;
          }
          return false;
        } catch {
          return false;
        }
      },
    }),
    {
      name: "task-tracker-store",
      partialize: (state) => ({
        domainData: state.domainData,
        domains: state.domains,
        activeDomainId: state.activeDomainId,
        themeId: state.themeId,
        customColor: state.customColor,
        customDark: state.customDark,
        currentMonth: state.currentMonth,
        currentYear: state.currentYear,
        presBg: state.presBg,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Migration: if domainData is empty but allData has real data
          // (old persisted format without domain isolation), wrap it
          if (Object.keys(state.domainData).length === 0) {
            state.domainData = {
              [state.activeDomainId]: {
                allData: state.allData,
                backlog: state.backlog,
              },
            };
          }

          // Phase 2 migration: для каждого домена, у которого нет
          // dataByYearMonth, конвертим старый allData (Record<0..11, Task[]>)
          // считая что эти задачи относятся к currentYear (или текущему
          // году по умолчанию). Идемпотентно: если dataByYearMonth уже
          // есть, ничего не делаем.
          const fallbackYear = state.currentYear ?? new Date().getFullYear();
          if (state.currentYear == null) state.currentYear = fallbackYear;

          for (const [id, dd] of Object.entries(state.domainData)) {
            if (!dd.dataByYearMonth) {
              const byKey: Record<MonthKey, Task[]> = {};
              for (let m = 0; m < 12; m++) {
                const tasks = dd.allData?.[m] || [];
                if (tasks.length > 0) {
                  byKey[monthKey(fallbackYear, m)] = tasks;
                }
              }
              state.domainData[id] = { ...dd, dataByYearMonth: byKey };
            }
          }

          // Derive live allData/backlog from domainData[activeDomainId]
          // — но только для среза currentYear.
          const entry = state.domainData[state.activeDomainId];
          if (entry) {
            // Если есть dataByYearMonth — пересоберём allData как срез текущего года
            if (entry.dataByYearMonth) {
              state.allData = buildAllDataForYear(entry.dataByYearMonth, state.currentYear);
            } else {
              state.allData = entry.allData;
            }
            state.backlog = entry.backlog;
          } else {
            state.allData = initAllData();
            state.backlog = [];
          }
        }
      },
    }
  )
);

/** Direct access to undo helpers (not through store) */
export const undoStore = {
  canUndo: () => undoHelpers.canUndo(),
  canRedo: () => undoHelpers.canRedo(),
};
