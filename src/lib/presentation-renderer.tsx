/* ================================================================ *
 *  PRESENTATION RENDERER — single source of truth for slides       *
 * ================================================================ */

import React from "react";
import type { Task } from "./types";
import { getPhaseForStatus, PHASE_COLORS } from "./types";
import type { PresBgSettings } from "./store";
import { fmt2, evalExpr } from "./metrics";
import { createTheme } from "./theme";

/* ================================================================ *
 *  Types                                                           *
 * ================================================================ */

export interface SlideData {
  type: "title" | "kpi" | "completed" | "inprogress" | "table" | "summary";
  content: Record<string, unknown>;
}

export interface AiConclusion {
  achievements: string[];
  risks: string[];
  inProgress: string[];
  summary: string[];
  source?: string;
}

export interface PresentationTheme {
  accentHex: string;
  rgb: [number, number, number];
  styleId: PresBgSettings["styleId"];
  bodyBg: string;
  overlayBg: string;
  textColor: string;
  mutedColor: string;
  cardColors: string[];
  isLight: boolean;
  bg: PresBgSettings;
}

/* ================================================================ *
 *  Helpers                                                         *
 * ================================================================ */

function hexToRgb(hex: string): [number, number, number] {
  const cleaned = hex.replace("#", "");
  return [
    parseInt(cleaned.substring(0, 2), 16) || 0,
    parseInt(cleaned.substring(2, 4), 16) || 0,
    parseInt(cleaned.substring(4, 6), 16) || 0,
  ];
}

export interface TrackerThemeTokens {
  bgMain: string;
  bgCard: string;
  textMain: string;
  textMuted: string;
  border: string;
  isDark: boolean;
}

export function buildTheme(
  accentHex: string,
  bg: PresBgSettings,
  tokens?: TrackerThemeTokens,
  isDarkOverride?: boolean,
): PresentationTheme {
  const safeAccent = accentHex && /^#?[0-9a-fA-F]{6}$/.test(accentHex) ? accentHex : "#5B9BD5";
  const rgb = hexToRgb(safeAccent);
  const [r, g, b] = rgb;

  let resolved: TrackerThemeTokens;
  if (tokens) {
    resolved = tokens;
  } else if (isDarkOverride !== undefined) {
    const synth = createTheme(safeAccent, isDarkOverride);
    resolved = {
      bgMain: synth.bgMain,
      bgCard: synth.bgCard,
      textMain: synth.textMain,
      textMuted: synth.textMuted,
      border: synth.border,
      isDark: isDarkOverride,
    };
  } else if (typeof window !== "undefined" && typeof getComputedStyle === "function") {
    const cs = getComputedStyle(document.documentElement);
    const v = (name: string, fallback: string) => (cs.getPropertyValue(name).trim() || fallback);
    const bgMainResolved = v("--tracker-bg-main", "#0d1117");
    const isDarkResolved = isHexDark(bgMainResolved);
    resolved = {
      bgMain: bgMainResolved,
      bgCard: v("--tracker-bg-card", isDarkResolved ? "#1a1f2a" : "#ffffff"),
      textMain: v("--tracker-text-main", isDarkResolved ? "#e2e8f0" : "#1e293b"),
      textMuted: v("--tracker-text-muted", isDarkResolved ? "rgba(148,163,184,.7)" : "rgba(100,116,139,.75)"),
      border: v("--tracker-border", isDarkResolved ? "rgba(255,255,255,.1)" : "rgba(0,0,0,.08)"),
      isDark: isDarkResolved,
    };
  } else {
    resolved = {
      bgMain: "#0d1117", bgCard: "#1a1f2a", textMain: "#e2e8f0",
      textMuted: "rgba(148,163,184,.7)", border: "rgba(255,255,255,.1)", isDark: true,
    };
  }

  const overlayBg = resolved.isDark ? resolved.bgMain : resolved.bgMain;

  const cardColors = resolved.isDark
    ? ["#1a1a30", "#181830", "#161628"]
    : ["#f0ecf8", "#ede8f5", "#eae5f2"];

  return {
    accentHex: safeAccent.startsWith("#") ? safeAccent : `#${safeAccent}`,
    rgb, styleId: bg.styleId, bodyBg: resolved.bgMain, overlayBg,
    textColor: resolved.textMain, mutedColor: resolved.textMuted,
    cardColors, isLight: !resolved.isDark, bg,
  };
}

function isHexDark(color: string): boolean {
  const hex = color.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return true;
  const [r, g, b] = hexToRgb(hex);
  return ((0.299 * r + 0.587 * g + 0.114 * b) / 255) < 0.5;
}

const STATUS_COLS: Record<string, string> = {
  "Завершено": "#34d399", "Завершенная": "#34d399", "Выполнено": "#34d399", "Выполненная": "#34d399",
  "Тестирование": "#38bdf8", "Разработка": "#fbbf24", "В очереди на разработку": "#22d3ee",
  "Анализ": "#a78bfa", "В работе": "#60a5fa", "Согласование": "#fb923c",
  "В релиз": "#f472b6", "Документация": "#f9a8d4", "Контроль на прод": "#bef264",
  "Отложенная": "#94a3b8", "Отменено": "#94a3b8", "Идея": "#fbbf24", "Новая": "#60a5fa",
};

function statusColor(status: string, theme: PresentationTheme): string {
  return STATUS_COLS[status] || `rgba(${theme.rgb[0]},${theme.rgb[1]},${theme.rgb[2]},.8)`;
}

/* ================================================================ *
 *  Шрифт Inter + background layer                                 *
 * ================================================================ */

const FONT_FAMILY = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

const FONT_STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
`;

export function PresentationBgLayer({ theme }: { theme: PresentationTheme }) {
  const { bg, rgb } = theme;
  const [r, g, b] = rgb;
  const sz = bg.patternSize;
  const op = (bg.patternOpacity / 100).toFixed(2);
  const lw = bg.patternLineThickness ?? 1;
  const pcol = `rgba(${r},${g},${b},${op})`;

  let patternStyle: React.CSSProperties = {};
  switch (bg.pattern) {
    case "grid":
      patternStyle = {
        backgroundImage: `linear-gradient(${pcol} ${lw}px, transparent ${lw}px), linear-gradient(90deg, ${pcol} ${lw}px, transparent ${lw}px)`,
        backgroundSize: `${sz}px ${sz}px`,
      };
      break;
    case "diagonal": {
      const diag = encodeURIComponent(`<svg width="${sz}" height="${sz}" xmlns="http://www.w3.org/2000/svg"><line x1="0" y1="${sz}" x2="${sz}" y2="0" stroke="rgba(${r},${g},${b},${op})" stroke-width="${lw}"/><line x1="${-sz}" y1="${sz}" x2="0" y2="0" stroke="rgba(${r},${g},${b},${op})" stroke-width="${lw}"/><line x1="${sz}" y1="${sz}" x2="${sz * 2}" y2="0" stroke="rgba(${r},${g},${b},${op})" stroke-width="${lw}"/></svg>`);
      patternStyle = { backgroundImage: `url("data:image/svg+xml,${diag}")`, backgroundSize: `${sz}px ${sz}px` };
      break;
    }
    case "diamond": {
      const half = sz / 2;
      const dia = encodeURIComponent(`<svg width="${sz}" height="${sz}" xmlns="http://www.w3.org/2000/svg"><line x1="0" y1="0" x2="${sz}" y2="${sz}" stroke="rgba(${r},${g},${b},${op})" stroke-width="${lw}"/><line x1="${sz}" y1="0" x2="0" y2="${sz}" stroke="rgba(${r},${g},${b},${op})" stroke-width="${lw}"/><line x1="${-half}" y1="0" x2="${half}" y2="${sz}" stroke="rgba(${r},${g},${b},${op})" stroke-width="${lw}"/><line x1="${half}" y1="0" x2="${sz + half}" y2="${sz}" stroke="rgba(${r},${g},${b},${op})" stroke-width="${lw}"/></svg>`);
      patternStyle = { backgroundImage: `url("data:image/svg+xml,${dia}")`, backgroundSize: `${sz}px ${sz}px` };
      break;
    }
    case "waves": {
      const wh = Math.round(sz / 2);
      const mid = Math.round(wh / 2);
      const waves = encodeURIComponent(`<svg width="${sz}" height="${wh}" xmlns="http://www.w3.org/2000/svg"><path d="M0 ${mid} Q ${sz / 4} 0 ${sz / 2} ${mid} T ${sz} ${mid}" fill="none" stroke="rgba(${r},${g},${b},${op})" stroke-width="${lw}"/></svg>`);
      patternStyle = { backgroundImage: `url("data:image/svg+xml,${waves}")`, backgroundSize: `${sz}px ${wh}px` };
      break;
    }
    case "zigzag": {
      const zh = Math.round(sz / 2);
      const zz = encodeURIComponent(`<svg width="${sz}" height="${zh}" xmlns="http://www.w3.org/2000/svg"><polyline points="0,${zh} ${sz / 4},0 ${sz / 2},${zh} ${sz * 3 / 4},0 ${sz},${zh}" fill="none" stroke="rgba(${r},${g},${b},${op})" stroke-width="${lw}" stroke-linejoin="round"/></svg>`);
      patternStyle = { backgroundImage: `url("data:image/svg+xml,${zz}")`, backgroundSize: `${sz}px ${zh}px` };
      break;
    }
  }

  const animMode: "off" | "drift" | "fall" = bg.emojiAnim || "drift";
  const speedMul = bg.emojiSpeed && bg.emojiSpeed > 0 ? bg.emojiSpeed : 1;
  const fixedOpacity = typeof bg.emojiOpacity === "number" ? Math.max(0, Math.min(1, bg.emojiOpacity / 100)) : null;
  const emojiList = (bg.emojis || "").split(" ").filter(Boolean);
  type EmojiItem = { e: string; x: number; y: number; size: number; opacity: number; rotate: number; duration: number; delay: number; sway: number; key: number };
  const emojis: EmojiItem[] = [];
  if (emojiList.length > 0 && bg.emojiCount > 0) {
    let seed = 42;
    const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    for (let i = 0; i < bg.emojiCount; i++) {
      const r1=rand(),r2=rand(),r3=rand(),r4=rand(),r5=rand(),r6=rand(),r7=rand(),r8=rand();
      const baseDur = animMode === "fall" ? 12 + r6 * 13 : 6 + r6 * 8;
      emojis.push({
        e: emojiList[Math.floor(r1 * emojiList.length)],
        x: r2 * 100, y: r3 * 100,
        size: Math.round(bg.emojiMinSize + r4 * (bg.emojiMaxSize - bg.emojiMinSize)),
        opacity: fixedOpacity != null ? fixedOpacity : 0.1 + r5 * 0.2,
        rotate: Math.floor(r5 * 40 - 20),
        duration: +(baseDur / speedMul).toFixed(2),
        delay: +(-(r7 * baseDur / speedMul)).toFixed(2) as unknown as number,
        sway: Math.round((r8 * 2 - 1) * (25 + r1 * 45)),
        key: i,
      });
    }
  }

  return (
    <>
      <style>{FONT_STYLE}</style>
      {animMode !== "off" && emojis.length > 0 && (
        <style>{`
          .pres-emoji{position:absolute;pointer-events:none;user-select:none;z-index:0;will-change:transform,opacity}
          .pres-emoji[data-anim="drift"]{animation-name:pres-emoji-drift;animation-timing-function:ease-in-out;animation-iteration-count:infinite;animation-direction:alternate}
          .pres-emoji[data-anim="fall"]{top:-10vh !important;animation-name:pres-emoji-fall;animation-timing-function:linear;animation-iteration-count:infinite}
          @keyframes pres-emoji-drift{from{transform:translate3d(0,0,0) rotate(var(--rot,0deg))}to{transform:translate3d(18px,12px,0) rotate(calc(var(--rot,0deg)+6deg))}}
          @keyframes pres-emoji-fall{0%{transform:translate3d(0,0,0) rotate(var(--rot,0deg));opacity:0}10%{opacity:var(--op,0.25)}50%{transform:translate3d(var(--sway,0px),60vh,0) rotate(calc(var(--rot,0deg)+180deg));opacity:var(--op,0.25)}90%{opacity:var(--op,0.25)}100%{transform:translate3d(0,130vh,0) rotate(calc(var(--rot,0deg)+360deg));opacity:0}}
          @media(prefers-reduced-motion:reduce){.pres-emoji[data-anim]{animation:none!important}}
          @media print{.pres-emoji[data-anim]{animation:none!important}}
        `}</style>
      )}
      <div style={{ position:"absolute", inset:0, zIndex:0, pointerEvents:"none", background:theme.overlayBg }} />
      {bg.pattern !== "none" && <div style={{ position:"absolute", inset:0, zIndex:0, pointerEvents:"none", ...patternStyle }} />}
      {emojis.map((em) => (
        <span key={em.key} className="pres-emoji" data-anim={animMode==="off"?undefined:animMode} style={{
          left:`${em.x.toFixed(1)}%`, top:`${em.y.toFixed(1)}%`, fontSize:`${em.size}px`,
          opacity:em.opacity, transform:`rotate(${em.rotate}deg)`,
          ["--rot" as never]:`${em.rotate}deg`, ["--op" as never]:em.opacity, ["--sway" as never]:`${em.sway}px`,
          animationDuration:animMode!=="off"?`${em.duration}s`:undefined,
          animationDelay:animMode!=="off"?`${em.delay}s`:undefined,
        }}>{em.e}</span>
      ))}
    </>
  );
}

/* ================================================================ *
 *  Slide renderer                                                  *
 * ================================================================ */

export interface PresentationSlideProps {
  slide: SlideData;
  theme: PresentationTheme;
  aiConclusion?: AiConclusion | null;
  fixedAspect?: boolean;
}

export function PresentationSlide({ slide, theme, aiConclusion }: PresentationSlideProps) {
  const { rgb, textColor, mutedColor, cardColors, isLight } = theme;
  const [r, g, b] = rgb;

  const acA = `rgba(${r},${g},${b},1)`;
  const acC = `rgba(${r},${g},${b},.15)`;
  const BDR = `1px solid rgba(${r},${g},${b},.20)`;
  const F = FONT_FAMILY;
  const numColor = isLight ? "rgba(30,41,59,.5)" : "rgba(255,255,255,.5)";
  const nameColor = isLight ? "#1e293b" : "#e2e8f0";

  const sectionH2 = (text: string): React.ReactNode => (
    <h2 style={{
      fontFamily: F, fontSize: "54px", fontWeight: 800, marginBottom: "24px",
      textAlign: "center", flexShrink: 0,
      color: textColor,
    }}>{text}</h2>
  );

  const shell: React.CSSProperties = { fontFamily: F, position: "relative", zIndex: 1, width: "100%", margin: "0 auto" };

  // ───────── 1. TITLE ─────────
  if (slide.type === "title") {
    const c = slide.content;
    const month = String(c.month || "");
    const total = Number(c.total || 0);
    const completed = Number(c.completed || 0);
    const pct = Number(c.pct || 0);
    const circ = 2 * Math.PI * 38;
    const dash = circ * (1 - pct / 100);

    return (
      <div style={{ ...shell, textAlign: "center", maxWidth: "1100px", margin: "auto" }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: "12px",
          background: acC, border: `1px solid rgba(${r},${g},${b},.7)`,
          color: acA, padding: "14px 42px", borderRadius: "32px",
          fontSize: "24px", fontWeight: 600, marginBottom: "36px", fontFamily: F,
        }}>
          <span style={{ width: "12px", height: "12px", borderRadius: "50%", background: acA, display: "inline-block" }} />
          {month}
        </div>
        <h1 style={{
          fontFamily: F, fontSize: "clamp(48px,6vw,80px)", fontWeight: 900, lineHeight: 1.1,
          letterSpacing: "-2px", marginBottom: "24px",
          color: textColor,
        }}>Отчёт по задачам</h1>
        <div style={{ width: "120px", height: "5px", background: acA, borderRadius: "3px", margin: "0 auto 36px" }} />
        <div style={{ display: "flex", gap: "48px", justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontFamily: F, fontSize: "64px", fontWeight: 900, color: acA, lineHeight: 1 }}>{total}</p>
            <p style={{ fontFamily: F, fontSize: "18px", color: mutedColor, marginTop: "6px" }}>Всего задач</p>
          </div>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontFamily: F, fontSize: "64px", fontWeight: 900, color: "#34d399", lineHeight: 1 }}>{completed}</p>
            <p style={{ fontFamily: F, fontSize: "18px", color: mutedColor, marginTop: "6px" }}>Завершено</p>
          </div>
          <div style={{ position: "relative", width: "120px", height: "120px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="120" height="120" style={{ transform: "rotate(-90deg)", position: "absolute" }}>
              <circle cx="60" cy="60" r="48" fill="none" stroke={`rgba(${r},${g},${b},.15)`} strokeWidth="9" />
              <circle cx="60" cy="60" r="48" fill="none" stroke={acA} strokeWidth="9"
                strokeDasharray={`${2 * Math.PI * 48}`} strokeDashoffset={`${2 * Math.PI * 48 * (1 - pct / 100)}`} strokeLinecap="round" />
            </svg>
            <span style={{ fontFamily: F, fontSize: "28px", fontWeight: 900, color: acA }}>{pct}%</span>
          </div>
        </div>
      </div>
    );
  }

  // ───────── 2. KPI — ×1.5 ─────────
  if (slide.type === "kpi") {
    const c = slide.content;
    const planN = Number(c.planH) || 0;
    const factN = Number(c.factH) || 0;
    const factCol = planN > 0 ? (factN > planN ? "#fb7185" : "#4ade80") : acA;
    const overPct = Number(c.overPct) || 0;
    const prevOverPct = Number(c.prevOverPct) || 0;
    const completed = Number(c.completed) || 0;
    const completedPrev = Number(c.completedPrev) || 0;
    const total = Number(c.total) || 0;
    const totalPrev = Number(c.totalPrev) || 0;
    const compPct = Number(c.compPct) || 0;
    const compPctPrev = Number(c.compPctPrev) || 0;
    const currentUncompleted = Number(c.currentUncompleted) || 0;
    const prevUncompleted = Number(c.prevUncompleted) || 0;

    const deltaHours = factN - planN;
    const deltaOverPct = overPct - prevOverPct;
    const deltaCompPct = compPct - compPctPrev;
    const deltaUncompleted = currentUncompleted - prevUncompleted;

    const kpiItems = [
      { i: "📝", l: "План, ч", v: String(planN), col: acA, sub: `${total} задач` },
      { i: "⏱", l: "Факт, ч", v: fmt2(factN), col: factCol,
        sub: deltaHours !== 0 ? `${deltaHours > 0 ? "+" : ""}${fmt2(deltaHours)}ч к плану` : "в рамках плана",
        subCol: deltaHours > 0 ? "#fb7185" : deltaHours < 0 ? "#4ade80" : mutedColor },
      { i: overPct > 0 ? "🔴" : "🟢", l: "Загрузка", v: `${Math.abs(overPct)}%`,
        col: overPct > 0 ? "#fb7185" : "#4ade80",
        sub: deltaOverPct !== 0 ? `${deltaOverPct > 0 ? "↑" : "↓"}${Math.abs(deltaOverPct)}% к прошлому` : "как в прошлом месяце",
        subCol: deltaOverPct > 0 ? "#fb7185" : deltaOverPct < 0 ? "#4ade80" : mutedColor },
      { i: "✅", l: "Выполнение", v: `${compPct}%`,
        col: compPct >= 70 ? "#34d399" : compPct >= 40 ? "#fbbf24" : "#fb7185",
        sub: deltaCompPct !== 0 ? `${deltaCompPct > 0 ? "↑" : "↓"}${Math.abs(deltaCompPct)}% к прошлому` : "как в прошлом месяце",
        subCol: deltaCompPct > 0 ? "#34d399" : deltaCompPct < 0 ? "#fb7185" : mutedColor,
        extra: `${completed} из ${total} задач` },
    ];

    return (
      <div style={{ ...shell, textAlign: "center", maxWidth: "1100px", margin: "auto" }}>
        {sectionH2("Ключевые показатели")}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "20px" }}>
          {kpiItems.map((k, i) => (
            <div key={i} style={{
              borderRadius: "28px", padding: "30px 36px", minWidth: "240px", maxWidth: "320px", flex: "1 1 240px",
              background: cardColors[i % cardColors.length], border: BDR, textAlign: "center",
            }}>
              <div style={{ fontSize: "42px", marginBottom: "10px" }}>{k.i}</div>
              <p style={{ fontFamily: F, fontSize: "48px", fontWeight: 900, letterSpacing: "-1.5px", color: k.col, lineHeight: 1 }}>{k.v}</p>
              <p style={{ fontFamily: F, fontSize: "20px", color: mutedColor, marginTop: "10px" }}>{k.l}</p>
              {k.sub && <p style={{ fontFamily: F, fontSize: "16px", color: k.subCol || mutedColor, marginTop: "8px", fontWeight: 600 }}>{k.sub}</p>}
              {k.extra && <p style={{ fontFamily: F, fontSize: "14px", color: mutedColor, marginTop: "4px" }}>{k.extra}</p>}
            </div>
          ))}
        </div>

        {(totalPrev > 0 || completedPrev > 0) && (
          <div style={{
            display: "inline-flex", gap: "40px", marginTop: "20px", flexWrap: "wrap", justifyContent: "center",
            padding: "16px 36px", borderRadius: "20px", background: cardColors[1], border: BDR,
          }}>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontFamily: F, fontSize: "16px", color: mutedColor }}>Невыполнено</p>
              <p style={{ fontFamily: F, fontSize: "32px", fontWeight: 900, color: currentUncompleted > prevUncompleted ? "#fb7185" : currentUncompleted < prevUncompleted ? "#34d399" : acA, lineHeight: 1.2 }}>{currentUncompleted}</p>
              <p style={{ fontFamily: F, fontSize: "14px", color: deltaUncompleted > 0 ? "#fb7185" : deltaUncompleted < 0 ? "#34d399" : mutedColor, fontWeight: 600 }}>{deltaUncompleted > 0 ? `+${deltaUncompleted}` : deltaUncompleted < 0 ? `${deltaUncompleted}` : "—"}</p>
            </div>
            <div style={{ width: "1px", background: `rgba(${r},${g},${b},.20)` }} />
            <div style={{ textAlign: "center" }}>
              <p style={{ fontFamily: F, fontSize: "16px", color: mutedColor }}>Всего</p>
              <p style={{ fontFamily: F, fontSize: "32px", fontWeight: 900, color: acA, lineHeight: 1.2 }}>{total}</p>
              <p style={{ fontFamily: F, fontSize: "14px", color: mutedColor }}>{totalPrev > 0 ? `было ${totalPrev}` : "—"}</p>
            </div>
            <div style={{ width: "1px", background: `rgba(${r},${g},${b},.20)` }} />
            <div style={{ textAlign: "center" }}>
              <p style={{ fontFamily: F, fontSize: "16px", color: mutedColor }}>Завершено</p>
              <p style={{ fontFamily: F, fontSize: "32px", fontWeight: 900, color: "#34d399", lineHeight: 1.2 }}>{completed}</p>
              <p style={{ fontFamily: F, fontSize: "14px", color: mutedColor }}>{completedPrev > 0 ? `было ${completedPrev}` : "—"}</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ───────── 3/4. COMPLETED / IN-PROGRESS — max 4, ×1.5 ─────────
  if (slide.type === "completed" || slide.type === "inprogress") {
    const items = (slide.content.tasks || []) as Array<{ task: Task; currentTotal: number; prevTotal: number; delta: number }>;
    const totalTasks = Number(slide.content.total || items.length);
    const totalHours = Number(slide.content.totalHours) || 0;
    const title = slide.type === "completed" ? "Завершённые задачи" : "Задачи в работе";

    return (
      <div style={{ ...shell, textAlign: "center", maxWidth: "1100px", margin: "auto" }}>
        {sectionH2(title)}
        <div style={{ display: "inline-flex", gap: "30px", marginBottom: "20px", padding: "14px 36px", borderRadius: "20px", background: cardColors[1], border: BDR, flexWrap: "wrap", justifyContent: "center" }}>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontFamily: F, fontSize: "30px", fontWeight: 900, color: acA, lineHeight: 1.2 }}>{totalTasks}</p>
            <p style={{ fontFamily: F, fontSize: "14px", color: mutedColor }}>задач</p>
          </div>
          <div style={{ width: "1px", background: `rgba(${r},${g},${b},.20)` }} />
          <div style={{ textAlign: "center" }}>
            <p style={{ fontFamily: F, fontSize: "30px", fontWeight: 900, color: acA, lineHeight: 1.2 }}>{fmt2(totalHours)}ч</p>
            <p style={{ fontFamily: F, fontSize: "14px", color: mutedColor }}>итого</p>
          </div>
        </div>

        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: "14px", justifyItems: "center",
          overflowY: "auto", maxHeight: "580px", textAlign: "left",
        }}>
          {items.map((item) => {
            const t = item.task;
            const col = statusColor(t.status, theme);
            return (
              <div key={t.id} style={{
                width: "100%", borderRadius: "18px", padding: "16px 20px",
                background: cardColors[0], border: BDR,
                display: "flex", flexDirection: "column", gap: "8px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontFamily: F, fontSize: "14px", color: numColor, fontWeight: 600 }}>#{t.num || ""}</span>
                  <span style={{ fontFamily: F, fontSize: "12px", fontWeight: 700, padding: "2px 10px", borderRadius: "8px", background: `${col}30`, color: col }}>{t.status}</span>
                </div>
                <p style={{ fontFamily: F, fontSize: "17px", color: nameColor, fontWeight: 500, lineHeight: 1.3 }}>{t.name || "—"}</p>
                <div style={{ display: "flex", gap: "12px", alignItems: "baseline", flexWrap: "wrap" }}>
                  <span style={{ fontFamily: F, fontSize: "14px", fontWeight: 600, color: mutedColor }}>
                    <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: ".5px" }}>план </span>
                    <span style={{ color: nameColor, fontSize: "17px", fontWeight: 800 }}>{fmt2(evalExpr(t.planH))}ч</span>
                  </span>
                  <span style={{ fontFamily: F, fontSize: "14px", fontWeight: 600, color: mutedColor }}>
                    <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: ".5px" }}>факт </span>
                    <span style={{ color: nameColor, fontSize: "17px", fontWeight: 800 }}>{fmt2(evalExpr(t.factH))}ч</span>
                  </span>
                  <span style={{ fontFamily: F, fontSize: "14px", fontWeight: 600, color: mutedColor }}>
                    <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: ".5px" }}>итого </span>
                    <span style={{ color: item.currentTotal <= evalExpr(t.planH) ? "#34d399" : "#fb7185", fontSize: "17px", fontWeight: 800 }}>{fmt2(item.currentTotal)}ч</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ───────── 5. TABLE — ×1.5 ─────────
  if (slide.type === "table") {
    const rows = ((slide.content.rows || slide.content.tasks || []) as Task[]);
    const totalFactMap = (slide.content.totalFactMap || {}) as Record<string, number>;
    const total = Number(slide.content.total || rows.length);
    const completed = Number(slide.content.completed) || 0;
    const totalHours = Number(slide.content.totalHours) || 0;
    const compPct = total > 0 ? Math.round((completed / total) * 100) : 0;

    const phaseOrder = ["new", "in_progress", "done", "cancel"] as const;
    const phaseLabels: Record<string, string> = { new: "Новая", in_progress: "В работе", done: "Завершенная", cancel: "Отменена" };
    const phaseMap = new Map<string, Task[]>();
    for (const t of rows) {
      const phase = getPhaseForStatus(t.status);
      if (!phaseMap.has(phase)) phaseMap.set(phase, []);
      phaseMap.get(phase)!.push(t);
    }
    const groups = phaseOrder.filter(p => phaseMap.has(p)).map(p => ({ phase: p, label: phaseLabels[p], color: PHASE_COLORS[p], tasks: phaseMap.get(p)! }));

    return (
      <div style={{ ...shell, textAlign: "center", maxWidth: "1100px", margin: "auto", display: "flex", flexDirection: "column", height: "100%" }}>
        {sectionH2("Полный список задач")}
        <div style={{ display: "inline-flex", gap: "28px", marginBottom: "16px", padding: "14px 36px", borderRadius: "20px", background: cardColors[1], border: BDR, flexWrap: "wrap", justifyContent: "center", alignItems: "center" }}>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontFamily: F, fontSize: "30px", fontWeight: 900, color: acA, lineHeight: 1.2 }}>{total}</p>
            <p style={{ fontFamily: F, fontSize: "14px", color: mutedColor }}>задач</p>
          </div>
          <div style={{ width: "1px", height: "36px", background: `rgba(${r},${g},${b},.20)` }} />
          <div style={{ textAlign: "center" }}>
            <p style={{ fontFamily: F, fontSize: "30px", fontWeight: 900, color: "#34d399", lineHeight: 1.2 }}>{completed}</p>
            <p style={{ fontFamily: F, fontSize: "14px", color: mutedColor }}>завершено</p>
          </div>
          <div style={{ width: "1px", height: "36px", background: `rgba(${r},${g},${b},.20)` }} />
          <div style={{ textAlign: "center" }}>
            <p style={{ fontFamily: F, fontSize: "30px", fontWeight: 900, color: acA, lineHeight: 1.2 }}>{fmt2(totalHours)}ч</p>
            <p style={{ fontFamily: F, fontSize: "14px", color: mutedColor }}>итого</p>
          </div>
          <div style={{ width: "1px", height: "36px", background: `rgba(${r},${g},${b},.20)` }} />
          <div style={{ textAlign: "center" }}>
            <div style={{ position: "relative", width: "42px", height: "42px", margin: "0 auto" }}>
              <svg width="42" height="42" style={{ transform: "rotate(-90deg)" }}>
                <circle cx="21" cy="21" r="16" fill="none" stroke={`rgba(${r},${g},${b},.15)`} strokeWidth="5" />
                <circle cx="21" cy="21" r="16" fill="none" stroke={acA} strokeWidth="5"
                  strokeDasharray={`${2 * Math.PI * 16}`}
                  strokeDashoffset={`${2 * Math.PI * 16 * (1 - compPct / 100)}`} strokeLinecap="round" />
              </svg>
              <span style={{ fontFamily: F, position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 900, color: acA }}>{compPct}%</span>
            </div>
            <p style={{ fontFamily: F, fontSize: "14px", color: mutedColor, marginTop: "3px" }}>%</p>
          </div>
        </div>

        <div style={{ flex: "1 1 auto", overflowX: "hidden", overflowY: "auto", borderRadius: "20px", border: BDR, textAlign: "left", background: cardColors[2] }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "18px", fontFamily: F }}>
            <thead>
              <tr style={{ background: cardColors[0], position: "sticky", top: 0, zIndex: 2 }}>
                {["№", "Наименование", "Этап", "План ч", "Факт ч", "Итого ч"].map((h, i) => (
                  <th key={i} style={{
                    padding: "12px 18px", textAlign: i >= 3 ? "center" : "left",
                    color: mutedColor, fontSize: "13px", textTransform: "uppercase", letterSpacing: ".8px",
                    borderBottom: `1px solid rgba(${r},${g},${b},.12)`,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                  <React.Fragment key={group.phase}>
                    <tr>
                      <td colSpan={6} style={{
                        padding: "8px 18px", fontSize: "13px", fontWeight: 700,
                        textTransform: "uppercase", letterSpacing: ".8px",
                        color: group.color, background: cardColors[0], borderBottom: `1px solid ${group.color}20`,
                      }}>{group.label} ({group.tasks.length})</td>
                    </tr>
                    {group.tasks.map((t, i) => (
                      <tr key={t.id} style={{ background: i % 2 === 0 ? cardColors[2] : cardColors[1] }}>
                        <td style={{ padding: "8px 18px", color: numColor, fontSize: "16px" }}>{t.num || ""}</td>
                        <td style={{ padding: "8px 18px", color: nameColor, maxWidth: "400px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name || "—"}</td>
                        <td style={{ padding: "8px 18px" }}>
                          <span style={{ fontFamily: F, fontSize: "12px", fontWeight: 700, padding: "2px 10px", borderRadius: "8px", background: `${statusColor(t.status, theme)}22`, color: statusColor(t.status, theme) }}>{t.status}</span>
                        </td>
                        <td style={{ padding: "8px 18px", textAlign: "center", fontWeight: 700, color: nameColor }}>{fmt2(evalExpr(t.planH))}</td>
                        <td style={{ padding: "8px 18px", textAlign: "center", fontWeight: 700, color: nameColor }}>{fmt2(evalExpr(t.factH))}</td>
                        <td style={{ padding: "8px 18px", textAlign: "center", fontWeight: 700, color: (t.num ? (totalFactMap[t.num] || evalExpr(t.factH)) : evalExpr(t.factH)) <= evalExpr(t.planH) ? "#34d399" : "#fb7185" }}>{fmt2(t.num ? (totalFactMap[t.num] || evalExpr(t.factH)) : evalExpr(t.factH))}</td>
                      </tr>
                    ))}
                  </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ───────── 6. SUMMARY — по центру, ×1.5 ─────────
  if (slide.type === "summary") {
    const c = slide.content;
    const planN = Number(c.planH) || 0;
    const factN = Number(c.factH) || 0;
    const compPct = Number(c.compPct) || 0;
    const overPct = Number(c.overPct) || 0;
    const total = Number(c.total) || 0;
    const completed = Number(c.completed) || 0;
    const currentUncompleted = Number(c.currentUncompleted) || 0;
    const prevUncompleted = Number(c.prevUncompleted) || 0;

    const fallbackAchievements: string[] = [];
    if (compPct >= 70) fallbackAchievements.push(`${compPct}% задач выполнено — высокая эффективность`);
    if (completed > 0) fallbackAchievements.push(`Завершено ${completed} из ${total} задач`);
    if (overPct < 0) fallbackAchievements.push(`Экономия ${Math.abs(overPct)}% бюджета`);
    if (fallbackAchievements.length === 0) fallbackAchievements.push("Месяц в процессе, данные накапливаются");

    const fallbackRisks: string[] = [];
    if (overPct > 20) fallbackRisks.push(`Перерасход ${overPct}% — превышен лимит бюджета`);
    if (overPct > 0 && overPct <= 20) fallbackRisks.push(`Незначительный перерасход ${overPct}%`);
    if (currentUncompleted > prevUncompleted) fallbackRisks.push(`Рост невыполненных задач: ${currentUncompleted} (+${currentUncompleted - prevUncompleted})`);
    if (currentUncompleted === 0 && total > 0) fallbackRisks.push("Все задачи закрыты");

    const fallbackInProgress: string[] = [];
    const inProgressCount = total - completed;
    if (inProgressCount > 0) fallbackInProgress.push(`${inProgressCount} задач в работе`);
    if (planN > factN) fallbackInProgress.push(`Остаток бюджета: ${fmt2(planN - factN)}ч`);

    const fallbackSummary: string[] = [];
    if (compPct >= 80 && overPct <= 10) fallbackSummary.push("Отличный результат — задачи выполнены в рамках бюджета");
    else if (compPct >= 50 && overPct <= 20) fallbackSummary.push("Результат удовлетворительный, есть области для оптимизации");
    else if (compPct < 50) fallbackSummary.push("Низкая эффективность — необходимо пересмотреть процессы");
    if (overPct > 20) fallbackSummary.push("Критический перерасход требует немедленного вмешательства");

    const con = aiConclusion ?? {
      achievements: fallbackAchievements, risks: fallbackRisks,
      inProgress: fallbackInProgress, summary: fallbackSummary,
    };

    const sections = [
      { key: "achievements" as const, icon: "✅", label: "Достижения", col: "#34d399", items: con.achievements },
      { key: "risks" as const, icon: "⚠️", label: "Риски", col: "#fb7185", items: con.risks },
      { key: "inProgress" as const, icon: "⚙️", label: "В процессе", col: "#fbbf24", items: con.inProgress },
      { key: "summary" as const, icon: "📊", label: "Выводы", col: "#a78bfa", items: con.summary },
    ].filter((s) => s.items && s.items.length > 0);

    return (
      <div style={{ ...shell, textAlign: "center", maxWidth: "1000px", margin: "auto" }}>
        {sectionH2("Итоги и выводы")}
        <div style={{ display: "grid", gridTemplateColumns: sections.length > 2 ? "1fr 1fr" : "1fr", gap: "20px", textAlign: "left" }}>
          {sections.map((s) => (
            <div key={s.key} style={{
              borderRadius: "24px", padding: "24px 28px",
              background: cardColors[0], border: `1px solid ${s.col}40`,
            }}>
              <h4 style={{
                fontFamily: F, fontSize: "18px", fontWeight: 700, textTransform: "uppercase",
                letterSpacing: ".8px", color: s.col, marginBottom: "14px",
              }}>{s.icon} {s.label}</h4>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
                {(s.items || []).map((item, i) => (
                  <li key={i} style={{
                    fontFamily: F, fontSize: "16px",
                    color: theme.isLight ? "rgba(30,41,59,.85)" : "rgba(255,255,255,.82)",
                    paddingLeft: "18px", position: "relative", lineHeight: 1.45,
                  }}>
                    <span style={{ position: "absolute", left: 0, top: "7px", width: "6px", height: "6px", borderRadius: "50%", background: s.col, display: "inline-block" }} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {aiConclusion && (
          <p style={{ fontFamily: F, fontSize: "14px", color: mutedColor, textAlign: "center", marginTop: "16px" }}>
            AI-анализ · {aiConclusion.source === "ai" ? "сгенерировано ИИ" : "заполнено вручную"}
          </p>
        )}
      </div>
    );
  }

  return (
    <div style={shell}>
      <p style={{ fontFamily: F, color: mutedColor, textAlign: "center" }}>Неизвестный тип слайда: {slide.type}</p>
    </div>
  );
}

export { hexToRgb, statusColor };
