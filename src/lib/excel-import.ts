import * as XLSX from "xlsx";
import { type Task, type Priority, type Status, PRIORITIES, STATUSES } from "@/lib/types";
import { fixStatus, fixPriority, evalExpr } from "@/lib/metrics";

/**
 * Разбор Excel-файла с задачами и сверка его с текущим месяцем.
 *
 * Здесь нет ничего от интерфейса: на входе файл или строки, на выходе —
 * данные. Благодаря этому логику можно проверить отдельно от модального окна,
 * которое её показывает (excel-import-modal.tsx).
 *
 * Порядок работы: parseWorkbook разбирает файл → buildDiff сравнивает
 * результат с задачами месяца и размечает строки как новые, изменённые
 * или совпадающие.
 */

export type EditableField = "name" | "planH" | "factH" | "priority" | "status" | "comment";

export interface ParsedRow {
  /** Original 1-based row number in the sheet, for user-friendly error reporting. */
  rowIndex: number;
  num: string;
  name: string;
  planH: string;
  factH: string;
  priority: Priority;
  status: Status;
  comment: string;
  /** Issues detected during parsing of this row (unknown priority, status, etc.) */
  warnings: string[];
}

export interface ParseResult {
  rows: ParsedRow[];
  /** Headers that were found in the file. Used for diagnostics. */
  headersFound: string[];
  /** Headers that we expected but did not find. Used for diagnostics. */
  headersMissing: string[];
  /** Soft warnings: e.g. "skipped 2 empty rows", "skipped row 'ИТОГО'". */
  notes: string[];
}

export type RowKind = "new" | "changed" | "same";

export interface FieldChange {
  /** Stable key — used for safe mapping back to Task fields. */
  key: EditableField;
  label: string;
  from: string;
  to: string;
}

export interface DiffRow {
  kind: RowKind;
  imported: ParsedRow;
  current: Task | null;
  changes: FieldChange[];
  selected: boolean;
  selectedChanges: boolean[];
}

export interface ApplyPayload {
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
}

/* ───────────────────────────────────────────────────────────────────────── */
/*  Field metadata (single source of truth)                                  */
/* ───────────────────────────────────────────────────────────────────────── */

const FIELD_LABELS: Record<EditableField, string> = {
  name: "Название",
  planH: "План",
  factH: "Факт",
  priority: "Приоритет",
  status: "Статус",
  comment: "Комментарий",
};
const COMPARED_FIELDS: EditableField[] = ["name", "planH", "factH", "priority", "status", "comment"];

/** All accepted column header variants — normalized to lowercase for matching. */
export const COLUMN_ALIASES: Record<string, EditableField | "num"> = {
  // num
  "номер": "num",
  "№": "num",
  "n": "num",
  "num": "num",
  // name
  "задача": "name",
  "наименование": "name",
  "название": "name",
  "name": "name",
  "task": "name",
  // planH
  "трудоемкость предв, ч": "planH",
  "трудоёмкость предв, ч": "planH",
  "трудоемкость предв": "planH",
  "трудоёмкость предв": "planH",
  "план, ч": "planH",
  "план": "planH",
  "planh": "planH",
  "plan": "planH",
  // factH
  "часы фактические": "factH",
  "факт, ч": "factH",
  "факт": "factH",
  "facth": "factH",
  "fact": "factH",
  // priority
  "приоритет": "priority",
  "priority": "priority",
  // status
  "статус": "status",
  "status": "status",
  // comment
  "комментарий": "comment",
  "comment": "comment",
  "примечание": "comment",
};

export const REQUIRED_FIELDS = ["num", "name"] as const;

/* ───────────────────────────────────────────────────────────────────────── */
/*  Parsing                                                                  */
/* ───────────────────────────────────────────────────────────────────────── */

const trimStr = (v: unknown): string => String(v ?? "").trim();

/** Looks at the file's headers and returns the map header → field key. */
export function detectHeaders(rawHeaders: string[]): {
  map: Map<string, EditableField | "num">;
  found: string[];
  missing: string[];
} {
  const map = new Map<string, EditableField | "num">();
  const found: string[] = [];

  for (const h of rawHeaders) {
    const norm = trimStr(h).toLowerCase();
    if (!norm) continue;
    const field = COLUMN_ALIASES[norm];
    if (field) {
      map.set(h, field);
      found.push(`«${h}» → ${field === "num" ? "Номер" : FIELD_LABELS[field]}`);
    }
  }

  // What did we expect?
  const detectedFields = new Set(map.values());
  const required = new Set<EditableField | "num">(["num", "name"]);
  const missing: string[] = [];
  for (const r of required) {
    if (!detectedFields.has(r)) {
      missing.push(r === "num" ? "Номер" : "Задача");
    }
  }
  return { map, found, missing };
}

export function isTotalRow(num: string, name: string): boolean {
  const n = name.trim().toLowerCase().replace(/[:.\s]+$/, "");
  const id = num.trim().toLowerCase();
  return n === "итого" || n === "total" || id === "итого" || id === "total";
}

export async function parseFile(file: File): Promise<ParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  if (!wb.SheetNames.length) {
    throw new Error("В файле нет ни одного листа. Откройте файл в Excel и проверьте, что данные есть.");
  }

  const ws = wb.Sheets[wb.SheetNames[0]];
  // header:1 → array-of-arrays; we manage headers manually so we can validate them.
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", blankrows: false });
  if (aoa.length === 0) {
    throw new Error("Лист пустой — на нём нет ни заголовков, ни строк.");
  }

  // First non-empty row is treated as the header row.
  let headerRowIdx = 0;
  while (headerRowIdx < aoa.length && aoa[headerRowIdx].every((c) => trimStr(c) === "")) {
    headerRowIdx++;
  }
  if (headerRowIdx >= aoa.length) {
    throw new Error("В файле не нашёл строки с заголовками.");
  }

  const rawHeaders = aoa[headerRowIdx].map((h) => trimStr(h));
  const { map: headerMap, found, missing } = detectHeaders(rawHeaders);

  if (missing.length) {
    throw new Error(
      `Не нашёл обязательные колонки: ${missing.map((m) => `«${m}»`).join(", ")}.\n` +
        `Распознал: ${found.length ? found.join("; ") : "ничего"}.\n` +
        `Подсказка: экспортируйте файл из трекера — у него правильный формат.`,
    );
  }

  const notes: string[] = [];
  const rows: ParsedRow[] = [];
  let skippedEmpty = 0;
  let skippedTotal = 0;

  for (let i = headerRowIdx + 1; i < aoa.length; i++) {
    const row = aoa[i];
    const get = (field: EditableField | "num"): unknown => {
      for (let c = 0; c < rawHeaders.length; c++) {
        if (headerMap.get(rawHeaders[c]) === field) return row[c];
      }
      return "";
    };

    const num = trimStr(get("num"));
    const name = trimStr(get("name"));
    if (!num && !name) {
      skippedEmpty++;
      continue;
    }
    if (isTotalRow(num, name)) {
      skippedTotal++;
      continue;
    }

    const warnings: string[] = [];

    const rawPriority = trimStr(get("priority"));
    const fixedPriority = fixPriority(rawPriority);
    if (rawPriority && fixedPriority === PRIORITIES.MEDIUM && rawPriority.toLowerCase() !== PRIORITIES.MEDIUM.toLowerCase()) {
      warnings.push(`Приоритет «${rawPriority}» не распознан → подставлен «${PRIORITIES.MEDIUM}»`);
    }

    const rawStatus = trimStr(get("status"));
    const fixedStatus = fixStatus(rawStatus);
    if (rawStatus && fixedStatus === STATUSES.IDEA && rawStatus.toLowerCase() !== STATUSES.IDEA.toLowerCase()) {
      warnings.push(`Статус «${rawStatus}» не распознан → подставлен «${STATUSES.IDEA}»`);
    }

    rows.push({
      rowIndex: i + 1, // 1-based for users
      num,
      name,
      planH: trimStr(get("planH")),
      factH: trimStr(get("factH")),
      priority: fixedPriority,
      status: fixedStatus,
      comment: trimStr(get("comment")),
      warnings,
    });
  }

  if (skippedEmpty) notes.push(`Пропущено пустых строк: ${skippedEmpty}`);
  if (skippedTotal) notes.push(`Пропущена строка итогов: ${skippedTotal}`);

  return { rows, headersFound: found, headersMissing: missing, notes };
}

/* ───────────────────────────────────────────────────────────────────────── */
/*  Diff building                                                            */
/* ───────────────────────────────────────────────────────────────────────── */

export function buildDiff(currentTasks: Task[], imported: ParsedRow[]): DiffRow[] {
  const byNum = new Map<string, Task>();
  for (const t of currentTasks) {
    // Пропускаем soft-delete tombstones — это удалённые задачи, которые
    // остаются в allData для серверной синхронизации, но в UI не видны.
    // Без этого фильтра импорт ошибочно считал бы их "текущими задачами"
    // и помечал бы заново загружаемые номера как "БЕЗ ИЗМЕНЕНИЙ".
    if (t._deleted) continue;
    const n = trimStr(t.num);
    if (n) byNum.set(n, t);
  }

  return imported.map((imp): DiffRow => {
    const cur = imp.num ? byNum.get(imp.num) ?? null : null;

    if (!cur) {
      return { kind: "new", imported: imp, current: null, changes: [], selected: true, selectedChanges: [] };
    }

    const changes: FieldChange[] = [];
    for (const f of COMPARED_FIELDS) {
      const from = trimStr((cur as unknown as Record<string, unknown>)[f]);
      const to = trimStr((imp as unknown as Record<string, unknown>)[f]);

      if (f === "planH" || f === "factH") {
        if (Math.abs(evalExpr(from) - evalExpr(to)) > 0.001) {
          changes.push({ key: f, label: FIELD_LABELS[f], from, to });
        }
      } else if (from !== to) {
        changes.push({ key: f, label: FIELD_LABELS[f], from, to });
      }
    }

    const kind: RowKind = changes.length > 0 ? "changed" : "same";
    return {
      kind,
      imported: imp,
      current: cur,
      changes,
      selected: kind === "changed",
      selectedChanges: changes.map(() => true),
    };
  });
}

/* ───────────────────────────────────────────────────────────────────────── */
/*  UI sub-components                                                        */
/* ───────────────────────────────────────────────────────────────────────── */

