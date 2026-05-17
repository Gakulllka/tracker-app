"use client";

import React, { useState, useCallback, useRef, useMemo, useEffect } from "react";
import * as XLSX from "xlsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Check,
  Loader2,
  FileSpreadsheet,
  X,
  Upload,
  ArrowRight,
  AlertTriangle,
  Sparkles,
  Search,
  Info,
  RefreshCw,
} from "lucide-react";
import { type Task, type Priority, type Status, PRIORITIES, STATUSES } from "@/lib/types";
import { fixStatus, fixPriority, evalExpr } from "@/lib/metrics";

/* ───────────────────────────────────────────────────────────────────────── */
/*  Types                                                                    */
/* ───────────────────────────────────────────────────────────────────────── */

type EditableField = "name" | "planH" | "factH" | "priority" | "status" | "comment";

interface ParsedRow {
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

interface ParseResult {
  rows: ParsedRow[];
  /** Headers that were found in the file. Used for diagnostics. */
  headersFound: string[];
  /** Headers that we expected but did not find. Used for diagnostics. */
  headersMissing: string[];
  /** Soft warnings: e.g. "skipped 2 empty rows", "skipped row 'ИТОГО'". */
  notes: string[];
}

type RowKind = "new" | "changed" | "same";

interface FieldChange {
  /** Stable key — used for safe mapping back to Task fields. */
  key: EditableField;
  label: string;
  from: string;
  to: string;
}

interface DiffRow {
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
const COLUMN_ALIASES: Record<string, EditableField | "num"> = {
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

const REQUIRED_FIELDS = ["num", "name"] as const;

/* ───────────────────────────────────────────────────────────────────────── */
/*  Parsing                                                                  */
/* ───────────────────────────────────────────────────────────────────────── */

const trimStr = (v: unknown): string => String(v ?? "").trim();

/** Looks at the file's headers and returns the map header → field key. */
function detectHeaders(rawHeaders: string[]): {
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

function isTotalRow(num: string, name: string): boolean {
  const n = name.trim().toLowerCase().replace(/[:.\s]+$/, "");
  const id = num.trim().toLowerCase();
  return n === "итого" || n === "total" || id === "итого" || id === "total";
}

async function parseFile(file: File): Promise<ParseResult> {
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

function buildDiff(currentTasks: Task[], imported: ParsedRow[]): DiffRow[] {
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

function KindBadge({ kind }: { kind: RowKind }) {
  const map: Record<RowKind, { label: string; bg: string; color: string; border: string }> = {
    new: {
      label: "НОВАЯ",
      bg: "var(--tracker-accent)",
      color: "#fff",
      border: "var(--tracker-accent)",
    },
    changed: {
      label: "ИЗМЕНЕНА",
      bg: "rgba(245,158,11,.15)",
      color: "#b45309",
      border: "rgba(245,158,11,.35)",
    },
    same: {
      label: "БЕЗ ИЗМЕНЕНИЙ",
      bg: "rgba(148,163,184,.10)",
      color: "var(--tracker-text-muted)",
      border: "var(--tracker-border)",
    },
  };
  const s = map[kind];
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 99,
        background: s.bg,
        color: s.color,
        letterSpacing: ".06em",
        border: `1px solid ${s.border}`,
        flexShrink: 0,
        whiteSpace: "nowrap",
        lineHeight: 1.6,
      }}
    >
      {s.label}
    </span>
  );
}

function Chip({ label, color, dim = false }: { label: string; color: string; dim?: boolean }) {
  return (
    <span
      style={{
        fontSize: 11,
        padding: "2px 8px",
        borderRadius: 99,
        border: `1px solid ${color}33`,
        color: dim ? "var(--tracker-text-muted)" : color,
        background: dim ? "transparent" : `${color}12`,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        maxWidth: 200,
      }}
    >
      {label}
    </span>
  );
}

function StatPill({
  count,
  label,
  color,
  bg,
  active,
  onClick,
  icon,
}: {
  count: number;
  label: string;
  color: string;
  bg: string;
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        padding: "6px 12px",
        borderRadius: 8,
        background: active ? bg : "transparent",
        border: `1px solid ${active ? color : "var(--tracker-border)"}`,
        color: active ? color : "var(--tracker-text-muted)",
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        transition: "all .15s",
        whiteSpace: "nowrap",
      }}
    >
      {icon}
      <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{count}</span>
      <span>{label}</span>
    </button>
  );
}

/* ───────────────────────────────────────────────────────────────────────── */
/*  Single row in the diff list                                              */
/* ───────────────────────────────────────────────────────────────────────── */

function TaskRow({
  row,
  onToggle,
  onToggleChange,
}: {
  row: DiffRow;
  onToggle: () => void;
  onToggleChange: (i: number) => void;
}) {
  const borderColor =
    row.kind === "new"
      ? "var(--tracker-accent)"
      : row.kind === "changed"
      ? "rgba(245,158,11,.45)"
      : "var(--tracker-border)";
  const dimmed = !row.selected && row.kind !== "same";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.2fr)",
        borderRadius: 10,
        overflow: "hidden",
        border: `1px solid ${borderColor}`,
        opacity: dimmed ? 0.45 : 1,
        transition: "opacity .15s, transform .15s, box-shadow .15s",
        boxShadow: row.selected && row.kind !== "same" ? `0 1px 3px ${borderColor}33` : "none",
      }}
    >
      {/* LEFT — task identity */}
      <div
        onClick={row.kind !== "same" ? onToggle : undefined}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          padding: "11px 14px",
          background: "var(--tracker-bg-card)",
          cursor: row.kind !== "same" ? "pointer" : "default",
          borderRight: "1px solid var(--tracker-border)",
        }}
      >
        {row.kind !== "same" && (
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              flexShrink: 0,
              marginTop: 2,
              border: `2px solid ${row.selected ? borderColor : "var(--tracker-border)"}`,
              background: row.selected ? borderColor : "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all .15s",
            }}
          >
            {row.selected && <Check style={{ width: 11, height: 11, color: "#fff", strokeWidth: 3 }} />}
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4, flexWrap: "wrap" }}>
            {row.imported.num && (
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontWeight: 700,
                  color: row.kind === "new" ? "var(--tracker-accent)" : "var(--tracker-text-muted)",
                }}
              >
                #{row.imported.num}
              </span>
            )}
            <KindBadge kind={row.kind} />
            {row.imported.warnings.length > 0 && (
              <span
                title={row.imported.warnings.join("\n")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "2px 7px",
                  borderRadius: 99,
                  background: "rgba(245,158,11,.12)",
                  color: "#b45309",
                  border: "1px solid rgba(245,158,11,.35)",
                }}
              >
                <AlertTriangle style={{ width: 10, height: 10 }} />
                {row.imported.warnings.length} замеч.
              </span>
            )}
          </div>
          <p
            style={{
              fontSize: 13,
              color: "var(--tracker-text-main)",
              lineHeight: 1.4,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {row.imported.name || (
              <span style={{ color: "var(--tracker-text-muted)", fontStyle: "italic" }}>
                без названия (стр. {row.imported.rowIndex})
              </span>
            )}
          </p>
        </div>
      </div>

      {/* RIGHT — changes / preview */}
      <div
        style={{
          padding: "11px 14px",
          background: "var(--tracker-bg-main)",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          justifyContent: "center",
          minWidth: 0,
        }}
      >
        {row.kind === "new" && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            <Chip label={row.imported.status} color="var(--tracker-accent)" />
            <Chip label={row.imported.priority} color="var(--tracker-text-muted)" dim />
            {row.imported.planH && (
              <Chip label={`план ${row.imported.planH} ч`} color="var(--tracker-text-muted)" dim />
            )}
            {row.imported.factH && (
              <Chip label={`факт ${row.imported.factH} ч`} color="var(--tracker-text-muted)" dim />
            )}
          </div>
        )}

        {row.kind === "changed" &&
          row.changes.map((c, i) => (
            <div
              key={c.key}
              onClick={() => onToggleChange(i)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                cursor: "pointer",
                opacity: row.selectedChanges[i] ? 1 : 0.35,
                transition: "opacity .15s",
                minWidth: 0,
              }}
            >
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  flexShrink: 0,
                  border: `1.5px solid ${row.selectedChanges[i] ? "rgba(245,158,11,.85)" : "var(--tracker-border)"}`,
                  background: row.selectedChanges[i] ? "rgba(245,158,11,.85)" : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {row.selectedChanges[i] && <Check style={{ width: 9, height: 9, color: "#fff", strokeWidth: 3 }} />}
              </div>
              <span style={{ fontSize: 11, color: "var(--tracker-text-muted)", flexShrink: 0, width: 76 }}>
                {c.label}
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: "var(--tracker-text-muted)",
                  flexShrink: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  textDecoration: "line-through",
                  textDecorationColor: "var(--tracker-border)",
                }}
              >
                {c.from || "—"}
              </span>
              <ArrowRight style={{ width: 12, height: 12, color: "var(--tracker-accent)", flexShrink: 0 }} />
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--tracker-accent)",
                  flexShrink: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {c.to || "—"}
              </span>
            </div>
          ))}

        {row.kind === "same" && (
          <span
            style={{
              fontSize: 12,
              color: "var(--tracker-text-muted)",
              fontStyle: "italic",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Check style={{ width: 12, height: 12 }} />
            совпадает с текущей
          </span>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────────── */
/*  Drop zone                                                                */
/* ───────────────────────────────────────────────────────────────────────── */

function DropZone({ onFile, loading }: { onFile: (f: File) => void; loading: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
      onClick={() => ref.current?.click()}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "18px 22px",
        borderRadius: 12,
        cursor: "pointer",
        transition: "all .18s",
        border: `2px dashed ${drag ? "var(--tracker-accent)" : "var(--tracker-border)"}`,
        background: drag ? "var(--tracker-accent-bg)" : "transparent",
      }}
    >
      <input
        ref={ref}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      {loading ? (
        <>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "var(--tracker-accent-bg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Loader2
              style={{ width: 20, height: 20, color: "var(--tracker-accent)" }}
              className="animate-spin"
            />
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--tracker-text-main)" }}>Читаем файл…</p>
            <p style={{ fontSize: 11, color: "var(--tracker-text-muted)", marginTop: 2 }}>
              Сравним содержимое с задачами текущего месяца
            </p>
          </div>
        </>
      ) : (
        <>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "var(--tracker-accent-bg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <FileSpreadsheet style={{ width: 20, height: 20, color: "var(--tracker-accent)" }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--tracker-text-main)" }}>
              Перетащите файл или нажмите, чтобы выбрать
            </p>
            <p style={{ fontSize: 11, color: "var(--tracker-text-muted)", marginTop: 3 }}>
              .xlsx или .xls · сверка по колонке <b style={{ color: "var(--tracker-text-main)" }}>«Номер»</b>
            </p>
          </div>
          <Upload
            style={{
              width: 18,
              height: 18,
              color: "var(--tracker-text-muted)",
              flexShrink: 0,
            }}
          />
        </>
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────────── */
/*  Empty/help states                                                        */
/* ───────────────────────────────────────────────────────────────────────── */

function FormatHint() {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "12px 14px",
        borderRadius: 10,
        background: "var(--tracker-bg-card)",
        border: "1px solid var(--tracker-border)",
      }}
    >
      <Info
        style={{ width: 16, height: 16, color: "var(--tracker-accent)", flexShrink: 0, marginTop: 2 }}
      />
      <div style={{ fontSize: 12, color: "var(--tracker-text-muted)", lineHeight: 1.55 }}>
        <p style={{ color: "var(--tracker-text-main)", fontWeight: 600, marginBottom: 4 }}>
          Какой формат файла поддерживается
        </p>
        <p>
          Первая строка листа — заголовки. Распознаются:{" "}
          <b style={{ color: "var(--tracker-text-main)" }}>Номер</b>,{" "}
          <b style={{ color: "var(--tracker-text-main)" }}>Задача</b>,{" "}
          <b style={{ color: "var(--tracker-text-main)" }}>Трудоёмкость предв, ч</b>,{" "}
          <b style={{ color: "var(--tracker-text-main)" }}>Часы фактические</b>,{" "}
          <b style={{ color: "var(--tracker-text-main)" }}>Приоритет</b>,{" "}
          <b style={{ color: "var(--tracker-text-main)" }}>Статус</b>,{" "}
          <b style={{ color: "var(--tracker-text-main)" }}>Комментарий</b>. Порядок колонок неважен; синонимы тоже
          подойдут. Удобнее всего: экспортировать месяц в Excel, поправить в любимой программе, импортировать обратно.
        </p>
      </div>
    </div>
  );
}

function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "14px 16px",
        borderRadius: 10,
        background: "rgba(239,68,68,.06)",
        border: "1px solid rgba(239,68,68,.35)",
      }}
    >
      <AlertTriangle style={{ width: 18, height: 18, color: "#dc2626", flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "#b91c1c", marginBottom: 4 }}>Не получилось прочитать файл</p>
        <p
          style={{
            fontSize: 12,
            color: "var(--tracker-text-main)",
            whiteSpace: "pre-wrap",
            lineHeight: 1.55,
          }}
        >
          {message}
        </p>
      </div>
      <Button variant="outline" size="sm" className="h-7 gap-1.5" onClick={onRetry}>
        <RefreshCw style={{ width: 12, height: 12 }} />
        Заново
      </Button>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────────── */
/*  Main component                                                           */
/* ───────────────────────────────────────────────────────────────────────── */

type Filter = "all" | "new" | "changed" | "same";

export function ExcelImportModal({
  isOpen,
  onClose,
  currentMonthTasks,
  currentMonth: _currentMonth, // currently unused — kept for API parity
  onApplyChanges,
  initialFile,
}: {
  isOpen: boolean;
  onClose: () => void;
  currentMonthTasks: Task[];
  currentMonth: number;
  onApplyChanges: (changes: ApplyPayload) => void;
  /** When passed, the modal will start parsing this file immediately on open. */
  initialFile?: File | null;
}) {
  // Suppress unused-var lint on the API-parity prop.
  void _currentMonth;

  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseNotes, setParseNotes] = useState<string[]>([]);
  const [rows, setRows] = useState<DiffRow[]>([]);
  const [parsedCount, setParsedCount] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  const reset = useCallback(() => {
    setFileName("");
    setRows([]);
    setParsedCount(0);
    setParseError(null);
    setParseNotes([]);
    setFilter("all");
    setSearch("");
    setLoading(false);
    setApplying(false);
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setFileName(file.name);
      setParseError(null);
      setParseNotes([]);
      setLoading(true);
      try {
        const result = await parseFile(file);
        setRows(buildDiff(currentMonthTasks, result.rows));
        setParsedCount(result.rows.length);
        setParseNotes(result.notes);
        setFilter("all");
      } catch (err) {
        setParseError(err instanceof Error ? err.message : String(err));
        setRows([]);
        setParsedCount(0);
      } finally {
        setLoading(false);
      }
    },
    [currentMonthTasks],
  );

  // Auto-parse initialFile when the modal opens with one attached.
  // ref-guard, чтобы не плодить лишние setState и не триггерить linter
  // (react-hooks/set-state-in-effect).
  const lastAutoParsedRef = useRef<File | null>(null);
  useEffect(() => {
    if (!isOpen) {
      lastAutoParsedRef.current = null;
      return;
    }
    if (initialFile && lastAutoParsedRef.current !== initialFile) {
      lastAutoParsedRef.current = initialFile;
      void handleFile(initialFile);
    }
  }, [isOpen, initialFile, handleFile]);

  const toggleRow = useCallback((i: number) => {
    setRows((prev) =>
      prev.map((r, idx) => {
        if (idx !== i) return r;
        if (r.kind === "same") return r;
        const next = !r.selected;
        return {
          ...r,
          selected: next,
          selectedChanges: r.selectedChanges.map(() => next),
        };
      }),
    );
  }, []);

  const toggleChange = useCallback((rowIdx: number, changeIdx: number) => {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== rowIdx) return r;
        const sc = r.selectedChanges.map((v, j) => (j === changeIdx ? !v : v));
        return { ...r, selectedChanges: sc, selected: sc.some(Boolean) };
      }),
    );
  }, []);

  const selectAll = useCallback(
    () =>
      setRows((p) =>
        p.map((r) => ({
          ...r,
          selected: r.kind !== "same",
          selectedChanges: r.selectedChanges.map(() => true),
        })),
      ),
    [],
  );
  const deselectAll = useCallback(
    () =>
      setRows((p) =>
        p.map((r) => ({
          ...r,
          selected: false,
          selectedChanges: r.selectedChanges.map(() => false),
        })),
      ),
    [],
  );

  // Stats / filters ───────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const newRows = rows.filter((r) => r.kind === "new");
    const changedRows = rows.filter((r) => r.kind === "changed");
    const sameRows = rows.filter((r) => r.kind === "same");
    const importedNums = new Set(
      rows.map((r) => r.imported.num).filter((n) => n),
    );
    const untouched = currentMonthTasks.filter(
      (t) => !t._deleted && t.num && !importedNums.has(t.num),
    ).length;
    return {
      total: rows.length,
      newCount: newRows.length,
      changedCount: changedRows.length,
      sameCount: sameRows.length,
      untouched,
      toAdd: newRows.filter((r) => r.selected).length,
      toUpdate: changedRows.filter((r) => r.selected).length,
      hasAny: rows.some((r) => r.selected && r.kind !== "same"),
      warningsCount: rows.reduce((a, r) => a + r.imported.warnings.length, 0),
    };
  }, [rows, currentMonthTasks]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .map((r, i) => ({ row: r, idx: i }))
      .filter(({ row }) => {
        if (filter !== "all" && row.kind !== filter) return false;
        if (!q) return true;
        return (
          row.imported.name.toLowerCase().includes(q) ||
          row.imported.num.toLowerCase().includes(q)
        );
      });
  }, [rows, filter, search]);

  /* ── Apply ─────────────────────────────────────────────────────────── */
  const apply = useCallback(async () => {
    setApplying(true);
    try {
      const newTasks: ApplyPayload["newTasks"] = [];
      const updatedTasks: Task[] = [];
      for (const row of rows) {
        if (!row.selected) continue;
        if (row.kind === "new") {
          newTasks.push({
            num: row.imported.num,
            name: row.imported.name,
            planH: row.imported.planH,
            factH: row.imported.factH,
            priority: row.imported.priority,
            status: row.imported.status,
            comment: row.imported.comment,
          });
          continue;
        }
        if (row.kind === "changed" && row.current) {
          const updated: Task = { ...row.current };
          row.changes.forEach((c, i) => {
            if (!row.selectedChanges[i]) return;
            // Safe assignment via the explicit key.
            (updated as unknown as Record<EditableField, string>)[c.key] = c.to;
          });
          updatedTasks.push(updated);
        }
      }
      onApplyChanges({ updatedTasks, newTasks });
    } finally {
      setApplying(false);
    }
  }, [rows, onApplyChanges]);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const hasLoaded = !loading && !parseError && parsedCount > 0;
  const hasNothing = !loading && !parseError && fileName && parsedCount === 0;

  /* ── Render ────────────────────────────────────────────────────────── */
  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && close()}>
      <DialogContent
        className="p-0 gap-0 flex flex-col"
        style={{
          maxWidth: 960,
          width: "96vw",
          maxHeight: "90vh",
          borderRadius: 14,
          border: "1px solid var(--tracker-border)",
          background: "var(--tracker-bg-main)",
          overflow: "hidden",
        }}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Импорт из Excel</DialogTitle>
        </DialogHeader>

        {/* ── Header ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "16px 22px",
            borderBottom: "1px solid var(--tracker-border)",
            flexShrink: 0,
            background:
              "linear-gradient(180deg, var(--tracker-bg-card) 0%, var(--tracker-bg-main) 100%)",
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: "var(--tracker-accent-bg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              boxShadow: "0 1px 3px rgba(0,0,0,.04)",
            }}
          >
            <FileSpreadsheet style={{ width: 19, height: 19, color: "var(--tracker-accent)" }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: "var(--tracker-text-main)",
                lineHeight: 1.3,
              }}
            >
              Импорт из Excel
            </p>
            <p
              style={{
                fontSize: 11,
                color: "var(--tracker-text-muted)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {fileName
                ? fileName
                : "Загрузите файл — мы найдём отличия и спросим, что применить"}
            </p>
          </div>
          <button
            onClick={close}
            className="hover:bg-muted/60 transition-colors"
            style={{
              width: 30,
              height: 30,
              borderRadius: 7,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--tracker-text-muted)",
              flexShrink: 0,
            }}
          >
            <X style={{ width: 15, height: 15 }} />
          </button>
        </div>

        {/* ── Body ── */}
        <div
          style={{
            flex: 1,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          {/* Top section: dropzone + format hint + errors/notes */}
          <div
            style={{
              padding: "16px 22px 10px",
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <DropZone onFile={handleFile} loading={loading} />

            {!fileName && !loading && <FormatHint />}

            {parseError && <ErrorBox message={parseError} onRetry={reset} />}

            {hasNothing && (
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "12px 14px",
                  borderRadius: 10,
                  background: "rgba(245,158,11,.08)",
                  border: "1px solid rgba(245,158,11,.35)",
                }}
              >
                <AlertTriangle
                  style={{ width: 16, height: 16, color: "#b45309", flexShrink: 0, marginTop: 2 }}
                />
                <div style={{ fontSize: 12, color: "var(--tracker-text-main)", lineHeight: 1.55 }}>
                  <b>Файл прочитан, но задач в нём нет.</b> Проверьте, что у строк заполнены колонки
                  «Номер» или «Задача».
                </div>
              </div>
            )}

            {parseNotes.length > 0 && hasLoaded && (
              <div
                style={{
                  fontSize: 11,
                  color: "var(--tracker-text-muted)",
                  paddingLeft: 4,
                  display: "flex",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                {parseNotes.map((n, i) => (
                  <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <Info style={{ width: 11, height: 11 }} />
                    {n}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Stat pills (filter tabs) + search */}
          {hasLoaded && (
            <div
              style={{
                padding: "6px 22px 8px",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
                borderTop: "1px solid var(--tracker-border)",
                background: "var(--tracker-bg-card)",
              }}
            >
              <StatPill
                count={stats.total}
                label="всего"
                color="var(--tracker-text-main)"
                bg="var(--tracker-accent-bg)"
                active={filter === "all"}
                onClick={() => setFilter("all")}
                icon={<Sparkles style={{ width: 12, height: 12 }} />}
              />
              <StatPill
                count={stats.newCount}
                label="новых"
                color="var(--tracker-accent)"
                bg="var(--tracker-accent-bg)"
                active={filter === "new"}
                onClick={() => setFilter(filter === "new" ? "all" : "new")}
              />
              <StatPill
                count={stats.changedCount}
                label="изменено"
                color="#b45309"
                bg="rgba(245,158,11,.12)"
                active={filter === "changed"}
                onClick={() => setFilter(filter === "changed" ? "all" : "changed")}
              />
              <StatPill
                count={stats.sameCount}
                label="без измен."
                color="var(--tracker-text-muted)"
                bg="rgba(148,163,184,.10)"
                active={filter === "same"}
                onClick={() => setFilter(filter === "same" ? "all" : "same")}
              />
              {stats.untouched > 0 && (
                <span
                  title="Эти задачи есть в текущем месяце, но отсутствуют в файле. Они не будут затронуты."
                  style={{
                    fontSize: 11,
                    color: "var(--tracker-text-muted)",
                    padding: "4px 9px",
                    borderRadius: 99,
                    border: "1px dashed var(--tracker-border)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <Info style={{ width: 11, height: 11 }} />
                  ещё {stats.untouched} останется как есть
                </span>
              )}

              <div style={{ flex: 1 }} />

              <div style={{ position: "relative" }}>
                <Search
                  style={{
                    position: "absolute",
                    left: 8,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 13,
                    height: 13,
                    color: "var(--tracker-text-muted)",
                    pointerEvents: "none",
                  }}
                />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск по № или названию"
                  className="h-8 text-xs"
                  style={{
                    paddingLeft: 26,
                    width: 220,
                    background: "var(--tracker-bg-main)",
                  }}
                />
              </div>

              <button
                onClick={selectAll}
                style={{
                  fontSize: 11,
                  padding: "5px 10px",
                  borderRadius: 6,
                  color: "var(--tracker-accent)",
                  border: "1px solid var(--tracker-accent)",
                  background: "transparent",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Выбрать всё
              </button>
              <button
                onClick={deselectAll}
                style={{
                  fontSize: 11,
                  padding: "5px 10px",
                  borderRadius: 6,
                  color: "var(--tracker-text-muted)",
                  border: "1px solid var(--tracker-border)",
                  background: "transparent",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Снять
              </button>
            </div>
          )}

          {/* Rows list */}
          {hasLoaded && (
            <ScrollArea style={{ flex: 1, minHeight: 0 }}>
              <div
                style={{
                  padding: "10px 22px 18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                {visibleRows.length === 0 ? (
                  <div
                    style={{
                      padding: "30px 16px",
                      textAlign: "center",
                      color: "var(--tracker-text-muted)",
                      fontSize: 13,
                    }}
                  >
                    Ничего не нашлось по этим условиям. Сбросьте фильтр или поиск.
                  </div>
                ) : (
                  visibleRows.map(({ row, idx }) => (
                    <TaskRow
                      key={row.imported.num ? `n_${row.imported.num}` : `r_${idx}_${row.imported.rowIndex}`}
                      row={row}
                      onToggle={() => toggleRow(idx)}
                      onToggleChange={(j) => toggleChange(idx, j)}
                    />
                  ))
                )}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* ── Footer ── */}
        {hasLoaded && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              padding: "12px 22px",
              borderTop: "1px solid var(--tracker-border)",
              background: "var(--tracker-bg-card)",
              flexShrink: 0,
            }}
          >
            <p style={{ fontSize: 12, color: "var(--tracker-text-muted)", lineHeight: 1.5 }}>
              {stats.hasAny ? (
                <>
                  {stats.toAdd > 0 && (
                    <>
                      <b style={{ color: "var(--tracker-accent)" }}>+{stats.toAdd}</b> добавится
                      {stats.toUpdate > 0 ? "  ·  " : ""}
                    </>
                  )}
                  {stats.toUpdate > 0 && (
                    <>
                      <b style={{ color: "#b45309" }}>~{stats.toUpdate}</b> обновится
                    </>
                  )}
                  {stats.untouched > 0 && (
                    <span style={{ marginLeft: 8, opacity: 0.7 }}>
                      · {stats.untouched} останется как есть
                    </span>
                  )}
                </>
              ) : (
                "Ничего не выбрано для применения"
              )}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="outline" size="sm" className="h-8" onClick={close}>
                Отмена
              </Button>
              <Button
                size="sm"
                className="h-8 gap-1.5"
                disabled={applying || !stats.hasAny}
                onClick={apply}
                style={{
                  background: "var(--tracker-accent)",
                  color: "#fff",
                  opacity: !stats.hasAny ? 0.5 : 1,
                }}
              >
                {applying ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}
                Применить
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
