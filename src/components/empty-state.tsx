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

const content: Record<string, { title: string; description: string; actionLabel?: string }> = {
  table: {
    title: "Пока нет задач",
    description: "Создайте первую задачу, чтобы начать работу",
    actionLabel: "Добавить задачу",
  },
  filter: {
    title: "Ничего не найдено",
    description: "Попробуйте изменить фильтры или поисковый запрос",
  },
  backlog: {
    title: "Беклог пуст",
    description: "Переместите задачи из таблицы в беклог",
    actionLabel: "Создать задачу",
  },
  dashboard: {
    title: "Нет данных",
    description: "Добавьте задачи, чтобы увидеть статистику",
  },
  questions: {
    title: "Нет вопросов",
    description: "Задайте первый вопрос",
    actionLabel: "Задать вопрос",
  },
}

export function EmptyState({ type, onAction }: EmptyStateProps) {
  const Icon = icons[type]
  const data = content[type]
  const actionLabel = data.actionLabel

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-muted-foreground/20 py-12 px-4">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/50">
        <Icon className="size-7 text-muted-foreground" />
      </div>
      <div className="text-center">
        <p className="font-semibold text-foreground">{data.title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{data.description}</p>
      </div>
      {onAction && actionLabel && (
        <button
          onClick={onAction}
          className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-[var(--tracker-accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--tracker-accent-hover)]"
        >
          <Plus className="size-4" />
          {actionLabel}
        </button>
      )}
    </div>
  )
}