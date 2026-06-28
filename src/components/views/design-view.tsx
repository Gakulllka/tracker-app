"use client";
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Check, RotateCcw, Presentation } from "lucide-react";
import { createTheme, NAMED_THEMES } from "@/lib/theme";
import type { PresBgSettings } from "@/lib/store";

export interface DesignViewProps {
  themeId: string;
  customColor: string;
  customDark: boolean;
  accentHex: string;
  onSetTheme: (hex: string) => void;
  onSetCustomColor: (hex: string, dark: boolean) => void;
  presBg: PresBgSettings;
  onSetPresBg: (bg: Partial<PresBgSettings>) => void;
  toast: (opts: { title: string; description?: string }) => void;
}

export function ThemePreview({ hex, isDark }: { hex: string; isDark: boolean }) {
  const theme = createTheme(hex, isDark);

  const previewStyle = {
    "--p-accent": theme.accent,
    "--p-accent-soft": theme.accentSoft,
    "--p-accent-bg": theme.accentBg,
    "--p-accent-fg": theme.accentFgDark,
    "--p-bg": theme.bgMain,
    "--p-card": theme.bgCard,
    "--p-text": theme.textMain,
    "--p-muted": theme.textMuted,
    "--p-border": theme.border,
    "--p-danger": theme.danger,
  } as React.CSSProperties;

  // Sample task data for preview
  const tasks = [
    { num: "35191", name: "Разработка модуля оплаты", status: "Разработка",   priority: "Высокий",   plan: 24, fact: 18, pct: 75  },
    { num: "35204", name: "Тестирование API",          status: "Тестирование", priority: "Наивысший", plan: 16, fact: 19, pct: 119 },
    { num: "35218", name: "Документация к релизу",     status: "Согласование", priority: "Средний",   plan: 8,  fact: 3,  pct: 37  },
  ];

  const statusColor: Record<string, string> = {
    "Разработка": "#7cc3fc",
    "Тестирование": "#5719a3",
    "Согласование": "#ff9400",
  };
  const priorityColor: Record<string, string> = {
    "Высокий": "#d48040",
    "Наивысший": "#d45454",
    "Средний": "#b89830",
  };

  return (
    <div
      className="rounded-2xl overflow-hidden border select-none"
      style={{
        ...previewStyle,
        background: "var(--p-bg)",
        borderColor: "var(--p-border)",
        fontSize: "11px",
        lineHeight: "1.4",
        boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
      }}
    >
      {/* Mini header */}
      <div className="flex items-center gap-2 px-3 py-2" style={{ background: "var(--p-card)", borderBottom: "1px solid var(--p-border)" }}>
        <span style={{ color: "var(--p-accent)", opacity: 0.7, fontWeight: 700 }}>△</span>
        <span style={{ color: "var(--p-text)", fontWeight: 600 }}>Delta</span>
        <div className="ml-auto flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
          <span style={{ color: "var(--p-muted)" }}>онлайн</span>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-2 px-3 py-2.5" style={{ borderBottom: "1px solid var(--p-border)" }}>
        {[
          { label: "Задач", val: "12" },
          { label: "Завершено", val: "7" },
          { label: "План, ч", val: "48" },
        ].map(kpi => (
          <div key={kpi.label} className="rounded-lg px-2 py-1.5 text-center" style={{ background: "var(--p-card)", border: "1px solid var(--p-border)" }}>
            <div style={{ color: "var(--p-muted)", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em" }}>{kpi.label}</div>
            <div style={{ color: "var(--p-accent-fg)", fontWeight: 800, fontSize: "15px", lineHeight: 1.1 }}>{kpi.val}</div>
          </div>
        ))}
      </div>

      {/* Table header */}
      <div className="grid px-3 py-1.5 gap-1" style={{ gridTemplateColumns: "2fr 1.2fr 0.8fr 0.6fr 0.6fr", background: "var(--p-accent-bg)", borderBottom: "1px solid var(--p-border)" }}>
        {["Наименование", "Статус", "Приоритет", "План", "Факт"].map(h => (
          <span key={h} style={{ color: "var(--p-accent-fg)", fontWeight: 650, fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</span>
        ))}
      </div>

      {/* Table rows */}
      {tasks.map((task, i) => {
        const isOver = task.pct > 100;
        return (
          <div
            key={task.num}
            className="grid px-3 py-2 gap-1 items-center"
            style={{
              gridTemplateColumns: "2fr 1.2fr 0.8fr 0.6fr 0.6fr",
              background: i % 2 === 0 ? "var(--p-card)" : "var(--p-bg)",
              borderBottom: "1px solid var(--p-border)",
            }}
          >
            {/* Name + num */}
            <div>
              <div style={{ color: "var(--p-text)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.name}</div>
              <div style={{ color: "var(--p-muted)", fontSize: "9px" }}>#{task.num}</div>
            </div>
            {/* Status */}
            <div>
              <span
                style={{
                  display: "inline-block",
                  background: (statusColor[task.status] || "#888") + "20",
                  color: statusColor[task.status] || "var(--p-muted)",
                  borderRadius: "999px",
                  padding: "1px 6px",
                  fontSize: "9px",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  maxWidth: "100%",
                }}
              >{task.status}</span>
            </div>
            {/* Priority */}
            <span style={{ color: priorityColor[task.priority] || "var(--p-muted)", fontWeight: 600, fontSize: "10px" }}>{task.priority}</span>
            {/* Plan */}
            <span style={{ color: "var(--p-muted)", textAlign: "right" }}>{task.plan}ч</span>
            {/* Fact */}
            <div className="flex flex-col items-end gap-0.5">
              <span style={{ color: isOver ? "var(--p-danger)" : "var(--p-text)", fontWeight: isOver ? 700 : 400, textAlign: "right" }}>{task.fact}ч</span>
              <div style={{ width: "100%", height: "3px", borderRadius: "9999px", background: "var(--p-border)", overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: "9999px", width: `${Math.min(task.pct, 100)}%`, background: isOver ? "var(--p-danger)" : "var(--p-accent)" }} />
              </div>
            </div>
          </div>
        );
      })}

      {/* Color swatches row — show derived colors */}
      <div className="px-3 py-2.5 flex items-center gap-2" style={{ background: "var(--p-card)", borderTop: "1px solid var(--p-border)" }}>
        <span style={{ color: "var(--p-muted)", fontSize: "9px", letterSpacing: "0.06em", textTransform: "uppercase" }}>Палитра темы</span>
        {[
          { color: theme.accent,      tip: "Акцент" },
          { color: theme.accentBg,    tip: "Фон акцента" },
          { color: theme.accentFgDark,tip: "Текст акцента" },
          { color: theme.bgCard,      tip: "Карточка" },
          { color: theme.bgMain,      tip: "Фон" },
          { color: theme.border,      tip: "Граница" },
          { color: theme.textMain,    tip: "Текст" },
          { color: theme.danger,      tip: "Опасность" },
        ].map(({ color, tip }) => (
          <div
            key={tip}
            title={tip}
            className="w-5 h-5 rounded-full border"
            style={{ background: color, borderColor: "var(--p-border)", flexShrink: 0 }}
          />
        ))}
      </div>
    </div>
  );
}

export function DesignView({ themeId, customColor, customDark, accentHex, onSetTheme, onSetCustomColor, presBg, onSetPresBg }: DesignViewProps) {
  const [customInput, setCustomInput] = useState(customColor || themeId || "#9B72CF");

  useEffect(() => { setCustomInput(customColor || themeId || "#9B72CF"); }, [customColor, themeId]);

  const activeHex = customColor || themeId;
  const isCustom = !!customColor && !NAMED_THEMES.find(t => t.hex === customColor);

  const handleSelectTheme = (hex: string) => {
    onSetTheme(hex);
  };

  const handleCustomChange = (hex: string) => {
    setCustomInput(hex);
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      onSetCustomColor(hex, customDark);
    }
  };

  const accentRaw = accentHex || "#9B72CF";
  const pr = parseInt(accentRaw.slice(1,3),16);
  const pg = parseInt(accentRaw.slice(3,5),16);
  const pb = parseInt(accentRaw.slice(5,7),16);

  return (
    <div className="space-y-6 w-full px-2">

      {/* Two-column top: Themes grid + Custom color */}
      <div className="grid gap-6" style={{ gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)" }}>

        {/* Left: Named themes */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold" style={{ color: "var(--tracker-text-main)" }}>Тема оформления</h3>
              <p className="text-xs mt-0.5" style={{ color: "var(--tracker-text-muted)" }}>Выберите одну из готовых тем</p>
            </div>
            <div className="flex items-center gap-2 text-xs px-3 py-1 rounded-full" style={{ background: "var(--tracker-accent-bg)", color: "var(--tracker-accent-fg-dark)" }}>
              <span style={{ fontSize: "14px" }}>
                {NAMED_THEMES.find(t => t.hex === activeHex)?.emoji || "🎨"}
              </span>
              <span className="font-semibold">
                {NAMED_THEMES.find(t => t.hex === activeHex)?.label || (isCustom ? "Свой цвет" : "Тема")}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2.5">
            {NAMED_THEMES.map(theme => {
              const isActive = activeHex === theme.hex && !isCustom;
              return (
                <button
                  key={theme.hex}
                  onClick={() => handleSelectTheme(theme.hex)}
                  className="group relative flex flex-col items-center gap-2 rounded-xl p-3 border-2 transition-all"
                  style={{
                    borderColor: isActive ? "var(--tracker-accent)" : "var(--tracker-border)",
                    background: isActive ? "var(--tracker-accent-bg)" : "var(--tracker-bg-card)",
                    boxShadow: isActive ? `0 0 0 3px ${theme.hex}22` : undefined,
                  }}
                >
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-base transition-transform group-hover:scale-110"
                    style={{ background: `${theme.hex}22`, boxShadow: `inset 0 0 0 2.5px ${theme.hex}` }}
                  >
                    {theme.emoji}
                  </div>
                  <div className="text-center">
                    <div className="text-xs font-semibold" style={{ color: isActive ? "var(--tracker-accent-fg-dark)" : "var(--tracker-text-main)" }}>
                      {theme.label}
                    </div>
                    <div className="text-[9px] leading-tight mt-0.5" style={{ color: "var(--tracker-text-muted)" }}>
                      {theme.desc}
                    </div>
                  </div>
                  {isActive && (
                    <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: theme.hex }}>
                      <Check className="w-2.5 h-2.5 text-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Custom color + palette */}
        <div className="rounded-xl border p-4 space-y-4" style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-bg-card)" }}>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: "var(--tracker-text-main)" }}>Свой цвет</h3>
            <p className="text-xs mt-0.5" style={{ color: "var(--tracker-text-muted)" }}>Введите HEX или используйте пипетку</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <input
                type="color"
                value={customInput.match(/^#[0-9A-Fa-f]{6}$/) ? customInput : "#9B72CF"}
                onChange={e => handleCustomChange(e.target.value)}
                className="w-12 h-12 rounded-xl border-2 cursor-pointer"
                style={{ borderColor: "var(--tracker-border)", padding: "2px" }}
              />
            </div>
            <div className="flex-1">
              <input
                type="text"
                value={customInput}
                onChange={e => handleCustomChange(e.target.value)}
                maxLength={7}
                placeholder="#RRGGBB"
                className="w-full h-10 rounded-lg border px-3 text-sm font-mono bg-transparent outline-none focus:ring-2"
                style={{
                  borderColor: "var(--tracker-border)",
                  color: "var(--tracker-text-main)",
                  background: "var(--tracker-bg-main)",
                }}
              />
              {isCustom && (
                <p className="text-[10px] mt-1" style={{ color: "var(--tracker-accent-fg-dark)" }}>
                  ✓ Применён свой цвет
                </p>
              )}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--tracker-text-muted)" }}>
              Палитра — автоматические оттенки
            </p>
            <div className="grid grid-cols-5 gap-2">
              {([
                { label: "Акцент", value: "var(--tracker-accent)", textOn: "#fff" },
                { label: "Soft", value: "var(--tracker-accent-soft)", textOn: "var(--tracker-accent-fg-dark)" },
                { label: "BG", value: "var(--tracker-accent-bg)", textOn: "var(--tracker-accent-fg-dark)" },
                { label: "Hover", value: "var(--tracker-accent-hover)", textOn: "var(--tracker-accent-fg-dark)" },
                { label: "На акценте", value: "var(--tracker-accent-fg-dark)", textOn: "var(--tracker-bg-main)" },
              ] as const).map(swatch => (
                <div
                  key={swatch.label}
                  className="flex flex-col items-center gap-1 rounded-lg p-2 border"
                  style={{ borderColor: "var(--tracker-border)" }}
                >
                  <div
                    className="w-full h-10 rounded-md flex items-center justify-center text-[10px] font-semibold"
                    style={{ background: swatch.value, color: swatch.textOn }}
                  >
                    Aa
                  </div>
                  <span className="text-[10px]" style={{ color: "var(--tracker-text-muted)" }}>
                    {swatch.label}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[10px] mt-2" style={{ color: "var(--tracker-text-muted)" }}>
              Тёмная/светлая определяется тумблером в шапке.
            </p>
          </div>
        </div>
      </div>

      {/* Presentation background section */}
      <div className="rounded-xl border p-5 space-y-5" style={{ borderColor: "var(--tracker-border)", background: "var(--tracker-bg-card)" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Presentation className="size-4" style={{ color: "var(--tracker-accent)" }} />
            <div>
              <h3 className="text-sm font-semibold" style={{ color: "var(--tracker-text-main)" }}>Фон презентации</h3>
              <p className="text-xs mt-0.5" style={{ color: "var(--tracker-text-muted)" }}>Паттерн и эмодзи для слайдов</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="text-xs h-7 gap-1.5" onClick={() => onSetPresBg({ pattern: "none", emojis: "", emojiCount: 0, emojiAnim: "off", emojiOpacity: 25, emojiMinSize: 20, emojiMaxSize: 60, patternOpacity: 5, patternSize: 30, patternLineThickness: 1 })}>
            <RotateCcw className="size-3" /> Сбросить
          </Button>
        </div>

        <div className="grid gap-6" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}>
          {/* Left: Pattern */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--tracker-text-muted)" }}>Паттерн фона</h4>

            {/* Pattern preview */}
            <div className="w-full h-16 rounded-xl overflow-hidden relative border" style={{ borderColor: "var(--tracker-border)" }}>
              <div className="absolute inset-0" style={{ background: "var(--tracker-bg-card)" }} />
              {presBg.pattern !== "none" && (() => {
                const sz = presBg.patternSize;
                const op = ((presBg.patternOpacity ?? 5) / 100).toFixed(2);
                const thick = presBg.patternLineThickness ?? 1;
                const pcol = `rgba(${pr},${pg},${pb},${op})`;
                let bg = "";
                switch (presBg.pattern) {
                  case "grid":     bg = `linear-gradient(${pcol} ${thick}px,transparent ${thick}px),linear-gradient(90deg,${pcol} ${thick}px,transparent ${thick}px)`; break;
                  case "diagonal": bg = `repeating-linear-gradient(45deg,transparent,transparent ${sz/2}px,${pcol} ${sz/2}px,${pcol} ${sz/2+thick}px)`; break;
                  case "diamond":  bg = `repeating-linear-gradient(45deg,transparent,transparent ${sz/2-thick}px,${pcol} ${sz/2-thick}px,${pcol} ${sz/2+thick}px),repeating-linear-gradient(-45deg,transparent,transparent ${sz/2-thick}px,${pcol} ${sz/2-thick}px,${pcol} ${sz/2+thick}px)`; break;
                  case "waves":    bg = `url("data:image/svg+xml,%3Csvg width='${sz}' height='${sz/2}' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 ${sz/4} Q ${sz/4} 0 ${sz/2} ${sz/4} T ${sz} ${sz/4}' fill='none' stroke='rgba(${pr},${pg},${pb},${op})' stroke-width='${thick}'/%3E%3C/svg%3E")`; break;
                  case "zigzag":   bg = `url("data:image/svg+xml,%3Csvg width='${sz}' height='${sz/2}' xmlns='http://www.w3.org/2000/svg'%3E%3Cpolyline points='0,${sz/2} ${sz/4},0 ${sz/2},${sz/2} ${sz*3/4},0 ${sz},${sz/2}' fill='none' stroke='rgba(${pr},${pg},${pb},${op})' stroke-width='${thick}'/%3E%3C/svg%3E")`; break;
                }
                return <div className="absolute inset-0" style={{ backgroundImage: bg, backgroundSize: `${sz}px ${sz}px` }} />;
              })()}
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[10px] font-medium px-2 py-1 rounded-lg" style={{ background: "var(--tracker-bg-card)", color: "var(--tracker-text-muted)", opacity: 0.9 }}>Предпросмотр</span>
              </div>
            </div>

            {/* Pattern buttons */}
            <div className="grid grid-cols-6 gap-1.5">
              {(["none", "grid", "diagonal", "diamond", "waves", "zigzag"] as const).map(p => {
                const active = (presBg.pattern || "none") === p;
                const labels: Record<string, string> = { none: "Нет", grid: "Сетка", diagonal: "Линии", diamond: "Ромбы", waves: "Волны", zigzag: "Зигзаг" };
                const sz = 14;
                const thick = presBg.patternLineThickness ?? 1;
                const pcol = `rgba(${pr},${pg},${pb},0.6)`;
                let thumbBg = "";
                switch (p) {
                  case "grid":     thumbBg = `linear-gradient(${pcol} ${thick}px,transparent ${thick}px),linear-gradient(90deg,${pcol} ${thick}px,transparent ${thick}px)`; break;
                  case "diagonal": thumbBg = `repeating-linear-gradient(45deg,transparent,transparent ${sz/2}px,${pcol} ${sz/2}px,${pcol} ${sz/2+thick}px)`; break;
                  case "diamond":  thumbBg = `repeating-linear-gradient(45deg,transparent,transparent ${sz/2-thick}px,${pcol} ${sz/2-thick}px,${pcol} ${sz/2+thick}px),repeating-linear-gradient(-45deg,transparent,transparent ${sz/2-thick}px,${pcol} ${sz/2-thick}px,${pcol} ${sz/2+thick}px)`; break;
                  case "waves":    thumbBg = `url("data:image/svg+xml,%3Csvg width='${sz}' height='${sz}' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 ${sz/2} Q ${sz/4} ${sz/4} ${sz/2} ${sz/2} T ${sz} ${sz/2}' fill='none' stroke='rgba(${pr},${pg},${pb},0.6)' stroke-width='${thick}'/%3E%3C/svg%3E")`; break;
                  case "zigzag":   thumbBg = `url("data:image/svg+xml,%3Csvg width='${sz}' height='${sz}' xmlns='http://www.w3.org/2000/svg'%3E%3Cpolyline points='0,${sz/2} ${sz/4},0 ${sz/2},${sz/2} ${sz*3/4},0 ${sz},${sz/2}' fill='none' stroke='rgba(${pr},${pg},${pb},0.6)' stroke-width='${thick}'/%3E%3C/svg%3E")`; break;
                }
                return (
                  <button key={p} onClick={() => onSetPresBg({ pattern: p })}
                    className="rounded-lg border-2 text-center transition-all overflow-hidden"
                    style={{ borderColor: active ? "var(--tracker-accent)" : "var(--tracker-border)" }}>
                    <div className="h-10 w-full relative" style={{ background: active ? "var(--tracker-accent-bg)" : "var(--tracker-bg-card)" }}>
                      {p !== "none" && <div className="absolute inset-0" style={{ backgroundImage: thumbBg, backgroundSize: `${sz}px ${sz}px` }} />}
                      {p === "none" && <div className="absolute inset-0 flex items-center justify-center text-xs" style={{ opacity: 0.4 }}>✕</div>}
                    </div>
                    <div className="px-1 py-0.5 text-[9px] font-medium" style={{ color: active ? "var(--tracker-accent-fg-dark)" : "var(--tracker-text-main)" }}>{labels[p]}</div>
                  </button>
                );
              })}
            </div>

            {/* Pattern sliders */}
            {presBg.pattern !== "none" && (
              <div className="grid grid-cols-3 gap-2">
                <label className="text-[10px]" style={{ color: "var(--tracker-text-muted)" }}>
                  Прозрачность <span className="font-semibold" style={{ color: "var(--tracker-text-main)" }}>{presBg.patternOpacity}%</span>
                  <input type="range" min={0} max={30} value={presBg.patternOpacity} onChange={e => onSetPresBg({ patternOpacity: Number(e.target.value) })} className="w-full mt-1" />
                </label>
                <label className="text-[10px]" style={{ color: "var(--tracker-text-muted)" }}>
                  Размер <span className="font-semibold" style={{ color: "var(--tracker-text-main)" }}>{presBg.patternSize}px</span>
                  <input type="range" min={10} max={100} step={5} value={presBg.patternSize} onChange={e => onSetPresBg({ patternSize: Number(e.target.value) })} className="w-full mt-1" />
                </label>
                <label className="text-[10px]" style={{ color: "var(--tracker-text-muted)" }}>
                  Толщина <span className="font-semibold" style={{ color: "var(--tracker-text-main)" }}>{presBg.patternLineThickness ?? 1}px</span>
                  <input type="range" min={1} max={4} step={0.5} value={presBg.patternLineThickness ?? 1} onChange={e => onSetPresBg({ patternLineThickness: Number(e.target.value) })} className="w-full mt-1" />
                </label>
              </div>
            )}
          </div>

          {/* Right: Emoji */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--tracker-text-muted)" }}>Эмодзи в фоне</h4>

            <input type="text" value={presBg.emojis}
              onChange={e => onSetPresBg({ emojis: e.target.value })}
              placeholder="🚀 ✨ 💡"
              className="w-full h-8 rounded-lg border px-3 text-xs bg-transparent outline-none"
              style={{ borderColor: "var(--tracker-border)", color: "var(--tracker-text-main)" }} />

            <div className="grid grid-cols-3 gap-2">
              <label className="text-[10px]" style={{ color: "var(--tracker-text-muted)" }}>
                Кол-во <span className="font-semibold" style={{ color: "var(--tracker-text-main)" }}>{presBg.emojiCount}</span>
                <input type="range" min={0} max={40} value={presBg.emojiCount} onChange={e => onSetPresBg({ emojiCount: Number(e.target.value) })} className="w-full mt-1" />
              </label>
              <label className="text-[10px]" style={{ color: "var(--tracker-text-muted)" }}>
                Мин. <span className="font-semibold" style={{ color: "var(--tracker-text-main)" }}>{presBg.emojiMinSize}px</span>
                <input type="range" min={10} max={60} value={presBg.emojiMinSize} onChange={e => onSetPresBg({ emojiMinSize: Number(e.target.value) })} className="w-full mt-1" />
              </label>
              <label className="text-[10px]" style={{ color: "var(--tracker-text-muted)" }}>
                Макс. <span className="font-semibold" style={{ color: "var(--tracker-text-main)" }}>{presBg.emojiMaxSize}px</span>
                <input type="range" min={20} max={120} value={presBg.emojiMaxSize} onChange={e => onSetPresBg({ emojiMaxSize: Number(e.target.value) })} className="w-full mt-1" />
              </label>
            </div>

            <div>
              <p className="text-[10px] mb-1.5" style={{ color: "var(--tracker-text-muted)" }}>Анимация</p>
              <div className="grid grid-cols-2 gap-1.5">
                {([
                  { id: "off",  label: "Выключена", emoji: "⏸" },
                  { id: "fall", label: "Падение",   emoji: "🌧" },
                ] as const).map(opt => {
                  const active = (presBg.emojiAnim === "drift" ? "fall" : (presBg.emojiAnim || "fall")) === opt.id;
                  return (
                    <button key={opt.id} onClick={() => onSetPresBg({ emojiAnim: opt.id })}
                      className="rounded-lg p-1.5 border-2 text-center transition-all flex items-center justify-center gap-1"
                      style={{
                        borderColor: active ? "var(--tracker-accent)" : "var(--tracker-border)",
                        background: active ? "var(--tracker-accent-bg)" : "var(--tracker-bg-card)",
                      }}>
                      <span className="text-xs" style={{ filter: active ? "none" : "grayscale(0.4)" }}>{opt.emoji}</span>
                      <span className="text-[10px] font-medium" style={{ color: active ? "var(--tracker-accent-fg-dark)" : "var(--tracker-text-muted)" }}>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="text-[10px]" style={{ color: "var(--tracker-text-muted)" }}>
              Прозрачность <span className="font-semibold" style={{ color: "var(--tracker-text-main)" }}>{presBg.emojiOpacity ?? 25}%</span>
              <input type="range" min={5} max={50} value={presBg.emojiOpacity ?? 25} onChange={e => onSetPresBg({ emojiOpacity: Number(e.target.value) })} className="w-full mt-1" />
            </label>
          </div>
        </div>
      </div>

    </div>
  );
}


