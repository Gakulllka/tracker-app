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

export const getTaskMetrics = (task: Task, totalFactMap?: Record<string, number>): TaskMetrics => {
  const plan = evalExpr(task.planH);
  const fact = evalExpr(task.factH);
  const totalH = task.num && totalFactMap ? (totalFactMap[task.num] || 0) : fact;
  const isDone = task.status === STATUSES.DONE;
  const prog = isDone ? 100 : (plan > 0 ? Math.min(100, Math.round(totalH / plan * 100)) : 0);
  const over = plan > 0 && totalH > plan;
  const variance = R2(totalH - plan);
  return { plan, fact, totalH: R2(totalH), prog, over, variance };
};

export const getRowsMetrics = (rows: Task[], totalFactMap?: Record<string, number>) => {
  let totPlan = 0, totFact = 0, totTotalH = 0, progSum = 0, progCount = 0;
  rows.forEach(r => {
    const m = getTaskMetrics(r, totalFactMap);
    totPlan += m.plan;
    totFact += m.fact;
    totTotalH += m.totalH;
    if (m.plan > 0 || r.status === STATUSES.DONE) { progSum += m.prog; progCount++; }
  });
  const avgProg = progCount ? Math.round(progSum / progCount) : 0;
  return { totPlan: R2(totPlan), totFact: R2(totFact), totTotalH: R2(totTotalH), avgProg };
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

export const progColor = (p: number): string => p >= 100 ? "#4a9a5a" : p >= 50 ? "#5090b8" : "#b89830";

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
