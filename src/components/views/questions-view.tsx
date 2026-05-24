"use client";
import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/empty-state";
import { Plus, Trash2, ChevronUp, ChevronDown, MessageSquare, Send } from "lucide-react";
import { STATUSES, PRIORITIES, MONTHS, PCOL, scolText, type Status, type Priority, type Task } from "@/lib/types";
import type { Question } from "@/lib/questions";
import { fmtDate as fmtDateUtil } from "@/lib/questions";

export interface QuestionsViewProps {
  questions: Question[];
  newQuestionText: string;
  setNewQuestionText: (v: string) => void;
  addQuestion: () => void;
  removeQuestion: (id: string) => void;
  answerQuestion: (questionId: string, answer: string, author: string) => void;
  deleteAnswer: (questionId: string, answerId: string) => void;
  currentUsername: string;
  currentMonth: number;
  addToBacklog: (task: Task) => void;
  addToTable: (month: number, task: Task) => void;
  isDark: boolean;
}

interface QuestionToTaskDialog {
  open: boolean; questionId: string; questionText: string;
  num: string; name: string; planH: string; month: number;
  priority: Priority; status: Status; target: "backlog" | "table";
}

export function QuestionsView({
  questions, newQuestionText, setNewQuestionText, addQuestion,
  removeQuestion, answerQuestion, deleteAnswer,
  currentUsername, currentMonth, addToBacklog, addToTable, isDark,
}: QuestionsViewProps) {
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [answerDraft, setAnswerDraft] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [taskDialog, setTaskDialog] = useState<QuestionToTaskDialog>({
    open: false, questionId: "", questionText: "", num: "", name: "",
    planH: "", month: currentMonth, priority: PRIORITIES.MEDIUM, status: STATUSES.NEW, target: "backlog",
  });

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
    taskDialog.target === "backlog" ? addToBacklog(task) : addToTable(taskDialog.month, task);
    setTaskDialog(d => ({ ...d, open: false }));
  }, [taskDialog, addToBacklog, addToTable]);

  const answered = questions.filter(q => (q.answers || []).length > 0);
  const unanswered = questions.filter(q => !(q.answers || []).length);

  return (
    <div className="space-y-4">
      {/* Create task dialog */}
      <Dialog open={taskDialog.open} onOpenChange={open => { if (!open) setTaskDialog(d => ({ ...d, open: false })); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>📋</span>{taskDialog.target === "backlog" ? "Добавить в беклог" : "Добавить в таблицу"}
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
            <Button disabled={!taskDialog.name.trim()} onClick={handleCreateTask} className="flex-1 bg-[var(--tracker-accent)] text-white hover:bg-[var(--tracker-accent-hover)]">
              {taskDialog.target === "backlog" ? "В беклог" : "В таблицу"}
            </Button>
            <Button variant="destructive" onClick={() => setTaskDialog(d => ({ ...d, open: false }))} className="flex-1">Отмена</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Input area */}
      <div className="questions-input-area">
        <div className="flex gap-2">
          <Textarea placeholder="Введите вопрос для команды..." value={newQuestionText}
            onChange={e => setNewQuestionText(e.target.value)}
            className="min-h-[44px] max-h-[120px] resize-none text-sm flex-1"
            style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-bg, var(--background))" }}
            onKeyDown={e => { if (e.key === "Enter" && e.ctrlKey) addQuestion(); }} rows={1} />
          <Button size="icon" disabled={!newQuestionText.trim()} className="h-11 w-11 shrink-0 rounded-xl"
            style={{ background: "var(--tracker-accent)", color: "#fff" }} onClick={addQuestion}>
            <Send className="w-5 h-5" />
          </Button>
        </div>
        <div className="flex items-center justify-between mt-1.5 px-0.5">
          <span className="text-[10px]" style={{ color: "var(--tracker-text-muted)" }}>{currentUsername} · Ctrl+Enter отправить</span>
          {questions.length > 0 && <span className="text-[10px]" style={{ color: "var(--tracker-text-muted)" }}>{unanswered.length} открытых · {answered.length} отвечено</span>}
        </div>
      </div>

      {/* Questions list */}
      <div className="questions-list-wrap space-y-3">
        {questions.length === 0 && <EmptyState type="questions" />}
        {questions.map(q => {
          const answers = q.answers || [];
          const isAnswered = answers.length > 0;
          const isExpanded = expandedId === q.id;
          const isAnswering = answeringId === q.id;
          return (
            <div key={q.id} className="rounded-xl border overflow-hidden transition-shadow"
              style={{ borderColor: isAnswered ? "var(--tracker-border)" : "color-mix(in srgb, #f59e0b 35%, var(--tracker-border))", background: "var(--tracker-bg-card)", borderLeft: isAnswered ? "3px solid #22c55e" : "3px solid #f59e0b" }}>
              <div className="px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold mt-0.5"
                    style={{ background: "var(--tracker-accent-bg)", color: "var(--tracker-accent-fg-dark)" }}>
                    {(q.author || "?")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-semibold" style={{ color: "var(--tracker-accent-fg-dark)" }}>{q.author}</span>
                      {q.questionDate && <span className="text-[10px]" style={{ color: "var(--tracker-text-muted)" }}>{fmtDateUtil(q.questionDate)}</span>}
                      {q.linkedTaskName && <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(99,102,241,0.1)", color: "#6366f1" }}>📋 {q.linkedTaskName}</span>}
                      {isAnswered
                        ? <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(34,197,94,0.12)", color: "#22c55e" }}>✓ {answers.length} {answers.length === 1 ? "ответ" : "ответа"}</span>
                        : <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(245,158,11,0.12)", color: "#f59e0b" }}>⏳ Открытый</span>}
                    </div>
                    <p className="text-sm leading-relaxed" style={{ color: "var(--tracker-text-main)" }}>{q.text}</p>
                    <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                      <button onClick={() => { setAnsweringId(isAnswering ? null : q.id); setAnswerDraft(""); }}
                        className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-colors hover:bg-[var(--tracker-accent-bg)]"
                        style={{ borderColor: "var(--tracker-border)", color: "var(--tracker-text-muted)" }}>
                        <MessageSquare className="size-3" />Ответить
                      </button>
                      {isAnswered && (
                        <button onClick={() => setExpandedId(isExpanded ? null : q.id)}
                          className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-colors hover:bg-[var(--tracker-accent-bg)]"
                          style={{ borderColor: "var(--tracker-border)", color: "var(--tracker-text-muted)" }}>
                          {isExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                          {isExpanded ? "Скрыть" : `История (${answers.length})`}
                        </button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-colors hover:bg-[var(--tracker-accent-bg)]"
                            style={{ borderColor: "var(--tracker-border)", color: "var(--tracker-text-muted)" }}>
                            <Plus className="size-3" />Создать задачу
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-48">
                          <DropdownMenuItem onClick={() => openTaskDialog(q, "backlog")} className="gap-2 text-sm"><span>📦</span>В беклог</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openTaskDialog(q, "table")} className="gap-2 text-sm"><span>📋</span>В таблицу задач</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <button onClick={() => removeQuestion(q.id)}
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors hover:bg-red-50 hover:text-red-500 ml-auto"
                        style={{ color: "var(--tracker-text-muted)" }} title="Удалить вопрос">
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                    {isAnswering && (
                      <div className="mt-3 ml-11 space-y-2">
                        <Textarea placeholder={`Ответ от ${currentUsername}...`} value={answerDraft}
                          onChange={e => setAnswerDraft(e.target.value)} className="min-h-[70px] resize-none text-sm" autoFocus />
                        <div className="flex gap-2">
                          <Button size="sm" disabled={!answerDraft.trim()} className="h-7 gap-1 bg-[var(--tracker-accent)] text-white text-xs"
                            onClick={() => { answerQuestion(q.id, answerDraft, currentUsername); setAnsweringId(null); setAnswerDraft(""); setExpandedId(q.id); }}>
                            <Send className="size-3" />Отправить ответ
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAnsweringId(null)}>Отмена</Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {isExpanded && answers.length > 0 && (
                <div className="border-t divide-y" style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-bg-main)" }}>
                  {answers.map((ans, ai) => (
                    <div key={ans.id} className="px-4 py-3 flex gap-3 items-start group">
                      <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold"
                        style={{ background: "color-mix(in srgb, #22c55e 15%, var(--tracker-accent-bg))", color: "#22c55e" }}>
                        {(ans.author || "?")[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold" style={{ color: "var(--tracker-text-main)" }}>{ans.author}</span>
                          <span className="text-[10px]" style={{ color: "var(--tracker-text-muted)" }}>{fmtDateUtil(ans.date)}</span>
                          {ai === answers.length - 1 && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e" }}>последний</span>}
                        </div>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--tracker-text-main)" }}>{ans.text}</p>
                      </div>
                      <button onClick={() => deleteAnswer(q.id, ans.id)}
                        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-50 hover:text-red-500"
                        style={{ color: "var(--tracker-text-muted)" }} title="Удалить ответ">
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {isAnswered && !isExpanded && answers.length > 0 && (
                <div className="px-4 py-2.5 border-t flex items-start gap-3"
                  style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-bg-main)" }}>
                  <div className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold mt-0.5"
                    style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>
                    {(answers[answers.length - 1].author || "?")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-semibold mr-1.5" style={{ color: "#22c55e" }}>{answers[answers.length - 1].author}</span>
                    <span className="text-xs line-clamp-1" style={{ color: "var(--tracker-text-muted)" }}>{answers[answers.length - 1].text}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
