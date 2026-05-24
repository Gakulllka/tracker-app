/**
 * theme.ts — утилиты для генерации и применения цветовой темы.
 * Вынесено из page.tsx для переиспользования в компонентах.
 */

export interface ThemeColors {
  accent: string;
  accentSoft: string;
  accentBg: string;
  accentFgDark: string;
  bgMain: string;
  bgCard: string;
  textMain: string;
  textMuted: string;
  border: string;
  danger: string;
}

export function hexToRgb(hex: string): [number, number, number] {
  const cleaned = hex.replace("#", "");
  return [
    parseInt(cleaned.substring(0, 2), 16),
    parseInt(cleaned.substring(2, 4), 16),
    parseInt(cleaned.substring(4, 6), 16),
  ];
}

export function hex2hsl(hex: string): [number, number, number] {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0, s = 0;
  const l = (mx + mn) / 2;
  if (d > 0) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) * 60
      : mx === g ? ((b - r) / d + 2) * 60
      : ((r - g) / d + 4) * 60;
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}

export function hsl2hex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60)       { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else              { r = c; b = x; }
  const f = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${f(r)}${f(g)}${f(b)}`;
}

export function createTheme(baseHex: string, isDark = false): ThemeColors {
  const [h, s] = hex2hsl(baseHex);
  const sat = Math.min(s, 48);
  const acSat = isDark ? Math.min(s, 65) : Math.min(s, 56);
  const hx = (sm: number, l: number) => hsl2hex(h, sat * sm, l);
  const ac = hsl2hex(h, acSat, isDark ? 68 : 58);
  return {
    accent: ac,
    accentSoft: ac + "1c",
    accentBg: hsl2hex(h, isDark ? 24 : 20, isDark ? 19 : 95.5),
    accentFgDark: hsl2hex(h, isDark ? 38 : 46, isDark ? 82 : 32),
    bgMain: hx(isDark ? 0.42 : 0.50, isDark ? 10 : 97),
    bgCard: hx(isDark ? 0.28 : 0.30, isDark ? 15 : 99.5),
    textMain: hx(isDark ? 0.15 : 0.32, isDark ? 90 : 12),
    textMuted: hx(isDark ? 0.20 : 0.26, isDark ? 44 : 52),
    border: hx(isDark ? 0.28 : 0.38, isDark ? 20 : 90),
    danger: hsl2hex(350, isDark ? 50 : 52, isDark ? 68 : 52),
  };
}

export function applyTheme(th: ThemeColors): void {
  const root = document.documentElement;
  const s = root.style;
  s.setProperty("--tracker-accent", th.accent);
  s.setProperty("--tracker-accent-soft", th.accentSoft);
  s.setProperty("--tracker-bg-main", th.bgMain);
  s.setProperty("--tracker-bg-card", th.bgCard);
  s.setProperty("--tracker-text-main", th.textMain);
  s.setProperty("--tracker-text-muted", th.textMuted);
  s.setProperty("--tracker-border", th.border);
  s.setProperty("--tracker-danger", th.danger);
  const [r, g, b] = hexToRgb(th.accent);
  s.setProperty("--tracker-accent-hover", `rgba(${r}, ${g}, ${b}, 0.22)`);
  s.setProperty("--tracker-accent-fg", th.accent);
  s.setProperty("--tracker-accent-bg", th.accentBg);
  s.setProperty("--tracker-accent-fg-dark", th.accentFgDark);
  s.setProperty("--background", th.bgMain);
  s.setProperty("--foreground", th.textMain);
  s.setProperty("--card", th.bgCard);
  s.setProperty("--card-foreground", th.textMain);
  s.setProperty("--popover", th.bgCard);
  s.setProperty("--popover-foreground", th.textMain);
  s.setProperty("--primary", th.accent);
  s.setProperty("--primary-foreground", "#ffffff");
  s.setProperty("--secondary", th.bgMain);
  s.setProperty("--secondary-foreground", th.textMain);
  s.setProperty("--muted", th.bgMain);
  s.setProperty("--muted-foreground", th.textMuted);
  s.setProperty("--accent", th.accentSoft);
  s.setProperty("--accent-foreground", th.accent);
  s.setProperty("--destructive", th.danger);
  s.setProperty("--destructive-foreground", "#ffffff");
  s.setProperty("--border", th.border);
  s.setProperty("--input", th.border);
  s.setProperty("--ring", th.accent);
  document.body.style.background = th.bgMain;
  document.body.style.color = th.textMain;
  document.body.style.transition = "background 0.3s, color 0.3s";
}

/** Набор палитрных цветов для picker-а */
export const PALETTE_COLORS = [
  { hex: "#5B9BD5", label: "Небо",    icon: "🌤" },
  { hex: "#4DB6AC", label: "Бирюза",  icon: "🧊" },
  { hex: "#4FC3F7", label: "Океан",   icon: "🌊" },
  { hex: "#66BB6A", label: "Трава",   icon: "🌿" },
  { hex: "#9CCC65", label: "Мята",    icon: "🍃" },
  { hex: "#D4A017", label: "Мёд",     icon: "🌟" },
  { hex: "#E8813A", label: "Закат",   icon: "🌅" },
  { hex: "#E86B6B", label: "Коралл",  icon: "🪸" },
  { hex: "#E07BAD", label: "Фуксия",  icon: "🌸" },
  { hex: "#9B72CF", label: "Сирень",  icon: "💜" },
  { hex: "#7986CB", label: "Лаванда", icon: "🔮" },
  { hex: "#C49A6C", label: "Песок",   icon: "🏜" },
] as const;

export const NEUTRAL_COLORS = [
  { hex: "#6B7280", label: "Серый",        icon: "🩶" },
  { hex: "#374151", label: "Тёмный серый", icon: "⚫" },
  { hex: "#9CA3AF", label: "Серебро",      icon: "⚪" },
] as const;

/** Именованные темы для picker-а */
export const NAMED_THEMES = [
  { hex: "#9B72CF", label: "Лаванда",  desc: "Мягкий фиолетовый",       emoji: "🪻" },
  { hex: "#5B9BD5", label: "Небо",     desc: "Спокойный синий",          emoji: "🌤" },
  { hex: "#4DB6AC", label: "Нефрит",   desc: "Холодная бирюза",          emoji: "🌿" },
  { hex: "#4FC3F7", label: "Океан",    desc: "Яркий голубой",            emoji: "🌊" },
  { hex: "#66BB6A", label: "Трава",    desc: "Свежий зелёный",           emoji: "🍃" },
  { hex: "#9CCC65", label: "Мята",     desc: "Светло-зелёный",           emoji: "🍀" },
  { hex: "#D4A017", label: "Янтарь",   desc: "Тёплый золотистый",        emoji: "🌟" },
  { hex: "#E8813A", label: "Закат",    desc: "Живой оранжевый",          emoji: "🌅" },
  { hex: "#E86B6B", label: "Коралл",   desc: "Тёплый красный",           emoji: "🪸" },
  { hex: "#E07BAD", label: "Пион",     desc: "Нежно-розовый",            emoji: "🌸" },
  { hex: "#7986CB", label: "Индиго",   desc: "Глубокий синий",           emoji: "💠" },
  { hex: "#C49A6C", label: "Дюна",     desc: "Тёплый бежевый",           emoji: "🏜" },
  { hex: "#6B7280", label: "Графит",   desc: "Нейтральный серый",        emoji: "🩶" },
  { hex: "#0F766E", label: "Малахит",  desc: "Насыщенный тёмно-зелёный", emoji: "💚" },
  { hex: "#7C3AED", label: "Аметист",  desc: "Глубокий фиолетовый",      emoji: "🔮" },
  { hex: "#DB2777", label: "Рубин",    desc: "Яркий малиновый",          emoji: "💎" },
] as const;

/** Маппинг цвета темы → пресет презентации */
export const THEME_TO_PRES: Record<string, { emojis: string; pattern: "none"|"grid"|"diagonal"|"diamond"|"waves"|"zigzag"; emojiAnim: "off"|"drift"|"fall" }> = {
  "#9B72CF": { emojis: "🌙 ⭐ ✨ 🔮 💫",  pattern: "diamond",  emojiAnim: "drift" },
  "#5B9BD5": { emojis: "🚀 ✨ 💡 🎯 🌐",  pattern: "grid",     emojiAnim: "drift" },
  "#4DB6AC": { emojis: "🌿 🍃 🌱 🌸 🍀",  pattern: "grid",     emojiAnim: "fall"  },
  "#4FC3F7": { emojis: "🌊 💧 🐬 ⛵ 🐟",  pattern: "waves",    emojiAnim: "drift" },
  "#66BB6A": { emojis: "🍃 🌱 🌳 🍀 🌲",  pattern: "grid",     emojiAnim: "fall"  },
  "#9CCC65": { emojis: "🍀 🌿 🌻 🎋 🌱",  pattern: "diagonal", emojiAnim: "fall"  },
  "#D4A017": { emojis: "🌟 ⭐ ✨ 💫 🌠",  pattern: "diamond",  emojiAnim: "drift" },
  "#E8813A": { emojis: "🔥 ⚡ 💥 🎯 🏆",  pattern: "zigzag",   emojiAnim: "drift" },
  "#E86B6B": { emojis: "🔥 ❤️ 🌹 💥 🌋",  pattern: "zigzag",   emojiAnim: "drift" },
  "#E07BAD": { emojis: "🌸 🌺 🌷 💐 🦋",  pattern: "diagonal", emojiAnim: "fall"  },
  "#7986CB": { emojis: "💠 🌊 ⚡ 🌀 🔷",  pattern: "waves",    emojiAnim: "drift" },
  "#C49A6C": { emojis: "📊 📈 🎯 💡 ✅",  pattern: "none",     emojiAnim: "off"   },
  "#6B7280": { emojis: "📊 📈 🎯 💡 ✅",  pattern: "none",     emojiAnim: "off"   },
  "#0F766E": { emojis: "🌿 🌱 🌳 🍃 💚",  pattern: "grid",     emojiAnim: "fall"  },
  "#7C3AED": { emojis: "🔮 ✨ 💜 🌙 ⭐",  pattern: "diamond",  emojiAnim: "drift" },
  "#DB2777": { emojis: "💎 🌺 🌸 💗 ✨",  pattern: "diagonal", emojiAnim: "fall"  },
};

/** Категории эмодзи для пикера */
export const EMOJI_CATS = [
  { name: "Бизнес",   items: "📊 📈 📉 💼 🏆 🎯 💡 🚀 ⚡ 💎 🔑 📋 ✅ 📌 🔔" },
  { name: "Природа",  items: "🌿 🍃 🍀 🌱 🌸 🌺 🌷 🦋 🌻 🌼 🍂 🍁 🌴 🌵 🪴" },
  { name: "Погода",   items: "☀️ 🌤 ☁️ 🌧 ⛈ 🌈 ❄️ ⛄ 🌨 💧 🔥 🌊 💨 🌙 ⭐" },
  { name: "Еда",      items: "🍯 🍉 🍇 🍓 🍒 🍵 🧊 🍕 🎂 🧁 🍩 🍫 🥤 🍷 🥂" },
  { name: "Животные", items: "🦊 🦎 🐠 🐚 🦩 🐝 🦄 🐪 🦋 🐬 🦜 🐾 🦁 🐧 🐌" },
  { name: "Праздник", items: "🎄 🎁 ⭐ 🔔 🎀 🎊 🎉 🎈 🪅 🧧 🎃 🕯 🧨 🎆 🎇" },
  { name: "Символы",  items: "✨ 💜 💙 💚 💛 🧡 ❤️ 🤍 🖤 🔮 💠 🔷 🔶 ♦️ ☯️" },
];
