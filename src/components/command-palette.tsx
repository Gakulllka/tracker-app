"use client";
/**
 * CommandPalette — глобальный поиск по активному домену (Ctrl+K / Cmd+K).
 * Ищет по всем месяцам всех лет, бэклогу и вопросам; клик — переход к записи.
 */
import React, { useState, useMemo, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Search, ClipboardList, Package, HelpCircle } from "lucide-react";
import { useTaskStore } from "@/lib/store";
import type { Task } from "@/lib/types";
import type { Question } from "@/lib/questions";
import { MONTHS } from "@/lib/types";

interface SearchHit {
  kind: "task" | "backlog" | "question";
  id: string;
  title: string;
  subtitle: string;
  /** для задач */
  year?: number;
  month?: number;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  questions: Question[];
  activeDomainId: string;
  /** Переходы */
  onGoToTask: (year: number, month: number, taskId: string) => void;
  onGoToBacklog: () => void;
  onGoToQuestions: () => void;
}

const MAX_RESULTS = 30;

export function CommandPalette({
  open, onClose, questions, activeDomainId,
  onGoToTask, onGoToBacklog, onGoToQuestions,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // сброс и фокус — после открытия диалога, вне тела эффекта
    const t = setTimeout(() => {
      setQuery("");
      setCursor(0);
      inputRef.current?.focus();
    }, 50);
    return () => clearTimeout(t);
  }, [open]);

  const hits = useMemo((): SearchHit[] => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const s = useTaskStore.getState();
    const dom = s.domainData[activeDomainId];
    const out: SearchHit[] = [];

    const matchTask = (t: Task) => !t._deleted && (
      (t.name || "").toLowerCase().includes(q) ||
      (t.num || "").toLowerCase().includes(q) ||
      (t.comment || "").toLowerCase().includes(q)
    );

    // Задачи всех лет и месяцев (dataByYearMonth: "YYYY-MM" → Task[])
    const byKey = dom?.dataByYearMonth || {};
    const seenIds = new Set<string>();
    for (const [mk, tasks] of Object.entries(byKey)) {
      const m = /^(\d{4})-(\d{2})$/.exec(mk);
      if (!m) continue;
      const year = Number(m[1]);
      const month = Number(m[2]) - 1;
      for (const t of (tasks as Task[]) || []) {
        if (out.length >= MAX_RESULTS) break;
        if (!matchTask(t) || seenIds.has(t.id)) continue;
        seenIds.add(t.id);
        out.push({
          kind: "task", id: t.id, year, month,
          title: `${t.num ? `#${t.num} ` : ""}${t.name || "Без названия"}`,
          subtitle: `${MONTHS[month]} ${year} · ${t.status || "—"}`,
        });
      }
    }
    // Текущий срез (задачи текущего года, ещё не зафиксированные в dataByYearMonth)
    for (const [mStr, tasks] of Object.entries(s.allData)) {
      const month = Number(mStr);
      for (const t of (tasks as Task[]) || []) {
        if (out.length >= MAX_RESULTS) break;
        if (!matchTask(t) || seenIds.has(t.id)) continue;
        seenIds.add(t.id);
        out.push({
          kind: "task", id: t.id, year: s.currentYear, month,
          title: `${t.num ? `#${t.num} ` : ""}${t.name || "Без названия"}`,
          subtitle: `${MONTHS[month]} ${s.currentYear} · ${t.status || "—"}`,
        });
      }
    }

    // Бэклог
    for (const t of s.backlog as Task[]) {
      if (out.length >= MAX_RESULTS) break;
      if (!matchTask(t)) continue;
      out.push({
        kind: "backlog", id: t.id,
        title: `${t.num ? `#${t.num} ` : ""}${t.name || "Без названия"}`,
        subtitle: `Бэклог · ${t.priority || "—"}`,
      });
    }

    // Вопросы (текущего домена и общие)
    for (const qu of questions) {
      if (out.length >= MAX_RESULTS) break;
      if (qu.domainId && qu.domainId !== activeDomainId) continue;
      if (!qu.text.toLowerCase().includes(q) && !qu.author.toLowerCase().includes(q)) continue;
      out.push({
        kind: "question", id: qu.id,
        title: qu.text.length > 70 ? qu.text.slice(0, 70) + "…" : qu.text,
        subtitle: `Вопрос · ${qu.author} · ${qu.status === "answered" ? "отвечен" : "открыт"}`,
      });
    }

    return out;
  }, [query, activeDomainId, questions]);



  const cursorSafe = hits.length === 0 ? 0 : Math.min(cursor, hits.length - 1);

  const go = (hit: SearchHit) => {
    onClose();
    if (hit.kind === "task" && hit.year !== undefined && hit.month !== undefined) {
      onGoToTask(hit.year, hit.month, hit.id);
    } else if (hit.kind === "backlog") {
      onGoToBacklog();
    } else {
      onGoToQuestions();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor(Math.min(cursorSafe + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor(Math.max(cursorSafe - 1, 0));
    } else if (e.key === "Enter" && hits[cursorSafe]) {
      e.preventDefault();
      go(hits[cursorSafe]);
    }
  };

  useEffect(() => {
    // Держим выделенный пункт в поле зрения
    const el = listRef.current?.querySelector(`[data-idx="${cursorSafe}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [cursorSafe]);

  const KIND_ICON = {
    task: <ClipboardList className="size-3.5 shrink-0" />,
    backlog: <Package className="size-3.5 shrink-0" />,
    question: <HelpCircle className="size-3.5 shrink-0" />,
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden" onKeyDown={onKeyDown}>
        <DialogTitle className="sr-only">Поиск по домену</DialogTitle>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--tracker-border)]">
          <Search className="size-4 shrink-0 text-[var(--tracker-text-muted)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск задач, бэклога, вопросов..."
            className="flex-1 bg-transparent outline-none text-sm text-[var(--tracker-text-main)] placeholder:text-[var(--tracker-text-muted)]"
          />
          <kbd className="text-[9px] px-1.5 py-0.5 rounded border border-[var(--tracker-border)] text-[var(--tracker-text-muted)]">Esc</kbd>
        </div>
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
          {query.trim() && hits.length === 0 && (
            <p className="px-4 py-6 text-center text-xs text-[var(--tracker-text-muted)]">
              Ничего не найдено в этом домене
            </p>
          )}
          {!query.trim() && (
            <p className="px-4 py-6 text-center text-xs text-[var(--tracker-text-muted)]">
              Ищет по всем месяцам, бэклогу и вопросам активного домена.<br />
              ↑↓ — навигация, Enter — перейти
            </p>
          )}
          {hits.map((h, i) => (
            <button
              key={`${h.kind}-${h.id}`}
              data-idx={i}
              onClick={() => go(h)}
              onMouseEnter={() => setCursor(i)}
              className="w-full flex items-center gap-2.5 px-4 py-2 text-left transition-colors"
              style={{ background: i === cursorSafe ? "var(--tracker-accent-bg)" : "transparent" }}
            >
              <span style={{ color: "var(--tracker-accent)" }}>{KIND_ICON[h.kind]}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-medium truncate text-[var(--tracker-text-main)]">{h.title}</span>
                <span className="block text-[10px] truncate text-[var(--tracker-text-muted)]">{h.subtitle}</span>
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
