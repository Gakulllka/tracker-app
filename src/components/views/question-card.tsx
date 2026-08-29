import React, { useMemo } from "react";
import {
  Archive, ChevronDown, ChevronUp, ClipboardList, MessageSquare,
  Package, Plus, Ruler, Send, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STATUSES } from "@/lib/types";
import { scolText } from "@/lib/tokens";
import { useTaskStore } from "@/lib/store";
import type { Status, Task } from "@/lib/types";
import type { Question } from "@/lib/questions";
import { fmtDate as fmtDateUtil } from "@/lib/questions";

/**
 * Карточка вопроса в ленте.
 *
 * Вопрос может быть привязан к задаче — тогда карточка показывает её номер,
 * статус и позволяет открыть задачу или создать новую прямо отсюда.
 * Развёрнутое состояние и черновик ответа хранятся в родителе: в ленте
 * одновременно открыт только один вопрос.
 */
export function QuestionCard({ q, expandedId, setExpandedId, answeringId, setAnsweringId, answerDraft, setAnswerDraft, currentUsername, answerQuestion, deleteAnswer, removeQuestion, archiveQuestion, openTaskDialog, isDark, allData, updateTask, currentMonth, isGuest }: {
  q: Question;
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  answeringId: string | null;
  setAnsweringId: (id: string | null) => void;
  answerDraft: string;
  setAnswerDraft: (v: string) => void;
  currentUsername: string;
  answerQuestion: (id: string, text: string, author: string) => void;
  deleteAnswer: (qid: string, aid: string) => void;
  removeQuestion: (id: string) => void;
  archiveQuestion: (id: string) => void;
  openTaskDialog: (q: Question, target: "backlog" | "table") => void;
  isDark: boolean;
  allData: Record<number, Task[]>;
  updateTask: (month: number, taskId: string, key: keyof Task, value: unknown) => void;
  currentMonth: number;
  isGuest?: boolean;
}) {
  const answers = q.answers || [];
  const isAnswered = answers.length > 0;
  const isExpanded = expandedId === q.id;
  const isAnswering = answeringId === q.id;

  // Find linked task
  const linkedTask = useMemo(() => {
    if (!q.linkedTaskId) return null;
    for (let m = 0; m <= 11; m++) {
      const t = (allData[m] || []).find(t => t.id === q.linkedTaskId);
      if (t) return { ...t, month: m };
    }
    return null;
  }, [q.linkedTaskId, allData]);

  return (
    <div className="rounded-xl border overflow-hidden transition-all duration-200 hover:shadow-md"
      style={{ background: "var(--tracker-bg-card, var(--background))", borderColor: "var(--tracker-border)" }}>
      <div className="p-3">
        <div className="flex items-start gap-2.5">
          <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold"
            style={{ background: "var(--tracker-accent-bg)", color: "var(--tracker-accent-fg-dark)" }}>
            {(q.author || "?")[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
              <span className="text-[11px] font-semibold" style={{ color: "var(--tracker-accent-fg-dark)" }}>{q.author}</span>
              {q.questionDate && <span className="text-[9px]" style={{ color: "var(--tracker-text-muted)" }}>{fmtDateUtil(q.questionDate)}</span>}
              {q.linkedTaskName && (
                <span className="text-[8px] font-semibold px-1 py-0.5 rounded-full inline-flex items-center gap-0.5" style={{ background: "rgba(99,102,241,0.1)", color: "var(--tracker-accent)" }}>
                  <ClipboardList className="size-2" />{q.linkedTaskName}
                </span>
              )}
              <div className="flex-1" />
              {q.status === "reopened"
                ? <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(249,115,22,0.12)", color: "var(--tracker-warning)" }}>Возобновлён</span>
                : q.status === "open" && isAnswered
                  ? <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(245,158,11,0.12)", color: "var(--tracker-warning)" }}>Ожидает ответа</span>
                  : isAnswered
                    ? <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(34,197,94,0.12)", color: "var(--tracker-success)" }}>{answers.length} {answers.length === 1 ? "ответ" : answers.length < 5 ? "ответа" : "ответов"}</span>
                    : <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(245,158,11,0.12)", color: "var(--tracker-warning)" }}>Ожидает</span>}
            </div>
            <p className="text-xs leading-relaxed" style={{ color: "var(--tracker-text-main)" }}>{q.text}</p>

            <div className="flex items-center gap-1 mt-2 flex-wrap">
              <button onClick={() => { setAnsweringId(isAnswering ? null : q.id); setAnswerDraft(""); }}
                className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md border transition-all hover:shadow-sm"
                style={{ borderColor: "var(--tracker-border)", color: "var(--tracker-text-muted)" }}>
                <MessageSquare className="size-2.5" />Ответить
              </button>
              {isAnswered && (
                <button onClick={() => setExpandedId(isExpanded ? null : q.id)}
                  className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md border transition-all hover:shadow-sm"
                  style={{ borderColor: "var(--tracker-border)", color: "var(--tracker-text-muted)" }}>
                  {isExpanded ? <ChevronUp className="size-2.5" /> : <ChevronDown className="size-2.5" />}
                  {isExpanded ? "Скрыть" : `История (${answers.length})`}
                </button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md border transition-all hover:shadow-sm"
                    style={{ borderColor: "var(--tracker-border)", color: "var(--tracker-text-muted)" }}>
                    <Plus className="size-2.5" />Задачу
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44">
                  <DropdownMenuItem onClick={() => openTaskDialog(q, "backlog")} className="gap-2 text-xs"><Package className="size-3" />В беклог</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openTaskDialog(q, "table")} className="gap-2 text-xs"><ClipboardList className="size-3" />В таблицу</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {isAnswered && !isGuest && (
                <button onClick={() => archiveQuestion(q.id)}
                  className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md border transition-all hover:shadow-sm"
                  style={{ borderColor: "rgba(139,92,246,0.3)", color: "var(--tracker-accent)" }}>
                  <Archive className="size-2.5" />В архив
                </button>
              )}
              {!isGuest && (
                <button onClick={() => removeQuestion(q.id)}
                  className="text-[10px] px-1.5 py-1 rounded-md transition-colors hover:bg-[color-mix(in_srgb,var(--tracker-danger)_10%,transparent)] hover:text-[var(--tracker-danger)] ml-auto"
                  style={{ color: "var(--tracker-text-muted)" }}>
                  <Trash2 className="size-2.5" />
                </button>
              )}
            </div>

            {/* Linked task actions */}
            {linkedTask && (
              <div className="mt-2 p-2 rounded-lg border" style={{ borderColor: "rgba(99,102,241,0.2)", background: "rgba(99,102,241,0.04)" }}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <ClipboardList className="size-3" style={{ color: "var(--tracker-accent)" }} />
                  <span className="text-[10px] font-semibold" style={{ color: "var(--tracker-accent)" }}>
                    #{linkedTask.num || "—"} {linkedTask.name || "Без названия"}
                  </span>
                  <span className="text-[9px] px-1 py-0.5 rounded-full ml-auto"
                    style={{ background: (scolText(linkedTask.status, isDark) || "#888") + "18", color: scolText(linkedTask.status, isDark) || "#888" }}>
                    {linkedTask.status}
                  </span>
                </div>
                <div className="flex gap-1 flex-wrap">
                  <select className="text-[9px] h-5 rounded border px-1 bg-transparent outline-none"
                    style={{ borderColor: "var(--tracker-border)", color: "var(--tracker-text-main)" }}
                    value={linkedTask.status}
                    onChange={e => updateTask(linkedTask.month, linkedTask.id, "status", e.target.value)}>
                    {Object.values(STATUSES).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button onClick={() => {
                    const newPlan = prompt("Новые часы:", linkedTask.planH || "0");
                    if (newPlan !== null) updateTask(linkedTask.month, linkedTask.id, "planH", newPlan);
                  }} className="text-[9px] px-1.5 py-0.5 rounded border hover:bg-[var(--tracker-accent-bg)] transition-colors"
                    style={{ borderColor: "var(--tracker-border)", color: "var(--tracker-text-muted)" }}>
                    <Ruler className="size-2.5 inline" /> {linkedTask.planH || "0"}ч
                  </button>
                  <button onClick={() => {
                    useTaskStore.setState({ backlog: [...useTaskStore.getState().backlog, { ...linkedTask, _ts: Date.now() }] });
                    updateTask(linkedTask.month, linkedTask.id, "_deleted", true);
                  }} className="text-[9px] px-1.5 py-0.5 rounded border hover:bg-orange-50 hover:text-orange-600 transition-colors"
                    style={{ borderColor: "var(--tracker-border)", color: "var(--tracker-text-muted)" }}>
                    <Package className="size-2.5 inline" /> В беклог
                  </button>
                </div>
              </div>
            )}

            {/* Answer input */}
            {isAnswering && (
              <div className="mt-2 space-y-1.5">
                <Textarea placeholder="Ваш ответ..." value={answerDraft}
                  onChange={e => setAnswerDraft(e.target.value)} className="min-h-[48px] resize-none text-xs rounded-lg" autoFocus />
                <div className="flex gap-1.5">
                  <Button size="sm" disabled={!answerDraft.trim()} className="h-6 gap-1 bg-[var(--tracker-accent)] text-[var(--tracker-accent-contrast)] text-[10px] rounded-md px-2"
                    onClick={() => { answerQuestion(q.id, answerDraft, currentUsername); setAnsweringId(null); setAnswerDraft(""); setExpandedId(q.id); }}>
                    <Send className="size-2.5" />Отправить
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setAnsweringId(null)}>Отмена</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Expanded answers */}
      {isExpanded && answers.length > 0 && (
        <div className="border-t px-3 py-2 space-y-2" style={{ borderColor: "var(--tracker-border)", background: "color-mix(in srgb, rgba(34,197,94,0.03) 50%, var(--tracker-bg-card))" }}>
          {answers.map((ans, ai) => (
            <div key={ans.id} className="flex gap-2 items-start group ml-9">
              <div className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold"
                style={{ background: "rgba(34,197,94,0.12)", color: "var(--tracker-success)" }}>
                {(ans.author || "?")[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[10px] font-semibold" style={{ color: "var(--tracker-text-main)" }}>{ans.author}</span>
                  <span className="text-[9px]" style={{ color: "var(--tracker-text-muted)" }}>{fmtDateUtil(ans.date)}</span>
                  {ai === answers.length - 1 && <span className="text-[8px] px-1 py-0.5 rounded-full font-semibold" style={{ background: "rgba(34,197,94,0.1)", color: "var(--tracker-success)" }}>последний</span>}
                </div>
                <p className="text-[11px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--tracker-text-main)" }}>{ans.text}</p>
              </div>
              <button onClick={() => deleteAnswer(q.id, ans.id)}
                className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-[color-mix(in_srgb,var(--tracker-danger)_10%,transparent)] hover:text-[var(--tracker-danger)]"
                style={{ color: "var(--tracker-text-muted)" }}>
                <Trash2 className="size-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Collapsed last answer preview */}
      {isAnswered && !isExpanded && answers.length > 0 && (
        <div className="border-t px-3 py-2 flex items-start gap-2"
          style={{ borderColor: "var(--tracker-border)", background: "color-mix(in srgb, rgba(34,197,94,0.03) 50%, var(--tracker-bg-card))" }}>
          <div className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold mt-0.5"
            style={{ background: "rgba(34,197,94,0.15)", color: "var(--tracker-success)" }}>
            {(answers[answers.length - 1].author || "?")[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[9px] font-semibold mr-1" style={{ color: "var(--tracker-success)" }}>{answers[answers.length - 1].author}</span>
            <span className="text-[10px] line-clamp-1" style={{ color: "var(--tracker-text-muted)" }}>{answers[answers.length - 1].text}</span>
          </div>
        </div>
      )}
    </div>
  );
}
