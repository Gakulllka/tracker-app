"use client";
/**
 * usePresentation — хук слайдов, AI-анализа, экспорта презентации.
 * Вынесено из TaskTrackerInner.
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { renderPresentationHtml } from "@/lib/presentation-export";
import { generateSlides } from "@/lib/slides";
import { saveInsight, deleteInsight } from "@/lib/ai-insights-client";
import type { AiInsightShape } from "@/lib/ai-insights-client";
import type { Task } from "@/lib/types";
import type { SlideData } from "@/lib/presentation-renderer";
import type { PresBgSettings } from "@/lib/store";
import { fetchPresentationSnapshot, type SnapshotResponse } from "@/lib/presentation-snapshots-client";
import { MONTHS } from "@/lib/types";
import { buildInsightPrompt } from "@/lib/ai-prompt";

interface UsePresentationParams {
  allData: Record<number, Task[]>;
  backlog: Task[];
  currentMonth: number;
  currentYear: number;
  darkMode: boolean;
  totalFactMap: Record<string, number>;
  /** Полная база по ключам "YYYY-MM" — для кумулятивного итога в слайдах. */
  dataByYearMonth: Record<string, Task[]>;
  presBg: PresBgSettings;
  workspaceId: string;
  activeDomainId: string;
  insightMonthKey: string;
  chatModel: string;
  apiKeyRef: React.MutableRefObject<string>;
  setView: (v: string) => void;
  setApiKeyDialogOpen: (v: boolean) => void;
  /** План часов на месяц (из Дашборда). */
  monthCapacity: number;
  /** Домен для брови на титульном слайде. */
  activeDomainName?: string;
  /** Бюджеты по месяцам, ключ "YYYY-MM". */
  monthlyPlans?: Record<string, number>;
}

export function usePresentation({
  allData, backlog, currentMonth, currentYear, darkMode,
  totalFactMap, dataByYearMonth, presBg, workspaceId, activeDomainId, insightMonthKey,
  chatModel, apiKeyRef, setView, setApiKeyDialogOpen,
  monthCapacity, activeDomainName = "", monthlyPlans = {},
}: UsePresentationParams) {

  const [currentSlide, setCurrentSlide]     = useState(0);
  const [aiConclusion, setAiConclusion]     = useState<AiInsightShape | null>(null);
  const [aiDraft, setAiDraft]               = useState<AiInsightShape | null>(null);
  const [aiConclusionBusy, setAiConclusionBusy] = useState(false);
  const [aiAnalysisError, setAiAnalysisError]   = useState<string | null>(null);
  const [currentDataHash, setCurrentDataHash]   = useState("");
  const fullscreenContainerRef = useRef<HTMLDivElement | null>(null);
  const [snapshot, setSnapshot] = useState<SnapshotResponse | null>(null);
  const [previousSnapshot, setPreviousSnapshot] = useState<SnapshotResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPresentationSnapshot(activeDomainId, insightMonthKey).then((value) => { if (!cancelled) setSnapshot(value); }).catch(() => { if (!cancelled) setSnapshot(null); });
    const [year, month] = insightMonthKey.split("-").map(Number);
    const previousDate = new Date(year, month - 2, 1);
    const previousKey = `${previousDate.getFullYear()}-${String(previousDate.getMonth() + 1).padStart(2, "0")}`;
    fetchPresentationSnapshot(activeDomainId, previousKey).then((value) => { if (!cancelled) setPreviousSnapshot(value); }).catch(() => { if (!cancelled) setPreviousSnapshot(null); });
    return () => { cancelled = true; };
  }, [activeDomainId, insightMonthKey]);

  const slides: SlideData[] = generateSlides({
    month: currentMonth,
    year: currentYear,
    allData,
    dataByYearMonth,
    totalFactMap,
    backlog,
    budget: monthCapacity,
    monthlyPlans,
    domainName: activeDomainName,
  });

  const openPresentation = useCallback(() => setView("slides"), [setView]);

  const readTrackerTokens = useCallback(() => {
    if (typeof window === "undefined") return {
      bgMain: "var(--tracker-bg-main)", bgCard: "var(--tracker-bg-card)", textMain: "var(--tracker-border)",
      textMuted: "rgba(148,163,184,.7)", border: "rgba(255,255,255,.1)", isDark: true,
    };
    const cs = getComputedStyle(document.documentElement);
    const v = (n: string, f: string) => cs.getPropertyValue(n).trim() || f;
    return {
      bgMain: v("--tracker-bg-main", "var(--tracker-bg-main)"),
      bgCard: v("--tracker-bg-card", darkMode ? "var(--tracker-bg-card)" : "#ffffff"),
      textMain: v("--tracker-text-main", darkMode ? "var(--tracker-border)" : "#1e293b"),
      textMuted: v("--tracker-text-muted", darkMode ? "rgba(148,163,184,.7)" : "rgba(100,116,139,.75)"),
      border: v("--tracker-border", darkMode ? "rgba(255,255,255,.1)" : "rgba(0,0,0,.08)"),
      isDark: darkMode,
    };
  }, [darkMode]);

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
  }, [slides, currentMonth, currentYear, presBg, aiConclusion, readTrackerTokens]);

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
  }, [slides, presBg, aiConclusion, readTrackerTokens]);

  const handleEnterFullscreen = useCallback(() => {
    const el = fullscreenContainerRef.current as HTMLElement & { webkitRequestFullscreen?: () => void };
    if (!el) return;
    (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
  }, []);

  const handleAiAnalysis = useCallback(async () => {
    const apiKey = apiKeyRef.current;
    if (!apiKey) { setApiKeyDialogOpen(true); setAiAnalysisError("Сначала введите API ключ Gemini"); return; }
    const rows = (allData[currentMonth] || []).filter(r => !r._deleted && (r.name || r.num));
    if (!rows.length) { setAiAnalysisError("В этом месяце нет задач для анализа"); return; }
    setAiAnalysisError(null); setAiConclusionBusy(true);
    try {
      const prompt = buildInsightPrompt(rows, {
        month: currentMonth,
        year: currentYear,
        budget: monthCapacity,
        totalFactMap,
      });
      const res  = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", parts: [{ text: prompt }] }], apiKey, model: chatModel }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const parsed = JSON.parse((data.text || "").replace(/```json|```/g, "").trim());
      setAiDraft(parsed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Неизвестная ошибка";
      setAiAnalysisError(msg);
    } finally { setAiConclusionBusy(false); }
  }, [allData, currentMonth, currentYear, apiKeyRef, chatModel, setApiKeyDialogOpen, monthCapacity, totalFactMap]);

  const handleApproveDraft = useCallback(async () => {
    if (!aiDraft) return;
    const source: "ai" | "manual" | "edited" = aiConclusion ? "edited" : "ai";
    const newConclusion: AiInsightShape = { ...aiDraft, dataHash: currentDataHash, source, updatedAt: new Date().toISOString() };
    setAiConclusion(newConclusion); setAiDraft(null);
    if (workspaceId) {
      saveInsight(workspaceId, activeDomainId, insightMonthKey, { ...aiDraft, dataHash: currentDataHash, source }).catch(err =>
        setAiAnalysisError(err instanceof Error ? err.message : "Не удалось сохранить инсайт")
      );
    }
  }, [aiDraft, aiConclusion, currentDataHash, workspaceId, activeDomainId, insightMonthKey]);

  const handleDiscardDraft    = useCallback(() => setAiDraft(null), []);

  const handleRemoveConclusion = useCallback(() => {
    setAiConclusion(null);
    if (workspaceId) {
      deleteInsight(workspaceId, activeDomainId, insightMonthKey).catch(err =>
        setAiAnalysisError(err instanceof Error ? err.message : "Не удалось удалить инсайт")
      );
    }
  }, [workspaceId, activeDomainId, insightMonthKey]);

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
    snapshot, setSnapshot,
  };
}
