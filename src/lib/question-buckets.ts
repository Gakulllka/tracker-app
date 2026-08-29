import type { Question, QuestionStatus } from "./questions";

export type QuestionBucket = "waiting" | "reopened" | "answered" | "archived";

export const BUCKET_LABELS: Record<QuestionBucket, string> = {
  waiting: "Ждут ответа",
  reopened: "Возобновлённые",
  answered: "Отвеченные",
  archived: "Архив",
};

/** Порядок корзин: сверху то, что требует действия. */
export const BUCKET_ORDER: QuestionBucket[] = ["waiting", "reopened", "answered", "archived"];

const STATUS_TO_BUCKET: Record<QuestionStatus, QuestionBucket> = {
  open: "waiting",
  reopened: "reopened",
  answered: "answered",
  archived: "archived",
};

export function bucketOf(question: Question): QuestionBucket {
  return STATUS_TO_BUCKET[question.status] ?? "waiting";
}

/**
 * Раскладывает вопросы по корзинам и считает, сколько в каждой.
 *
 * Раньше статус выражался на экране трижды — цветными счётчиками сверху,
 * кнопками фильтра и колонками списка. Одна раскладка вместо трёх.
 */
export function groupQuestions(
  questions: Question[],
): { byBucket: Record<QuestionBucket, Question[]>; counts: Record<QuestionBucket, number> } {
  const byBucket: Record<QuestionBucket, Question[]> = {
    waiting: [],
    reopened: [],
    answered: [],
    archived: [],
  };

  for (const question of questions) {
    byBucket[bucketOf(question)].push(question);
  }

  return {
    byBucket,
    counts: {
      waiting: byBucket.waiting.length,
      reopened: byBucket.reopened.length,
      answered: byBucket.answered.length,
      archived: byBucket.archived.length,
    },
  };
}

export interface WaitingInfo {
  /** Полных суток с момента вопроса. */
  days: number;
  /** «Сегодня», «Ждёт 1 день», «Ждёт 5 дней». */
  label: string;
  /** Ждёт дольше трёх дней — повод обратить внимание. */
  overdue: boolean;
}

/** Правильная форма слова «день» для русского счёта. */
function plural(days: number): string {
  const mod100 = days % 100;
  if (mod100 >= 11 && mod100 <= 14) return "дней";

  switch (days % 10) {
    case 1: return "день";
    case 2:
    case 3:
    case 4: return "дня";
    default: return "дней";
  }
}

/**
 * Сколько вопрос ждёт ответа.
 *
 * Дата «28 авг, 09:41» ничего не говорит без вычислений в уме. Срок
 * ожидания отвечает сразу и подсвечивается, когда становится неприличным —
 * единственное место на вкладке, где цвет уместен.
 */
export function waitingSince(dateStr: string | undefined, now: Date = new Date()): WaitingInfo {
  if (!dateStr) return { days: 0, label: "", overdue: false };

  const asked = new Date(dateStr);
  if (Number.isNaN(asked.getTime())) return { days: 0, label: "", overdue: false };

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.max(0, Math.floor((startOfDay(now) - startOfDay(asked)) / 86_400_000));

  return {
    days,
    label: days === 0 ? "Сегодня" : `Ждёт ${days} ${plural(days)}`,
    overdue: days > 3,
  };
}
