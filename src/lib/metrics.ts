import { PRIO_START, STATUSES, PRIORITIES } from "./types";
import type { Task, TaskMetrics, Priority, Status } from "./types";
import { STATE } from "./tokens";

export const R2 = (v: number) => Math.round(v * 100) / 100;

// Safe math expression evaluator (NO Function() constructor)
export const evalExpr = (s: string): number => {
  const cleaned = String(s).replace(/,/g, ".").replace(/[^0-9+\-*/.() ]/g, "");
  if (!cleaned.trim()) return 0;
  try {
    // Simple safe parser - only supports basic arithmetic
    const result = parseArithmetic(cleaned);
    return isNaN(result) || !isFinite(result) ? 0 : Math.max(0, R2(result));
  } catch {
    return 0;
  }
};

// Simple recursive descent parser for arithmetic expressions
function parseArithmetic(expr: string): number {
  // Tokenize
  const tokens = tokenize(expr);
  let pos = 0;

  function parseExpr(): number {
    let left = parseTerm();
    while (pos < tokens.length && (tokens[pos] === "+" || tokens[pos] === "-")) {
      const op = tokens[pos++];
      const right = parseTerm();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number {
    let left = parseFactor();
    while (pos < tokens.length && (tokens[pos] === "*" || tokens[pos] === "/")) {
      const op = tokens[pos++];
      const right = parseFactor();
      left = op === "*" ? left * right : left / right;
    }
    return left;
  }

  function parseFactor(): number {
    if (pos < tokens.length && tokens[pos] === "(") {
      pos++; // skip (
      const val = parseExpr();
      if (pos < tokens.length && tokens[pos] === ")") pos++; // skip )
      return val;
    }
    const val = parseFloat(tokens[pos] || "0");
    if (pos < tokens.length) pos++;
    return val;
  }

  return parseExpr();
}

function tokenize(expr: string): string[] {
  const tokens: string[] = [];
  let current = "";
  for (const ch of expr) {
    if ("0123456789.".includes(ch)) {
      current += ch;
    } else {
      if (current) { tokens.push(current); current = ""; }
      if ("+-*/()".includes(ch)) tokens.push(ch);
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

export const fmt2 = (v: number) => {
  const n = R2(v);
  return n % 1 === 0 ? String(n) : n.toFixed(2);
};

/** Статусы считающиеся «закрытыми» — прогресс всегда 100%. */
export const CLOSED_STATUSES: ReadonlySet<Status> = new Set<Status>([
  STATUSES.COMPLETED,   // Выполненная
  STATUSES.PROD_CHECK,  // Контроль на прод
  STATUSES.DONE,        // Завершенная
]);

export const getTaskMetrics = (task: Task, totalFactMap?: Record<string, number>): TaskMetrics => {
  const plan = evalExpr(task.planH);
  const fact = evalExpr(task.factH);
  const totalH = task.num && totalFactMap ? (totalFactMap[task.num] || 0) : fact;
  const isClosed = CLOSED_STATUSES.has(task.status as Status);
  const prog = isClosed ? 100 : (plan > 0 ? Math.min(100, Math.round(totalH / plan * 100)) : 0);
  const over = isClosed ? totalH > plan : plan > 0 && totalH > plan;
  const variance = R2(totalH - plan);
  return { plan, fact, totalH: R2(totalH), prog, over, variance };
};

export const getRowsMetrics = (rows: Task[], totalFactMap?: Record<string, number>) => {
  let totPlan = 0, totFact = 0, progSum = 0, progCount = 0;
  const totalHByNum = new Map<string, number>(); // deduplicate by task num
  let totalHNoNum = 0; // for tasks without a num

  rows.forEach(r => {
    const m = getTaskMetrics(r, totalFactMap);
    totPlan += m.plan;
    totFact += m.fact;

    // For totalH: if task has a num, track the max cumulative total for that num
    // (to avoid double-counting same task num across multiple rows)
    if (r.num && totalFactMap) {
      const existing = totalHByNum.get(r.num) || 0;
      totalHByNum.set(r.num, Math.max(existing, m.totalH));
    } else {
      totalHNoNum += m.totalH;
    }

    if (m.plan > 0 || r.status === STATUSES.DONE) { progSum += m.prog; progCount++; }
  });

  const totTotalH = R2(totalHNoNum + Array.from(totalHByNum.values()).reduce((a, b) => a + b, 0));
  const avgProg = progCount ? Math.round(progSum / progCount) : 0;
  return { totPlan: R2(totPlan), totFact: R2(totFact), totTotalH, avgProg };
};

export const createNewTask = (): Task => ({
  id: crypto.randomUUID(),
  num: "",
  name: "",
  planH: "",
  factH: "",
  priority: PRIORITIES.MEDIUM,
  status: STATUSES.IDEA,
  comment: "",
  commentLog: [],
});

const ALL_STATUSES: Status[] = Object.values(STATUSES);

export const fixStatus = (s: unknown): Status => {
  if (!s || s === "—") return STATUSES.IDEA;
  const v = String(s).trim();
  if (v === "Выполнена") return STATUSES.COMPLETED;
  if ((ALL_STATUSES as string[]).includes(v)) return v as Status;
  const lower = v.toLowerCase();
  for (const st of ALL_STATUSES) {
    if (lower.includes(st.toLowerCase())) return st;
  }
  return STATUSES.IDEA;
};

const ALL_PRIORITIES: Priority[] = Object.values(PRIORITIES);

export const fixPriority = (s: unknown): Priority => {
  if (!s) return PRIORITIES.MEDIUM;
  const v = String(s).trim();
  if ((ALL_PRIORITIES as string[]).includes(v)) return v as Priority;
  const numMap: Record<string, Priority> = {
    "1": PRIORITIES.HIGHEST,
    "2": PRIORITIES.HIGH,
    "3": PRIORITIES.MEDIUM,
    "4": PRIORITIES.LOW,
    "5": PRIORITIES.QUEUE,
  };
  const m = v.match(/^(\d)/);
  if (m && numMap[m[1]]) return numMap[m[1]];
  return PRIORITIES.MEDIUM;
};

export const calcQueueMap = (rows: Task[]): Record<string, number> => {
  const map: Record<string, number> = {};
  rows.forEach((row, i) => {
    map[row.id] = i + 1;
  });
  return map;
};

/**
 * Кумулятивный итог по `num` задачи (вечной по номеру).
 *
 * Накапливает factH по `task.num` по ВСЕЙ истории из `dataByYearMonth`
 * (ключи "YYYY-MM"): все прошлые годы целиком + в текущем году месяцы
 * с 0 по upToMonth. Удалённые (tombstone) строки пропускаются.
 *
 * Возвращает Record<num, totalFact>. Подставляется в getTaskMetrics —
 * там `totalH = totalFactMap[num]`, а `fact` остаётся фактом текущей строки.
 * Таким образом «Итого» = накопление по задаче + факт этой строки.
 *
 * @param dataByYearMonth полная база, Record<"YYYY-MM", Task[]>
 * @param currentYear год текущего просмотра (для отсечения «будущего»)
 * @param upToMonth месяц текущего года (0..11) включительно, до которого копим
 */
export const buildTotalFactMap = (
  dataByYearMonth: Record<string, Task[]>,
  currentYear: number,
  upToMonth: number,
): Record<string, number> => {
  const map: Record<string, number> = {};
  for (const [key, rows] of Object.entries(dataByYearMonth)) {
    const parsed = /^(\d{4})-(\d{2})$/.exec(key);
    if (!parsed) continue;
    const year = Number(parsed[1]);
    const month = Number(parsed[2]) - 1; // 0..11
    // Только прошлое: прошлые годы целиком, текущий год — до upToMonth.
    if (year > currentYear) continue;
    if (year === currentYear && month > upToMonth) continue;
    (rows || []).forEach(row => {
      if (row._deleted) return; // пропускаем tombstone
      if (row.num) map[row.num] = (map[row.num] || 0) + evalExpr(row.factH);
    });
  }
  Object.keys(map).forEach(k => { map[k] = R2(map[k]); });
  return map;
};

export const sortVal = (row: Task, key: string, qMap: Record<string, number>, totalFactMap?: Record<string, number>): number => {
  if (key === "queue") return qMap[row.id] ?? 999;
  const m = getTaskMetrics(row, totalFactMap);
  if (key === "planH") return m.plan;
  if (key === "factH") return m.fact;
  if (key === "totalH") return m.totalH;
  if (key === "progress") return m.prog;
  return 0;
};

/**
 * Цвет итога, прогресс-бара и процента. Три состояния:
 *
 *  - перерасход (итого > план)          → красный
 *  - выполнено в рамках плана (100%)    → зелёный
 *  - в работе                           → чернильный
 *
 * Зелёный здесь не украшение: он отвечает на вопрос «уложились ли»
 * одним взглядом. Закрытым задачам getTaskMetrics ставит prog = 100,
 * поэтому отдельная проверка статуса не нужна.
 */
export const progColor = (p: number, _isClosed?: boolean, isOver?: boolean): string => {
  if (isOver) return STATE.danger;
  if (p >= 100) return STATE.success;
  return STATE.neutral;
};

// ─────────────────────────────────────────────────────────────────────────────
// Delta: Ролловер бюджета
// ─────────────────────────────────────────────────────────────────────────────

/** Лимит часов в месяце по умолчанию (240ч). */
export const MONTH_CAPACITY = 240;

/**
 * Рассчитывает budgetAllocated для текущего месяца с учётом ролловера.
 *
 * @param totalBudgetRequested — сколько часов нужно для задачи всего
 * @param usedHours            — сколько часов УЖЕ зарезервировано другими задачами в этом месяце
 * @param monthCapacity        — лимит месяца (дефолт 240)
 * @returns { budgetAllocated, budgetRollover }
 */
export function calcRollover(
  totalBudgetRequested: number,
  usedHours: number,
  monthCapacity: number = MONTH_CAPACITY,
): { budgetAllocated: number; budgetRollover: number } {
  const freeHours = Math.max(0, monthCapacity - usedHours);
  const budgetAllocated = Math.min(totalBudgetRequested, freeHours);
  const budgetRollover = Math.max(0, totalBudgetRequested - budgetAllocated);
  return { budgetAllocated: R2(budgetAllocated), budgetRollover: R2(budgetRollover) };
}

/**
 * Считает суммарные budgetAllocated по всем задачам месяца,
 * исключая отклонённые (approvalStatus === "rejected") и удалённые.
 * Если budgetAllocated не выставлен — фолбэк на planH задачи.
 */
export function calcMonthBudgetUsed(tasks: Task[]): number {
  return R2(
    tasks
      .filter((t) => !t._deleted && t.approvalStatus !== "rejected" && (t.status as string) !== "Очередь")
      .reduce((sum, t) => sum + (t.budgetAllocated ?? evalExpr(t.planH)), 0),
  );
}

/**
 * Вычисляет daysInStatus из statusChangedAt (ISO-строки).
 * Если statusChangedAt отсутствует — фолбэк на _ts задачи.
 */
export function calcDaysInStatus(task: Task): number {
  const ref = task.statusChangedAt || (task._ts ? new Date(task._ts).toISOString() : null);
  if (!ref) return 0;
  const ms = Date.now() - new Date(ref).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}
