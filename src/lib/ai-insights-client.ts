/* ================================================================ *
 *  AI Insights client helper (Phase 4)                             *
 * ================================================================ *
 *
 *  Тонкая обёртка над /api/insights + хеширование задач для
 *  детекции «данные изменились с момента генерации».
 *
 *  Хеш: SHA-256 от стабильно-сериализованных task-ов. Включает поля,
 *  которые влияют на содержание AI-выводов: num, name, status, planH,
 *  factH, priority. id и _ts намеренно НЕ включаются — они не влияют
 *  на смысл задачи.
 */

import type { Task } from "./types";

export interface AiInsightShape {
  achievements: string[];
  risks: string[];
  inProgress: string[];
  summary: string[];
  dataHash?: string;
  source?: "ai" | "manual" | "edited";
  updatedAt?: string;
}

/** Поля задачи, попадающие в хеш. Если какое-то из этих полей изменилось,
 *  хеш изменится, и инсайт будет помечен как stale. */
const HASH_FIELDS: (keyof Task)[] = ["num", "name", "status", "planH", "factH", "priority"];

/** Стабильная сериализация задач: сортировка по num+id, потом JSON.stringify
 *  только нужных полей. Гарантирует одинаковый хеш для одинакового набора. */
function stableSerialize(tasks: Task[]): string {
  const cleaned = tasks
    .filter((t) => !t._deleted && (t.name || t.num))
    .map((t) => {
      const out: Record<string, unknown> = {};
      for (const f of HASH_FIELDS) out[f as string] = (t as unknown as Record<string, unknown>)[f as string] ?? "";
      return out;
    })
    .sort((a, b) => {
      const an = String(a.num || "");
      const bn = String(b.num || "");
      if (an !== bn) return an < bn ? -1 : 1;
      return 0;
    });
  return JSON.stringify(cleaned);
}

/** SHA-256 hex от строки. Использует Web Crypto API (доступен в браузерах
 *  и в Next.js Edge runtime). */
export async function hashTasks(tasks: Task[]): Promise<string> {
  const text = stableSerialize(tasks);
  const buf = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/* ─────────────────────────── API calls ─────────────────────────── */

export async function fetchInsight(
  workspaceId: string,
  domainId: string,
  monthKey: string,
): Promise<AiInsightShape | null> {
  const url = `/api/insights?workspaceId=${encodeURIComponent(workspaceId)}&domainId=${encodeURIComponent(domainId)}&monthKey=${encodeURIComponent(monthKey)}`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Failed to fetch insight: ${res.status}`);
  }
  const data = await res.json();
  return (data.insight as AiInsightShape | null) ?? null;
}

export async function saveInsight(
  workspaceId: string,
  domainId: string,
  monthKey: string,
  payload: {
    achievements: string[];
    risks: string[];
    inProgress: string[];
    summary: string[];
    dataHash: string;
    source: "ai" | "manual" | "edited";
  },
): Promise<AiInsightShape> {
  const res = await fetch("/api/insights", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceId,
      domainId,
      monthKey,
      ...payload,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to save insight: ${res.status}`);
  }
  const data = await res.json();
  return data.insight as AiInsightShape;
}

export async function deleteInsight(
  workspaceId: string,
  domainId: string,
  monthKey: string,
): Promise<void> {
  const url = `/api/insights?workspaceId=${encodeURIComponent(workspaceId)}&domainId=${encodeURIComponent(domainId)}&monthKey=${encodeURIComponent(monthKey)}`;
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to delete insight: ${res.status}`);
  }
}
