"use client";

import React, { useState, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, Loader2, FileSpreadsheet, X, Upload, Plus, ArrowRight } from "lucide-react";
import { type Task } from "@/lib/types";
import { fixStatus, fixPriority, evalExpr } from "@/lib/metrics";

/* ── Types ─────────────────────────────────────────────────────────── */

interface ParsedRow {
  num: string;
  name: string;
  planH: string;
  factH: string;
  priority: string;
  status: string;
  comment: string;
}

type RowKind = "new" | "changed" | "same";

interface FieldChange { label: string; from: string; to: string; }

interface DiffRow {
  kind: RowKind;
  imported: ParsedRow;
  current: Task | null;
  changes: FieldChange[];
  selected: boolean;         // include in apply
  selectedChanges: boolean[]; // per-field include (for "changed")
}

/* ── Parsing ────────────────────────────────────────────────────────── */

function str(v: unknown): string { return String(v ?? "").trim(); }

async function parseFile(file: File): Promise<ParsedRow[]> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = (e) => {
      try {
        const wb = XLSX.read(e.target!.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
        const out: ParsedRow[] = [];
        for (const row of rows) {
          const num  = str(row["Номер"] ?? row["№"] ?? row["num"] ?? "");
          const name = str(row["Задача"] ?? row["Наименование"] ?? row["Название"] ?? row["name"] ?? "");
          if ((!num && !name) || name === "ИТОГО") continue;
          out.push({
            num, name,
            planH:    str(row["Трудоемкость предв, ч"] ?? row["Трудоёмкость предв, ч"] ?? row["План, ч"] ?? row["planH"] ?? ""),
            factH:    str(row["Часы фактические"] ?? row["Факт, ч"] ?? row["factH"] ?? ""),
            priority: fixPriority(row["Приоритет"] ?? row["priority"] ?? ""),
            status:   fixStatus(row["Статус"] ?? row["status"] ?? ""),
            comment:  str(row["Комментарий"] ?? row["comment"] ?? ""),
          });
        }
        resolve(out);
      } catch (err) { reject(err); }
    };
    r.onerror = () => reject(new Error("Ошибка чтения файла"));
    r.readAsArrayBuffer(file);
  });
}

const LABELS: Record<string, string> = {
  name: "Название", planH: "План", factH: "Факт",
  priority: "Приоритет", status: "Статус", comment: "Комментарий",
};
const FIELDS = ["name", "planH", "factH", "priority", "status", "comment"] as const;

function buildRows(currentTasks: Task[], imported: ParsedRow[]): DiffRow[] {
  // Map current month tasks by their Номер
  const byNum = new Map<string, Task>();
  for (const t of currentTasks) {
    const n = str(t.num);
    if (n) byNum.set(n, t);
  }

  return imported.map((imp): DiffRow => {
    const cur = imp.num ? (byNum.get(imp.num) ?? null) : null;

    if (!cur) {
      // Task number not found in current month → NEW
      return { kind: "new", imported: imp, current: null, changes: [], selected: true, selectedChanges: [] };
    }

    // Compare fields
    const changes: FieldChange[] = [];
    for (const f of FIELDS) {
      const from = str((cur as unknown as Record<string, unknown>)[f]);
      const to   = str((imp as unknown as Record<string, unknown>)[f]);
      if (f === "planH" || f === "factH") {
        if (Math.abs(evalExpr(from) - evalExpr(to)) > 0.001)
          changes.push({ label: LABELS[f], from, to });
      } else if (from !== to) {
        changes.push({ label: LABELS[f], from, to });
      }
    }

    const kind: RowKind = changes.length > 0 ? "changed" : "same";
    return { kind, imported: imp, current: cur, changes, selected: kind !== "same", selectedChanges: changes.map(() => true) };
  });
}

/* ── Kind badge ─────────────────────────────────────────────────────── */
function KindBadge({ kind }: { kind: RowKind }) {
  const map = {
    new:     { label: "НОВАЯ",     bg: "var(--tracker-accent)",     color: "#fff" },
    changed: { label: "ИЗМЕНЕНА",  bg: "rgba(245,158,11,.15)",      color: "#d97706" },
    same:    { label: "БЕЗ ИЗМЕНЕНИЙ", bg: "rgba(148,163,184,.12)", color: "var(--tracker-text-muted)" },
  };
  const s = map[kind];
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99,
      background: s.bg, color: s.color, letterSpacing: ".05em", flexShrink: 0, whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}

/* ── Single task row ────────────────────────────────────────────────── */
function TaskRow({ row, onToggle, onToggleChange }: {
  row: DiffRow;
  onToggle: () => void;
  onToggleChange: (i: number) => void;
}) {
  const borderColor = row.kind === "new" ? "var(--tracker-accent)" : row.kind === "changed" ? "#d97706" : "var(--tracker-border)";
  const dimmed = !row.selected && row.kind !== "same";

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr 1fr", borderRadius: 10, overflow: "hidden",
      border: `1px solid ${borderColor}`, opacity: dimmed ? 0.4 : 1, transition: "opacity .15s",
    }}>
      {/* LEFT — num + name + checkbox */}
      <div
        onClick={row.kind !== "same" ? onToggle : undefined}
        style={{
          display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 14px",
          background: "var(--tracker-bg-card)",
          cursor: row.kind !== "same" ? "pointer" : "default",
          borderRight: `1px solid var(--tracker-border)`,
        }}
      >
        {/* Checkbox for new/changed */}
        {row.kind !== "same" && (
          <div style={{
            width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginTop: 1,
            border: `2px solid ${row.selected ? borderColor : "var(--tracker-border)"}`,
            background: row.selected ? borderColor : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {row.selected && <Check style={{ width: 11, height: 11, color: "#fff", strokeWidth: 3 }} />}
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
            {row.imported.num && (
              <span style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 700,
                color: row.kind === "new" ? "var(--tracker-accent)" : "var(--tracker-text-muted)" }}>
                #{row.imported.num}
              </span>
            )}
            <KindBadge kind={row.kind} />
          </div>
          <p style={{ fontSize: 13, color: "var(--tracker-text-main)", lineHeight: 1.4,
            overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
            {row.imported.name || <span style={{ color: "var(--tracker-text-muted)", fontStyle: "italic" }}>без названия</span>}
          </p>
        </div>
      </div>

      {/* RIGHT — changes or summary */}
      <div style={{ padding: "11px 14px", background: "var(--tracker-bg-main)", display: "flex", flexDirection: "column", gap: 6, justifyContent: "center" }}>
        {row.kind === "new" && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {row.imported.status && <Chip label={row.imported.status} color="var(--tracker-accent)" />}
            {row.imported.priority && <Chip label={row.imported.priority} color="var(--tracker-text-muted)" />}
            {row.imported.planH && <Chip label={`план ${row.imported.planH} ч`} color="var(--tracker-text-muted)" />}
            {row.imported.factH && <Chip label={`факт ${row.imported.factH} ч`} color="var(--tracker-text-muted)" />}
          </div>
        )}

        {row.kind === "changed" && row.changes.map((c, i) => (
          <div
            key={c.label}
            onClick={() => onToggleChange(i)}
            style={{
              display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
              opacity: row.selectedChanges[i] ? 1 : 0.35, transition: "opacity .15s",
            }}
          >
            {/* per-field checkbox */}
            <div style={{
              width: 14, height: 14, borderRadius: 3, flexShrink: 0,
              border: `1.5px solid ${row.selectedChanges[i] ? "#d97706" : "var(--tracker-border)"}`,
              background: row.selectedChanges[i] ? "#d97706" : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {row.selectedChanges[i] && <Check style={{ width: 9, height: 9, color: "#fff", strokeWidth: 3 }} />}
            </div>
            <span style={{ fontSize: 11, color: "var(--tracker-text-muted)", flexShrink: 0, width: 64 }}>{c.label}</span>
            <span style={{ fontSize: 12, color: "var(--tracker-text-muted)", flexShrink: 1, minWidth: 0,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {c.from || "—"}
            </span>
            <ArrowRight style={{ width: 12, height: 12, color: "var(--tracker-accent)", flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--tracker-accent)", flexShrink: 1, minWidth: 0,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {c.to || "—"}
            </span>
          </div>
        ))}

        {row.kind === "same" && (
          <span style={{ fontSize: 12, color: "var(--tracker-text-muted)", fontStyle: "italic" }}>
            совпадает с текущей
          </span>
        )}
      </div>
    </div>
  );
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99,
      border: `1px solid ${color}33`, color, background: `${color}15`,
      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>
      {label}
    </span>
  );
}

/* ── Drop zone ──────────────────────────────────────────────────────── */
function DropZone({ onFile, loading }: { onFile: (f: File) => void; loading: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  return (
    <div
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
      onClick={() => ref.current?.click()}
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "14px 20px",
        borderRadius: 10, cursor: "pointer", transition: "all .15s",
        border: `2px dashed ${drag ? "var(--tracker-accent)" : "var(--tracker-border)"}`,
        background: drag ? "var(--tracker-accent-bg)" : "transparent",
      }}
    >
      <input ref={ref} type="file" accept=".xlsx,.xls" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
      {loading
        ? <><Loader2 style={{ width: 20, height: 20, color: "var(--tracker-accent)" }} className="animate-spin" />
            <span style={{ fontSize: 13, color: "var(--tracker-text-muted)" }}>Читаем файл…</span></>
        : <><div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--tracker-accent-bg)",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <FileSpreadsheet style={{ width: 18, height: 18, color: "var(--tracker-accent)" }} />
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 500, color: "var(--tracker-text-main)" }}>Выберите или перетащите .xlsx</p>
              <p style={{ fontSize: 11, color: "var(--tracker-text-muted)", marginTop: 2 }}>Нужна колонка «Номер» для сверки</p>
            </div>
            <Upload style={{ width: 16, height: 16, color: "var(--tracker-text-muted)", marginLeft: "auto", flexShrink: 0 }} /></>
      }
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────── */
export function ExcelImportModal({ isOpen, onClose, currentMonthTasks, currentMonth, onApplyChanges }: {
  isOpen: boolean; onClose: () => void; currentMonthTasks: Task[]; currentMonth: number;
  onApplyChanges: (changes: { updatedTasks: Task[]; newTasks: any[] }) => void;
}) {
  const [loading, setLoading]   = useState(false);
  const [applying, setApplying] = useState(false);
  const [fileName, setFileName] = useState("");
  const [rows, setRows]         = useState<DiffRow[]>([]);
  const [parsed, setParsed]     = useState<ParsedRow[]>([]);

  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name); setLoading(true);
    try {
      const imp = await parseFile(file);
      setParsed(imp);
      setRows(buildRows(currentMonthTasks, imp));
    } catch (err) {
      alert("Ошибка: " + (err instanceof Error ? err.message : String(err)));
    } finally { setLoading(false); }
  }, [currentMonthTasks]);

  const toggle = useCallback((i: number) => {
    setRows(prev => prev.map((r, idx) => idx !== i ? r : { ...r, selected: !r.selected }));
  }, []);

  const toggleChange = useCallback((rowIdx: number, changeIdx: number) => {
    setRows(prev => prev.map((r, i) => {
      if (i !== rowIdx) return r;
      const sc = r.selectedChanges.map((v, j) => j === changeIdx ? !v : v);
      return { ...r, selectedChanges: sc, selected: sc.some(Boolean) };
    }));
  }, []);

  const selectAll   = useCallback(() => setRows(p => p.map(r => ({ ...r, selected: r.kind !== "same", selectedChanges: r.selectedChanges.map(() => true) }))), []);
  const deselectAll = useCallback(() => setRows(p => p.map(r => ({ ...r, selected: false, selectedChanges: r.selectedChanges.map(() => false) }))), []);

  const stats = {
    newCount:     rows.filter(r => r.kind === "new").length,
    changedCount: rows.filter(r => r.kind === "changed").length,
    sameCount:    rows.filter(r => r.kind === "same").length,
    toAdd:        rows.filter(r => r.kind === "new" && r.selected).length,
    toUpdate:     rows.filter(r => r.kind === "changed" && r.selected).length,
    hasAny:       rows.some(r => r.selected && r.kind !== "same"),
  };

  const apply = useCallback(async () => {
    setApplying(true);
    try {
      const newTasks: ParsedRow[] = [];
      const updatedTasks: Task[] = [];
      for (const row of rows) {
        if (!row.selected) continue;
        if (row.kind === "new") { newTasks.push(row.imported); continue; }
        if (row.kind === "changed" && row.current) {
          const updated = { ...row.current };
          row.changes.forEach((c, i) => {
            if (row.selectedChanges[i])
              (updated as Record<string, unknown>)[["name","planH","factH","priority","status","comment"].find(f => LABELS[f] === c.label) || ""] = c.to;
          });
          updatedTasks.push(updated);
        }
      }
      onApplyChanges({ updatedTasks, newTasks });
    } finally { setApplying(false); }
  }, [rows, onApplyChanges]);

  const close = useCallback(() => {
    setFileName(""); setRows([]); setParsed([]); setLoading(false); setApplying(false); onClose();
  }, [onClose]);

  const hasLoaded = !loading && parsed.length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={close}>
      <DialogContent className="p-0 gap-0 flex flex-col" style={{
        maxWidth: 900, width: "96vw", maxHeight: "90vh", borderRadius: 14,
        border: "1px solid var(--tracker-border)", background: "var(--tracker-bg-main)", overflow: "hidden",
      }}>
        <DialogHeader className="sr-only"><DialogTitle>Импорт из Excel</DialogTitle></DialogHeader>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 22px", borderBottom: "1px solid var(--tracker-border)", flexShrink: 0 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: "var(--tracker-accent-bg)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <FileSpreadsheet style={{ width: 18, height: 18, color: "var(--tracker-accent)" }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--tracker-text-main)" }}>Импорт из Excel</p>
            {fileName && <p style={{ fontSize: 11, color: "var(--tracker-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fileName}</p>}
          </div>
          {hasLoaded && (
            <div style={{ display: "flex", gap: 6 }}>
              {stats.newCount > 0 && <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99, background: "var(--tracker-accent-bg)", color: "var(--tracker-accent)", border: "1px solid var(--tracker-accent)" }}>+ {stats.newCount} новых</span>}
              {stats.changedCount > 0 && <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99, background: "rgba(245,158,11,.1)", color: "#d97706", border: "1px solid rgba(245,158,11,.3)" }}>~ {stats.changedCount} изменений</span>}
              {stats.sameCount > 0 && <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 99, color: "var(--tracker-text-muted)", border: "1px solid var(--tracker-border)" }}>{stats.sameCount} совпадают</span>}
            </div>
          )}
          <button onClick={close} className="hover:bg-muted/60 transition-colors" style={{ width: 30, height: 30, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--tracker-text-muted)", flexShrink: 0 }}>
            <X style={{ width: 15, height: 15 }} />
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ padding: "14px 22px 10px", flexShrink: 0 }}>
            <DropZone onFile={handleFile} loading={loading} />
          </div>

          {hasLoaded && (
            <>
              {/* Column headers + controls */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", padding: "0 22px 6px", flexShrink: 0, gap: "0 1px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--tracker-text-muted)", paddingLeft: 4 }}>
                  Задача ({parsed.length} из файла)
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--tracker-text-muted)" }}>Изменения</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={selectAll} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 5, color: "var(--tracker-accent)", border: "1px solid var(--tracker-accent)", background: "transparent", cursor: "pointer" }}>Всё</button>
                    <button onClick={deselectAll} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 5, color: "var(--tracker-text-muted)", border: "1px solid var(--tracker-border)", background: "transparent", cursor: "pointer" }}>Снять</button>
                  </div>
                </div>
              </div>

              {/* Task list */}
              <ScrollArea style={{ flex: 1, minHeight: 0 }}>
                <div style={{ padding: "2px 22px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                  {rows.map((row, i) => (
                    <TaskRow key={row.imported.num || `nonum-${i}`} row={row}
                      onToggle={() => toggle(i)} onToggleChange={j => toggleChange(i, j)} />
                  ))}
                </div>
              </ScrollArea>
            </>
          )}
        </div>

        {/* ── Footer ── */}
        {hasLoaded && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "12px 22px", borderTop: "1px solid var(--tracker-border)", background: "var(--tracker-bg-card)", flexShrink: 0 }}>
            <p style={{ fontSize: 12, color: "var(--tracker-text-muted)" }}>
              {stats.hasAny
                ? <>{stats.toAdd > 0 && <><b style={{ color: "var(--tracker-text-main)" }}>{stats.toAdd}</b> добавится &nbsp;</>}{stats.toUpdate > 0 && <><b style={{ color: "var(--tracker-text-main)" }}>{stats.toUpdate}</b> обновится</>}</>
                : "Ничего не выбрано"}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="outline" size="sm" className="h-8" onClick={close}>Отмена</Button>
              <Button size="sm" className="h-8 gap-1.5" disabled={applying || !stats.hasAny} onClick={apply}
                style={{ background: "var(--tracker-accent)", color: "#fff" }}>
                {applying ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                Применить
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
