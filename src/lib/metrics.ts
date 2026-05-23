import { Task, TaskMetrics, Priority, PRIO_START, Status, STATUSES, PRIORITIES } from "./types";

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
  const cnt: Record<string, number> = {};
  const map: Record<string, number> = {};
  rows.forEach(row => {
    const b = PRIO_START[row.priority] ?? 50;
    cnt[row.priority] = (cnt[row.priority] || 0);
    map[row.id] = b + cnt[row.priority];
    cnt[row.priority]++;
  });
  return map;
};

export const buildTotalFactMap = (allData: Record<number, Task[]>, upToMonth: number): Record<string, number> => {
  const map: Record<string, number> = {};
  for (let mi = 0; mi <= upToMonth; mi++) {
    (allData[mi] || []).forEach(row => {
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

/** Цвет прогресс-бара:
 *  - задача закрыта без перевыполнения → зелёный
 *  - задача закрыта с перевыполнением  → красный  (через over-флаг в TableCell)
 *  - в процессе                        → синий / жёлтый по % */
export const progColor = (p: number, isClosed?: boolean, isOver?: boolean): string => {
  if (isClosed) return isOver ? "#ef4444" : "#22c55e";
  return "#f59e0b";
};

export interface CommentFormulaResult {
  comment: string;
  planH: string;
  factH: string;
}

export function processCommentFormulas(
  comment: string,
  row: { planH: string; factH: string }
): CommentFormulaResult | null {
  const rx = /@(план|факт)\s*([+\-*=])\s*([\d.,]+)/gi;
  let nc = comment;
  let np = row.planH;
  let nf = row.factH;
  const logs: string[] = [];
  let m: RegExpExecArray | null;

  while ((m = rx.exec(comment)) !== null) {
    const [full, field, op, ns] = m;
    const num = parseFloat(ns.replace(",", "."));
    if (isNaN(num)) continue;
    const isPlan = /план/i.test(field);
    const cur = evalExpr(isPlan ? row.planH : row.factH);
    let nv: number;
    switch (op) {
      case "+": nv = cur + num; break;
      case "-": nv = cur - num; break;
      case "*": nv = R2(cur * num); break;
      case "=": nv = num; break;
      default: continue;
    }
    nv = R2(Math.max(0, nv));
    const lbl = isPlan ? "План" : "Факт";
    logs.push(`${lbl}: ${cur}→${nv}`);
    if (isPlan) np = String(nv); else nf = String(nv);
    nc = nc.replace(full, "");
  }

  if (!logs.length) return null;

  nc = nc.replace(/\n{2,}/g, "\n").trim();
  const tag = `[${logs.join(", ")}]`;
  nc = nc ? nc + "\n" + tag : tag;
  return { comment: nc, planH: np, factH: nf };
}

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
      .filter((t) => !t._deleted && t.approvalStatus !== "rejected")
      .reduce((sum, t) => sum + (t.budgetAllocated ?? evalExpr(t.planH)), 0),
  );
}

/**
 * Индикатор здоровья команды (0–100).
 * Падает если factH > monthCapacity или есть блокеры.
 */
export function calcHealthScore(
  tasks: Task[],
  monthCapacity: number = MONTH_CAPACITY,
): number {
  const alive = tasks.filter((t) => !t._deleted && t.approvalStatus !== "rejected");
  if (alive.length === 0) return 100;

  const totalFact = alive.reduce((s, t) => s + evalExpr(t.factH), 0);
  const totalAllocated = alive.reduce((s, t) => s + (t.budgetAllocated ?? evalExpr(t.planH)), 0);
  const blockers = alive.filter((t) => (t.status as string) === "Блокер").length;

  let score = 100;
  // Перегрев факта
  if (monthCapacity > 0) {
    const overload = Math.max(0, totalFact - monthCapacity) / monthCapacity;
    score -= Math.round(overload * 40);
  }
  // Перегрев аллокации
  if (monthCapacity > 0 && totalAllocated > monthCapacity) {
    score -= Math.round(((totalAllocated - monthCapacity) / monthCapacity) * 20);
  }
  // Блокеры
  score -= blockers * 5;

  return Math.max(0, Math.min(100, score));
}

/**
 * Прогноз даты исчерпания бюджета.
 * @param remainingHours — оставшиеся зарезервированные часы
 * @param hoursPerDay    — скорость расходования (дефолт 12ч/день)
 * @returns строка "dd.mm.yyyy" или null
 */
export function calcBudgetExhaustDate(
  remainingHours: number,
  hoursPerDay: number = 12,
): string | null {
  if (remainingHours <= 0 || hoursPerDay <= 0) return null;
  const days = Math.ceil(remainingHours / hoursPerDay);
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
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
