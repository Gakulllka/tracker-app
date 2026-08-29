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
import { Input } from "@/components/ui/input";
import {
  Check,
  Loader2,
  FileSpreadsheet,
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
import {
  COLUMN_ALIASES, REQUIRED_FIELDS, detectHeaders, isTotalRow, buildDiff, parseFile,
  type EditableField, type ParsedRow, type ParseResult,
  type RowKind, type FieldChange, type DiffRow, type ApplyPayload,
} from "@/lib/excel-import";
import {
  KindBadge, Chip, StatPill, TaskRow, DropZone, FormatHint, ErrorBox,
} from "@/components/excel-import-parts";

/* ───────────────────────────────────────────────────────────────────────── */
/*  Types                                                                    */
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
  /** Progressive rendering: показываем displayCount строк, догружая при скролле.
   *  Решает тормоза на 500+ строк без тяжёлой виртуализации. */
  const [displayCount, setDisplayCount] = useState(60);

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
  const listScrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
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

  // Сброс progressive-счётчика при смене фильтра/поиска/данных.
  useEffect(() => { setDisplayCount(60); }, [filter, search, fileName]);

  // Progressive rendering: догрузка при достижении дна списка.
  useEffect(() => {
    const root = listScrollRef.current;
    const node = sentinelRef.current;
    if (!root || !node) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) {
        setDisplayCount(prev => prev + 60);
      }
    }, { root, rootMargin: "200px" });
    io.observe(node);
    return () => io.disconnect();
  }, [displayCount, visibleRows.length, parsedCount, parseError, loading]);

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
        className="p-0 gap-0 flex min-h-0 flex-col"
        style={{
          maxWidth: 960,
          width: "96vw",
          maxHeight: "90vh",
          borderRadius: 14,
          border: "2px solid var(--tracker-accent)",
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
          {/* Кастомный X убран — закрытие через стандартный DialogClose
              (правый верхний угол), дублировал крестик. */}
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
                  style={{ width: 16, height: 16, color: "var(--tracker-warning)", flexShrink: 0, marginTop: 2 }}
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
                color="var(--tracker-warning)"
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
                    border: "2px dashed var(--tracker-accent)",
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
                  border: "2px solid var(--tracker-accent)",
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
            <div
              ref={listScrollRef}
              className="min-h-0 flex-1"
              style={{ overflowY: "auto", overflowX: "hidden" }}
            >
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
                  <>
                    {visibleRows.slice(0, displayCount).map(({ row, idx }) => (
                      <TaskRow
                        key={row.imported.num ? `n_${row.imported.num}` : `r_${idx}_${row.imported.rowIndex}`}
                        row={row}
                        onToggle={() => toggleRow(idx)}
                        onToggleChange={(j) => toggleChange(idx, j)}
                      />
                    ))}
                    {visibleRows.length > displayCount && (
                      <div ref={sentinelRef} style={{ height: 1 }} />
                    )}
                    {visibleRows.length > displayCount && (
                      <div style={{ padding: "8px 0", textAlign: "center", fontSize: 11, color: "var(--tracker-text-muted)" }}>
                        Показано {displayCount} из {visibleRows.length} · прокрутите для загрузки
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
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
                      <b style={{ color: "var(--tracker-warning)" }}>~{stats.toUpdate}</b> обновится
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
