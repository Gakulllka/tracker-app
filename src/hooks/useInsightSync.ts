import { useEffect, useMemo } from "react";
import { fetchInsight, hashTasks, type AiInsightShape } from "@/lib/ai-insights-client";
import type { Task } from "@/lib/types";

export interface InsightSyncOptions {
  workspaceId: string | null | undefined;
  activeDomainId: string | null | undefined;
  /** Месяц в формате YYYY-MM — ключ, под которым инсайт лежит на сервере. */
  monthKey: string;
  /** Задачи текущего месяца, включая удалённые. */
  monthTasks: Task[];
  /** Инсайт, загруженный ранее (хранится в usePresentation). */
  insight: AiInsightShape | null;
  setInsight: (insight: AiInsightShape | null) => void;
  /** Черновик инсайта — принадлежит конкретному месяцу и домену. */
  setDraft: (draft: null) => void;
  currentDataHash: string;
  setCurrentDataHash: (hash: string) => void;
}

/**
 * Держит AI-инсайт в согласии с тем, что сейчас на экране.
 *
 * Делает две вещи. Первая — при смене домена, месяца или воркспейса тянет
 * с сервера сохранённый инсайт и сбрасывает черновик: черновик относился к
 * прежнему контексту и в новом просто вводил бы в заблуждение.
 *
 * Вторая — считает хеш задач месяца. Инсайт хранит хеш данных, на которых он
 * был построен; расхождение хешей означает, что с момента генерации задачи
 * правили, и в интерфейсе загорается пометка «устарел».
 *
 * Раньше обе эти реакции жили в page.tsx выше по файлу, чем объявление
 * сеттеров, которые они вызывают. Работало это лишь потому, что тела эффектов
 * запускаются после рендера — конструкция хрупкая и запутанная.
 */
export function useInsightSync(options: InsightSyncOptions): { isStale: boolean } {
  const {
    workspaceId, activeDomainId, monthKey, monthTasks,
    insight, setInsight, setDraft, currentDataHash, setCurrentDataHash,
  } = options;

  // Загрузка сохранённого инсайта при смене контекста.
  useEffect(() => {
    if (!workspaceId) return;

    let cancelled = false;
    setDraft(null);

    fetchInsight(workspaceId, activeDomainId ?? "", monthKey)
      .then((loaded) => { if (!cancelled) setInsight(loaded); })
      .catch(() => { if (!cancelled) setInsight(null); });

    return () => { cancelled = true; };
  }, [workspaceId, activeDomainId, monthKey]);

  // Хеш задач месяца — основа для пометки «инсайт устарел».
  useEffect(() => {
    let cancelled = false;

    const rows = monthTasks.filter((t) => !t._deleted && (t.name || t.num));
    if (rows.length === 0) {
      setCurrentDataHash("");
      return;
    }

    hashTasks(rows)
      .then((hash) => { if (!cancelled) setCurrentDataHash(hash); })
      .catch(() => { /* crypto.subtle недоступен — оставляем пустой хеш */ });

    return () => { cancelled = true; };
  }, [monthTasks]);

  const isStale = useMemo(() => {
    if (!insight?.dataHash || !currentDataHash) return false;
    return insight.dataHash !== currentDataHash;
  }, [insight, currentDataHash]);

  return { isStale };
}
