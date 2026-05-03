/* ================================================================ *
 *  PRESENTATION RENDERER — single source of truth for slides       *
 * ================================================================ *
 *
 *  ОДИН компонент <PresentationSlide /> рендерит слайд И в превью,
 *  И в экспортируемом HTML. Никаких дублей логики/вёрстки.
 *
 *  - В preview:   <PresentationSlide slide={…} theme={…} />
 *  - В export:    renderToStaticMarkup(<PresentationSlide … />)
 *
 *  Все стили — inline (style={{...}}), потому что экспорт идёт
 *  через ReactDOMServer и в нём нет Tailwind. Inline-стили дают
 *  гарантию: то, что видит юзер в превью, попадёт в HTML файл
 *  один в один.
 *
 *  Тема (PresentationTheme) собирается из текущего accent + presBg.
 *  Один раз посчитали — оба места используют.
 */

import type { Task } from "./types";
import type { PresBgSettings } from "./store";

/* ================================================================ *
 *  Types                                                           *
 * ================================================================ */

export interface SlideData {
  type: "title" | "kpi" | "statuses" | "completed" | "inprogress" | "table" | "summary";
  content: Record<string, unknown>;
}

export interface AiConclusion {
  achievements: string[];
  risks: string[];
  inProgress: string[];
  nextSteps: string[];
}

/** Полная тема одного рендера. Computed-поля вычислены заранее, чтобы
 *  и preview и export получали одинаковые цвета без ремайша. */
export interface PresentationTheme {
  accentHex: string;
  /** RGB-кортеж accent для построения rgba(...) */
  rgb: [number, number, number];
  /** Стиль из PRES_STYLE_PRESETS */
  styleId: PresBgSettings["styleId"];
  /** Цвет фона body */
  bodyBg: string;
  /** Слой radial-gradient'ов поверх body */
  overlayBg: string;
  /** Основной текст */
  textColor: string;
  /** Приглушённый текст */
  mutedColor: string;
  /** 3 цвета карточек по слайдам */
  cardColors: string[];
  /** Light-flag — для подбора цветов рамок */
  isLight: boolean;
  /** Эмодзи и паттерн — для слоя позади слайда */
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

/** Канонический список пресетов фона. Дублирует PRES_STYLE_PRESETS, но
 *  здесь — без эмоджи/лейблов, только то, что нужно рендеру. Сделано
 *  отдельно, чтобы renderer не зависел от UI-стора. */
const STYLE_DEFS: Record<
  PresBgSettings["styleId"],
  { bodyBg: string; overlayBg: (rgb: [number, number, number]) => string; textColor: string; mutedColor: string; cardColors: (rgb: [number, number, number]) => string[]; isLight: boolean }
> = {
  dark: {
    bodyBg: "#0d1117",
    overlayBg: ([r, g, b]) =>
      `radial-gradient(ellipse 80% 60% at 20% 20%,rgba(${r},${g},${b},.18),transparent 60%),radial-gradient(ellipse 70% 70% at 80% 80%,rgba(${r},${g},${b},.1),transparent 60%),linear-gradient(160deg,#080d14 0%,#111827 40%,#0d1117 100%)`,
    textColor: "#e2e8f0",
    mutedColor: "rgba(148,163,184,.55)",
    cardColors: ([r, g, b]) => [`rgba(${r},${g},${b},.12)`, `rgba(${r},${g},${b},.1)`, `rgba(${r},${g},${b},.08)`],
    isLight: false,
  },
  spring: {
    bodyBg: "#0a1a0f",
    overlayBg: () =>
      "radial-gradient(ellipse 80% 60% at 20% 20%,rgba(52,211,153,.18),transparent 60%),radial-gradient(ellipse 70% 70% at 80% 80%,rgba(134,239,172,.12),transparent 60%),linear-gradient(160deg,#071510 0%,#0d2118 40%,#081a10 100%)",
    textColor: "#d1fae5",
    mutedColor: "rgba(167,243,208,.55)",
    cardColors: () => ["rgba(4,108,78,.6)", "rgba(21,128,61,.5)", "rgba(63,98,18,.55)"],
    isLight: false,
  },
  ocean: {
    bodyBg: "#070e1a",
    overlayBg: () =>
      "radial-gradient(ellipse 80% 60% at 20% 20%,rgba(56,189,248,.18),transparent 60%),radial-gradient(ellipse 70% 70% at 80% 80%,rgba(14,165,233,.12),transparent 60%),linear-gradient(160deg,#04090f 0%,#0c1829 40%,#060d1a 100%)",
    textColor: "#e0f2fe",
    mutedColor: "rgba(186,230,253,.55)",
    cardColors: () => ["rgba(7,50,90,.65)", "rgba(10,70,130,.55)", "rgba(5,60,110,.6)"],
    isLight: false,
  },
  night: {
    bodyBg: "#07050f",
    overlayBg: () =>
      "radial-gradient(ellipse 80% 60% at 20% 20%,rgba(139,92,246,.18),transparent 60%),radial-gradient(ellipse 70% 70% at 80% 80%,rgba(167,139,250,.12),transparent 60%),linear-gradient(160deg,#05030c 0%,#0f0a1e 40%,#070510 100%)",
    textColor: "#ede9fe",
    mutedColor: "rgba(221,214,254,.55)",
    cardColors: () => ["rgba(50,20,90,.65)", "rgba(60,30,110,.55)", "rgba(40,15,80,.6)"],
    isLight: false,
  },
  fire: {
    bodyBg: "#120800",
    overlayBg: () =>
      "radial-gradient(ellipse 80% 60% at 20% 20%,rgba(251,191,36,.18),transparent 60%),radial-gradient(ellipse 70% 70% at 80% 80%,rgba(245,158,11,.12),transparent 60%),linear-gradient(160deg,#0d0500 0%,#1c0f00 40%,#100700 100%)",
    textColor: "#fef3c7",
    mutedColor: "rgba(253,230,138,.55)",
    cardColors: () => ["rgba(90,55,5,.65)", "rgba(120,70,5,.55)", "rgba(75,45,5,.6)"],
    isLight: false,
  },
  minimal: {
    bodyBg: "#f8fafc",
    overlayBg: () => "linear-gradient(160deg,#f8fafc 0%,#f1f5f9 100%)",
    textColor: "#1e293b",
    mutedColor: "rgba(100,116,139,.7)",
    cardColors: () => ["rgba(241,245,249,1)", "rgba(248,250,252,1)", "rgba(226,232,240,1)"],
    isLight: true,
  },
};

/** Собирает PresentationTheme из вводных параметров приложения. */
export function buildTheme(accentHex: string, bg: PresBgSettings): PresentationTheme {
  const safeAccent = accentHex && /^#?[0-9a-fA-F]{6}$/.test(accentHex) ? accentHex : "#5B9BD5";
  const rgb = hexToRgb(safeAccent);
  const def = STYLE_DEFS[bg.styleId] || STYLE_DEFS.dark;
  return {
    accentHex: safeAccent.startsWith("#") ? safeAccent : `#${safeAccent}`,
    rgb,
    styleId: bg.styleId,
    bodyBg: def.bodyBg,
    overlayBg: def.overlayBg(rgb),
    textColor: def.textColor,
    mutedColor: def.mutedColor,
    cardColors: def.cardColors(rgb),
    isLight: def.isLight,
    bg,
  };
}

/** Цвет статуса — функциональный, не зависит от темы.
 *  Используется и в превью, и в экспорте → отсюда. */
const STATUS_COLS: Record<string, string> = {
  "Завершено": "#34d399",
  "Завершенная": "#34d399",
  "Выполнено": "#34d399",
  "Выполненная": "#34d399",
  "Тестирование": "#38bdf8",
  "Разработка": "#fbbf24",
  "В очереди на разработку": "#22d3ee",
  "Анализ": "#a78bfa",
  "В работе": "#60a5fa",
  "Согласование": "#fb923c",
  "В релиз": "#f472b6",
  "Документация": "#f9a8d4",
  "Контроль на прод": "#bef264",
  "Отложенная": "#94a3b8",
  "Отменено": "#94a3b8",
  "Идея": "#fbbf24",
  "Новая": "#60a5fa",
};

function statusColor(status: string, theme: PresentationTheme): string {
  return STATUS_COLS[status] || `rgba(${theme.rgb[0]},${theme.rgb[1]},${theme.rgb[2]},.8)`;
}

const PRIO_COLS: Record<string, string> = {
  "Наивысший": "#d45454",
  "Высокий": "#d48040",
  "Средний": "#b89830",
  "Низкий": "#4a9a5a",
  "Очередь": "#7a6ab0",
};

/* ================================================================ *
 *  Background layer (pattern + emoji)                              *
 *  Отдельный компонент — кладётся ОДИН раз поверх body, не на      *
 *  каждый слайд, чтобы соответствовать поведению export.           *
 * ================================================================ */

export function PresentationBgLayer({ theme }: { theme: PresentationTheme }) {
  const { bg, rgb } = theme;
  const [r, g, b] = rgb;
  const sz = bg.patternSize;
  const op = (bg.patternOpacity / 100).toFixed(2);
  const pcol = `rgba(${r},${g},${b},${op})`;

  let patternStyle: React.CSSProperties = {};
  switch (bg.pattern) {
    case "grid":
      patternStyle = {
        backgroundImage: `linear-gradient(${pcol} 1px,transparent 1px),linear-gradient(90deg,${pcol} 1px,transparent 1px)`,
        backgroundSize: `${sz}px ${sz}px`,
      };
      break;
    case "diagonal":
      patternStyle = {
        backgroundImage: `repeating-linear-gradient(45deg,transparent,transparent ${sz / 2}px,${pcol} ${sz / 2}px,${pcol} ${sz / 2 + 1}px)`,
        backgroundSize: `${sz}px ${sz}px`,
      };
      break;
    case "diamond":
      patternStyle = {
        backgroundImage: `repeating-linear-gradient(45deg,transparent,transparent ${sz / 2 - 1}px,${pcol} ${sz / 2 - 1}px,${pcol} ${sz / 2 + 1}px),repeating-linear-gradient(-45deg,transparent,transparent ${sz / 2 - 1}px,${pcol} ${sz / 2 - 1}px,${pcol} ${sz / 2 + 1}px)`,
        backgroundSize: `${sz}px ${sz}px`,
      };
      break;
    case "waves":
      patternStyle = {
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='${sz}' height='${sz / 2}' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 ${sz / 4} Q ${sz / 4} 0 ${sz / 2} ${sz / 4} T ${sz} ${sz / 4}' fill='none' stroke='rgba(${r},${g},${b},${op})' stroke-width='1'/%3E%3C/svg%3E")`,
        backgroundSize: `${sz}px ${sz / 2}px`,
      };
      break;
    case "zigzag":
      patternStyle = {
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='${sz}' height='${sz / 2}' xmlns='http://www.w3.org/2000/svg'%3E%3Cpolyline points='0,${sz / 2} ${sz / 4},0 ${sz / 2},${sz / 2} ${sz * 3 / 4},0 ${sz},${sz / 2}' fill='none' stroke='rgba(${r},${g},${b},${op})' stroke-width='1'/%3E%3C/svg%3E")`,
        backgroundSize: `${sz}px ${sz / 2}px`,
      };
      break;
  }

  // Phase 5: режим анимации. По умолчанию drift (мягкий дрейф).
  const animMode: "off" | "drift" | "fall" = bg.emojiAnim || "drift";
  const speedMul = bg.emojiSpeed && bg.emojiSpeed > 0 ? bg.emojiSpeed : 1;
  const fixedOpacity = typeof bg.emojiOpacity === "number"
    ? Math.max(0, Math.min(1, bg.emojiOpacity / 100))
    : null;

  // Эмодзи: детерминированный seeded random, чтобы расположение было
  // одинаковым в превью и в экспорте.
  const emojiList = (bg.emojis || "").split(" ").filter(Boolean);
  type EmojiItem = {
    e: string;
    x: number;
    y: number;
    size: number;
    opacity: number;
    rotate: number;
    duration: number;
    delay: number;
    sway: number;
    key: number;
  };
  const emojis: EmojiItem[] = [];
  if (emojiList.length > 0 && bg.emojiCount > 0) {
    let seed = 42;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < bg.emojiCount; i++) {
      const r1 = rand();
      const r2 = rand();
      const r3 = rand();
      const r4 = rand();
      const r5 = rand();
      const r6 = rand();
      const r7 = rand();
      const r8 = rand();
      // Длительность: 6..14s в drift, 12..25s в fall, базовая делится на speedMul.
      const baseDur = animMode === "fall" ? 12 + r6 * 13 : 6 + r6 * 8;
      const duration = +(baseDur / speedMul).toFixed(2);
      // Delay: распределяем равномерно [-duration; 0], чтобы в момент монтажа
      // эмодзи уже были в разных фазах своего цикла, а не все стартовали одновременно.
      const delay = -(r7 * duration);
      // Горизонтальное покачивание для fall: ±25..70px
      const sway = Math.round((r8 * 2 - 1) * (25 + r1 * 45));
      emojis.push({
        e: emojiList[Math.floor(r1 * emojiList.length)],
        x: r2 * 100,
        y: r3 * 100,
        size: Math.round(bg.emojiMinSize + r4 * (bg.emojiMaxSize - bg.emojiMinSize)),
        opacity: fixedOpacity != null ? fixedOpacity : 0.1 + r5 * 0.2,
        rotate: Math.floor(r5 * 40 - 20),
        duration,
        delay: +delay.toFixed(2),
        sway,
        key: i,
      });
    }
  }

  const hasPattern = bg.pattern !== "none";

  return (
    <>
      {/* CSS анимаций — инлайн в каждый рендер. В превью браузер парсит
          один раз, в экспорте уезжает в HTML вместе с разметкой. */}
      {animMode !== "off" && emojis.length > 0 && (
        <style>{`
          .pres-emoji {
            position: absolute;
            pointer-events: none;
            user-select: none;
            z-index: 0;
            will-change: transform, opacity;
          }
          .pres-emoji[data-anim="drift"] {
            animation-name: pres-emoji-drift;
            animation-timing-function: ease-in-out;
            animation-iteration-count: infinite;
            animation-direction: alternate;
          }
          .pres-emoji[data-anim="fall"] {
            top: -10vh !important;
            animation-name: pres-emoji-fall;
            animation-timing-function: linear;
            animation-iteration-count: infinite;
          }
          @keyframes pres-emoji-drift {
            from { transform: translate3d(0,0,0) rotate(var(--rot,0deg)); }
            to   { transform: translate3d(18px,12px,0) rotate(calc(var(--rot,0deg) + 6deg)); }
          }
          @keyframes pres-emoji-fall {
            0%   { transform: translate3d(0,0,0) rotate(var(--rot,0deg)); opacity: 0; }
            10%  { opacity: var(--op,0.25); }
            50%  { transform: translate3d(var(--sway,0px),60vh,0) rotate(calc(var(--rot,0deg) + 180deg)); opacity: var(--op,0.25); }
            90%  { opacity: var(--op,0.25); }
            100% { transform: translate3d(0,130vh,0) rotate(calc(var(--rot,0deg) + 360deg)); opacity: 0; }
          }
          @media (prefers-reduced-motion: reduce) {
            .pres-emoji[data-anim] { animation: none !important; }
          }
          @media print {
            .pres-emoji[data-anim] { animation: none !important; }
          }
        `}</style>
      )}

      {/* overlay-gradient */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          background: theme.overlayBg,
        }}
      />
      {hasPattern && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 0,
            pointerEvents: "none",
            ...patternStyle,
          }}
        />
      )}
      {emojis.map((em) => {
        // Базовый стиль (общий для всех режимов). Анимация задаётся
        // через data-anim + CSS-переменные. Если режим off — никаких
        // animation-свойств вообще, статика как раньше.
        const cssVars: React.CSSProperties = {
          left: `${em.x.toFixed(1)}%`,
          top: `${em.y.toFixed(1)}%`,
          fontSize: `${em.size}px`,
          opacity: em.opacity,
          transform: `rotate(${em.rotate}deg)`,
          // Custom properties для keyframes
          ["--rot" as never]: `${em.rotate}deg`,
          ["--op" as never]: em.opacity,
          ["--sway" as never]: `${em.sway}px`,
          animationDuration: animMode !== "off" ? `${em.duration}s` : undefined,
          animationDelay: animMode !== "off" ? `${em.delay}s` : undefined,
        };
        return (
          <span
            key={em.key}
            className="pres-emoji"
            data-anim={animMode === "off" ? undefined : animMode}
            style={cssVars}
          >
            {em.e}
          </span>
        );
      })}
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
  /** В preview — false (пусть растягивается). В export — true (1280×720 фикс). */
  fixedAspect?: boolean;
}

export function PresentationSlide({ slide, theme, aiConclusion, fixedAspect = false }: PresentationSlideProps) {
  const { rgb, accentHex, textColor, mutedColor, cardColors } = theme;
  const [r, g, b] = rgb;

  const acA = `rgba(${r},${g},${b},1)`;
  const acC = `rgba(${r},${g},${b},.15)`;
  const acGrad = `linear-gradient(135deg,${acA},rgba(${r},${g},${b},.6))`;

  // Унифицированный заголовок секции (h2)
  const sectionH2 = (text: string): React.ReactNode => (
    <h2
      style={{
        fontSize: "40px",
        fontWeight: 800,
        marginBottom: "32px",
        textAlign: "center",
        background: `linear-gradient(135deg,${textColor},${acA})`,
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
        color: "transparent",
      }}
    >
      {text}
    </h2>
  );

  const slideShellStyle: React.CSSProperties = {
    position: "relative",
    zIndex: 1,
    width: "100%",
    maxWidth: "1200px",
    margin: "0 auto",
  };

  // ───────── TITLE ─────────
  if (slide.type === "title") {
    const c = slide.content;
    const month = String(c.month || "");
    const total = Number(c.total || 0);
    const completed = Number(c.completed || 0);
    const pct = Number(c.pct || 0);
    const circ = 2 * Math.PI * 38;
    const dash = circ * (1 - pct / 100);

    return (
      <div style={{ ...slideShellStyle, textAlign: "center", maxWidth: "900px" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "10px",
            background: acC,
            border: `1px solid rgba(${r},${g},${b},.7)`,
            color: acA,
            padding: "10px 32px",
            borderRadius: "28px",
            fontSize: "18px",
            fontWeight: 600,
            marginBottom: "32px",
          }}
        >
          <span
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              background: acA,
              display: "inline-block",
            }}
          />
          {month}
        </div>
        <h1
          style={{
            fontSize: "clamp(40px,5.5vw,64px)",
            fontWeight: 900,
            lineHeight: 1.1,
            letterSpacing: "-2px",
            marginBottom: "20px",
            background: `linear-gradient(135deg,${textColor} 10%,${acA} 55%)`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          Отчёт по задачам
        </h1>
        <div
          style={{
            width: "100px",
            height: "4px",
            background: acGrad,
            borderRadius: "2px",
            margin: "0 auto 32px",
          }}
        />
        <div
          style={{
            display: "flex",
            gap: "40px",
            justifyContent: "center",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: "52px", fontWeight: 900, color: acA, lineHeight: 1 }}>{total}</p>
            <p style={{ fontSize: "14px", color: mutedColor, marginTop: "4px" }}>Всего задач</p>
          </div>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: "52px", fontWeight: 900, color: "#34d399", lineHeight: 1 }}>{completed}</p>
            <p style={{ fontSize: "14px", color: mutedColor, marginTop: "4px" }}>Завершено</p>
          </div>
          <div
            style={{
              position: "relative",
              width: "96px",
              height: "96px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="96" height="96" style={{ transform: "rotate(-90deg)", position: "absolute" }}>
              <circle cx="48" cy="48" r="38" fill="none" stroke={`rgba(${r},${g},${b},.15)`} strokeWidth="7" />
              <circle
                cx="48"
                cy="48"
                r="38"
                fill="none"
                stroke={acA}
                strokeWidth="7"
                strokeDasharray={circ.toFixed(1)}
                strokeDashoffset={dash.toFixed(1)}
                strokeLinecap="round"
              />
            </svg>
            <span style={{ fontSize: "22px", fontWeight: 900, color: acA }}>{pct}%</span>
          </div>
        </div>
      </div>
    );
  }

  // ───────── KPI ─────────
  if (slide.type === "kpi") {
    const c = slide.content;
    const planN = Number(c.planH) || 0;
    const factN = Number(c.factH) || 0;
    const factCol = planN > 0 ? (factN > planN ? "#fb7185" : "#4ade80") : acA;
    const items = [
      { i: "📋", l: "Всего задач", v: String(c.total || 0), col: acA },
      { i: "✅", l: "Завершено", v: String(c.completed || 0), col: "#34d399" },
      { i: "📝", l: "План, ч", v: `${c.planH || "0"}`, col: acA },
      { i: "⏱", l: "Факт, ч", v: `${c.factH || "0"}`, col: factCol },
    ];
    return (
      <div style={slideShellStyle}>
        {sectionH2("Ключевые показатели")}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "20px" }}>
          {items.map((k, i) => (
            <div
              key={i}
              style={{
                borderRadius: "24px",
                padding: "32px 24px",
                background: cardColors[i % cardColors.length],
                border: "1px solid rgba(255,255,255,.08)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  width: "120px",
                  height: "120px",
                  borderRadius: "50%",
                  top: "-30px",
                  right: "-30px",
                  background: k.col,
                  filter: "blur(50px)",
                  opacity: 0.3,
                }}
              />
              <div style={{ fontSize: "36px", marginBottom: "14px" }}>{k.i}</div>
              <p
                style={{
                  fontSize: "44px",
                  fontWeight: 900,
                  letterSpacing: "-2px",
                  color: k.col,
                  lineHeight: 1,
                }}
              >
                {k.v}
              </p>
              <p style={{ fontSize: "15px", color: mutedColor, marginTop: "10px" }}>{k.l}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ───────── STATUSES ─────────
  if (slide.type === "statuses") {
    const sc = (slide.content.statusCounts || {}) as Record<string, number>;
    const entries = Object.entries(sc).sort((a, b) => b[1] - a[1]);
    const maxV = Math.max(...entries.map((e) => e[1]), 1);
    return (
      <div style={slideShellStyle}>
        {sectionH2("Статусы задач")}
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          {entries.map(([s, cnt]) => {
            const col = statusColor(s, theme);
            return (
              <div
                key={s}
                style={{
                  flex: 1,
                  minWidth: "180px",
                  borderRadius: "24px",
                  padding: "28px 20px",
                  textAlign: "center",
                  border: "1px solid rgba(255,255,255,.07)",
                  background: cardColors[0],
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: "3px",
                    borderRadius: "24px 24px 0 0",
                    background: col,
                  }}
                />
                <p style={{ fontSize: "52px", fontWeight: 900, letterSpacing: "-2px", color: col }}>{cnt}</p>
                <p style={{ fontSize: "14px", color: mutedColor, marginTop: "8px", fontWeight: 600 }}>{s}</p>
                <div
                  style={{
                    marginTop: "14px",
                    height: "6px",
                    background: "rgba(255,255,255,.06)",
                    borderRadius: "3px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      borderRadius: "3px",
                      background: col,
                      width: `${Math.round((cnt / maxV) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            );
          })}
          {entries.length === 0 && <p style={{ color: mutedColor, textAlign: "center", width: "100%" }}>Нет данных</p>}
        </div>
      </div>
    );
  }

  // ───────── COMPLETED / IN-PROGRESS (карточки задач) ─────────
  if (slide.type === "completed" || slide.type === "inprogress") {
    const tasks = ((slide.content.tasks || []) as Task[]).slice(0, 9);
    const total = Number(slide.content.total || tasks.length);
    const title =
      slide.type === "completed"
        ? `Завершённые задачи${total > tasks.length ? ` (показано ${tasks.length} из ${total})` : ""}`
        : `Задачи в работе${total > tasks.length ? ` (показано ${tasks.length} из ${total})` : ""}`;
    return (
      <div style={slideShellStyle}>
        {sectionH2(title)}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "14px" }}>
          {tasks.map((t) => {
            const col = statusColor(t.status, theme);
            const planN = Number(t.planH) || 0;
            const factN = Number(t.factH) || 0;
            const fCol = planN > 0 ? (factN > planN ? "#fb7185" : "#4ade80") : `rgba(${r},${g},${b},.6)`;
            return (
              <div
                key={t.id}
                style={{
                  borderRadius: "20px",
                  padding: "18px 20px",
                  border: "1px solid rgba(255,255,255,.07)",
                  background: cardColors[0],
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "4px",
                    height: "100%",
                    background: col,
                  }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "12px", color: mutedColor, fontWeight: 600 }}>#{t.num || ""}</span>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      padding: "3px 10px",
                      borderRadius: "10px",
                      background: `${col}1a`,
                      color: col,
                      border: `1px solid ${col}40`,
                    }}
                  >
                    {t.status}
                  </span>
                </div>
                <p style={{ fontSize: "15px", color: textColor, fontWeight: 500, lineHeight: 1.4 }}>{t.name || "—"}</p>
                <div style={{ display: "flex", gap: "20px" }}>
                  <div>
                    <p style={{ fontSize: "20px", fontWeight: 800, color: mutedColor }}>{t.planH || "—"}</p>
                    <p style={{ fontSize: "10px", color: mutedColor, textTransform: "uppercase", letterSpacing: ".6px" }}>план</p>
                  </div>
                  <div>
                    <p style={{ fontSize: "20px", fontWeight: 800, color: fCol }}>{t.factH || "—"}</p>
                    <p style={{ fontSize: "10px", color: mutedColor, textTransform: "uppercase", letterSpacing: ".6px" }}>факт</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ───────── TABLE ─────────
  if (slide.type === "table") {
    const rows = ((slide.content.rows || slide.content.tasks || []) as Task[]).slice(0, 15);
    const total = Number(slide.content.total || rows.length);
    return (
      <div style={slideShellStyle}>
        {sectionH2("Полный список задач")}
        <div
          style={{
            overflow: "hidden",
            borderRadius: "20px",
            border: "1px solid rgba(255,255,255,.07)",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead>
              <tr style={{ background: `rgba(${r},${g},${b},.1)` }}>
                {["№", "Наименование", "План ч", "Факт ч", "Статус"].map((h, i) => (
                  <th
                    key={i}
                    style={{
                      padding: "12px 16px",
                      textAlign: i === 2 || i === 3 ? "center" : "left",
                      color: mutedColor,
                      fontSize: "11px",
                      textTransform: "uppercase",
                      letterSpacing: ".8px",
                      borderBottom: `1px solid rgba(${r},${g},${b},.12)`,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((t, i) => {
                const planN = Number(t.planH) || 0;
                const factN = Number(t.factH) || 0;
                const fCol = planN > 0 ? (factN > planN ? "#fb7185" : "#4ade80") : textColor;
                const col = statusColor(t.status, theme);
                return (
                  <tr key={t.id} style={{ background: i % 2 === 0 ? `rgba(${r},${g},${b},.04)` : "transparent" }}>
                    <td style={{ padding: "10px 16px", color: mutedColor, fontSize: "13px" }}>{t.num || ""}</td>
                    <td style={{ padding: "10px 16px", color: textColor, maxWidth: "260px" }}>{t.name || "—"}</td>
                    <td style={{ padding: "10px 16px", textAlign: "center", color: mutedColor }}>{t.planH || "—"}</td>
                    <td style={{ padding: "10px 16px", textAlign: "center", fontWeight: 700, color: fCol }}>
                      {t.factH || "—"}
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          padding: "3px 10px",
                          borderRadius: "10px",
                          background: `${col}1a`,
                          color: col,
                          border: `1px solid ${col}40`,
                        }}
                      >
                        {t.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {total > rows.length && (
          <p style={{ fontSize: "12px", color: mutedColor, textAlign: "center", marginTop: "12px" }}>
            Показано {rows.length} из {total} задач
          </p>
        )}
      </div>
    );
  }

  // ───────── SUMMARY (AI conclusion) ─────────
  if (slide.type === "summary") {
    const fallback: AiConclusion = {
      achievements: ["Задачи выполнены в рамках плана", "Приоритетные задачи закрыты"],
      risks: ["Перерасход часов по ряду задач", "Требуется корректировка сроков"],
      inProgress: ["Задачи перенесены на следующий период", "Беклог требует планирования"],
      nextSteps: ["Распределить задачи из беклога", "Согласовать план на следующий месяц"],
    };
    const con: AiConclusion = aiConclusion ?? fallback;
    const sections = [
      { key: "achievements" as const, icon: "✅", label: "Достижения", col: "#34d399" },
      { key: "risks" as const, icon: "⚠️", label: "Риски", col: "#fb7185" },
      { key: "inProgress" as const, icon: "⚙️", label: "В процессе", col: "#fbbf24" },
      { key: "nextSteps" as const, icon: "🎯", label: "Следующие шаги", col: "#a78bfa" },
    ];
    return (
      <div style={slideShellStyle}>
        {sectionH2("Итоги и рекомендации")}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
          {sections.map((s) => (
            <div
              key={s.key}
              style={{
                borderRadius: "22px",
                padding: "24px 22px",
                background: cardColors[0],
                border: `1px solid ${s.col}33`,
                position: "relative",
                overflow: "hidden",
              }}
            >
              <h4
                style={{
                  fontSize: "15px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: ".8px",
                  color: s.col,
                  marginBottom: "14px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <span>{s.icon}</span> {s.label}
              </h4>
              <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "10px", padding: 0, margin: 0 }}>
                {(con[s.key] || []).map((item, i) => (
                  <li
                    key={i}
                    style={{
                      fontSize: "14px",
                      color: theme.isLight ? "rgba(30,41,59,.85)" : "rgba(255,255,255,.82)",
                      paddingLeft: "18px",
                      position: "relative",
                      lineHeight: 1.5,
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        left: 0,
                        top: "8px",
                        width: "7px",
                        height: "7px",
                        borderRadius: "50%",
                        background: s.col,
                        boxShadow: `0 0 6px ${s.col}`,
                        display: "inline-block",
                      }}
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={slideShellStyle}>
      <p style={{ color: mutedColor, textAlign: "center" }}>Неизвестный тип слайда: {slide.type}</p>
    </div>
  );
}

// Экспортируем хелперы — они нужны page.tsx и export-функции.
export { hexToRgb, statusColor, PRIO_COLS };
