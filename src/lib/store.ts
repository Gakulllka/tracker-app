import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { workspaceStorage, LEGACY_KEY } from "./workspace-storage";
import { PRIORITIES, STATUSES, MONTHS, PRIO_START, STATUS_ORDER } from "./types";
import type { Task, Domain, AllData, Status, Priority, CommentEntry } from "./types";
import { createNewTask } from "./metrics";
import { createUndoHelpers } from "./undo";
import { prepareTransfer } from "./transfer";
import { monthKey, parseMonthKey, buildAllDataForYear, listYearsWithData, type MonthKey } from "./month-keys";
import { DEFAULT_PRES_BG, type PresBgSettings } from "./presentation-bg";

// Реэкспорт: раньше эти сущности жили здесь, и на них ссылается много файлов.
export { DEFAULT_PRES_BG };
export type { PresBgSettings, MonthKey };

const undoHelpers = createUndoHelpers();

/**
 * Монотонная метка LWW: строго больше предыдущей, даже если две правки
 * пришлись на одну миллисекунду. Без этого сервер считает вторую правку
 * «той же версией» и молча пропускает её.
 */
const bumpTs = (prev?: number) => Math.max(Date.now(), (prev || 0) + 1);

function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}


function makeSystemLog(text: string): CommentEntry {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`,
    week: String(getWeekNumber(now)),
    text,
    planH: "—",
    factH: "—",
    // "—" — отображаемый плейсхолдер «нет статуса»; UI рендерит как обычный текст.
    status: "—" as Status,
  };
}

function getStateSnapshot() {
  const s = useTaskStore.getState();
  return { allData: s.allData, backlog: s.backlog };
}


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

/** Constructs "2025-10" from (2025, 9). Внимание: month 0..11. */
interface DomainData {
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
  view: "table" | "backlog" | "dashboard" | "slides" | "chat" | "design" | "questions" | "protocols";
  /** Phase 3: активный под-таб внутри Презентации. */
  presSubTab: "slides" | "ai";
  /** Режим интерфейса вкладки «Задачи»: simple (по умолчанию — минимум кнопок)
   *  или detailed (полный тулбар и настройки группировки). */
  uiMode: "simple" | "detailed";
  clientMode: boolean;

  // Theme
  /** Тёмная тема. Раньше жила внутри механизма выбора акцента (customDark). */
  darkMode: boolean;

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

  /** Текущий пользователь (username) — для подписи комментариев и синхронизации.
   *  Не персистится (sessionStorage-only): при логине выставляется из useAuth. */
  currentUsername: string;

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
  /** Переключить режим интерфейса вкладки «Задачи» (simple/detailed). */
  setUiMode: (v: "simple" | "detailed") => void;
  /** Установить текущего пользователя (username) — для подписи комментариев. */
  setCurrentUsername: (username: string) => void;

  // Task CRUD
  updateTask: (month: number, taskId: string, key: keyof Task, value: unknown) => void;
  archiveComment: (month: number, taskId: string) => void;
  deleteTask: (month: number, taskId: string) => void;
  setTaskVisibility: (month: number, taskId: string, userIds: string[]) => void;
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
  /** Phase 7: переключить только тёмную тему (без смены акцента). */
  setDarkMode: (dark: boolean) => void;

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
  bulkUpdateTasks: (month: number, ids: string[], key: keyof Task, value: unknown) => void;
  duplicateTask: (month: number, taskId: string) => void;

  // Import / Export
  exportJSON: () => string;
  importJSON: (json: string) => boolean;
}

const DEFAULT_DOMAIN: Domain = { id: "default", name: "По умолчанию" };

const initAllData = (): AllData => {
  const data: AllData = {};
  for (let i = 0; i < 12; i++) data[i] = [];
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

/** Сохраняет данные текущего домена (allData/backlog) в dataByYearMonth. */
function saveCurrentDomainData(
  state: Pick<AppState, "activeDomainId" | "domainData" | "allData" | "backlog" | "currentYear">,
): Record<string, DomainData> {
  const currentDom = state.domainData[state.activeDomainId];
  const currentByKey: Record<MonthKey, Task[]> = currentDom?.dataByYearMonth ?? {};
  const updated: Record<MonthKey, Task[]> = { ...currentByKey };
  for (let m = 0; m < 12; m++) {
    updated[monthKey(state.currentYear, m)] = state.allData[m] || [];
  }
  return {
    ...state.domainData,
    [state.activeDomainId]: {
      allData: state.allData,
      backlog: state.backlog,
      dataByYearMonth: updated,
    },
  };
}

export const useTaskStore = create<AppState>()(
  persist(
    (set, get): AppState => ({
      allData: initAllData(),
      backlog: [] as Task[],
      domainData: {} as Record<string, DomainData>,
      domains: [DEFAULT_DOMAIN],
      activeDomainId: "default",
      currentMonth: new Date().getMonth(),
      currentYear: new Date().getFullYear(),
      view: "table" as const,
      presSubTab: "slides" as const,
      uiMode: "simple" as const,
      clientMode: false,
      darkMode: false,
      presBg: DEFAULT_PRES_BG,
      filterStatuses: new Set(),
      filterPriorities: new Set(),
      sortKey: "",
      sortDir: 1,
      searchQuery: "",
      currentUsername: "",
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
        for (const [id, ddRaw] of Object.entries(newDomainData)) {
          // План часов: сервер отдаёт его только непустым; если во входящих
          // данных плана нет — сохраняем локальный, чтобы pull его не стёр.
          const dd: DomainData = ddRaw.monthlyPlanByYearMonth
            ? ddRaw
            : { ...ddRaw, monthlyPlanByYearMonth: state.domainData[id]?.monthlyPlanByYearMonth };
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
      setUiMode: (v) => set({ uiMode: v }),
      setCurrentUsername: (username) => set({ currentUsername: username }),

      updateTask: (month, taskId, key, value) => set(state => {
        const rows = state.allData[month] || [];
        // If setting status to POSTPONED — move to backlog automatically
        if (key === "status" && value === STATUSES.POSTPONED) {
          const task = rows.find(r => r.id === taskId);
          if (!task) return state; // no-op
          // Tombstone в месяце: иначе серверная копия «воскресит» задачу
          const newAllData = {
            ...state.allData,
            [month]: rows.map(r => r.id === taskId ? { ...r, _deleted: true, _ts: bumpTs(r._ts) } : r),
          };
          const backlogEntry = {
            ...task,
            status: STATUSES.POSTPONED,
            _ts: bumpTs(task._ts),
            commentLog: [...(task.commentLog || []), makeSystemLog("📦 Отложена → перемещена в беклог")],
          };
          return withDomainSync(state, { allData: newAllData, backlog: [...state.backlog, backlogEntry] });
        }
        const newAllData = {
          ...state.allData,
          [month]: rows.map(r => {
            if (r.id !== taskId) return r;
            const patch: Partial<Task> = { [key]: value, _ts: bumpTs(r._ts) };
            // При смене статуса сбрасываем таймер daysInStatus
            if (key === "status" && value !== r.status) {
              patch.statusChangedAt = new Date().toISOString();
              patch.daysInStatus = 0;
            }
            return { ...r, ...patch };
          }),
        };
        return withDomainSync(state, { allData: newAllData });
      }),

      archiveComment: (month, taskId) => {
        undoHelpers.snapshot(getStateSnapshot);
        set(state => {
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
              author: state.currentUsername || "",
            };
            return {
              ...r,
              comment: "",
              commentLog: [...(r.commentLog || []), logEntry],
            };
          }),
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
              r.id === taskId ? { ...r, _deleted: true, _ts: bumpTs(r._ts) } : r
            ),
          };
          return withDomainSync(state, { allData: newAllData });
        });
      },

      setTaskVisibility: (month, taskId, userIds) => set(state => {
        const rows = state.allData[month] || [];
        const newAllData = {
          ...state.allData,
          [month]: rows.map(r => {
            if (r.id !== taskId) return r;
            return { ...r, visibleTo: JSON.stringify(userIds), _ts: bumpTs(r._ts) };
          }),
        };
        return withDomainSync(state, { allData: newAllData });
      }),

      moveTasks: (taskId, fromMonth, toMonth) => {
        undoHelpers.snapshot(getStateSnapshot);
        set(state => {
          const fromRows = state.allData[fromMonth] || [];
          const task = fromRows.find(r => r.id === taskId);
          if (!task) return state; // no-op
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
          if (fi < 0 || ti < 0) return state; // no-op
          const [item] = rows.splice(fi, 1);
          rows.splice(ti, 0, item);
          // Порядок хранится в sortOrder каждой строки — бампим все, иначе
          // сервер проигнорирует перестановку как «ту же версию».
          const stamped = rows.map(r => ({ ...r, _ts: bumpTs(r._ts) }));
          const newAllData = { ...state.allData, [month]: stamped };
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
          const stamped = rows.map(r => ({ ...r, _ts: bumpTs(r._ts) }));
          const newAllData = { ...state.allData, [month]: stamped };
          return withDomainSync(state, { allData: newAllData });
        });
      },

      moveToBacklog: (month, taskId) => {
        undoHelpers.snapshot(getStateSnapshot);
        set(state => {
          const rows = state.allData[month] || [];
          const task = rows.find(r => r.id === taskId);
          if (!task) return state; // no-op
          // Tombstone вместо удаления: серверная копия месяца не воскреснет
          const newAllData = {
            ...state.allData,
            [month]: rows.map(r => r.id === taskId ? { ...r, _deleted: true, _ts: bumpTs(r._ts) } : r),
          };
          const backlogEntry = {
            ...task,
            priority: PRIORITIES.QUEUE,
            status: STATUSES.IDEA,
            _ts: bumpTs(task._ts),
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
          if (!task) return state; // no-op
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
            _ts: bumpTs(task._ts),
          };
          const existing = state.allData[targetMonth] || [];
          const isEmpty = existing.length === 1 && !existing[0].num && !existing[0].name;
          const newAllData = {
            ...state.allData,
            [targetMonth]: isEmpty ? [clean] : [...existing, clean],
          };
          // Tombstone в бэклоге: иначе серверная копия вернёт задачу обратно
          const newBacklog = state.backlog.map(t =>
            t.id === taskId ? { ...t, _deleted: true, _ts: bumpTs(t._ts) } : t
          );
          return withDomainSync(state, { allData: newAllData, backlog: newBacklog });
        });
      },

      returnFromBacklogWithEdits: (taskId, targetMonth, edits) => {
        undoHelpers.snapshot(getStateSnapshot);
        set(state => {
          const task = state.backlog.find(t => t.id === taskId);
          if (!task) return state; // no-op
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
            _ts: bumpTs(task._ts),
          };
          const existing = state.allData[targetMonth] || [];
          const isEmpty = existing.length === 1 && !existing[0].num && !existing[0].name;
          const newAllData = {
            ...state.allData,
            [targetMonth]: isEmpty ? [clean] : [...existing, clean],
          };
          // Tombstone в бэклоге: иначе серверная копия вернёт задачу обратно
          const newBacklog = state.backlog.map(t =>
            t.id === taskId ? { ...t, _deleted: true, _ts: bumpTs(t._ts) } : t
          );
          return withDomainSync(state, { allData: newAllData, backlog: newBacklog });
        });
      },

      deleteBacklogTask: (taskId) => {
        undoHelpers.snapshot(getStateSnapshot);
        set(state => {
          const newBacklog = state.backlog.map(t =>
            t.id === taskId ? { ...t, _deleted: true, _ts: bumpTs(t._ts) } : t
          );
          return withDomainSync(state, { backlog: newBacklog });
        });
      },

      reorderBacklog: (fromId, toId) => {
        undoHelpers.snapshot(getStateSnapshot);
        set(state => {
          const fromIdx = state.backlog.findIndex(t => t.id === fromId);
          const toIdx = state.backlog.findIndex(t => t.id === toId);
          if (fromIdx === -1 || toIdx === -1) return state; // no-op
          const reordered = [...state.backlog];
          const [moved] = reordered.splice(fromIdx, 1);
          reordered.splice(toIdx, 0, moved);
          const newBacklog = reordered.map(t => ({ ...t, _ts: bumpTs(t._ts) }));
          return withDomainSync(state, { backlog: newBacklog });
        });
      },

      updateBacklogTask: (taskId, key, value) => {
        undoHelpers.snapshot(getStateSnapshot);
        set(state => {
          const newBacklog = state.backlog.map(t =>
            t.id === taskId ? { ...t, [key]: value, _ts: bumpTs(t._ts) } : t
          );
          return withDomainSync(state, { backlog: newBacklog });
        });
      },

      addDomain: (name) => {
        const id = "dom_" + Date.now();
        set(state => {
          const savedDomainData = saveCurrentDomainData(state);
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
        if (state.domains.length <= 1) return state; // no-op
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
        // Save current domain data
        const savedDomainData = saveCurrentDomainData(state);
        return {
          domains: remaining,
          domainData: {
            ...savedDomainData,
            [id]: savedDomainData[id], // keep deleted domain's saved data briefly
          },
        };
      }),

      setActiveDomain: (id) => set(state => {
        const updatedDomainData = saveCurrentDomainData(state);

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

      setDarkMode: (dark) => set({ darkMode: dark }),
      setPresBg: (bg) => set((s) => ({ presBg: { ...s.presBg, ...bg } })),

      /** Phase 7.2: записать план часов в monthlyPlanByYearMonth активного домена. */
      setMonthlyPlan: (monthKey, hours) => set((s) => {
        const dom = s.domainData[s.activeDomainId];
        if (!dom) return s; // no-op: домена нет, ничего не меняем
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
        const savedDomainData = saveCurrentDomainData(state);
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
      setActiveDomainId: (id) => { get().setActiveDomain(id); },

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
      // Логика отбора — в lib/transfer.ts, здесь только запись в стор.
      transferIncompleteTasks: (fromMonth, toMonth) => {
        const state = get();
        const { transferred } = prepareTransfer(state.allData[fromMonth] || []);
        if (transferred.length === 0) return 0;

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
          if (fromRows.length === 0) return state; // no-op
          const newAllData = {
            ...state.allData,
            [fromMonth]: [],
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
            [month]: [],
          };
          return withDomainSync(state, { allData: newAllData });
        });
      },

      bulkUpdateTasks: (month, ids, key, value) => {
        undoHelpers.snapshot(getStateSnapshot);
        set(state => {
          const idSet = new Set(ids);
          const newAllData = {
            ...state.allData,
            [month]: (state.allData[month] || []).map(r =>
              idSet.has(r.id) ? { ...r, [key]: value, _ts: bumpTs(r._ts) } : r
            ),
          };
          return withDomainSync(state, { allData: newAllData });
        });
      },

      duplicateTask: (month, taskId) => {
        undoHelpers.snapshot(getStateSnapshot);
        set(state => {
          const rows = state.allData[month] || [];
          const task = rows.find(r => r.id === taskId);
          if (!task) return state;
          const copy: Task = {
            ...task,
            id: crypto.randomUUID(),
            num: task.num ? `${task.num}-copy` : "",
            _ts: Date.now(),
          };
          const idx = rows.findIndex(r => r.id === taskId);
          const newRows = [...rows];
          newRows.splice(idx + 1, 0, copy);
          const newAllData = { ...state.allData, [month]: newRows };
          return withDomainSync(state, { allData: newAllData });
        });
      },

      // Export / Import
      exportJSON: () => {
        const state = get();
        return JSON.stringify({
          version: 2,
          domainData: state.domainData,
          domains: state.domains,
          activeDomainId: state.activeDomainId,
          currentMonth: state.currentMonth,
          currentYear: state.currentYear,
        }, null, 2);
      },

      importJSON: (json: string) => {
        try {
          const data = JSON.parse(json);
          if (data.version === 2 && data.domainData) {
            set(state => ({
              ...withDomainSync(state, {
                allData: state.allData,
                backlog: state.backlog,
              }),
              domainData: data.domainData,
              domains: data.domains || state.domains,
              activeDomainId: data.activeDomainId || state.activeDomainId,
              currentMonth: data.currentMonth ?? state.currentMonth,
              currentYear: data.currentYear ?? state.currentYear,
            }));
            return true;
          }
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
      name: LEGACY_KEY,
      storage: createJSONStorage(() => workspaceStorage),
      partialize: (state) => ({
        domainData: state.domainData,
        domains: state.domains,
        activeDomainId: state.activeDomainId,
        darkMode: state.darkMode,
        currentMonth: state.currentMonth,
        currentYear: state.currentYear,
        presBg: state.presBg,
        uiMode: state.uiMode,
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
  /** Сброс истории undo/redo (используется синком при чужих правках). */
  clear: () => undoHelpers.clear(),
};
