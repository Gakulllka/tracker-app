/**
 * questions.ts — типы и утилиты для системы вопросов/ответов.
 * Вынесено из page.tsx.
 */

export interface QuestionAnswer {
  id: string;
  author: string;
  text: string;
  date: string;
}

export type QuestionStatus = "open" | "reopened" | "answered" | "archived";

export interface Question {
  id: string;
  text: string;
  author: string;
  answers: QuestionAnswer[];
  status: QuestionStatus;
  questionDate?: string;
  answerDate?: string;
  linkedTaskId?: string;
  linkedTaskName?: string;
  /** Домен, к которому относится вопрос (null/undefined = общий). */
  domainId?: string | null;
}

type APIQuestion = {
  id: string;
  text: string;
  author: string;
  answers?: QuestionAnswer[];
  answer?: string;
  status?: string;
  questionDate?: string;
  answerDate?: string;
  linkedTaskId?: string;
  linkedTaskName?: string;
  domainId?: string | null;
};

/**
 * Нормализует объект вопроса из API — поддерживает как новый формат
 * (массив answers), так и устаревший (строка answer).
 */
export function mapQuestionFromAPI(q: APIQuestion): Question {
  let answers: QuestionAnswer[] = [];
  if (q.answers && Array.isArray(q.answers)) {
    answers = q.answers;
  } else if (q.answer) {
    try {
      const parsed = JSON.parse(q.answer);
      if (Array.isArray(parsed)) {
        answers = parsed;
      } else if (typeof parsed === "string" && parsed.trim()) {
        answers = [{ id: "legacy", author: "Аноним", text: parsed, date: q.questionDate || new Date().toISOString() }];
      }
    } catch {
      if (q.answer.trim()) {
        answers = [{ id: "legacy", author: "Аноним", text: q.answer, date: q.questionDate || new Date().toISOString() }];
      }
    }
  }
  return {
    id: q.id,
    text: q.text,
    author: q.author || "Аноним",
    answers,
    status: (q.status as QuestionStatus) || "open",
    questionDate: q.questionDate,
    answerDate: q.answerDate,
    linkedTaskId: q.linkedTaskId || undefined,
    linkedTaskName: q.linkedTaskName || undefined,
    domainId: q.domainId ?? null,
  };
}

/** Форматирует ISO-дату в читаемый вид */
export function fmtDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
