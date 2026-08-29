import type { Task } from "./types";
import { scolText } from "./tokens";
import type { PresBgSettings } from "./presentation-bg";
import { LIGHT, DARK } from "./tokens";

/* Презентация уходит в файл и не имеет доступа к CSS-переменным,
   поэтому семантика состояния здесь задана значениями. */
const LIGHT_STATE = { success: "#3F9E6E", danger: "#C6453F", warning: "#C08A2D" } as const;
const DARK_STATE = { success: "#5FBE8E", danger: "#E0706A", warning: "#D9A84E" } as const;
import { INK } from "./tokens";

/**
 * Тема презентации: цвета, шрифты и производные от акцента значения.
 *
 * Отделено от рендерера слайдов, потому что тем пользуются и предпросмотр
 * в приложении, и выгрузка в самостоятельный HTML-файл.
 *
 * Палитра статусов берётся из lib/tokens.ts — та же, что в основном
 * интерфейсе, и та же, что в Planfix. Раньше здесь был свой набор из
 * шестнадцати произвольных оттенков, и презентация выглядела чужой.
 */


export interface PresentationTheme {
  INK: string;
  rgb: [number, number, number];
  bodyBg: string;
  overlayBg: string;
  textColor: string;
  mutedColor: string;
  /** Семантика состояния — каноничные цвета ДНК, подобранные под светлоту. */
  successColor: string;
  dangerColor: string;
  warningColor: string;
  isLight: boolean;
  bg: PresBgSettings;
}

/* ================================================================ *
 *  Helpers                                                         *
 * ================================================================ */

export function hexToRgb(hex: string): [number, number, number] {
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
  bg: PresBgSettings,
  tokens?: TrackerThemeTokens,
  isDarkOverride?: boolean,
): PresentationTheme {
  let resolved: TrackerThemeTokens;
  if (tokens) {
    resolved = tokens;
  } else if (isDarkOverride !== undefined) {
    const synth = isDarkOverride ? DARK : LIGHT;
    resolved = {
      bgMain: synth.bg,
      bgCard: synth.card,
      textMain: synth.text,
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

  // Чёрно-белая тема: акцент — белый на тёмном фоне, чёрный на светлом
  const bwAccent = resolved.isDark ? "#F5F5F2" : "#17181C";
  const rgb = hexToRgb(bwAccent);

  const overlayBg = resolved.isDark ? "linear-gradient(160deg,#131418 0%,#1A1B20 100%)" : "linear-gradient(160deg,#FAFAF8 0%,#FFFFFF 100%)";

  // Манга-стиль: без серых полутонов. Свет — чистая бумага #FFFFFF,
  // тьма — графит #17181C (не серый). Карты отличаются рамкой, не тоном.

  // muted — полутон чернил (не серый оттенок): 55% чернил на бумаге /
  // 60% бумаги на графите.
  const mutedColor = resolved.isDark ? "rgba(245,245,242,0.60)" : "rgba(23,24,28,0.55)";

  return {
    INK: bwAccent,
    rgb, bodyBg: resolved.bgMain, overlayBg,
    textColor: resolved.textMain, mutedColor,
    isLight: !resolved.isDark, bg,
    // Каноничные цвета ДНК: на светлом — приглушённые, на тёмном — светлее,
    // иначе на графите они теряются. Раньше здесь стояли #22c55e и #ef4444
    // из палитры Tailwind, и слайд выглядел ярче самого трекера.
    successColor: resolved.isDark ? DARK_STATE.success : LIGHT_STATE.success,
    dangerColor: resolved.isDark ? DARK_STATE.danger : LIGHT_STATE.danger,
    warningColor: resolved.isDark ? DARK_STATE.warning : LIGHT_STATE.warning,
  };
}

export function isHexDark(color: string): boolean {
  const hex = color.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return true;
  const [r, g, b] = hexToRgb(hex);
  return ((0.299 * r + 0.587 * g + 0.114 * b) / 255) < 0.5;
}

/**
 * Цвет статуса на слайде — та же палитра, что в трекере и в Planfix.
 * Запасной вариант — акцент темы, чтобы неизвестный статус не пропал.
 */
export function statusColor(status: string, theme: PresentationTheme): string {
  return (
    scolText(status as Task["status"], theme.isLight === false) ||
    `rgba(${theme.rgb[0]},${theme.rgb[1]},${theme.rgb[2]},.8)`
  );
}

/* ================================================================ *
 *  Шрифт Geist + background layer                                  *
 * ================================================================ */

// Geist + Geist Mono загружаются глобально в layout.tsx (next/font/google).
// Для standalone-экспорта HTML подключаем Geist с Google Fonts.
export const FONT_FAMILY = "'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
export const FONT_MONO = "'Geist Mono', ui-monospace, 'SF Mono', Menlo, monospace";

export const FONT_STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800;900&family=Geist+Mono:wght@400;500;600;700&display=swap');
`;
