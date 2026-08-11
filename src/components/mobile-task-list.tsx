"use client";

/**
 * MobileTaskList — вкладка «Задачи» на телефоне (ТЗ, блок 5).
 *
 * Таблица на девять колонок в горизонтальном скролле на экране 375 px
 * нечитаема: пользователь листает вбок, теряя из виду название задачи.
 * Здесь та же информация подана карточками — вертикально, без
 * горизонтальной прокрутки.
 *
 * Карточка в свёрнутом виде отвечает на главные вопросы: что за задача,
 * в каком статусе, сколько часов и как идёт прогресс. Тап раскрывает
 * остальное — приоритет, накопленный итог, комментарий.
 *
 * Редактирование не встроено в карточку: на телефоне инлайн-правка ячеек
 * промахивается мимо цели. Правка идёт через существующий шит действий
 * (onOpenActions), где элементы управления полноразмерные.
 */

import React, { useState, useCallback } from "react";
import { ChevronDown, MoreVertical } from "lucide-react";
import {
  Task, Status, Priority, PCOL, scolText, CLOSED_STATUSES_UI,
} from "@/lib/types";
import { evalExpr, fmt2, getTaskMetrics, progColor } from "@/lib/metrics";

export interface MobileTaskListProps {
  tasks: Task[];
  /** Накопленный факт по номерам задач — для строки «Итого». */
  totalFactMap?: Record<string, number>;
  /** Порядковый номер задачи в очереди по приоритету. */
  qMap?: Record<string, number>;
  /** Открыть шит действий по задаче. */
  onOpenActions?: (task: Task) => void;
  /** Открыть карточку задачи. */
  onOpenDetail?: (task: Task) => void;
  /** Только просмотр — скрыть кнопку действий. */
  readOnly?: boolean;
}

export function MobileTaskList({
  tasks, totalFactMap, qMap, onOpenActions, onOpenDetail, readOnly,
}: MobileTaskListProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  if (tasks.length === 0) {
    return (
      <p
        className="py-10 text-center text-sm"
        style={{ color: "var(--tracker-text-muted, var(--muted-foreground))" }}
      >
        В этом месяце задач нет.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2 list-none p-0 m-0" aria-label="Задачи месяца">
      {tasks.map(task => (
        <MobileTaskCard
          key={task.id}
          task={task}
          open={expanded.has(task.id)}
          onToggle={toggle}
          totalFactMap={totalFactMap}
          queue={qMap?.[task.id]}
          onOpenActions={onOpenActions}
          onOpenDetail={onOpenDetail}
          readOnly={readOnly}
        />
      ))}
    </ul>
  );
}

const MobileTaskCard = React.memo(function MobileTaskCard({
  task, open, onToggle, totalFactMap, queue, onOpenActions, onOpenDetail, readOnly,
}: {
  task: Task;
  open: boolean;
  onToggle: (id: string) => void;
  totalFactMap?: Record<string, number>;
  queue?: number;
  onOpenActions?: (task: Task) => void;
  onOpenDetail?: (task: Task) => void;
  readOnly?: boolean;
}) {
  const metrics = getTaskMetrics(task, totalFactMap);
  const isClosed = CLOSED_STATUSES_UI.has(task.status as Status);
  const barColor = progColor(metrics.prog, isClosed, metrics.over);
  const statusColor = scolText(task.status as Status);

  return (
    <li
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--tracker-bg-card, var(--card))",
        border: "1px solid var(--tracker-border, var(--border))",
      }}
    >
      <div className="flex items-start gap-2 p-3">
        <button
          onClick={() => onToggle(task.id)}
          className="flex-1 text-left min-w-0"
          aria-expanded={open}
          aria-label={`Задача ${task.num || ""} ${task.name || ""}`}
        >
          {/* Номер, очередь, статус */}
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {task.num && (
              <span
                className="font-mono tabular-nums shrink-0"
                style={{ fontSize: 11, color: "var(--tracker-text-muted, var(--muted-foreground))" }}
              >
                #{task.num}
              </span>
            )}
            {typeof queue === "number" && (
              <span
                className="font-mono tabular-nums shrink-0"
                style={{ fontSize: 11, color: "var(--tracker-text-muted, var(--muted-foreground))" }}
              >
                оч. {queue}
              </span>
            )}
            <span
              className="px-1.5 py-0.5 rounded-full font-medium shrink-0"
              style={{ fontSize: 10.5, color: statusColor, background: statusColor + "1A" }}
            >
              {task.status}
            </span>
          </div>

          {/* Название */}
          <p className="text-[14px] font-medium leading-snug break-words">
            {task.name || "Без названия"}
          </p>

          {/* Часы и прогресс */}
          <div className="flex items-center gap-3 mt-2">
            <span className="tabular-nums shrink-0" style={{ fontSize: 12 }}>
              <span style={{ color: "var(--tracker-text-muted, var(--muted-foreground))" }}>план </span>
              <b>{fmt2(metrics.plan)}</b>
              <span style={{ color: "var(--tracker-text-muted, var(--muted-foreground))" }}> · факт </span>
              <b>{fmt2(metrics.fact)}</b>
            </span>
            <span
              className="flex-1 h-1.5 rounded-full overflow-hidden"
              style={{ background: "var(--tracker-border, var(--border))" }}
              aria-hidden
            >
              <span
                className="block h-full rounded-full"
                style={{ width: `${Math.min(100, metrics.prog)}%`, background: barColor }}
              />
            </span>
            <span
              className="tabular-nums font-semibold shrink-0"
              style={{ fontSize: 11, color: barColor }}
            >
              {metrics.prog}%
            </span>
          </div>
        </button>

        <div className="flex flex-col items-center gap-1 shrink-0">
          {!readOnly && onOpenActions && (
            <button
              onClick={() => onOpenActions(task)}
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ color: "var(--tracker-text-muted, var(--muted-foreground))" }}
              aria-label="Действия с задачей"
            >
              <MoreVertical className="size-4" />
            </button>
          )}
          <button
            onClick={() => onToggle(task.id)}
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ color: "var(--tracker-text-muted, var(--muted-foreground))" }}
            aria-label={open ? "Свернуть" : "Развернуть"}
          >
            <ChevronDown
              className="size-4 transition-transform"
              style={{
                transform: open ? "rotate(180deg)" : "none",
                transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            />
          </button>
        </div>
      </div>

      {open && (
        <div
          className="px-3 pb-3 pt-0 flex flex-col gap-2"
          style={{ borderTop: "1px solid var(--tracker-border, var(--border))" }}
        >
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 mt-3 m-0">
            <Field label="Приоритет">
              <span style={{ color: PCOL[task.priority as Priority] }} className="font-medium">
                {task.priority}
              </span>
            </Field>
            <Field label="Итого, ч">
              <span className="tabular-nums font-semibold">{fmt2(metrics.totalH)}</span>
              {metrics.over && (
                <span className="ml-1.5" style={{ fontSize: 11, color: "#C6453F" }}>
                  +{fmt2(metrics.variance)}
                </span>
              )}
            </Field>
            {evalExpr(task.planH) > 0 && (
              <Field label="Остаток, ч">
                <span className="tabular-nums">
                  {fmt2(Math.max(0, metrics.plan - metrics.totalH))}
                </span>
              </Field>
            )}
            {task.daysInStatus != null && (
              <Field label="В статусе">
                <span className="tabular-nums">{task.daysInStatus} дн</span>
              </Field>
            )}
          </dl>

          {task.comment && (
            <p
              className="text-[12.5px] leading-snug break-words m-0"
              style={{ color: "var(--tracker-text-muted, var(--muted-foreground))" }}
            >
              {task.comment}
            </p>
          )}

          {onOpenDetail && (
            <button
              onClick={() => onOpenDetail(task)}
              className="self-start px-3 py-1.5 rounded-lg text-[12px] font-semibold"
              style={{
                border: "1px solid var(--tracker-border, var(--border))",
                color: "var(--tracker-text, var(--foreground))",
              }}
            >
              Открыть карточку
            </button>
          )}
        </div>
      )}
    </li>
  );
});

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col leading-tight">
      <dt
        className="font-mono uppercase"
        style={{
          fontSize: 9.5,
          letterSpacing: "0.14em",
          color: "var(--tracker-text-muted, var(--muted-foreground))",
        }}
      >
        {label}
      </dt>
      <dd className="text-[13px] m-0">{children}</dd>
    </div>
  );
}
