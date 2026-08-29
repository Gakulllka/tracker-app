/**
 * Оформление фона презентации: эмодзи, паттерн, градиент.
 *
 * По умолчанию всё выключено — канон дизайн-системы «Графит и бумага»
 * не допускает эмодзи и узоров в отчётных материалах. Пользователь может
 * включить их вручную в настройках презентации.
 */

export interface PresBgSettings {
  emojis: string;
  emojiCount: number;
  emojiMinSize: number;
  emojiMaxSize: number;
  pattern: "none" | "grid" | "diagonal" | "diamond" | "waves" | "zigzag";
  patternSize: number;
  patternOpacity: number;
  styleId: "dark" | "spring" | "ocean" | "night" | "fire" | "minimal";
  /** Phase 5: режим анимации эмодзи. */
  emojiAnim?: "off" | "drift" | "fall";
  /** Phase 5: скорость анимации, 0.25..2 (1 = базовая). */
  emojiSpeed?: number;
  /** Phase 5: прозрачность эмодзи, 5..50 (% числом). Если undefined — рандомная как раньше (для совместимости со старым state). */
  emojiOpacity?: number;
  /** Толщина линий паттерна, px (1..4). */
  patternLineThickness?: number;
}

interface PresStylePreset {
  id: PresBgSettings["styleId"];
  label: string;
  emoji: string;
  desc: string;
  bodyBg: string;
  overlayBg: string;
  cardColors: string[];
  defaultEmojis: string;
  defaultPattern: PresBgSettings["pattern"];
  textColor: string;
  mutedColor: string;
}

const PRES_STYLE_PRESETS: PresStylePreset[] = [
  {
    id: "dark",
    label: "Тёмный",
    emoji: "🌑",
    desc: "Тёмный фон, чёрно-белый",
    bodyBg: "#131418",
    overlayBg: "linear-gradient(160deg,#131418 0%,#1A1B20 100%)",
    cardColors: ["#1e1e22", "#1c1c20", "#1a1a1e"],
    defaultEmojis: "🚀 ✨ 💡 🎯 ⚡ 🎯 💼 📊",
    defaultPattern: "grid",
    textColor: "#F5F5F2",
    mutedColor: "rgba(171,171,165,.55)",
  },
  {
    id: "spring",
    label: "Весна",
    emoji: "🌿",
    desc: "Тёмный фон, чёрно-белый",
    bodyBg: "#131418",
    overlayBg: "linear-gradient(160deg,#131418 0%,#1A1B20 100%)",
    cardColors: ["#1e1e22", "#1c1c20", "#1a1a1e"],
    defaultEmojis: "🚀 ✨ 💡 🎯 ⚡ 🎯 💼 📊",
    defaultPattern: "grid",
    textColor: "#F5F5F2",
    mutedColor: "rgba(171,171,165,.55)",
  },
  {
    id: "ocean",
    label: "Океан",
    emoji: "🌊",
    desc: "Тёмный фон, чёрно-белый",
    bodyBg: "#131418",
    overlayBg: "linear-gradient(160deg,#131418 0%,#1A1B20 100%)",
    cardColors: ["#1e1e22", "#1c1c20", "#1a1a1e"],
    defaultEmojis: "🚀 ✨ 💡 🎯 ⚡ 🎯 💼 📊",
    defaultPattern: "grid",
    textColor: "#F5F5F2",
    mutedColor: "rgba(171,171,165,.55)",
  },
  {
    id: "night",
    label: "Ночь",
    emoji: "🌙",
    desc: "Тёмный фон, чёрно-белый",
    bodyBg: "#131418",
    overlayBg: "linear-gradient(160deg,#131418 0%,#1A1B20 100%)",
    cardColors: ["#1e1e22", "#1c1c20", "#1a1a1e"],
    defaultEmojis: "🚀 ✨ 💡 🎯 ⚡ 🎯 💼 📊",
    defaultPattern: "grid",
    textColor: "#F5F5F2",
    mutedColor: "rgba(171,171,165,.55)",
  },
  {
    id: "fire",
    label: "Огонь",
    emoji: "🔥",
    desc: "Тёмный фон, чёрно-белый",
    bodyBg: "#131418",
    overlayBg: "linear-gradient(160deg,#131418 0%,#1A1B20 100%)",
    cardColors: ["#1e1e22", "#1c1c20", "#1a1a1e"],
    defaultEmojis: "🚀 ✨ 💡 🎯 ⚡ 🎯 💼 📊",
    defaultPattern: "grid",
    textColor: "#F5F5F2",
    mutedColor: "rgba(171,171,165,.55)",
  },
  {
    id: "minimal",
    label: "Минимал",
    emoji: "⬜",
    desc: "Светлый фон, чёрно-белый",
    bodyBg: "#FAFAF8",
    overlayBg: "linear-gradient(160deg,#FAFAF8 0%,#FFFFFF 100%)",
    cardColors: ["#f5f5f5", "#f0f0f0", "#ebebeb"],
    defaultEmojis: "🚀 ✨ 💡 🎯 ⚡ 🎯 💼 📊",
    defaultPattern: "grid",
    textColor: "#17181C",
    mutedColor: "rgba(93,93,87,.7)",
  },
];

export const DEFAULT_PRES_BG: PresBgSettings = {
  // Эмодзи убраны по умолчанию (минимализм Delta). Пользователь может включить в настройках.
  emojis: "",
  emojiCount: 0,
  emojiMinSize: 12,
  emojiMaxSize: 32,
  pattern: "none",
  patternSize: 40,
  patternOpacity: 5,
  styleId: "dark",
  emojiAnim: "off",
  emojiSpeed: 1,
  emojiOpacity: 25,
};
