"use client";

/**
 * DomainSummary — одна строка над таблицей, отвечающая на вопрос
 * «что происходит с доменом» без чтения самой таблицы.
 *
 * Зачем. Человек, впервые открывший домен, раньше собирал картину по
 * крупицам: часть чисел в подвале таблицы, часть — считая строки глазами.
 * Здесь всё сразу: сколько задач, как они распределены по фазам, сколько
 * часов запланировано, отработано и осталось свободными.
 *
 * Цвет по ДНК: по умолчанию монохром, цвет появляется только когда есть
 * что сообщить — перерасход лимита месяца.
 */

import React, { useMemo } from "react";
import { Task, Status, getPhaseForStatus, PHASE_COLORS } from "@/lib/types";
import { evalExpr, fmt2, R2, CLOSED_STATUSES } from "@/lib/metrics";

export interface DomainSummaryProps {
  /** Задачи текущего месяца (уже отфильтрованные от удалённых). */
  tasks: Task[];
  /** Лимит часов месяца для домена. */
  monthCapacity: number;
  /** Накопленный факт по номерам задач — для «отработано всего». */
  totalFactMap?: Record<string, number>;
}

interface PhaseStat {
  key: "new" | "in_progress" | "done" | "cancel";
  label: string;
  count: number;
}

const PHASE_LABELS: Record<PhaseStat["key"], string> = {
  new: "Не начаты",
  in_progress: "В работе",
  done: "Закрыты",
  cancel: "Отложены",
};

export function DomainSummary({ tasks, monthCapacity, totalFactMap }: DomainSummaryProps) {
  const stat = useMemo(() => {
    const live = tasks.filter(t => !t._deleted && (t.name || t.num));

    let plan = 0;
    let fact = 0;
    const byPhase: Record<PhaseStat["key"], number> = {
      new: 0, in_progress: 0, done: 0, cancel: 0,
    };

    for (const t of live) {
      plan += evalExpr(t.planH);
      fact += evalExpr(t.factH);
      byPhase[getPhaseForStatus(t.status as Status)] += 1;
    }

    // «Отработано всего» — накопительно по номерам, а не факт месяца:
    // задача живёт дольше одного месяца, и важен её полный след.
    let cumulative = 0;
    if (totalFactMap) {
      const seen = new Set<string>();
      for (const t of live) {
        if (!t.num || seen.has(t.num)) continue;
        seen.add(t.num);
        cumulative += totalFactMap[t.num] || 0;
      }
    }

    const free = R2(monthCapacity - plan);
    const closed = live.filter(t => CLOSED_STATUSES.has(t.status as Status)).length;

    return {
      total: live.length,
      closed,
      plan: R2(plan),
      fact: R2(fact),
      cumulative: R2(cumulative),
      free,
      over: free < 0,
      phases: (Object.keys(byPhase) as PhaseStat["key"][])
        .map(key => ({ key, label: PHASE_LABELS[key], count: byPhase[key] }))
        .filter(p => p.count > 0),
    };
  }, [tasks, monthCapacity, totalFactMap]);

  if (stat.total === 0) return null;

  return (
    <div
      className="flex items-center gap-x-6 gap-y-2 flex-wrap px-4 py-2.5 rounded-xl"
      style={{
        background: "var(--tracker-bg-card, var(--card))",
        border: "1px solid var(--tracker-border, var(--border))",
      }}
      aria-label="Сводка домена за месяц"
    >
      <Metric label="Задач" value={String(stat.total)} hint={`закрыто ${stat.closed}`} />

      <Divider />

      <Metric label="План месяца" value={`${fmt2(stat.plan)} ч`} />
      <Metric label="Факт месяца" value={`${fmt2(stat.fact)} ч`} />
      {stat.cumulative > 0 && (
        <Metric label="Отработано всего" value={`${fmt2(stat.cumulative)} ч`} />
      )}

      <Metric
        label={stat.over ? "Перерасход" : "Свободно"}
        value={`${fmt2(Math.abs(stat.free))} ч`}
        // Единственное место, где появляется цвет: лимит месяца превышен.
        tone={stat.over ? "danger" : undefined}
      />

      {stat.phases.length > 0 && (
        <>
          <Divider />
          <div className="flex items-center gap-3 flex-wrap">
            {stat.phases.map(p => (
              <span key={p.key} className="flex items-center gap-1.5 text-xs">
                <span
                  className="inline-block w-2 h-2 rounded-full shrink-0"
                  style={{ background: PHASE_COLORS[p.key] }}
                  aria-hidden
                />
                <span style={{ color: "var(--tracker-text-muted, var(--muted-foreground))" }}>
                  {p.label}
                </span>
                <span className="font-semibold tabular-nums">{p.count}</span>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Metric({
  label, value, hint, tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "danger";
}) {
  return (
    <div className="flex flex-col leading-tight">
      <span
        className="font-mono uppercase"
        style={{
          fontSize: 10,
          letterSpacing: "0.14em",
          color: "var(--tracker-text-muted, var(--muted-foreground))",
        }}
      >
        {label}
      </span>
      <span
        className="text-sm font-semibold tabular-nums"
        style={tone === "danger" ? { color: "#C6453F" } : undefined}
      >
        {value}
        {hint && (
          <span
            className="ml-1.5 font-normal"
            style={{ fontSize: 11, color: "var(--tracker-text-muted, var(--muted-foreground))" }}
          >
            {hint}
          </span>
        )}
      </span>
    </div>
  );
}

function Divider() {
  return (
    <span
      className="hidden sm:block self-stretch w-px shrink-0"
      style={{ background: "var(--tracker-border, var(--border))" }}
      aria-hidden
    />
  );
}
