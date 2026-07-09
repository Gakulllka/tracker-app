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
  Presentation, FileText, Layers, Brain,
} from "lucide-react";
import {
  PresentationSlide, PresentationBgLayer, buildTheme,
  type SlideData, type AiConclusion,
} from "@/lib/presentation-renderer";
import type { PresBgSettings } from "@/lib/store";
import type { AiInsightShape } from "@/lib/ai-insights-client";
import { MONTHS } from "@/lib/types";

type AiConclusionShape = Pick<AiInsightShape, "achievements" | "risks" | "inProgress"> & { summary: string[] } & Partial<Pick<AiInsightShape, "dataHash" | "source" | "updatedAt">>;

export interface SlidesViewProps {
  slides: SlideData[];
  currentSlide: number;
  setCurrentSlide: (i: number) => void;
  accentHex: string;
  presBg: PresBgSettings;
  customDark: boolean;
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
  onSetAiDraft: (v: AiInsightShape | null) => void;
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
  presSubTab: "slides" | "ai";
  setPresSubTab: (v: "slides" | "ai") => void;
  /** Phase 3: текущий месяц/год для шапки слайдов. */
  currentMonth: number;
  currentYear: number;
  /** Гость — только просмотр. */
  isGuest?: boolean;
}

const AI_SECTION_LABELS: Record<string, string> = {
  achievements: "✅ Достижения",
  risks: "⚠️ Риски",
  inProgress: "⚙️ В процессе",
  summary: "📊 Выводы",
};

export function SlidesView({
  slides,
  currentSlide,
  setCurrentSlide,
  accentHex,
  presBg,
  customDark,
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
  currentMonth,
  currentYear,
  isGuest,
}: SlidesViewProps) {

  /* Sub-tabs header — общий для всех трёх режимов */
  const subTabsHeader = (
    <div className="flex items-center gap-1 p-1.5 rounded-xl border self-start"
      style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-bg-card)" }}>
      {([
        { key: "slides", icon: Layers, label: "Слайды" },
        { key: "ai",     icon: Brain, label: "AI-инсайты" + (aiConclusion || aiDraft ? " ·" : "") },
      ] as const).map(t => {
        const active = presSubTab === t.key;
        const Icon = t.icon;
        return (
          <button
            key={t.key}
            onClick={() => setPresSubTab(t.key)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg transition-all font-medium"
            style={{
              background: active ? "var(--tracker-accent)" : "transparent",
              color: active ? "#fff" : "var(--tracker-text-muted)",
            }}
          >
            <Icon className="size-4" />
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
      <div className="space-y-4 -mx-2 sm:mx-0">
        <div className="flex items-center justify-between gap-2 flex-wrap px-2 sm:px-0">
          {subTabsHeader}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs" onClick={onEnterFullscreen}>
              <Maximize2 className="size-3.5" />Во весь экран
            </Button>
            <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs" onClick={onExportPDF}>
              <FileText className="size-3.5" />PDF
            </Button>
            <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs" onClick={onExportHTML}>
              <Download className="size-3.5" />HTML
            </Button>
          </div>
        </div>

        {/* Slide preview — большой, на всю доступную ширину */}
        <div ref={fullscreenContainerRef} className="relative">
          {slide && (
            <SlidePreview slide={slide} accentHex={accentHex} presBg={presBg} customDark={customDark} aiConclusion={aiConclusion} />
          )}

          {/* Floating navigation — поверх превью, не отъедает место */}
          <div className="absolute inset-x-0 bottom-4 flex justify-center pointer-events-none z-10">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full backdrop-blur-md pointer-events-auto"
              style={{ background: "rgba(0,0,0,.5)", border: "1px solid rgba(255,255,255,.15)" }}>
              <button
                onClick={() => setCurrentSlide(Math.max(0, currentSlide - 1))}
                disabled={currentSlide === 0}
                className="size-8 rounded-full flex items-center justify-center text-white/90 hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                aria-label="Назад"
              >
                <ChevronLeft className="size-5" />
              </button>
              <div className="flex items-center gap-1.5">
                {slides.map((_, i) => (
                  <button key={i} onClick={() => setCurrentSlide(i)}
                    className={`rounded-full transition-all ${i === currentSlide ? "h-2 w-6 bg-white" : "h-2 w-2 bg-white/40 hover:bg-white/60"}`}
                    aria-label={`Слайд ${i + 1}`}
                  />
                ))}
              </div>
              <span className="text-xs text-white/80 tabular-nums px-1.5 min-w-[32px] text-center font-medium">
                {Math.min(currentSlide, slides.length - 1) + 1}/{slides.length}
              </span>
              <button
                onClick={() => setCurrentSlide(Math.min(slides.length - 1, currentSlide + 1))}
                disabled={currentSlide >= slides.length - 1}
                className="size-8 rounded-full flex items-center justify-center text-white/90 hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                aria-label="Далее"
              >
                <ChevronRight className="size-5" />
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
        {!isGuest && (
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
              onClick={() => onSetAiDraft({ achievements: [""], risks: [""], inProgress: [""], summary: [""] })}
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
        )}
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
      {aiDraft && !isGuest && (
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
            {(["achievements", "risks", "inProgress", "summary"] as const).map(key => (
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
            {(["achievements", "risks", "inProgress", "summary"] as const).map(key => (
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
          return <SlidePreview slide={summarySlide} accentHex={accentHex} presBg={presBg} customDark={customDark} aiConclusion={aiConclusion} />;
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
  customDark,
  aiConclusion,
}: {
  slide: SlideData;
  accentHex: string;
  presBg: PresBgSettings;
  customDark: boolean;
  aiConclusion?: AiConclusion | null;
}) {
  const theme = useMemo(() => buildTheme(accentHex, presBg, undefined, customDark), [accentHex, presBg, customDark]);
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
          justifyContent: "flex-start",
          alignItems: "stretch",
          padding: "24px 28px",
          zIndex: 1,
          overflow: "hidden",
        }}
      >
        <PresentationSlide slide={slide} theme={theme} aiConclusion={aiConclusion} />
      </div>
    </div>
  );
}

