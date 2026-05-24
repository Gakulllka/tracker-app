"use client";
import React, { useState, useMemo, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ChevronLeft, ChevronRight, Download, Maximize2,
  Sparkles, Loader2, KeyRound, Check, X, Trash2,
  Presentation, FileText,
} from "lucide-react";
import {
  PresentationSlide, PresentationBgLayer, buildTheme,
  type SlideData, type AiConclusion,
} from "@/lib/presentation-renderer";
import type { PresBgSettings } from "@/lib/store";
import type { AiInsightShape } from "@/lib/ai-insights-client";
import { MONTHS } from "@/lib/types";

type AiConclusionShape = {
  achievements: string[];
  risks: string[];
  inProgress: string[];
  nextSteps: string[];
};

export interface SlidesViewProps {
  slides: SlideData[];
  currentSlide: number;
  setCurrentSlide: (i: number) => void;
  accentHex: string;
  presBg: PresBgSettings;
  onSetPresBg: (patch: Partial<PresBgSettings>) => void;
  onResetPresBg: () => void;
  onExportHTML: () => void;
  /** Phase 6: PDF экспорт через native print. */
  onExportPDF: () => void;
  /** Phase 6: переход в полноэкранный режим. */
  onEnterFullscreen: () => void;
  /** Phase 6: ref на контейнер превью — нужен для requestFullscreen(). */
  fullscreenContainerRef: React.RefObject<HTMLDivElement | null>;
  hasData: boolean;
  onAiAnalysis: () => void;
  aiAnalysisBusy: boolean;
  aiDraft: AiConclusionShape | null;
  /** Phase 4: aiConclusion расширен серверными полями (dataHash, source, updatedAt). */
  aiConclusion: AiInsightShape | null;
  onSetAiDraft: (v: AiConclusionShape | null) => void;
  onApproveDraft: () => void;
  onDiscardDraft: () => void;
  onRemoveConclusion: () => void;
  /** Phase 4: данные изменились с момента генерации текущего инсайта. */
  aiInsightStale: boolean;
  /** Phase 7.3: ошибка последней AI-генерации (если была). */
  aiAnalysisError: string | null;
  /** Phase 7.3: открыть диалог ввода Gemini API ключа. */
  onOpenApiKeyDialog: () => void;
  /** Phase 7.3: текущая выбранная модель Gemini. */
  chatModel: string;
  /** Phase 7.3: установить модель Gemini. */
  setChatModel: (m: string) => void;
  /** Phase 7.3: есть ли валидный ключ Gemini в памяти сессии. */
  hasApiKey: boolean;
  /** Phase 3: активный под-таб + сеттер. */
  presSubTab: "slides" | "design" | "ai";
  setPresSubTab: (v: "slides" | "design" | "ai") => void;
  /** Phase 3: открыть глобальный таб «Дизайн» (для полных настроек темы трекера). */
  onOpenGlobalDesign: () => void;
  /** Phase 3: текущий месяц/год для шапки слайдов. */
  currentMonth: number;
  currentYear: number;
}

const AI_SECTION_LABELS: Record<string, string> = {
  achievements: "✅ Достижения",
  risks: "⚠️ Риски",
  inProgress: "⚙️ В процессе",
  nextSteps: "🎯 Следующие шаги",
};

export function SlidesView({
  slides,
  currentSlide,
  setCurrentSlide,
  accentHex,
  presBg,
  onSetPresBg,
  onResetPresBg,
  onExportHTML,
  onExportPDF,
  onEnterFullscreen,
  fullscreenContainerRef,
  hasData,
  onAiAnalysis,
  aiAnalysisBusy,
  aiDraft,
  aiConclusion,
  onSetAiDraft,
  onApproveDraft,
  onDiscardDraft,
  onRemoveConclusion,
  aiInsightStale,
  aiAnalysisError,
  onOpenApiKeyDialog,
  chatModel,
  setChatModel,
  hasApiKey,
  presSubTab,
  setPresSubTab,
  onOpenGlobalDesign,
  currentMonth,
  currentYear,
}: SlidesViewProps) {

  /* Sub-tabs header — общий для всех трёх режимов */
  const subTabsHeader = (
    <div className="flex items-center gap-1 p-1 rounded-xl border self-start"
      style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-bg-card)" }}>
      {([
        { key: "slides", label: "📑 Слайды" },
        { key: "design", label: "🎨 Дизайн" },
        { key: "ai",     label: "✨ AI-инсайты" + (aiConclusion || aiDraft ? " ·" : "") },
      ] as const).map(t => {
        const active = presSubTab === t.key;
        return (
          <button
            key={t.key}
            onClick={() => setPresSubTab(t.key)}
            className="px-3 py-1.5 text-xs sm:text-sm rounded-lg transition-colors font-medium"
            style={{
              background: active ? "var(--tracker-accent)" : "transparent",
              color: active ? "#fff" : "var(--tracker-text-muted)",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );

  /* Phase 6: keyboard nav — стрелки ← → переключают слайды
   * как в превью, так и в fullscreen режиме. */
  useEffect(() => {
    if (presSubTab !== "slides") return;
    const handler = (e: Event) => {
      const ke = e as Event & { key?: string; preventDefault: () => void };
      if (ke.key === "ArrowRight" || ke.key === " ") {
        ke.preventDefault();
        setCurrentSlide(Math.min(slides.length - 1, currentSlide + 1));
      } else if (ke.key === "ArrowLeft") {
        ke.preventDefault();
        setCurrentSlide(Math.max(0, currentSlide - 1));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [presSubTab, currentSlide, slides.length, setCurrentSlide]);

  /* ── Empty state ── */
  if (!hasData) {
    return (
      <div className="space-y-4">
        {subTabsHeader}
        <div className="flex flex-col items-center justify-center py-16 space-y-4">
          <Presentation className="size-16 text-muted-foreground/30" />
          <p className="text-lg text-muted-foreground">Нет задач за {MONTHS[currentMonth]} {currentYear}</p>
          <p className="text-sm text-muted-foreground">Добавьте задачи в таблицу, и презентация появится автоматически</p>
        </div>
      </div>
    );
  }

  const slide = slides[Math.min(currentSlide, slides.length - 1)];

  /* ════════════════════════════════════════════════════════════════ */
  /* SUB-TAB: SLIDES — Phase 6: большой превью, компактный тулбар     */
  /* ════════════════════════════════════════════════════════════════ */
  if (presSubTab === "slides") {
    return (
      <div className="space-y-3 -mx-2 sm:mx-0">
        <div className="flex items-center justify-between gap-2 flex-wrap px-2 sm:px-0">
          {subTabsHeader}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={onEnterFullscreen}>
              <Maximize2 className="size-3.5" />Во весь экран
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={onExportPDF}>
              <FileText className="size-3.5" />PDF
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={onExportHTML}>
              <Download className="size-3.5" />HTML
            </Button>
          </div>
        </div>

        {/* Slide preview — большой, на всю доступную ширину */}
        <div ref={fullscreenContainerRef} className="relative">
          {slide && (
            <SlidePreview slide={slide} accentHex={accentHex} presBg={presBg} aiConclusion={aiConclusion} />
          )}

          {/* Floating navigation — поверх превью, не отъедает место */}
          <div className="absolute inset-x-0 bottom-3 flex justify-center pointer-events-none z-10">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md pointer-events-auto"
              style={{ background: "rgba(0,0,0,.45)", border: "1px solid rgba(255,255,255,.12)" }}>
              <button
                onClick={() => setCurrentSlide(Math.max(0, currentSlide - 1))}
                disabled={currentSlide === 0}
                className="size-7 rounded-full flex items-center justify-center text-white/90 hover:bg-white/15 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                aria-label="Назад"
              >
                <ChevronLeft className="size-4" />
              </button>
              <div className="flex items-center gap-1">
                {slides.map((_, i) => (
                  <button key={i} onClick={() => setCurrentSlide(i)}
                    className={`h-1.5 rounded-full transition-all ${i === currentSlide ? "w-5 bg-white" : "w-1.5 bg-white/40 hover:bg-white/60"}`}
                    aria-label={`Слайд ${i + 1}`}
                  />
                ))}
              </div>
              <span className="text-[11px] text-white/70 tabular-nums px-1 min-w-[28px] text-center">
                {Math.min(currentSlide, slides.length - 1) + 1} / {slides.length}
              </span>
              <button
                onClick={() => setCurrentSlide(Math.min(slides.length - 1, currentSlide + 1))}
                disabled={currentSlide >= slides.length - 1}
                className="size-7 rounded-full flex items-center justify-center text-white/90 hover:bg-white/15 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                aria-label="Далее"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Под слайдом — лёгкая подсказка про AI, если выводов ещё нет */}
        {!aiConclusion && !aiDraft && (
          <div className="rounded-xl border p-3 flex items-center justify-between gap-3 flex-wrap mx-2 sm:mx-0"
            style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-bg-card)" }}>
            <div className="text-sm" style={{ color: "var(--tracker-text-muted)" }}>
              <Sparkles className="inline size-3.5 mr-1.5" />Слайд «Итоги» использует шаблонные тезисы — можно заменить AI-выводами.
            </div>
            <Button variant="outline" size="sm" onClick={() => setPresSubTab("ai")} className="gap-1.5">
              <Sparkles className="size-3.5" />Открыть AI-инсайты
            </Button>
          </div>
        )}
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════════ */
  /* SUB-TAB: DESIGN                                                  */
  /* ════════════════════════════════════════════════════════════════ */
  if (presSubTab === "design") {
    return (
      <div className="space-y-4">
        {subTabsHeader}

        <div className="max-w-3xl mx-auto">

          {/* Design controls — теперь во всю ширину (макс 768px) */}
          <div className="space-y-5">

            {/* Phase 6: Info — цвета привязаны к теме трекера */}
            <section className="rounded-xl border p-3 flex items-center justify-between gap-3 flex-wrap"
              style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-accent-bg)" }}>
              <div className="text-xs flex items-center gap-2" style={{ color: "var(--tracker-accent-fg-dark)" }}>
                <span className="text-base">🎨</span>
                <span>Цвета презентации совпадают с темой трекера. Светлая/тёмная — как у сайта.</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={onResetPresBg}>
                  ↺ Сбросить фон
                </Button>
              </div>
            </section>

            {/* Pattern */}
            <section>
              <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--tracker-text-main)" }}>Паттерн фона</h3>

              {/* Мини-предпросмотр текущего фона */}
              <div
                className="w-full h-20 rounded-xl mb-3 overflow-hidden relative border"
                style={{ borderColor: "var(--tracker-border)" }}
              >
                {/* Фон слайда */}
                <div className="absolute inset-0" style={{ background: "var(--tracker-bg-card)" }} />
                {/* Паттерн поверх */}
                {presBg.pattern !== "none" && (() => {
                  const sz = presBg.patternSize;
                  const op = ((presBg.patternOpacity ?? 5) / 100).toFixed(2);
                  const pcol = `rgba(var(--tracker-accent-rgb, 155,114,207),${op})`;
                  const accentRaw = accentHex || "#9B72CF";
                  const pr = parseInt(accentRaw.slice(1,3),16);
                  const pg = parseInt(accentRaw.slice(3,5),16);
                  const pb = parseInt(accentRaw.slice(5,7),16);
                  const pcolRaw = `rgba(${pr},${pg},${pb},${op})`;
                  let bg = "";
                  switch (presBg.pattern) {
                    case "grid":     bg = `linear-gradient(${pcolRaw} 1px,transparent 1px),linear-gradient(90deg,${pcolRaw} 1px,transparent 1px)`; break;
                    case "diagonal": bg = `repeating-linear-gradient(45deg,transparent,transparent ${sz/2}px,${pcolRaw} ${sz/2}px,${pcolRaw} ${sz/2+1}px)`; break;
                    case "diamond":  bg = `repeating-linear-gradient(45deg,transparent,transparent ${sz/2-1}px,${pcolRaw} ${sz/2-1}px,${pcolRaw} ${sz/2+1}px),repeating-linear-gradient(-45deg,transparent,transparent ${sz/2-1}px,${pcolRaw} ${sz/2-1}px,${pcolRaw} ${sz/2+1}px)`; break;
                    case "waves":    bg = `url("data:image/svg+xml,%3Csvg width='${sz}' height='${sz/2}' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 ${sz/4} Q ${sz/4} 0 ${sz/2} ${sz/4} T ${sz} ${sz/4}' fill='none' stroke='rgba(${pr},${pg},${pb},${op})' stroke-width='1.5'/%3E%3C/svg%3E")`; break;
                    case "zigzag":   bg = `url("data:image/svg+xml,%3Csvg width='${sz}' height='${sz/2}' xmlns='http://www.w3.org/2000/svg'%3E%3Cpolyline points='0,${sz/2} ${sz/4},0 ${sz/2},${sz/2} ${sz*3/4},0 ${sz},${sz/2}' fill='none' stroke='rgba(${pr},${pg},${pb},${op})' stroke-width='1.5'/%3E%3C/svg%3E")`; break;
                  }
                  return (
                    <div className="absolute inset-0" style={{
                      backgroundImage: bg,
                      backgroundSize: `${sz}px ${sz}px`,
                    }} />
                  );
                })()}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs font-medium px-2 py-1 rounded-lg"
                    style={{ background: "var(--tracker-bg-card)", color: "var(--tracker-text-muted)", opacity: 0.9 }}>
                    Предпросмотр фона
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-3">
                {(["none", "grid", "diagonal", "diamond", "waves", "zigzag"] as const).map(p => {
                  const active = (presBg.pattern || "none") === p;
                  const labels: Record<string, string> = { none: "Нет", grid: "Сетка", diagonal: "Линии", diamond: "Ромбы", waves: "Волны", zigzag: "Зигзаг" };
                  // Строим мини-паттерн для предпросмотра в кнопке
                  const sz = 20;
                  const accentRaw = accentHex || "#9B72CF";
                  const pr = parseInt(accentRaw.slice(1,3),16);
                  const pg = parseInt(accentRaw.slice(3,5),16);
                  const pb = parseInt(accentRaw.slice(5,7),16);
                  const pcol = `rgba(${pr},${pg},${pb},0.55)`;
                  let thumbBg = "";
                  switch (p) {
                    case "grid":     thumbBg = `linear-gradient(${pcol} 1px,transparent 1px),linear-gradient(90deg,${pcol} 1px,transparent 1px)`; break;
                    case "diagonal": thumbBg = `repeating-linear-gradient(45deg,transparent,transparent ${sz/2}px,${pcol} ${sz/2}px,${pcol} ${sz/2+1}px)`; break;
                    case "diamond":  thumbBg = `repeating-linear-gradient(45deg,transparent,transparent ${sz/2-1}px,${pcol} ${sz/2-1}px,${pcol} ${sz/2+1}px),repeating-linear-gradient(-45deg,transparent,transparent ${sz/2-1}px,${pcol} ${sz/2-1}px,${pcol} ${sz/2+1}px)`; break;
                    case "waves":    thumbBg = `url("data:image/svg+xml,%3Csvg width='${sz}' height='${sz/2}' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 ${sz/4} Q ${sz/4} 0 ${sz/2} ${sz/4} T ${sz} ${sz/4}' fill='none' stroke='rgba(${pr},${pg},${pb},0.55)' stroke-width='1.5'/%3E%3C/svg%3E")`; break;
                    case "zigzag":   thumbBg = `url("data:image/svg+xml,%3Csvg width='${sz}' height='${sz/2}' xmlns='http://www.w3.org/2000/svg'%3E%3Cpolyline points='0,${sz/2} ${sz/4},0 ${sz/2},${sz/2} ${sz*3/4},0 ${sz},${sz/2}' fill='none' stroke='rgba(${pr},${pg},${pb},0.55)' stroke-width='1.5'/%3E%3C/svg%3E")`; break;
                  }
                  return (
                    <button key={p} onClick={() => onSetPresBg({ pattern: p })}
                      className="rounded-lg border-2 text-center transition-all overflow-hidden"
                      style={{
                        borderColor: active ? "var(--tracker-accent)" : "var(--tracker-border)",
                        boxShadow: active ? `0 0 0 3px var(--tracker-accent)22` : undefined,
                      }}>
                      {/* Паттерн-миниатюра */}
                      <div className="h-9 w-full relative"
                        style={{ background: active ? "var(--tracker-accent-bg)" : "var(--tracker-bg-card)" }}>
                        {p !== "none" && (
                          <div className="absolute inset-0" style={{
                            backgroundImage: thumbBg,
                            backgroundSize: `${sz}px ${sz}px`,
                          }} />
                        )}
                        {p === "none" && (
                          <div className="absolute inset-0 flex items-center justify-center text-base" style={{ opacity: 0.4 }}>
                            ✕
                          </div>
                        )}
                      </div>
                      <div className="px-1 py-1 text-[10px] font-medium"
                        style={{ color: active ? "var(--tracker-accent-fg-dark)" : "var(--tracker-text-main)" }}>
                        {labels[p]}
                      </div>
                    </button>
                  );
                })}
              </div>
              {presBg.pattern !== "none" && (
                <div className="grid grid-cols-3 gap-3">
                  <label className="text-xs" style={{ color: "var(--tracker-text-muted)" }}>
                    Прозрачность <span className="font-semibold" style={{ color: "var(--tracker-text-main)" }}>{presBg.patternOpacity}%</span>
                    <input type="range" min={0} max={30} value={presBg.patternOpacity}
                      onChange={e => onSetPresBg({ patternOpacity: Number(e.target.value) })}
                      className="w-full mt-1" />
                  </label>
                  <label className="text-xs" style={{ color: "var(--tracker-text-muted)" }}>
                    Размер <span className="font-semibold" style={{ color: "var(--tracker-text-main)" }}>{presBg.patternSize}px</span>
                    <input type="range" min={10} max={100} step={5} value={presBg.patternSize}
                      onChange={e => onSetPresBg({ patternSize: Number(e.target.value) })}
                      className="w-full mt-1" />
                  </label>
                  <label className="text-xs" style={{ color: "var(--tracker-text-muted)" }}>
                    Толщина <span className="font-semibold" style={{ color: "var(--tracker-text-main)" }}>{presBg.patternLineThickness ?? 1}px</span>
                    <input type="range" min={1} max={4} step={0.5} value={presBg.patternLineThickness ?? 1}
                      onChange={e => onSetPresBg({ patternLineThickness: Number(e.target.value) })}
                      className="w-full mt-1" />
                  </label>
                </div>
              )}
            </section>

            {/* Emoji */}
            <section>
              <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--tracker-text-main)" }}>Эмодзи в фоне</h3>
              <div className="space-y-3">
                <input type="text" value={presBg.emojis}
                  onChange={e => onSetPresBg({ emojis: e.target.value })}
                  placeholder="🚀 ✨ 💡"
                  className="w-full h-9 rounded-lg border px-3 text-sm bg-transparent outline-none"
                  style={{ borderColor: "var(--tracker-border)", color: "var(--tracker-text-main)" }} />
                <div className="grid grid-cols-3 gap-3">
                  <label className="text-xs" style={{ color: "var(--tracker-text-muted)" }}>
                    Кол-во <span className="font-semibold" style={{ color: "var(--tracker-text-main)" }}>{presBg.emojiCount}</span>
                    <input type="range" min={0} max={40} value={presBg.emojiCount}
                      onChange={e => onSetPresBg({ emojiCount: Number(e.target.value) })}
                      className="w-full mt-1" />
                  </label>
                  <label className="text-xs" style={{ color: "var(--tracker-text-muted)" }}>
                    Мин. размер <span className="font-semibold" style={{ color: "var(--tracker-text-main)" }}>{presBg.emojiMinSize}px</span>
                    <input type="range" min={10} max={60} value={presBg.emojiMinSize}
                      onChange={e => onSetPresBg({ emojiMinSize: Number(e.target.value) })}
                      className="w-full mt-1" />
                  </label>
                  <label className="text-xs" style={{ color: "var(--tracker-text-muted)" }}>
                    Макс. размер <span className="font-semibold" style={{ color: "var(--tracker-text-main)" }}>{presBg.emojiMaxSize}px</span>
                    <input type="range" min={20} max={120} value={presBg.emojiMaxSize}
                      onChange={e => onSetPresBg({ emojiMaxSize: Number(e.target.value) })}
                      className="w-full mt-1" />
                  </label>
                </div>

                {/* Анимация: только выкл и падение */}
                <div>
                  <p className="text-xs mb-1.5" style={{ color: "var(--tracker-text-muted)" }}>Анимация эмодзи</p>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { id: "off",  label: "Выключена", emoji: "⏸" },
                      { id: "fall", label: "Падение",   emoji: "🌧" },
                    ] as const).map(opt => {
                      const active = (presBg.emojiAnim === "drift" ? "fall" : (presBg.emojiAnim || "fall")) === opt.id;
                      return (
                        <button key={opt.id} onClick={() => onSetPresBg({ emojiAnim: opt.id })}
                          className="rounded-lg p-2 border-2 text-center transition-all flex flex-col items-center gap-0.5"
                          style={{
                            borderColor: active ? "var(--tracker-accent)" : "var(--tracker-border)",
                            background: active ? "var(--tracker-accent-bg)" : "var(--tracker-bg-card)",
                          }}>
                          <span className="text-base" style={{ filter: active ? "none" : "grayscale(0.4)" }}>{opt.emoji}</span>
                          <span className="text-[10px] font-medium" style={{ color: active ? "var(--tracker-accent-fg-dark)" : "var(--tracker-text-muted)" }}>
                            {opt.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Прозрачность эмодзи */}
                <label className="text-xs" style={{ color: "var(--tracker-text-muted)" }}>
                  Прозрачность эмодзи <span className="font-semibold" style={{ color: "var(--tracker-text-main)" }}>{presBg.emojiOpacity ?? 25}%</span>
                  <input type="range" min={5} max={50} value={presBg.emojiOpacity ?? 25}
                    onChange={e => onSetPresBg({ emojiOpacity: Number(e.target.value) })}
                    className="w-full mt-1" />
                </label>
              </div>
            </section>

            {/* Link to global design */}
            <section className="rounded-xl border p-3 flex items-center justify-between gap-3 flex-wrap"
              style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-bg-card)" }}>
              <div className="text-sm" style={{ color: "var(--tracker-text-muted)" }}>
                Нужны настройки цвета и темы всего трекера?
              </div>
              <Button variant="outline" size="sm" onClick={onOpenGlobalDesign} className="gap-1.5">
                Глобальный Дизайн
              </Button>
            </section>
          </div>

          {/* Phase 7.3: правая колонка «Предпросмотр» удалена.
           * Слайды видно в под-табе «Слайды», смысла дублировать не было —
           * лишь зажимало основные настройки в узкую полосу. */}
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════════════ */
  /* SUB-TAB: AI                                                      */
  /* ════════════════════════════════════════════════════════════════ */
  return (
    <div className="space-y-4">
      {subTabsHeader}

      {/* Phase 7.3: AI control bar — ключ + модель + кнопки. Идентичен чату. */}
      <div className="rounded-xl border p-3 flex items-center justify-between flex-wrap gap-2"
        style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-bg-card)" }}>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs px-2.5" onClick={onOpenApiKeyDialog}>
            <KeyRound className="size-3.5" />
            {hasApiKey ? "Ключ ✓" : "API ключ"}
          </Button>
          <Select value={chatModel} onValueChange={setChatModel}>
            <SelectTrigger className="h-8 w-auto text-xs px-2 gap-1 border-[var(--tracker-border)]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gemini-2.5-flash" className="text-xs">2.5 Flash</SelectItem>
              <SelectItem value="gemini-2.5-flash-lite" className="text-xs">2.5 Flash Lite</SelectItem>
              <SelectItem value="gemini-3-flash-preview" className="text-xs">3 Flash</SelectItem>
              <SelectItem value="gemini-3.1-flash-lite-preview" className="text-xs">3.1 Flash Lite</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
            onClick={() => onSetAiDraft({ achievements: [""], risks: [""], inProgress: [""], nextSteps: [""] })}
            disabled={!!aiDraft}>
            ✏️ Заполнить вручную
          </Button>
          <Button size="sm" className="h-8 gap-1.5 text-xs bg-[var(--tracker-accent)] text-white hover:bg-[var(--tracker-accent-hover)]"
            onClick={onAiAnalysis} disabled={aiAnalysisBusy || !!aiDraft}>
            {aiAnalysisBusy
              ? <><Loader2 className="size-3.5 animate-spin" />Анализирую...</>
              : <><Sparkles className="size-3.5" />Сгенерировать</>}
          </Button>
        </div>
      </div>

      {/* Phase 7.3: красный баннер ошибки — отображается до следующей попытки */}
      {aiAnalysisError && !aiAnalysisBusy && (
        <div className="rounded-xl border p-3 flex items-start gap-2"
          style={{ background: "rgba(226,75,74,.06)", borderColor: "rgba(226,75,74,.3)" }}>
          <span className="text-base shrink-0" style={{ color: "#A32D2D" }}>⚠</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold" style={{ color: "#A32D2D" }}>Ошибка AI-генерации</p>
            <p className="text-[11px] mt-0.5 break-words" style={{ color: "#A32D2D", opacity: 0.85 }}>{aiAnalysisError}</p>
          </div>
        </div>
      )}

      {/* Header — статус */}
      <div className="rounded-2xl border p-5 space-y-3"
        style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-bg-card)" }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2" style={{ color: "var(--tracker-text-main)" }}>
              <Sparkles className="size-4" />Анализ за {MONTHS[currentMonth]} {currentYear}
            </h3>
            <p className="text-xs mt-1" style={{ color: "var(--tracker-text-muted)" }}>
              {aiAnalysisBusy
                ? "AI обрабатывает запрос..."
                : aiDraft
                  ? "Черновик готов — проверьте и примените"
                  : aiConclusion
                    ? (aiConclusion.source === "manual" ? "Тезисы применены вручную" : aiConclusion.source === "edited" ? "Тезисы применены (отредактированы)" : "AI-выводы применены к слайду «Итоги»")
                    : hasApiKey
                      ? "Сгенерируйте AI-выводы или заполните вручную"
                      : "Введите API ключ Gemini чтобы сгенерировать AI-выводы"}
            </p>
            {/* Phase 4: бейдж stale — данные изменились с момента генерации */}
            {aiInsightStale && !aiDraft && (
              <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium"
                style={{ background: "rgba(251,191,36,.12)", color: "#92400e", border: "1px solid rgba(251,191,36,.35)" }}>
                ⚠️ Данные изменились с момента генерации — стоит обновить
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Draft editor */}
      {aiDraft && (
        <div className="rounded-2xl border-2 p-5 space-y-4"
          style={{ borderColor: "var(--tracker-accent)", background: "var(--tracker-accent-bg)" }}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm font-semibold" style={{ color: "var(--tracker-accent-fg-dark)" }}>
              Черновик (редактируемый)
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={onDiscardDraft}>
                <X className="size-3" />Отклонить
              </Button>
              <Button size="sm" className="h-8 gap-1.5 text-xs bg-[var(--tracker-accent)] text-white" onClick={onApproveDraft}>
                <Check className="size-3" />Применить
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(["achievements", "risks", "inProgress", "nextSteps"] as const).map(key => (
              <div key={key} className="space-y-1.5">
                <p className="text-xs font-semibold" style={{ color: "var(--tracker-accent-fg-dark)" }}>
                  {AI_SECTION_LABELS[key]}
                </p>
                {aiDraft[key].map((item, i) => (
                  <div key={i} className="flex gap-1.5">
                    <input type="text" value={item}
                      onChange={e => {
                        const updated = [...aiDraft[key]];
                        updated[i] = e.target.value;
                        onSetAiDraft({ ...aiDraft, [key]: updated });
                      }}
                      className="flex-1 h-8 rounded-lg border px-2 text-xs bg-transparent outline-none focus:ring-1"
                      style={{ borderColor: "var(--tracker-border)", color: "var(--tracker-text-main)", background: "var(--tracker-bg-card)" }} />
                    <button onClick={() => {
                      const updated = aiDraft[key].filter((_, j) => j !== i);
                      onSetAiDraft({ ...aiDraft, [key]: updated });
                    }} className="w-7 h-8 flex items-center justify-center rounded-lg" style={{ color: "var(--tracker-text-muted)" }}>
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ))}
                <button onClick={() => onSetAiDraft({ ...aiDraft, [key]: [...aiDraft[key], ""] })}
                  className="text-xs px-2 py-1 rounded-lg border border-dashed transition-colors"
                  style={{ borderColor: "var(--tracker-border)", color: "var(--tracker-text-muted)" }}>
                  + добавить
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Approved insights */}
      {aiConclusion && !aiDraft && (
        <div className="rounded-2xl border p-4 space-y-3"
          style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-bg-card)" }}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--tracker-text-main)" }}>
              <Check className="size-4 text-green-600" />Применено
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs"
                onClick={() => onSetAiDraft({ ...aiConclusion })}>
                ✏️ Редактировать
              </Button>
              <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground"
                onClick={onRemoveConclusion}>
                Удалить
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(["achievements", "risks", "inProgress", "nextSteps"] as const).map(key => (
              <div key={key}>
                <p className="text-[10px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--tracker-text-muted)" }}>
                  {AI_SECTION_LABELS[key]}
                </p>
                <ul className="space-y-0.5">
                  {(aiConclusion[key] || []).map((item, i) => (
                    <li key={i} className="text-xs flex gap-1.5 items-start" style={{ color: "var(--tracker-text-main)" }}>
                      <span style={{ color: "var(--tracker-accent)", marginTop: "2px" }}>·</span>{item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Превью слайда «Итоги» */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold" style={{ color: "var(--tracker-text-muted)" }}>
          Как это попадёт в слайд
        </h3>
        {(() => {
          const summarySlide = slides.find(s => s.type === "summary");
          if (!summarySlide) return null;
          return <SlidePreview slide={summarySlide} accentHex={accentHex} presBg={presBg} aiConclusion={aiConclusion} />;
        })()}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Slide Preview Card — тонкий wrapper над единым рендером         */
/* ------------------------------------------------------------------ */
/*
 *  Phase 1 (WYSIWYG): теперь и превью, и экспорт используют ОДИН и
 *  тот же React-компонент <PresentationSlide /> из
 *  src/lib/presentation-renderer.tsx. Старые ~720 строк дублей
 *  удалены — buildSlidesHTML заменён renderPresentationHtml.
 */

export function SlidePreview({
  slide,
  accentHex,
  presBg,
  aiConclusion,
}: {
  slide: SlideData;
  accentHex: string;
  presBg: PresBgSettings;
  aiConclusion?: AiConclusion | null;
}) {
  const theme = useMemo(() => buildTheme(accentHex, presBg), [accentHex, presBg]);
  const [r, g, b] = theme.rgb;

  return (
    <div
      className="w-full rounded-2xl border shadow-lg relative overflow-hidden bg-emoji-fullscreen-host"
      style={{
        background: theme.bodyBg,
        borderColor: `rgba(${r},${g},${b},.15)`,
        aspectRatio: "16 / 9",
      }}
    >
      <PresentationBgLayer theme={theme} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: "32px 48px",
          zIndex: 1,
        }}
      >
        <PresentationSlide slide={slide} theme={theme} aiConclusion={aiConclusion} />
      </div>
    </div>
  );
}

