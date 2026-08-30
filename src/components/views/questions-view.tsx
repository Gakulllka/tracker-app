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
  groupQuestions, BUCKET_LABELS, BUCKET_ORDER, type QuestionBucket,
} from "@/lib/question-buckets";
import {
  Clock, RotateCcw, CheckCircle2, Archive, MessageSquare, Search, Plus, Trash2,
  Sparkles, X, ChevronDown, ChevronUp, ListTodo, ClipboardList,
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

const BUCKET_ICONS: Record<QuestionBucket, React.ComponentType<{ className?: string }>> = {
  waiting: Clock,
  reopened: RotateCcw,
  answered: CheckCircle2,
  archived: Archive,
};

/** Пустая корзина объясняет, чего в ней нет, а не показывает «0». */
const EMPTY_TITLES: Record<QuestionBucket, string> = {
  waiting: "Все вопросы отвечены",
  reopened: "Нет возобновлённых",
  answered: "Пока нет отвеченных",
  archived: "Архив пуст",
};

const EMPTY_HINTS: Record<QuestionBucket, string> = {
  waiting: "Задайте вопрос команде — он появится здесь",
  reopened: "Сюда попадают вопросы, к которым вернулись после ответа",
  answered: "Отвеченные вопросы остаются здесь до отправки в архив",
  archived: "Отправленные в архив вопросы можно вернуть в работу",
};

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
  const [bucket, setBucket] = useState<QuestionBucket>("waiting");
  const [search, setSearch] = useState("");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveSearch, setArchiveSearch] = useState("");
  const [archiveAuthorFilter, setArchiveAuthorFilter] = useState("");
  const { byBucket, counts } = useMemo(
    () => groupQuestions(scopedQuestions),
    [scopedQuestions],
  );

  const visible = useMemo(() => {
    const list = byBucket[bucket];
    const needle = search.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(
      (q) =>
        q.text.toLowerCase().includes(needle) ||
        (q.author || "").toLowerCase().includes(needle),
    );
  }, [byBucket, bucket, search]);

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

  return (
    <div className="space-y-4">

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


      {/* ── Корзины слева, выбранная справа ──────────────────────────
           Раньше статус выражался трижды: цветными счётчиками сверху,
           кнопками фильтра и колонками списка. Теперь одна раскладка.
           Пустые корзины не рисуют коробок «здесь ничего нет» — они
           просто показывают ноль в счётчике.                          */}
      <div className="ink-window questions-shell">
        <nav className="questions-buckets" aria-label="Разделы вопросов">
          {BUCKET_ORDER.map((key) => {
            const Icon = BUCKET_ICONS[key];
            return (
              <button
                key={key}
                className={`questions-bucket ${bucket === key ? "questions-bucket--on" : ""}`}
                onClick={() => setBucket(key)}
                aria-current={bucket === key}
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{BUCKET_LABELS[key]}</span>
                <span className="delta-num questions-bucket-count">{counts[key]}</span>
              </button>
            );
          })}

          <div className="questions-buckets-foot">
            <div className="questions-scope">
              <button
                className={domainScope === "current" ? "on" : ""}
                onClick={() => setDomainScope("current")}
              >
                {activeDomainName || "Домен"}
              </button>
              <button
                className={domainScope === "all" ? "on" : ""}
                onClick={() => setDomainScope("all")}
              >
                Все
              </button>
            </div>

            <div className="questions-search">
              <Search className="size-3.5 shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск…"
                aria-label="Поиск по вопросам"
              />
            </div>
          </div>
        </nav>

        <div className="questions-pane">
          {/* Форма и поиск сверху: внизу они уезжали бы за пределы экрана,
              как только вопросов станет много — а их станет много. */}
          <div className="questions-compose">
            <div>
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
                  style={{ background: "rgba(99,102,241,0.1)", color: "var(--tracker-accent)" }}>
                  <ClipboardList className="size-3" />
                  #{allTasks.find(t => t.id === linkedTaskId)?.num} {linkedTaskName}
                  <button onClick={() => { setLinkedTaskId(null); setLinkedTaskName(""); setTaskSearch(""); }}
                    className="ml-0.5 hover:text-[var(--tracker-danger)]"><X className="size-3" /></button>
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
          </div>

          <div className="questions-list">
            {visible.length === 0 ? (
              <div className="empty-state py-10">
                <div className="empty-state-icon"><MessageSquare className="size-6" /></div>
                <p className="empty-state-title">{EMPTY_TITLES[bucket]}</p>
                <p className="empty-state-hint">{EMPTY_HINTS[bucket]}</p>
              </div>
            ) : (
              visible.map((q) => (
                <QuestionCard
                  key={q.id}
                  q={q}
                  expandedId={expandedId}
                  setExpandedId={setExpandedId}
                  answeringId={answeringId}
                  setAnsweringId={setAnsweringId}
                  answerDraft={answerDraft}
                  setAnswerDraft={setAnswerDraft}
                  answerQuestion={answerQuestion}
                  deleteAnswer={deleteAnswer}
                  removeQuestion={removeQuestion}
                  archiveQuestion={archiveQuestion}
                  openTaskDialog={openTaskDialog}
                  isDark={isDark}
                  isGuest={isGuest}
                  currentUsername={currentUsername}
                  allData={allData}
                  updateTask={updateTask}
                  currentMonth={currentMonth}
                />
              ))
            )}
          </div>

        </div>
      </div>

    </div>
  );
}

// ── Question Card Component ──
