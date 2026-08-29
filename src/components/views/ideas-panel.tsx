import React, { useState } from "react";
import { ChevronDown, Lightbulb, Package, Play, Ruler, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TaskContextMenu } from "@/components/task-context-menu";
import { getTaskMetrics, fmt2, progColor, CLOSED_STATUSES } from "@/lib/metrics";
import { useTaskStore } from "@/lib/store";
import {
  PCOL, PRIORITIES, STATUSES, PHASE_COLORS, getPhaseForStatus, scolText,
} from "@/lib/types";
import type { Task, Status } from "@/lib/types";

export interface IdeasPanelProps {
  /** Идеи со всех месяцев: одна и та же идея показывается один раз. */
  ideaRows: Array<{ task: Task; sourceMonth: number }>;
  isDark: boolean;
  totalFactMap?: Record<string, number>;
  updateTask: (month: number, id: string, field: keyof Task, value: unknown) => void;
  deleteTask: (month: number, id: string) => void;
  moveToBacklog: (month: number, id: string) => void;
  duplicateTask: (month: number, id: string) => void;
  onOpenTaskDetail?: (task: Task, month: number) => void;
  /** Перевести идею в статус «Новая» и в рабочий список текущего месяца. */
  promoteIdea: (sourceMonth: number, task: Task) => void;
  isGuest?: boolean;
  isExecutive?: boolean;
}

/**
 * Сворачиваемый блок «Идеи» под списком задач.
 *
 * Идеи живут отдельно от рабочего списка: у них нет плана часов и они не
 * участвуют в бюджете месяца. Собираются со всех месяцев сразу, поэтому одна
 * идея не дублируется при переходе между месяцами.
 *
 * По умолчанию блок свёрнут — он не должен отвлекать от текущей работы.
 */
export function IdeasPanel({
  ideaRows,
  isDark,
  totalFactMap,
  updateTask,
  deleteTask,
  moveToBacklog,
  duplicateTask,
  onOpenTaskDetail,
  promoteIdea,
  isGuest,
  isExecutive,
}: IdeasPanelProps) {
  const [ideasOpen, setIdeasOpen] = useState(false);

  if (ideaRows.length === 0) return null;

  return (
<div className="rounded-2xl border" style={{ borderColor: "#17181C", borderWidth: 2, background: "var(--tracker-bg-card)" }}>
  <button type="button" onClick={() => setIdeasOpen(v => !v)} className="w-full flex items-center gap-2 px-4 py-3 text-left cursor-pointer select-none hover:bg-black/5 transition-colors">
    <Lightbulb className="size-4" style={{ color: "#fbbf24" }} />
    <span className="font-semibold text-sm">Идеи</span>
    <span className="text-xs rounded-full px-2 py-0.5" style={{ background: "rgba(251,191,36,.14)", color: "#b45309" }}>{ideaRows.length}</span>
    <ChevronDown className={`size-4 ml-auto transition-transform ${ideasOpen ? "rotate-180" : ""}`} />
  </button>
  {ideasOpen && <div className="task-card-grid p-3 pt-0">
    {ideaRows.map(({ task, sourceMonth }) => {
      const metrics = getTaskMetrics(task, totalFactMap);
      const accentColor = PHASE_COLORS[getPhaseForStatus(task.status)] || "var(--tracker-accent)";
      return (
      <TaskContextMenu key={task.id} task={task} month={sourceMonth} isDark={isDark} updateTask={updateTask} deleteTask={deleteTask} moveToBacklog={moveToBacklog} duplicateTask={duplicateTask} isGuest={isGuest}>
        <div
          className="task-card cursor-pointer"
          style={{ "--card-accent-color": "#fbbf24" } as React.CSSProperties}
          onClick={(e) => {
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON" || tag === "SELECT") return;
            if ((e.target as HTMLElement)?.closest("button, select, input, textarea, [role='combobox']")) return;
            onOpenTaskDetail?.(task, sourceMonth);
          }}
        >
          {/* Строка 1: лампочка + номер + статус + приоритет */}
          <div className="flex items-start gap-2">
            <div className="shrink-0 mt-0.5" onClick={(e) => e.stopPropagation()}>
              <Lightbulb className="size-4" style={{ color: "#fbbf24" }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                <span className="task-card-num">#{task.num || "—"}</span>
              </div>
              <p className="task-card-name">{task.name || "без названия"}</p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
              {/* Статус — дропдаун */}
              {!isExecutive && !isGuest ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      className="h-5 w-auto min-w-[70px] text-[0.6rem] font-semibold rounded-full px-1.5 border-none cursor-pointer hover:opacity-80 transition-opacity"
                      style={{
                        color: scolText(task.status, isDark) || "var(--tracker-text-muted)",
                        background: (scolText(task.status, isDark) || "var(--tracker-accent)") + "18",
                      }}
                    >
                      {task.status}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[280px] p-2" align="end" side="bottom">
                    <div className="flex flex-col gap-1.5">
                      {([
                        { label: "Новая", items: [STATUSES.IDEA, STATUSES.NEW], color: PHASE_COLORS.new },
                        { label: "В работе", items: [STATUSES.ANALYSIS, STATUSES.APPROVAL, STATUSES.QUEUE_DEV, STATUSES.DEV, STATUSES.TEST, STATUSES.RELEASE, STATUSES.DOCS], color: PHASE_COLORS.in_progress },
                        { label: "Завершена", items: [STATUSES.COMPLETED, STATUSES.PROD_CHECK, STATUSES.DONE], color: PHASE_COLORS.done },
                        { label: "Отмена", items: [STATUSES.POSTPONED, STATUSES.CANCEL], color: PHASE_COLORS.cancel },
                      ]).map((group) => (
                        <div key={group.label}>
                          <div className="text-[8px] uppercase tracking-wider font-semibold mb-0.5 px-0.5" style={{ color: group.color }}>{group.label}</div>
                          <div className="flex flex-wrap gap-1">
                            {group.items.map((s) => (
                              <button
                                key={s}
                                onClick={() => { useTaskStore.getState().snapshot(); updateTask(sourceMonth, task.id, "status", s); }}
                                className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full transition-all ${task.status === s ? "ring-1 ring-offset-1" : "opacity-70 hover:opacity-100"}`}
                                style={{
                                  color: scolText(s, isDark) || "#888",
                                  background: (scolText(s, isDark) || "#888") + "20",
                                  ...(task.status === s ? { ringColor: scolText(s, isDark) || "#888", outlineColor: scolText(s, isDark) || "#888" } : {}),
                                }}
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              ) : (
                <span
                  className="h-5 w-auto min-w-[70px] text-[0.6rem] font-semibold rounded-full px-1.5 inline-flex items-center justify-center"
                  style={{
                    color: scolText(task.status, isDark) || "var(--tracker-text-muted)",
                    background: (scolText(task.status, isDark) || "var(--tracker-accent)") + "18",
                  }}
                >
                  {task.status}
                </span>
              )}
              {/* Приоритет — дропдаун */}
              {!isExecutive && !isGuest ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="h-5 text-[0.6rem] font-semibold rounded-full px-1.5 border-none cursor-pointer hover:opacity-80 transition-opacity flex items-center gap-1"
                      style={{ color: PCOL[task.priority], background: PCOL[task.priority] + "18" }}
                    >
                      {task.priority}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {Object.values(PRIORITIES).map(p => (
                      <DropdownMenuItem key={p} className="text-xs gap-2 cursor-pointer" onClick={() => {
                        useTaskStore.getState().snapshot();
                        updateTask(sourceMonth, task.id, "priority", p);
                      }}>
                        <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PCOL[p] }} />
                        {p}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <span
                  className="h-5 text-[0.6rem] font-semibold rounded-full px-1.5 inline-flex items-center gap-1"
                  style={{ color: PCOL[task.priority], background: PCOL[task.priority] + "18" }}
                >
                  {task.priority}
                </span>
              )}
            </div>
          </div>

          {/* Прогресс */}
          <div className="flex items-center gap-1.5 mt-2 pl-5">
            <div className="task-card-progress flex-1">
              <div
                className="task-card-progress-fill"
                style={{
                  width: `${Math.min(metrics.prog, 100)}%`,
                  backgroundColor: "var(--tracker-accent)",
                }}
              />
            </div>
            <span className="text-[10px] font-semibold tabular-nums shrink-0" style={{ color: progColor(metrics.prog, CLOSED_STATUSES.has(task.status as Status), metrics.over) }}>
              {metrics.prog}%
            </span>
          </div>

          {/* Часы: план / факт / итого */}
          <div className="flex items-center gap-2 mt-1.5 pl-5 text-[13px] delta-num text-[var(--tracker-text-main)] [&_svg]:opacity-45">
            <span className="flex items-center gap-1 w-[72px]">
              <Ruler className="size-3.5 shrink-0" /> {fmt2(metrics.plan)}<span className="text-[var(--tracker-text-muted)]">ч</span>
            </span>
            <span className={`flex items-center gap-1 w-[72px] ${metrics.fact > metrics.plan && metrics.plan > 0 ? "text-[var(--tracker-danger)] font-semibold" : ""}`}>
              <Timer className="size-3.5 shrink-0" /> {fmt2(metrics.fact)}<span className="text-[var(--tracker-text-muted)]">ч</span>
            </span>
            <span className="flex items-center gap-1 w-[72px]">
              <span className="opacity-60">Σ</span> {fmt2(metrics.totalH)}<span className="text-[var(--tracker-text-muted)]">ч</span>
            </span>
          </div>

          {/* Кнопки: В работу + В бэклог */}
          {!isExecutive && !isGuest && (
            <div className="flex items-center gap-0.5 shrink-0 mt-1.5 ml-5" onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => promoteIdea(sourceMonth, task)} title="В работу">
                <Play className="size-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveToBacklog(sourceMonth, task.id)} title="В беклог">
                <Package className="size-3" />
              </Button>
            </div>
          )}
        </div>
      </TaskContextMenu>
      );
    })}
  </div>}
</div>
  );
}
