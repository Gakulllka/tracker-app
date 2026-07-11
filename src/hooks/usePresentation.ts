"use client";
/**
 * usePresentation — хук слайдов, AI-анализа, экспорта презентации.
 * Вынесено из TaskTrackerInner.
 */
import { useState, useCallback, useRef } from "react";
import { renderPresentationHtml } from "@/lib/presentation-export";
import { generateSlides } from "@/lib/slides";
import { saveInsight, deleteInsight } from "@/lib/ai-insights-client";
import type { AiInsightShape } from "@/lib/ai-insights-client";
import type { Task } from "@/lib/types";
import type { SlideData } from "@/lib/presentation-renderer";
import type { PresBgSettings } from "@/lib/store";
import { MONTHS } from "@/lib/types";

interface UsePresentationParams {
  allData: Record<number, Task[]>;
  currentMonth: number;
  currentYear: number;
  accentHex: string;
  customDark: boolean;
  totalFactMap: Record<string, number>;
  presBg: PresBgSettings;
  workspaceId: string;
  activeDomainId: string;
  insightMonthKey: string;
  chatModel: string;
  apiKeyRef: React.MutableRefObject<string>;
  setView: (v: string) => void;
  setApiKeyDialogOpen: (v: boolean) => void;
  toast: (opts: { title: string; description?: string; variant?: "destructive" }) => void;
  /** План часов на месяц (из Дашборда). */
  monthCapacity: number;
}

export function usePresentation({
  allData, currentMonth, currentYear, accentHex, customDark,
  totalFactMap, presBg, workspaceId, activeDomainId, insightMonthKey,
  chatModel, apiKeyRef, setView, setApiKeyDialogOpen, toast,
  monthCapacity,
}: UsePresentationParams) {

  const [currentSlide, setCurrentSlide]     = useState(0);
  const [aiConclusion, setAiConclusion]     = useState<AiInsightShape | null>(null);
  const [aiDraft, setAiDraft]               = useState<AiInsightShape | null>(null);
  const [aiConclusionBusy, setAiConclusionBusy] = useState(false);
  const [aiAnalysisError, setAiAnalysisError]   = useState<string | null>(null);
  const [currentDataHash, setCurrentDataHash]   = useState("");
  const fullscreenContainerRef = useRef<HTMLDivElement | null>(null);

  const slides: SlideData[] = generateSlides(
    currentMonth, currentYear, allData, accentHex, totalFactMap, monthCapacity
  );

  const openPresentation = useCallback(() => setView("slides"), [setView]);

  const readTrackerTokens = useCallback(() => {
    if (typeof window === "undefined") return {
      bgMain: "#0d1117", bgCard: "#1a1f2a", textMain: "#e2e8f0",
      textMuted: "rgba(148,163,184,.7)", border: "rgba(255,255,255,.1)", isDark: true,
    };
    const cs = getComputedStyle(document.documentElement);
    const v = (n: string, f: string) => cs.getPropertyValue(n).trim() || f;
    return {
      bgMain: v("--tracker-bg-main", "#0d1117"),
      bgCard: v("--tracker-bg-card", customDark ? "#1a1f2a" : "#ffffff"),
      textMain: v("--tracker-text-main", customDark ? "#e2e8f0" : "#1e293b"),
      textMuted: v("--tracker-text-muted", customDark ? "rgba(148,163,184,.7)" : "rgba(100,116,139,.75)"),
      border: v("--tracker-border", customDark ? "rgba(255,255,255,.1)" : "rgba(0,0,0,.08)"),
      isDark: customDark,
    };
  }, [customDark]);

  const handleExportSlidesHTML = useCallback(() => {
    if (!slides.length) return;
    const html = renderPresentationHtml(slides, presBg, aiConclusion, readTrackerTokens());
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `presentation_${currentYear}-${String(currentMonth + 1).padStart(2, "0")}.html`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    toast({ title: "Презентация скачана", description: "Презентация сохранена как HTML" });
  }, [slides, currentMonth, currentYear, presBg, aiConclusion, readTrackerTokens, toast]);

  const handleExportPDF = useCallback(() => {
    if (!slides.length) return;
    const html   = renderPresentationHtml(slides, presBg, aiConclusion, readTrackerTokens());
    const iframe = document.createElement("iframe");
    Object.assign(iframe.style, {
      position: "fixed", left: "-10000px", top: "0",
      width: "1280px", height: "720px", opacity: "0", pointerEvents: "none",
    });
    iframe.setAttribute("aria-hidden", "true");
    document.body.appendChild(iframe);
    const cleanup = () => setTimeout(() => {
      try { document.body.removeChild(iframe); } catch { /* */ }
    }, 1000);
    iframe.onload = () => {
      try {
        const win = iframe.contentWindow;
        if (!win) { cleanup(); return; }
        setTimeout(() => { try { win.focus(); win.print(); } catch { /* */ } cleanup(); }, 250);
      } catch { cleanup(); }
    };
    iframe.srcdoc = html;
    toast({ title: "Экспорт в PDF", description: "Откроется диалог печати — выберите «Сохранить как PDF»" });
  }, [slides, presBg, aiConclusion, readTrackerTokens, toast]);

  const handleEnterFullscreen = useCallback(() => {
    const el = fullscreenContainerRef.current as HTMLElement & { webkitRequestFullscreen?: () => void };
    if (!el) return;
    (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
  }, []);

  const handleAiAnalysis = useCallback(async () => {
    const apiKey = apiKeyRef.current;
    if (!apiKey) { setApiKeyDialogOpen(true); setAiAnalysisError("Сначала введите API ключ Gemini"); return; }
    const rows = (allData[currentMonth] || []).filter(r => r.name || r.num);
    if (!rows.length) { setAiAnalysisError("В этом месяце нет задач для анализа"); return; }
    setAiAnalysisError(null); setAiConclusionBusy(true);
    try {
      const summary = rows.map(r =>
        `#${r.num} "${r.name}" — статус: ${r.status}, план: ${r.planH || "—"}ч, факт: ${r.factH || "—"}ч`
      ).join("\n");
      const prompt = `Ты аналитик проекта. На основе списка задач за ${MONTHS[currentMonth]} ${currentYear} напиши краткие выводы на русском языке. Ответь строго в формате JSON без пояснений:\n{"achievements":["...","..."],"risks":["...","..."],"inProgress":["...","..."],"summary":["...","..."]}\nКаждый массив — 2-3 пункта, лаконично, до 10 слов каждый.\nЗадачи:\n${summary}`;
      const res  = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", parts: [{ text: prompt }] }], apiKey, model: chatModel }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const parsed = JSON.parse((data.text || "").replace(/```json|```/g, "").trim());
      setAiDraft(parsed);
      toast({ title: "Черновик AI готов", description: "Проверьте тезисы и нажмите «Применить в презентацию»" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Неизвестная ошибка";
      setAiAnalysisError(msg);
      toast({ title: "Ошибка AI анализа", description: msg, variant: "destructive" });
    } finally { setAiConclusionBusy(false); }
  }, [allData, currentMonth, currentYear, apiKeyRef, chatModel, setApiKeyDialogOpen, toast]);

  const handleApproveDraft = useCallback(async () => {
    if (!aiDraft) return;
    const source: "ai" | "manual" | "edited" = aiConclusion ? "edited" : "ai";
    const newConclusion: AiInsightShape = { ...aiDraft, dataHash: currentDataHash, source, updatedAt: new Date().toISOString() };
    setAiConclusion(newConclusion); setAiDraft(null);
    toast({ title: "Анализ применён", description: "Тезисы добавлены в слайд «Итоги»" });
    if (workspaceId) {
      saveInsight(workspaceId, activeDomainId, insightMonthKey, { ...aiDraft, dataHash: currentDataHash, source }).catch(err =>
        toast({ title: "Не удалось сохранить инсайт", description: err instanceof Error ? err.message : "Сетевая ошибка", variant: "destructive" })
      );
    }
  }, [aiDraft, aiConclusion, currentDataHash, workspaceId, activeDomainId, insightMonthKey, toast]);

  const handleDiscardDraft    = useCallback(() => setAiDraft(null), []);

  const handleRemoveConclusion = useCallback(() => {
    setAiConclusion(null);
    if (workspaceId) {
      deleteInsight(workspaceId, activeDomainId, insightMonthKey).catch(err =>
        toast({ title: "Не удалось удалить инсайт", description: err instanceof Error ? err.message : "Сетевая ошибка", variant: "destructive" })
      );
    }
  }, [workspaceId, activeDomainId, insightMonthKey, toast]);

  return {
    slides, currentSlide, setCurrentSlide,
    aiConclusion, setAiConclusion,
    aiDraft, setAiDraft,
    aiConclusionBusy, aiAnalysisError,
    currentDataHash, setCurrentDataHash,
    fullscreenContainerRef,
    openPresentation,
    readTrackerTokens,
    handleExportSlidesHTML, handleExportPDF, handleEnterFullscreen,
    handleAiAnalysis, handleApproveDraft, handleDiscardDraft, handleRemoveConclusion,
  };
}
