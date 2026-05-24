/**
 * planfix.ts — интеграция с Planfix.
 * Вынесено из page.tsx.
 */

import React from "react";

export const PLANFIX_BASE_URL = "https://emk.planfix.ru/task/";

export function TaskLink({ num }: { num: string }) {
  if (!num) return null;
  return (
    <a
      href={`${PLANFIX_BASE_URL}${num}`}
      target="_blank"
      rel="noreferrer"
      className="ml-1 inline-block text-xs opacity-60 transition-opacity hover:opacity-100"
      title={`Planfix: /task/${num}`}
    >
      🔗
    </a>
  );
}
