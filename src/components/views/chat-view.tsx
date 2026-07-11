"use client";
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KeyRound, Check, Trash2, Send, Loader2 } from "lucide-react";
import { STATUSES, MONTHS, type Task } from "@/lib/types";
import { evalExpr, R2 } from "@/lib/metrics";
import type { Question } from "@/lib/questions";

interface ChatMessage {
  role: "user" | "ai" | "error" | "system";
  text: string; timestamp?: number; suggestedQuestions?: string[];
}

export interface ChatViewProps {
  apiKeyRef: React.MutableRefObject<string>;
  apiKeyDialogOpen: boolean;
  setApiKeyDialogOpen: (v: boolean) => void;
  onApiKeySaved: () => void;
  chatModel: string; setChatModel: (v: string) => void;
  rows: Task[]; month: number; year: number;
  allData: Record<number, Task[]>; backlog: Task[];
  totalFactMap: Record<string, number>;
  questions: Question[];
  addQuestion: (text: string, author: string) => void;
}

function AiText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="text-sm leading-relaxed space-y-1">
      {lines.map((line, i) => {
        if (line.startsWith("### ")) return <h3 key={i} className="font-bold text-sm mt-2 mb-0.5" style={{ color: "var(--tracker-accent-fg-dark)" }}>{line.slice(4)}</h3>;
        if (line.startsWith("## "))  return <h2 key={i} className="font-bold text-base mt-2 mb-0.5" style={{ color: "var(--tracker-accent-fg-dark)" }}>{line.slice(3)}</h2>;
        if (line.startsWith("- ") || line.startsWith("• ")) return <div key={i} className="flex gap-2"><span style={{ color: "var(--tracker-accent)" }}>·</span><span>{renderBold(line.slice(2))}</span></div>;
        if (/^\d+\.\s/.test(line)) return <div key={i} className="flex gap-2"><span className="shrink-0 font-semibold" style={{ color: "var(--tracker-accent)" }}>{line.match(/^\d+/)?.[0]}.</span><span>{renderBold(line.replace(/^\d+\.\s/, ""))}</span></div>;
        if (line.startsWith("---") || line.startsWith("===")) return <hr key={i} className="my-1 opacity-20" />;
        if (!line.trim()) return <div key={i} className="h-1" />;
        return <p key={i}>{renderBold(line)}</p>;
      })}
    </div>
  );
}

function renderBold(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => p.startsWith("**") && p.endsWith("**")
    ? <strong key={i} style={{ color: "var(--tracker-accent-fg-dark)" }}>{p.slice(2, -2)}</strong>
    : p);
}

export function ChatView({
  apiKeyRef, apiKeyDialogOpen, setApiKeyDialogOpen, onApiKeySaved,
  chatModel, setChatModel, rows, month, year, allData, backlog, totalFactMap, questions, addQuestion,
}: ChatViewProps) {
  const [input, setInput] = useState("");
  const [log, setLog] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [creatingQuestion, setCreatingQuestion] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [log, busy]);

  const buildContext = useCallback((): string => {
    const lines: string[] = [];
    lines.push(`Дата: ${new Date().toLocaleDateString("ru-RU")}, текущий месяц трекера: ${MONTHS[month]} ${year}`);
    lines.push("\n=== ГОД — СВОДКА ПО ВСЕМ МЕСЯЦАМ ===");
    for (let mi = 0; mi < 12; mi++) {
      const mRows = (allData[mi] || []).filter(r => !r._deleted && (r.name || r.num));
      if (!mRows.length) continue;
      const done = mRows.filter(r => r.status === STATUSES.DONE || r.status === STATUSES.COMPLETED).length;
      const planH = R2(mRows.reduce((s, r) => s + evalExpr(r.planH), 0));
      const factH = R2(mRows.reduce((s, r) => s + evalExpr(r.factH), 0));
      lines.push(`${MONTHS[mi]}: задач=${mRows.length} завершено=${done} план=${planH}ч факт=${factH}ч`);
    }
    const curRows = (allData[month] || []).filter(r => !r._deleted && (r.name || r.num));
    lines.push(`\n=== ДЕТАЛИ: ${MONTHS[month].toUpperCase()} ${year} ===\nВсего задач: ${curRows.length}`);
    if (curRows.length) {
      lines.push("Список задач:");
      for (const r of curRows) {
        const plan = evalExpr(r.planH), fact = evalExpr(r.factH);
        const over = plan > 0 && fact > plan ? ` ПРЕВЫШЕНИЕ+${R2(fact - plan)}ч` : "";
        lines.push(`  №${r.num || "—"} "${r.name}" | ${r.status} ${r.priority} план:${plan}ч факт:${fact}ч${over}`);
      }
    }
    const bl = (backlog || []).filter(r => !r._deleted);
    if (bl.length) {
      lines.push(`\n=== БЕКЛОГ (${bl.length} задач) ===`);
      bl.slice(0, 15).forEach((r, i) => lines.push(`  ${i + 1}. №${r.num || "—"} "${r.name}" план:${evalExpr(r.planH)}ч`));
    }
    if (questions?.length) {
      lines.push(`\n=== ВОПРОСЫ (${questions.length}) ===`);
      questions.slice(0, 10).forEach((q, i) => {
        const ans = q.answers || [];
        lines.push(`  ${i + 1}. [${ans.length > 0 ? "✅" : "⏳"}] "${q.text}" — ${q.author || "аноним"}`);
        if (ans.length > 0) lines.push(`     Ответ: "${ans[ans.length - 1].text}"`);
      });
    }
    return lines.join("\n");
  }, [allData, month, year, backlog, questions]);

  const buildSystemPrompt = useCallback(() =>
    `Ты — AI-ассистент менеджера проектов. Отвечай ТОЛЬКО на русском языке.\nИспользуй **жирный** для ключевых цифр, ### для заголовков, - для списков.\nЕсли предлагаешь вопросы команде — блок "### Предлагаемые вопросы:"\n\n--- ДАННЫЕ ---\n${buildContext()}\n--- /ДАННЫЕ ---`
  , [buildContext]);

  const extractSuggestedQuestions = (text: string): string[] => {
    const block = text.match(/###\s*Предлагаемые вопросы[:\s]*([\s\S]*?)(?:\n###|\n---|\n\n\n|$)/i);
    if (!block) return [];
    return block[1].split("\n").map(l => l.replace(/^[-•\d.]\s*/, "").trim()).filter(l => l.length > 10 && l.length < 200).slice(0, 5);
  };

  const send = useCallback(async (overrideText?: string) => {
    const msg = (overrideText ?? input).trim();
    if (!msg || busy) return;
    const apiKey = apiKeyRef.current;
    if (!apiKey) { setApiKeyDialogOpen(true); return; }
    if (!overrideText) setInput("");
    const newLog: ChatMessage[] = [...log, { role: "user", text: msg, timestamp: Date.now() }];
    setLog(newLog); setBusy(true);
    try {
      const sysPrompt = buildSystemPrompt();
      const contents = newLog.filter(m => m.role === "user" || m.role === "ai").map((m, idx) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.role === "user" && idx === 0 ? sysPrompt + "\n\nПервый вопрос: " + m.text : m.text }],
      }));
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: contents, apiKey, model: chatModel }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const aiText = (data.text || "").trim();
      setLog(l => [...l, { role: "ai", text: aiText, timestamp: Date.now(), suggestedQuestions: extractSuggestedQuestions(aiText) }]);
    } catch (err) {
      setLog(l => [...l, { role: "error", text: err instanceof Error ? err.message : "Ошибка", timestamp: Date.now() }]);
    }
    setBusy(false);
  }, [input, busy, log, apiKeyRef, chatModel, buildSystemPrompt, setApiKeyDialogOpen]);

  const quickActions = useMemo(() => {
    const curRows = (allData[month] || []).filter(r => !r._deleted && (r.name || r.num));
    const atRiskCount = curRows.filter(r => evalExpr(r.factH) > evalExpr(r.planH) && evalExpr(r.planH) > 0).length;
    const backlogCount = (backlog || []).filter(r => !r._deleted).length;
    const unansweredCount = questions.filter(q => !(q.answers || []).length).length;
    return [
      { label: "Отчёт за месяц", text: `Составь краткий отчёт по задачам за ${MONTHS[month]} ${year}.` },
      { label: `Зона риска${atRiskCount > 0 ? ` (${atRiskCount})` : ""}`, text: `Проанализируй задачи которые превышают план в ${MONTHS[month]} ${year}.` },
      { label: "Предложи вопросы", text: `На основе данных предложи 5 ключевых вопросов. Оформи в блоке "### Предлагаемые вопросы:"` },
      ...(backlogCount > 0 ? [{ label: `📦 Беклог (${backlogCount})`, text: `Какие задачи беклога приоритетнее перенести?` }] : []),
      ...(unansweredCount > 0 ? [{ label: `❓ Открытые (${unansweredCount})`, text: `Какие открытые вопросы наиболее критичны?` }] : []),
    ];
  }, [allData, month, year, backlog, questions]);

  const hasKey = !!apiKeyRef.current;

  return (
    <div className="flex flex-col gap-3" style={{ height: "calc(100vh - 200px)", minHeight: 500 }}>
      {/* API Key Dialog */}
      <Dialog open={apiKeyDialogOpen} onOpenChange={setApiKeyDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle><KeyRound className="size-5 inline mr-2 text-[var(--tracker-accent)]" />Gemini API ключ</DialogTitle>
            <DialogDescription>Введите ваш API ключ Google Gemini. Хранится только в памяти сессии.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <Input value={apiKeyInput} onChange={e => setApiKeyInput(e.target.value)} placeholder="AIzaSy..." className="font-mono text-sm"
              onKeyDown={e => { if (e.key === "Enter" && apiKeyInput.trim()) { apiKeyRef.current = apiKeyInput.trim(); setApiKeyDialogOpen(false); setApiKeyInput(""); onApiKeySaved(); } }} autoFocus />
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium whitespace-nowrap">Модель</label>
              <Select value={chatModel} onValueChange={setChatModel}>
                <SelectTrigger className="h-9 flex-1 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-3-flash-preview", "gemini-3.1-flash-lite-preview"].map(m =>
                    <SelectItem key={m} value={m} className="text-xs">{m.replace("gemini-", "")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">Получить ключ: <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="underline" style={{ color: "var(--tracker-accent)" }}>aistudio.google.com</a></p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApiKeyDialogOpen(false)}>Отмена</Button>
            <Button disabled={!apiKeyInput.trim()} className="bg-[var(--tracker-accent)] text-[var(--tracker-accent-contrast)]"
              onClick={() => { apiKeyRef.current = apiKeyInput.trim(); setApiKeyDialogOpen(false); setApiKeyInput(""); onApiKeySaved(); }}>
              <Check className="size-4 mr-1.5" />Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create question dialog */}
      <Dialog open={!!creatingQuestion} onOpenChange={open => { if (!open) setCreatingQuestion(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>❓ Создать вопрос</DialogTitle><DialogDescription>Вопрос будет добавлен в список вопросов команды</DialogDescription></DialogHeader>
          <div className="py-2"><Textarea value={creatingQuestion || ""} onChange={e => setCreatingQuestion(e.target.value)} rows={3} className="text-sm resize-none" /></div>
          <DialogFooter className="gap-2 sm:flex-row sm:justify-stretch">
            <Button onClick={() => { if (creatingQuestion?.trim()) { addQuestion(creatingQuestion.trim(), "AI-ассистент"); setCreatingQuestion(null); } }}
              className="flex-1 bg-[var(--tracker-accent)] text-[var(--tracker-accent-contrast)]">Добавить вопрос</Button>
            <Button variant="destructive" onClick={() => setCreatingQuestion(null)} className="flex-1">Отмена</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Top bar */}
      <div className="flex items-center gap-2 shrink-0 flex-wrap">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs flex-1 min-w-0"
          style={{ background: "var(--tracker-accent-bg)", color: "var(--tracker-accent-fg-dark)" }}>
          <span className="font-semibold">✦ AI</span><span className="opacity-60">·</span>
          <span>{MONTHS[month]} {year}</span><span className="opacity-60">·</span>
          <span>{(rows || []).filter(r => r.name || r.num).length} задач</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Select value={chatModel} onValueChange={setChatModel}>
            <SelectTrigger className="h-7 w-auto text-[11px] px-2 gap-1 border-[var(--tracker-border)]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["gemini-2.5-flash", "gemini-2.5-flash-lite"].map(m => <SelectItem key={m} value={m} className="text-xs">{m.replace("gemini-", "")}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs px-2" onClick={() => setApiKeyDialogOpen(true)}>
            <KeyRound className="size-3" />{hasKey ? "Ключ ✓" : "API ключ"}
          </Button>
          {log.length > 0 && <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => setLog([])} title="Очистить"><Trash2 className="size-3.5" /></Button>}
        </div>
      </div>

      {/* Quick actions */}
      {log.length === 0 && (
        <div className="flex gap-2 flex-wrap shrink-0">
          {quickActions.map((qa, i) => (
            <button key={i} onClick={() => { if (hasKey) send(qa.text); else setApiKeyDialogOpen(true); }} disabled={busy}
              className="text-xs px-3 py-1.5 rounded-full border transition-colors hover:border-[var(--tracker-accent)] hover:bg-[var(--tracker-accent-bg)] disabled:opacity-50"
              style={{ borderColor: "var(--tracker-border)", color: "var(--tracker-text-main)", background: "var(--tracker-bg-card)" }}>
              {qa.label}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 flex flex-col gap-3 overflow-y-auto rounded-xl border p-4 min-h-0"
        style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-bg-main)" }}>
        {!log.length && !busy && (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-8 animate-fade-in">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: "var(--tracker-accent-bg)" }}>
              <span className="text-3xl">✦</span>
            </div>
            <p className="text-lg font-semibold mb-1" style={{ color: "var(--tracker-text-main)" }}>AI-ассистент менеджера</p>
            <p className="text-sm max-w-sm" style={{ color: "var(--tracker-text-muted)" }}>{hasKey ? "Нажмите быстрое действие или задайте свой вопрос." : "Нажмите «API ключ» чтобы подключить Gemini."}</p>
          </div>
        )}
        {log.map((m, i) => (
          <div key={i} className={`flex flex-col gap-1.5 animate-fade-in-up ${m.role === "user" ? "items-end" : "items-start"}`} style={{ animationDelay: `${Math.min(i * 50, 200)}ms` }}>
            <span className="text-[11px] font-semibold px-1.5" style={{ color: "var(--tracker-text-muted)" }}>{m.role === "user" ? "Вы" : m.role === "error" ? "⚠ Ошибка" : "✦ AI-ассистент"}</span>
            <div className={`rounded-2xl px-4 py-3 max-w-[85%] ${m.role === "user" ? "rounded-tr-sm" : "rounded-tl-sm"}`}
              style={m.role === "user" ? { background: "var(--tracker-accent-bg)", color: "var(--tracker-text-main)", border: "1px solid var(--tracker-border)" }
                : m.role === "error" ? { background: "rgba(239,68,68,0.07)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)" }
                : { background: "var(--tracker-bg-card)", color: "var(--tracker-text-main)", border: "1px solid var(--tracker-border)" }}>
              {m.role === "ai" ? <AiText text={m.text} /> : <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.text}</p>}
              {m.role === "ai" && m.suggestedQuestions && m.suggestedQuestions.length > 0 && (
                <div className="mt-3 pt-3 border-t space-y-1.5" style={{ borderColor: "var(--tracker-border)" }}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--tracker-text-muted)" }}>Добавить в вопросы команды:</p>
                  {m.suggestedQuestions.map((q, qi) => (
                    <button key={qi} onClick={() => setCreatingQuestion(q)}
                      className="flex items-start gap-2 w-full text-left text-xs px-3 py-2.5 rounded-lg border transition-all hover:bg-[var(--tracker-accent-bg)] hover:border-[var(--tracker-accent)]/30"
                      style={{ borderColor: "var(--tracker-border)", color: "var(--tracker-text-main)" }}>
                      <span className="shrink-0 mt-0.5" style={{ color: "var(--tracker-accent)" }}>+</span><span className="flex-1">{q}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-start gap-1 animate-fade-in">
            <div className="rounded-2xl rounded-tl-sm px-4 py-3 border" style={{ background: "var(--tracker-bg-card)", borderColor: "var(--tracker-border)" }}>
              <div className="flex gap-1.5 items-center h-5">
                {[0, 1, 2].map(i => <span key={i} className="w-2 h-2 rounded-full animate-bounce" style={{ background: "var(--tracker-accent)", animationDelay: `${i * 120}ms`, opacity: 0.7 }} />)}
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 shrink-0">
        <div className="flex-1 flex items-end gap-2 rounded-xl border px-3 py-2" style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-bg-card)" }}>
          <Textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={hasKey ? "Спросите что угодно..." : "Сначала введите API ключ →"}
            rows={1} className="flex-1 resize-none border-0 bg-transparent p-0 text-sm focus-visible:ring-0 shadow-none min-h-[36px]" style={{ color: "var(--tracker-text-main)" }} />
          <Button onClick={() => send()} disabled={busy || !input.trim()} size="icon" className="h-9 w-9 shrink-0 rounded-xl transition-all hover:shadow-md active:scale-95"
            style={{ background: busy || !input.trim() ? "var(--tracker-border)" : "var(--tracker-accent)", color: "#fff" }}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>
      </div>
      <p className="text-[11px] shrink-0 text-center" style={{ color: "var(--tracker-text-muted)" }}>Enter — отправить · Shift+Enter — перенос</p>
    </div>
  );
}
