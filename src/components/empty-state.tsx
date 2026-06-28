"use client"

import { Plus, Filter, Package, BarChart3, MessageCircleQuestion } from "lucide-react"

interface EmptyStateProps {
  type: "table" | "filter" | "backlog" | "dashboard" | "questions"
  onAction?: () => void
}

const icons = {
  table: Plus,
  filter: Filter,
  backlog: Package,
  dashboard: BarChart3,
  questions: MessageCircleQuestion,
}

const content: Record<string, { title: string; description: string; tip?: string; actionLabel?: string }> = {
  table: {
    title: "Пока нет задач",
    description: "Создайте первую задачу, чтобы начать работу",
    tip: "Ctrl+N для быстрого создания",
    actionLabel: "Добавить задачу",
  },
  filter: {
    title: "Ничего не найдено",
    description: "Попробуйте изменить фильтры или поисковый запрос",
    tip: "Сбросьте фильтры для отображения всех задач",
  },
  backlog: {
    title: "Беклог пуст",
    description: "Переместите задачи из таблицы в беклог или создайте новую",
    tip: "Задачи из беклога легко перенести в текущий месяц",
    actionLabel: "Создать задачу",
  },
  dashboard: {
    title: "Нет данных для анализа",
    description: "Добавьте задачи в таблицу, чтобы увидеть статистику",
    tip: "Дашборд покажет здоровье проекта и риски",
  },
  questions: {
    title: "Нет вопросов",
    description: "Задайте первый вопрос команде",
    tip: "Вопросы помогают синхронизировать команду",
    actionLabel: "Задать вопрос",
  },
}

export function EmptyState({ type, onAction }: EmptyStateProps) {
  const Icon = icons[type]
  const data = content[type]
  const actionLabel = data.actionLabel

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-muted-foreground/20 py-16 px-6 animate-fade-in">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--tracker-accent-bg)] animate-scale-in">
        <Icon className="size-8 text-[var(--tracker-accent)]" />
      </div>
      <div className="text-center space-y-1">
        <p className="font-semibold text-foreground text-lg">{data.title}</p>
        <p className="text-sm text-muted-foreground max-w-xs">{data.description}</p>
        {data.tip && (
          <p className="text-xs text-muted-foreground/70 mt-2 flex items-center justify-center gap-1">
            <span className="inline-block w-1 h-1 rounded-full bg-[var(--tracker-accent)]" />
            {data.tip}
          </p>
        )}
      </div>
      {onAction && actionLabel && (
        <button
          onClick={onAction}
          className="mt-2 inline-flex items-center gap-2 rounded-xl bg-[var(--tracker-accent)] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[var(--tracker-accent-hover)] hover:shadow-lg active:scale-95"
        >
          <Plus className="size-4" />
          {actionLabel}
        </button>
      )}
    </div>
  )
}
