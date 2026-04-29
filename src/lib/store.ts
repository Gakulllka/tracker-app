import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Task, Domain, AllData, Status, Priority, PRIORITIES, STATUSES, MONTHS } from "./types";
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
};

/** Per-domain isolated data */
export interface DomainData {
  allData: AllData;
  backlog: Task[];
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
  view: "table" | "backlog" | "dashboard" | "slides" | "chat" | "design" | "questions";
  clientMode: boolean;

  // Theme
  themeId: string;
  customColor: string;
  customDark: boolean;

  // Presentation background
  presBg: PresBgSettings;

  // Per-month budget (formula strings)
  monthBudget: string[];

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
  setView: (v: AppState["view"]) => void;

  // Task CRUD
  updateTask: (month: number, taskId: string, key: keyof Task, value: unknown) => void;
  archiveComment: (month: number, taskId: string) => void;
  addTask: (month: number) => void;
  deleteTask: (month: number, taskId: string) => void;
  moveTasks: (taskId: string, fromMonth: number, toMonth: number) => void;
  reorderTask: (month: number, fromId: string, toId: string) => void;

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

  // Presentation background
  setPresBg: (bg: Partial<PresBgSettings>) => void;

  // Per-month budget
  setMonthBudget: (month: number, value: string) => void;

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
 */
function withDomainSync(
  state: Pick<AppState, "activeDomainId" | "domainData" | "allData" | "backlog">,
  patch: { allData?: AllData; backlog?: Task[] },
): { allData: AllData; backlog: Task[]; domainData: Record<string, DomainData> } {
  const newAllData = patch.allData ?? state.allData;
  const newBacklog = patch.backlog ?? state.backlog;
  return {
    allData: newAllData,
    backlog: newBacklog,
    domainData: {
      ...state.domainData,
      [state.activeDomainId]: {
        allData: newAllData,
        backlog: newBacklog,
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
      view: "table",
      clientMode: false,
      themeId: "#9B72CF",
      customColor: "",
      customDark: false,
      presBg: DEFAULT_PRES_BG,
      monthBudget: Array(12).fill("80"),
      filterStatuses: new Set(),
      filterPriorities: new Set(),
      sortKey: "",
      sortDir: 1,
      searchQuery: "",
      undoVersion: 0,

      setAllData: (data) => set(state => withDomainSync(state, { allData: data })),

      /** Replace all domainData (used by server sync pull). Merges with
       *  local domains not present on the server, then derives live
       *  allData/backlog for the active domain. */
      setDomainData: (newDomainData) => set(state => {
        const merged = { ...newDomainData };
        // Keep local domain entries not on server
        for (const [id, dd] of Object.entries(state.domainData)) {
          if (!merged[id]) merged[id] = dd;
        }
        const current = merged[state.activeDomainId] || { allData: initAllData(), backlog: [] };
        return {
          domainData: merged,
          allData: current.allData,
          backlog: current.backlog,
        };
      }),

      setCurrentMonth: (m) => set({ currentMonth: m, searchQuery: "" }),
      setView: (v) => set({ view: v }),

      updateTask: (month, taskId, key, value) => set(state => {
        const rows = state.allData[month] || [];
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
          // Save current domain data first
          const savedDomainData = {
            ...state.domainData,
            [state.activeDomainId]: { allData: state.allData, backlog: state.backlog },
          };
          // Initialize new domain
          const newEntry: DomainData = { allData: initAllData(), backlog: [] };
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
          const newData = newDomainData[newActiveId] || { allData: initAllData(), backlog: [] };
          return {
            domains: remaining,
            activeDomainId: newActiveId,
            domainData: newDomainData,
            allData: newData.allData,
            backlog: newData.backlog,
            searchQuery: "",
          };
        }
        // Save current domain data
        return {
          domains: remaining,
          domainData: {
            ...newDomainData,
            [state.activeDomainId]: { allData: state.allData, backlog: state.backlog },
          },
        };
      }),

      setActiveDomain: (id) => set(state => {
        // Save current domain data
        const updatedDomainData = {
          ...state.domainData,
          [state.activeDomainId]: { allData: state.allData, backlog: state.backlog },
        };
        // Load new domain data
        const newData = updatedDomainData[id] || { allData: initAllData(), backlog: [] };
        return {
          activeDomainId: id,
          domainData: updatedDomainData,
          allData: newData.allData,
          backlog: newData.backlog,
          searchQuery: "",
        };
      }),

      setTheme: (themeId) => set({ themeId, customColor: "" }),
      setCustomColor: (color, dark) => set({ customColor: color, customDark: dark, themeId: "custom" }),
      setPresBg: (bg) => set((s) => ({ presBg: { ...s.presBg, ...bg } })),
      setMonthBudget: (month, value) => set((s) => {
        const next = [...s.monthBudget];
        next[month] = value;
        return { monthBudget: next };
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
        // Save current domain data
        const savedDomainData = {
          ...state.domainData,
          [state.activeDomainId]: { allData: state.allData, backlog: state.backlog },
        };
        const newData = savedDomainData[newActiveId] || { allData: initAllData(), backlog: [] };
        return {
          domains,
          activeDomainId: newActiveId,
          domainData: savedDomainData,
          allData: newData.allData,
          backlog: newData.backlog,
        };
      }),
      setActiveDomainId: (id) => set(state => {
        const savedDomainData = {
          ...state.domainData,
          [state.activeDomainId]: { allData: state.allData, backlog: state.backlog },
        };
        const newData = savedDomainData[id] || { allData: initAllData(), backlog: [] };
        return {
          activeDomainId: id,
          domainData: savedDomainData,
          allData: newData.allData,
          backlog: newData.backlog,
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
        presBg: state.presBg,
        monthBudget: state.monthBudget,
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
          // Derive live allData/backlog from domainData[activeDomainId]
          const entry = state.domainData[state.activeDomainId];
          if (entry) {
            state.allData = entry.allData;
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
