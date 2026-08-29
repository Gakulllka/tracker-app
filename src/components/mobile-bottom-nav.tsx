import React from "react";
import { LayoutGrid, Package, HelpCircle, Presentation, FileText } from "lucide-react";

export type MobileNavTab = "table" | "backlog" | "questions" | "slides" | "protocols";

export interface MobileBottomNavProps {
  view: string;
  setView: (view: MobileNavTab) => void;
  /** Вкладки, разрешённые текущему пользователю. undefined — разрешены все. */
  allowedTabs?: Set<string>;
  /** Виден ли раздел вопросов: у части ролей его нет. */
  canSeeQuestions: boolean;
}

/**
 * Нижняя навигация для телефона.
 *
 * Дашборд сюда не добавлен сознательно — инструмент не используется.
 * Админ-панель и «Дизайн» на мобильном пока недоступны.
 */
export function MobileBottomNav({
  view,
  setView,
  allowedTabs,
  canSeeQuestions,
}: MobileBottomNavProps) {
  return (
<nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 mobile-bottom-nav" role="navigation" aria-label="Мобильная навигация">
  <div className="flex items-stretch" role="tablist" aria-label="Вкладки приложения">
    {(
      [
        { key: "table",     icon: LayoutGrid,    label: "Задачи" },
        { key: "backlog",   icon: Package,       label: "Беклог" },
        ...(canSeeQuestions ? [{ key: "questions" as const, icon: HelpCircle, label: "Вопросы" }] : []),
        { key: "slides",    icon: Presentation,  label: "Слайды" },
        { key: "protocols", icon: FileText,      label: "Протоколы" },
      ] as const
    )
      .filter((tab) => !allowedTabs || allowedTabs.has(tab.key))
      .map((tab) => {
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={view === tab.key}
            aria-label={tab.label}
            onClick={() => setView(tab.key)}
            className={`mobile-bottom-nav-item ${view === tab.key ? "active" : ""}`}
          >
            <span className="mobile-bottom-nav-icon"><tab.icon className="size-[18px]" /></span>
            <span className="mobile-bottom-nav-label">{tab.label}</span>
          </button>
        );
      })}
  </div>
</nav>
  );
}
