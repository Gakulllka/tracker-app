"use client";
import React, { useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/empty-state";
import { QuestionCard } from "@/components/views/question-card";
import {
  Plus, Trash2, ChevronUp, ChevronDown, MessageSquare, Send,
  ClipboardList, Package, Search, Pin, CheckCircle2, Clock,
  CircleDot, Archive, BarChart3, Sparkles, Ruler, X,
} from "lucide-react";
import { STATUSES, PRIORITIES, MONTHS, type Status, type Priority, type Task } from "@/lib/types";
import { PCOL, scolText } from "@/lib/tokens";
import { useTaskStore } from "@/lib/store";
import type { Question } from "@/lib/questions";
import { fmtDate as fmtDateUtil } from "@/lib/questions";

export interface QuestionsViewProps {
  questions: Question[];
  newQuestionText: string;
  setNewQuestionText: (v: string) => void;
  addQuestion: () => void;
  addLinkedQuestion: (text: string, author: string, linkedTaskId: string, linkedTaskName: string) => void;
  removeQuestion: (id: string) => void;
  answerQuestion: (questionId: string, answer: string, author: string) => void;
  deleteAnswer: (questionId: string, answerId: string) => void;
  archiveQuestion: (questionId: string) => void;
  restoreQuestion: (questionId: string) => void;
  currentUsername: string;
  currentMonth: number;
  allData: Record<number, Task[]>;
  updateTask: (month: number, taskId: string, key: keyof Task, value: unknown) => void;
  addToBacklog: (task: Task) => void;
  addToTable: (month: number, task: Task) => void;
  isDark: boolean;
  isGuest?: boolean;
  /** Активный домен — для фильтра «текущий домен / все». */
  activeDomainId?: string;
  activeDomainName?: string;
}

interface QuestionToTaskDialog {
  open: boolean; questionId: string; questionText: string;
  num: string; name: string; planH: string; month: number;
  priority: Priority; status: Status; target: "backlog" | "table";
}

type FilterTab = "all" | "open" | "reopened" | "answered";

function getDateGroup(dateStr?: string): string {
  if (!dateStr) return "Ранее";
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const questionDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.floor((today.getTime() - questionDay.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Сегодня";
  if (diffDays === 1) return "Вчера";
  if (diffDays <= 7) return "На этой неделе";
  if (diffDays <= 30) return "В этом месяце";
  return "Ранее";
}

const DATE_GROUP_ORDER = ["Сегодня", "Вчера", "На этой неделе", "В этом месяце", "Ранее"];

const FILTER_TABS: { key: FilterTab; label: string; icon: React.ReactNode }[] = [
  { key: "all", label: "Все", icon: <BarChart3 className="size-3.5" /> },
  { key: "open", label: "Открытые", icon: <CircleDot className="size-3.5" /> },
  { key: "answered", label: "Отвеченные", icon: <CheckCircle2 className="size-3.5" /> },
];

export function QuestionsView({
  questions, newQuestionText, setNewQuestionText, addQuestion, addLinkedQuestion,
  removeQuestion, answerQuestion, deleteAnswer, archiveQuestion, restoreQuestion,
  currentUsername, currentMonth, allData, updateTask, addToBacklog, addToTable, isDark, isGuest,
  activeDomainId, activeDomainName,
}: QuestionsViewProps) {
  /** Фильтр по домену: по умолчанию — вопросы текущего домена и общие. */
  const [domainScope, setDomainScope] = useState<"current" | "all">("current");
  const scopedQuestions = useMemo(() => {
    if (domainScope === "all" || !activeDomainId) return questions;
    return questions.filter(q => !q.domainId || q.domainId === activeDomainId);
  }, [questions, domainScope, activeDomainId]);
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [answerDraft, setAnswerDraft] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveSearch, setArchiveSearch] = useState("");
  const [archiveAuthorFilter, setArchiveAuthorFilter] = useState("");
  const [taskDialog, setTaskDialog] = useState<QuestionToTaskDialog>({
    open: false, questionId: "", questionText: "", num: "", name: "",
    planH: "", month: currentMonth, priority: PRIORITIES.MEDIUM, status: STATUSES.NEW, target: "backlog",
  });

  // Task linking
  const [linkedTaskId, setLinkedTaskId] = useState<string | null>(null);
  const [linkedTaskName, setLinkedTaskName] = useState<string>("");
  const [taskSearch, setTaskSearch] = useState("");

  const allTasks = useMemo(() => {
    const tasks: { id: string; num: string; name: string; month: number; status: string }[] = [];
    for (let m = 0; m <= 11; m++) {
      for (const t of (allData[m] || [])) {
        if (!t._deleted && (t.num || t.name)) {
          tasks.push({ id: t.id, num: t.num, name: t.name, month: m, status: t.status });
        }
      }
    }
    return tasks;
  }, [allData]);

  const filteredTasks = useMemo(() => {
    if (!taskSearch.trim()) return allTasks.slice(0, 20);
    const q = taskSearch.toLowerCase();
    return allTasks.filter(t =>
      (t.num || "").toLowerCase().includes(q) ||
      (t.name || "").toLowerCase().includes(q)
    ).slice(0, 20);
  }, [allTasks, taskSearch]);

  const handleAddQuestion = useCallback(() => {
    if (!newQuestionText.trim()) return;
    if (linkedTaskId && linkedTaskName) {
      addLinkedQuestion(newQuestionText.trim(), currentUsername, linkedTaskId, linkedTaskName);
    } else {
      addQuestion();
    }
    setNewQuestionText("");
    setLinkedTaskId(null);
    setLinkedTaskName("");
    setTaskSearch("");
  }, [newQuestionText, currentUsername, linkedTaskId, linkedTaskName, addQuestion, addLinkedQuestion, setNewQuestionText]);

  const openTaskDialog = useCallback((q: Question, target: "backlog" | "table") => {
    setTaskDialog({
      open: true, questionId: q.id, questionText: q.text,
      num: "", name: q.text.slice(0, 120), planH: "", month: currentMonth,
      priority: PRIORITIES.MEDIUM,
      status: target === "backlog" ? STATUSES.IDEA : STATUSES.NEW, target,
    });
  }, [currentMonth]);

  const handleCreateTask = useCallback(() => {
    if (!taskDialog.name.trim()) return;
    const task: Task = {
      id: crypto.randomUUID(), num: taskDialog.num, name: taskDialog.name,
      planH: taskDialog.planH, factH: "0", priority: taskDialog.priority,
      status: taskDialog.status,
      comment: `Создано из вопроса: ${taskDialog.questionText}`,
      commentLog: [{ date: new Date().toLocaleDateString("ru-RU"), week: "0", text: `Создано из вопроса: "${taskDialog.questionText}"`, planH: "0", factH: "0", status: taskDialog.status }],
      _ts: Date.now(),
    };
    if (taskDialog.target === "backlog") addToBacklog(task);
    else addToTable(taskDialog.month, task);
    setTaskDialog(d => ({ ...d, open: false }));
  }, [taskDialog, addToBacklog, addToTable]);

  const filtered = useMemo(() => {
    let result = scopedQuestions.filter(q => q.status !== "archived");
    if (filter === "open") result = result.filter(q => q.status === "open");
    if (filter === "reopened") result = result.filter(q => q.status === "reopened");
    if (filter === "answered") result = result.filter(q => q.status === "answered");
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(r =>
        r.text.toLowerCase().includes(q) ||
        r.author.toLowerCase().includes(q) ||
        (r.linkedTaskName || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [scopedQuestions, filter, search]);

  const groupedQuestions = useMemo(() => {
    const groups: Record<string, Question[]> = {};
    for (const q of filtered) {
      const group = getDateGroup(q.questionDate);
      if (!groups[group]) groups[group] = [];
      groups[group].push(q);
    }
    return DATE_GROUP_ORDER.filter(g => groups[g]?.length).map(g => ({ label: g, items: groups[g] }));
  }, [filtered]);

  const { totalQuestions, answered, reopened, unanswered, archived } = useMemo(() => ({
    totalQuestions: scopedQuestions.filter(q => q.status !== "archived").length,
    answered: scopedQuestions.filter(q => q.status === "answered"),
    reopened: scopedQuestions.filter(q => q.status === "reopened"),
    unanswered: scopedQuestions.filter(q => q.status === "open"),
    archived: scopedQuestions.filter(q => q.status === "archived"),
  }), [scopedQuestions]);
  const answeredCount = answered.length;
  const reopenedCount = reopened.length;
  const openCount = unanswered.length;
  const archivedCount = archived.length;

  const archivedAuthors = useMemo(() => {
    const authors = new Set(archived.map(q => q.author));
    return Array.from(authors).sort();
  }, [archived]);

  const filteredArchived = useMemo(() => {
    let result = archived;
    if (archiveSearch.trim()) {
      const s = archiveSearch.toLowerCase();
      result = result.filter(q =>
        q.text.toLowerCase().includes(s) ||
        (q.linkedTaskName || "").toLowerCase().includes(s) ||
        (q.linkedTaskId || "").toLowerCase().includes(s)
      );
    }
    if (archiveAuthorFilter) {
      result = result.filter(q => q.author === archiveAuthorFilter);
    }
    return result;
  }, [archived, archiveSearch, archiveAuthorFilter]);

  return (
    <div className="space-y-4">

      {/* ── Stats bar ── */}
      {(totalQuestions > 0 || archivedCount > 0) && (() => {
        const allTiles = [
            { label: "Всего", value: totalQuestions, color: "var(--tracker-accent)", bg: "var(--tracker-accent-bg)" },
            { label: "Открытых", value: openCount, color: "#f59e0b", bg: "rgba(245,158,11,0.08)" },
            { label: "Возобновлённых", value: reopenedCount, color: "#f97316", bg: "rgba(249,115,22,0.08)" },
            { label: "Отвечено", value: answeredCount, color: "#22c55e", bg: "rgba(34,197,94,0.08)" },
            { label: "Архив", value: archivedCount, color: "#8b5cf6", bg: "rgba(139,92,246,0.08)", clickable: true },
        ];
        // Нет активных вопросов — показываем только плитку «Архив»,
        // иначе вход в архив недоступен при пустом списке.
        const tiles = totalQuestions > 0 ? allTiles : allTiles.filter(t => t.clickable);
        return (
          <div className={totalQuestions > 0 ? "grid grid-cols-5 gap-2" : "grid grid-cols-1 gap-2 max-w-[160px]"}>
            {tiles.map((s) => (
              <div key={s.label}
                onClick={s.clickable ? () => setArchiveOpen(true) : undefined}
                className={`rounded-xl px-3 py-2.5 text-center ${s.clickable ? "cursor-pointer hover:opacity-80 transition-opacity" : ""}`}
                style={{ background: s.bg }}>
                <p className="text-lg font-bold tabular-nums" style={{ color: s.color }}>{s.value}</p>
                <p className="text-[10px] font-medium" style={{ color: "var(--tracker-text-muted)" }}>{s.label}</p>
              </div>
            ))}
          </div>
        );
      })()}

      {/* ── Create task dialog ── */}
      <Dialog open={taskDialog.open} onOpenChange={open => { if (!open) setTaskDialog(d => ({ ...d, open: false })); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="size-5" />{taskDialog.target === "backlog" ? "Добавить в беклог" : "Добавить в таблицу"}
            </DialogTitle>
            <DialogDescription className="text-xs line-clamp-2">Вопрос: «{taskDialog.questionText}»</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="grid grid-cols-[90px_1fr] gap-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">№ задачи</label>
                <Input value={taskDialog.num} onChange={e => setTaskDialog(d => ({ ...d, num: e.target.value }))} placeholder="—" className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Наименование</label>
                <Input value={taskDialog.name} onChange={e => setTaskDialog(d => ({ ...d, name: e.target.value }))} placeholder="Название задачи" className="h-9 text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">План, ч</label>
                <Input value={taskDialog.planH} onChange={e => setTaskDialog(d => ({ ...d, planH: e.target.value }))} placeholder="0" className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Приоритет</label>
                <Select value={taskDialog.priority} onValueChange={v => setTaskDialog(d => ({ ...d, priority: v as Priority }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.values(PRIORITIES).map(p => <SelectItem key={p} value={p} className="text-sm"><span style={{ color: PCOL[p] }}>{p}</span></SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            {taskDialog.target === "table" && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Месяц</label>
                  <Select value={String(taskDialog.month)} onValueChange={v => setTaskDialog(d => ({ ...d, month: Number(v) }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i)} className="text-sm">{m}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Статус</label>
                  <Select value={taskDialog.status} onValueChange={v => setTaskDialog(d => ({ ...d, status: v as Status }))}>
                    <SelectTrigger className="h-9 text-sm" style={{ color: scolText(taskDialog.status, isDark) || undefined }}><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.values(STATUSES).map(s => <SelectItem key={s} value={s} className="text-sm"><span style={{ color: scolText(s, isDark) || "#888" }}>{s}</span></SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:flex-row sm:justify-stretch">
            <Button disabled={!taskDialog.name.trim()} onClick={handleCreateTask} className="flex-1 bg-[var(--tracker-accent)] text-[var(--tracker-accent-contrast)] hover:bg-[var(--tracker-accent-hover)]">
              {taskDialog.target === "backlog" ? "В беклог" : "В таблицу"}
            </Button>
            <Button variant="destructive" onClick={() => setTaskDialog(d => ({ ...d, open: false }))} className="flex-1">Отмена</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Input area ── */}
      <div className="rounded-2xl border p-4" style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-bg-card, var(--background))", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
        <div className="flex gap-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
            style={{ background: "var(--tracker-accent-bg)", color: "var(--tracker-accent-fg-dark)" }}>
            {currentUsername?.charAt(0)?.toUpperCase() || "?"}
          </div>
          <div className="flex-1">
            <Textarea placeholder="Задайте вопрос команде..." value={newQuestionText}
              onChange={e => setNewQuestionText(e.target.value)}
              className="min-h-[80px] max-h-[200px] resize-none text-sm rounded-xl border-0 p-1 shadow-none focus-visible:ring-0 w-full"
              style={{ background: "transparent" }}
              onKeyDown={e => { if (e.key === "Enter" && e.ctrlKey) handleAddQuestion(); }} />

            {/* Task linker */}
            <div className="mt-2">
              {linkedTaskId ? (
                <div className="inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-1 rounded-lg"
                  style={{ background: "rgba(99,102,241,0.1)", color: "#6366f1" }}>
                  <ClipboardList className="size-3" />
                  #{allTasks.find(t => t.id === linkedTaskId)?.num} {linkedTaskName}
                  <button onClick={() => { setLinkedTaskId(null); setLinkedTaskName(""); setTaskSearch(""); }}
                    className="ml-0.5 hover:text-red-500"><X className="size-3" /></button>
                </div>
              ) : (
                <div className="relative">
                  <input value={taskSearch} onChange={e => setTaskSearch(e.target.value)}
                    placeholder="Привязать к задаче..."
                    className="w-full h-7 pl-7 pr-3 text-[11px] rounded-lg border bg-transparent outline-none focus:ring-1 focus:ring-[var(--tracker-accent)]"
                    style={{ borderColor: "var(--tracker-border)", color: "var(--tracker-text-main)" }}
                    onFocus={() => setTaskSearch(" ")} />
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3" style={{ color: "var(--tracker-text-muted)" }} />
                  {taskSearch.trim() && filteredTasks.length > 0 && (
                    <div className="absolute z-10 top-full mt-1 w-full max-h-48 overflow-y-auto rounded-lg border shadow-lg"
                      style={{ background: "var(--tracker-bg-card)", borderColor: "var(--tracker-border)" }}>
                      {filteredTasks.map(t => (
                        <button key={t.id}
                          onClick={() => { setLinkedTaskId(t.id); setLinkedTaskName(t.name); setTaskSearch(""); }}
                          className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-[var(--tracker-accent-bg)] flex items-center gap-2 transition-colors">
                          <span className="font-mono font-semibold" style={{ color: "var(--tracker-text-muted)" }}>#{t.num || "—"}</span>
                          <span className="truncate" style={{ color: "var(--tracker-text-main)" }}>{t.name || "Без названия"}</span>
                          <span className="ml-auto text-[9px] shrink-0" style={{ color: "var(--tracker-text-muted)" }}>{t.status}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {!isGuest && (
              <div className="flex items-center justify-between mt-2 pt-2 border-t" style={{ borderColor: "var(--tracker-border)" }}>
                <span className="text-[10px]" style={{ color: "var(--tracker-text-muted)" }}>Ctrl+Enter · отправить</span>
                <Button size="sm" disabled={!newQuestionText.trim()}
                  className="h-7 gap-1.5 text-xs rounded-lg px-3"
                  style={{ background: "var(--tracker-accent)", color: "var(--tracker-accent-contrast)" }}
                  onClick={handleAddQuestion}>
                  <Sparkles className="size-3" /> Задать вопрос
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Domain scope ── */}
      {activeDomainId && (
        <div className="flex items-center gap-2">
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: "var(--tracker-bg-card, var(--background))", border: "1px solid var(--tracker-border)" }}>
            <button onClick={() => setDomainScope("current")}
              className={`text-xs font-medium px-3 py-1 rounded-lg transition-all ${domainScope === "current" ? "shadow-sm" : "hover:bg-muted/50"}`}
              style={{
                background: domainScope === "current" ? "var(--tracker-accent-bg)" : "transparent",
                color: domainScope === "current" ? "var(--tracker-accent-fg-dark)" : "var(--tracker-text-muted)",
              }}>
              <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-[4px]" style={{ background: "var(--tracker-accent)" }} />{activeDomainName || "Текущий домен"}</span>
            </button>
            <button onClick={() => setDomainScope("all")}
              className={`text-xs font-medium px-3 py-1 rounded-lg transition-all ${domainScope === "all" ? "shadow-sm" : "hover:bg-muted/50"}`}
              style={{
                background: domainScope === "all" ? "var(--tracker-accent-bg)" : "transparent",
                color: domainScope === "all" ? "var(--tracker-accent-fg-dark)" : "var(--tracker-text-muted)",
              }}>
              Все домены
            </button>
          </div>
          <span className="text-[10px]" style={{ color: "var(--tracker-text-muted)" }}>
            {domainScope === "current" ? "вопросы текущего домена и общие" : "вопросы всех доменов"}
          </span>
        </div>
      )}

      {/* ── Filter tabs + Search ── */}
      {totalQuestions > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: "var(--tracker-bg-card, var(--background))", border: "1px solid var(--tracker-border)" }}>
            {FILTER_TABS.map((tab) => (
              <button key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all ${filter === tab.key ? "shadow-sm" : "hover:bg-muted/50"}`}
                style={{
                  background: filter === tab.key ? "var(--tracker-accent-bg)" : "transparent",
                  color: filter === tab.key ? "var(--tracker-accent-fg-dark)" : "var(--tracker-text-muted)",
                }}>
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5" style={{ color: "var(--tracker-text-muted)" }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Поиск..."
              className="w-full h-8 pl-8 pr-3 text-xs rounded-lg border bg-transparent outline-none focus:ring-1 focus:ring-[var(--tracker-accent)]"
              style={{ borderColor: "var(--tracker-border)", color: "var(--tracker-text-main)" }}
            />
          </div>
        </div>
      )}

      {/* ── Three-column layout ── */}
      {questions.length === 0 && <EmptyState type="questions" />}

      {questions.length > 0 && (
        <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)" }}>
          {/* ── LEFT: Open questions ── */}
          <div className="space-y-2 min-w-0">
            <div className="flex items-center gap-2 mb-1 px-1">
              <CircleDot className="size-3.5" style={{ color: "#f59e0b" }} />
              <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#f59e0b" }}>
                Открытые
              </h3>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: "rgba(245,158,11,0.1)", color: "#f59e0b" }}>
                {unanswered.length}
              </span>
            </div>
            {unanswered.length === 0 && (
              <div className="text-center py-6 rounded-xl border border-dashed" style={{ borderColor: "var(--tracker-border)" }}>
                <CheckCircle2 className="size-6 mx-auto mb-1.5" style={{ color: "#22c55e", opacity: 0.5 }} />
                <p className="text-xs" style={{ color: "var(--tracker-text-muted)" }}>Нет открытых</p>
              </div>
            )}
            {unanswered.map((q) => (
              <QuestionCard key={q.id} q={q} expandedId={expandedId} setExpandedId={setExpandedId}
                answeringId={answeringId} setAnsweringId={setAnsweringId} answerDraft={answerDraft} setAnswerDraft={setAnswerDraft}
                currentUsername={currentUsername} answerQuestion={answerQuestion} deleteAnswer={deleteAnswer}
                removeQuestion={removeQuestion} archiveQuestion={archiveQuestion} openTaskDialog={openTaskDialog} isDark={isDark}
                allData={allData} updateTask={updateTask} currentMonth={currentMonth} isGuest={isGuest} />
            ))}
          </div>

          {/* ── MIDDLE: Reopened questions ── */}
          <div className="space-y-2 min-w-0">
            <div className="flex items-center gap-2 mb-1 px-1">
              <Clock className="size-3.5" style={{ color: "#f97316" }} />
              <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#f97316" }}>
                Возобновлённые
              </h3>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: "rgba(249,115,22,0.1)", color: "#f97316" }}>
                {reopened.length}
              </span>
            </div>
            {reopened.length === 0 && (
              <div className="text-center py-6 rounded-xl border border-dashed" style={{ borderColor: "var(--tracker-border)" }}>
                <Clock className="size-6 mx-auto mb-1.5" style={{ color: "#f97316", opacity: 0.5 }} />
                <p className="text-xs" style={{ color: "var(--tracker-text-muted)" }}>Нет возобновлённых</p>
              </div>
            )}
            {reopened.map((q) => (
              <QuestionCard key={q.id} q={q} expandedId={expandedId} setExpandedId={setExpandedId}
                answeringId={answeringId} setAnsweringId={setAnsweringId} answerDraft={answerDraft} setAnswerDraft={setAnswerDraft}
                currentUsername={currentUsername} answerQuestion={answerQuestion} deleteAnswer={deleteAnswer}
                removeQuestion={removeQuestion} archiveQuestion={archiveQuestion} openTaskDialog={openTaskDialog} isDark={isDark}
                allData={allData} updateTask={updateTask} currentMonth={currentMonth} isGuest={isGuest} />
            ))}
          </div>

          {/* ── RIGHT: Answered questions ── */}
          <div className="space-y-2 min-w-0">
            <div className="flex items-center gap-2 mb-1 px-1">
              <CheckCircle2 className="size-3.5" style={{ color: "#22c55e" }} />
              <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#22c55e" }}>
                Отвеченные
              </h3>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e" }}>
                {answered.length}
              </span>
            </div>
            {answered.length === 0 && (
              <div className="text-center py-6 rounded-xl border border-dashed" style={{ borderColor: "var(--tracker-border)" }}>
                <CircleDot className="size-6 mx-auto mb-1.5" style={{ color: "#f59e0b", opacity: 0.5 }} />
                <p className="text-xs" style={{ color: "var(--tracker-text-muted)" }}>Пока нет отвеченных</p>
              </div>
            )}
            {answered.map((q) => (
              <QuestionCard key={q.id} q={q} expandedId={expandedId} setExpandedId={setExpandedId}
                answeringId={answeringId} setAnsweringId={setAnsweringId} answerDraft={answerDraft} setAnswerDraft={setAnswerDraft}
                currentUsername={currentUsername} answerQuestion={answerQuestion} deleteAnswer={deleteAnswer}
                removeQuestion={removeQuestion} archiveQuestion={archiveQuestion} openTaskDialog={openTaskDialog} isDark={isDark}
                allData={allData} updateTask={updateTask} currentMonth={currentMonth} isGuest={isGuest} />
            ))}
          </div>
        </div>
      )}

      {/* ── Archive dialog ── */}
      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Archive className="size-5" style={{ color: "#8b5cf6" }} />Архив вопросов
            </DialogTitle>
            <DialogDescription className="text-xs">{archivedCount} вопросов в архиве</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[150px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5" style={{ color: "var(--tracker-text-muted)" }} />
              <input value={archiveSearch} onChange={e => setArchiveSearch(e.target.value)}
                placeholder="Поиск по тексту или задаче..."
                className="w-full h-8 pl-8 pr-3 text-xs rounded-lg border bg-transparent outline-none focus:ring-1 focus:ring-[var(--tracker-accent)]"
                style={{ borderColor: "var(--tracker-border)", color: "var(--tracker-text-main)" }} />
            </div>
            <select value={archiveAuthorFilter} onChange={e => setArchiveAuthorFilter(e.target.value)}
              className="h-8 px-2 text-xs rounded-lg border bg-transparent outline-none focus:ring-1 focus:ring-[var(--tracker-accent)]"
              style={{ borderColor: "var(--tracker-border)", color: "var(--tracker-text-main)" }}>
              <option value="">Все авторы</option>
              {archivedAuthors.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 mt-2 min-h-0">
            {filteredArchived.length === 0 && (
              <div className="text-center py-8 text-xs" style={{ color: "var(--tracker-text-muted)" }}>
                {archivedCount === 0 ? "Архив пуст" : "Ничего не найдено"}
              </div>
            )}
            {filteredArchived.map(q => (
              <div key={q.id} className="rounded-xl border p-3 flex items-start gap-2.5"
                style={{ background: "var(--tracker-bg-card)", borderColor: "var(--tracker-border)" }}>
                <div className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold"
                  style={{ background: "rgba(139,92,246,0.12)", color: "#8b5cf6" }}>
                  {(q.author || "?")[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                    <span className="text-[10px] font-semibold" style={{ color: "var(--tracker-accent-fg-dark)" }}>{q.author}</span>
                    {q.questionDate && <span className="text-[9px]" style={{ color: "var(--tracker-text-muted)" }}>{fmtDateUtil(q.questionDate)}</span>}
                    {q.linkedTaskName && (
                      <span className="text-[8px] font-semibold px-1 py-0.5 rounded-full inline-flex items-center gap-0.5" style={{ background: "rgba(99,102,241,0.1)", color: "#6366f1" }}>
                        <ClipboardList className="size-2" />{q.linkedTaskName}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] leading-relaxed line-clamp-2" style={{ color: "var(--tracker-text-main)" }}>{q.text}</p>
                  {q.answers.length > 0 && (
                    <p className="text-[9px] mt-1" style={{ color: "var(--tracker-text-muted)" }}>
                      {q.answers.length} {q.answers.length === 1 ? "ответ" : q.answers.length < 5 ? "ответа" : "ответов"}
                    </p>
                  )}
                </div>
                <button onClick={() => restoreQuestion(q.id)}
                  className="shrink-0 text-[9px] px-2 py-1 rounded-md border transition-colors hover:bg-[var(--tracker-accent-bg)]"
                  style={{ borderColor: "var(--tracker-border)", color: "var(--tracker-accent-fg-dark)" }}>
                  Восстановить
                </button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Question Card Component ──
