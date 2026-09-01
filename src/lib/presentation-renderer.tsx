/* ================================================================ *
 *  PRESENTATION RENDERER — single source of truth for slides       *
 * ================================================================ */

import React from "react";
import type { Task } from "./types";
import { getPhaseForStatus, MONTHS } from "./types";
import type { PresBgSettings } from "./store";
import { fmt2, evalExpr, R2 } from "./metrics";
import { describeMonth } from "./task-history";
import { PLANFIX_BASE_URL } from "./planfix";
import {
  buildTheme, hexToRgb, isHexDark, statusColor,
  FONT_FAMILY, FONT_MONO, FONT_STYLE,
  type PresentationTheme, type TrackerThemeTokens,
} from "./presentation-theme";

export { buildTheme };
export type { PresentationTheme, TrackerThemeTokens };

/* ================================================================ *
 *  Types                                                           *
 * ================================================================ */

export interface SlideData {
  type: "title" | "kpi" | "completed" | "inprogress" | "table" | "summary";
  content: Record<string, unknown>;
}

export interface AiConclusion {
  achievements: string[];
  risks: string[];
  inProgress: string[];
  summary: string[];
  source?: string;
}

/**
 * Фоновый слой слайда.
 *
 * Был генератором эмодзи и паттернов: раскидывал ракеты и лампочки
 * случайными позициями, умел ронять их сверху или дрейфовать. Всё это
 * удалено вместе с настройками — по канону слайд не украшают.
 * Остался ровный фон.
 */
export function PresentationBgLayer({ theme }: { theme: PresentationTheme }) {
  return (
    <div
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, background: theme.bodyBg }}
    />
  );
}

/* ================================================================ *
 *  Slide renderer                                                  *
 * ================================================================ */

export interface PresentationSlideProps {
  slide: SlideData;
  theme: PresentationTheme;
  aiConclusion?: AiConclusion | null;
  fixedAspect?: boolean;
}

export function PresentationSlide({ slide, theme, aiConclusion }: PresentationSlideProps) {
  const { rgb, textColor, mutedColor, isLight,
    successColor, dangerColor } = theme;
  const [r, g, b] = rgb;

  const acA = `rgba(${r},${g},${b},1)`;
  const acC = `rgba(${r},${g},${b},.15)`;
  const BDR = `2px solid rgba(${r},${g},${b},1)`; // манга: сплошная чернильная рамка
  const F = FONT_FAMILY;
  const numColor = isLight ? "rgba(23,24,28,0.55)" : "rgba(245,245,242,0.60)";
  const nameColor = textColor;

  /* Заголовок раздела — бровь с чертой, тот же приём, что в шапке
     месяца и в окне задачи. Был центрированный текст 54 пикселя,
     съедавший четверть слайда и ни с чем не рифмующийся. */
  const sectionH2 = (text: string): React.ReactNode => (
    <h2 style={{
      fontFamily: F, fontSize: "17px", fontWeight: 500, flexShrink: 0,
      letterSpacing: "2.4px", textTransform: "uppercase",
      color: mutedColor, paddingBottom: "12px", marginBottom: "26px",
      borderBottom: `3px solid ${acA}`,
    }}>{text}</h2>
  );

  const shell: React.CSSProperties = { fontFamily: F, position: "relative", zIndex: 1, width: "100%", margin: "0 auto" };

  // ───────── 1. TITLE ─────────
  if (slide.type === "title") {
    const c = slide.content;
    const month = String(c.month || "");
    const total = Number(c.total || 0);
    const completed = Number(c.completed || 0);
    const factH = Number(c.factH || 0);
    const domain = String(c.domain || "");
    const year = String(c.year || "");

    /* Титул разворота — тот же приём, что в шапке месяца и на заставке:
       бровь, крупное название, жирная черта, числа под ней.
       Раньше здесь были плашка с точкой, заголовок начертанием 900,
       кольцевая диаграмма и число 64 пикселя — слайд кричал громче,
       чем говорит весь остальной продукт. */
    return (
      <div style={{ ...shell, height: "100%", display: "flex", flexDirection: "column" }}>
        <p style={{
          fontFamily: FONT_MONO, fontSize: "18px", letterSpacing: "4px",
          textTransform: "uppercase", color: mutedColor,
        }}>
          {year}{domain ? ` · ${domain}` : ""}
        </p>

        {/* Месяц занимает полотно: на 16:9 сжатый в середину блок оставлял
            вокруг себя поле пустоты. Числа стоят на общей линии внизу,
            отбитые чернильной чертой — как в шапке списка задач. */}
        <div style={{ flex: "1 1 auto", display: "flex", alignItems: "center" }}>
          <h1 style={{
            fontFamily: F, fontSize: "clamp(88px,13vw,190px)", fontWeight: 500,
            lineHeight: 0.92, letterSpacing: "-0.045em", color: textColor,
          }}>{month}</h1>
        </div>

        <div style={{ borderTop: `4px solid ${acA}`, paddingTop: "26px", display: "flex", alignItems: "flex-end", gap: "72px", flexWrap: "wrap" }}>
          <div>
            <p style={{ fontFamily: F, fontSize: "16px", letterSpacing: "2px", textTransform: "uppercase", color: mutedColor }}>Задач</p>
            <p style={{ fontFamily: FONT_MONO, fontSize: "54px", fontWeight: 500, color: textColor, lineHeight: 1.05 }}>{total}</p>
          </div>
          <div>
            <p style={{ fontFamily: F, fontSize: "16px", letterSpacing: "2px", textTransform: "uppercase", color: mutedColor }}>Завершено</p>
            <p style={{ fontFamily: FONT_MONO, fontSize: "54px", fontWeight: 500, color: textColor, lineHeight: 1.05 }}>{completed}</p>
          </div>
          <div>
            <p style={{ fontFamily: F, fontSize: "16px", letterSpacing: "2px", textTransform: "uppercase", color: mutedColor }}>Часов</p>
            <p style={{ fontFamily: FONT_MONO, fontSize: "54px", fontWeight: 500, color: textColor, lineHeight: 1.05 }}>{fmt2(factH)}</p>
          </div>

          <p style={{
            marginLeft: "auto", fontFamily: FONT_MONO, fontSize: "15px",
            letterSpacing: "2px", textTransform: "uppercase", color: mutedColor,
          }}>
            Delta · операционный монитор
          </p>
        </div>
      </div>
    );
  }

  // ───────── 2. KPI — ×1.5 ─────────
  if (slide.type === "kpi") {
    const c = slide.content;
    const planN = Number(c.planH) || 0;
    const factN = Number(c.factH) || 0;
    const completed = Number(c.completed) || 0;
    const total = Number(c.total) || 0;
    const history = (c.history || []) as
      { month: number; factH: number; budget: number; over: boolean }[];
    const peak = Math.max(planN, ...history.map((h) => Math.max(h.factH, h.budget)), 1);

    const prevFact = history.length > 1 ? history[history.length - 2].factH : null;
    const diff = prevFact === null ? 0 : R2(factN - prevFact);

    /* Числа столбиком слева, динамика справа: используется ширина слайда,
       а не высота. Раньше всё шло сверху вниз и не влезало в 16:9 —
       содержимое сжималось и становилось нечитаемым.

       Перерасход отмечается у каждого месяца по его собственному бюджету,
       а не только у текущего. Текущий месяц выделен насыщенностью. */
    return (
      <div style={{ ...shell, height: "100%", display: "flex", flexDirection: "column" }}>
        {sectionH2("Показатели месяца")}

        <div style={{ flex: "1 1 auto", display: "flex", gap: "44px", minHeight: 0 }}>
          <div style={{ width: "31%", flex: "none", display: "flex", flexDirection: "column", justifyContent: "center", gap: "22px" }}>
            <div>
              <p style={{ fontFamily: F, fontSize: "14px", letterSpacing: "1.8px", textTransform: "uppercase", color: mutedColor }}>Бюджет</p>
              <p style={{ fontFamily: FONT_MONO, fontSize: "42px", fontWeight: 500, color: textColor, lineHeight: 1.05 }}>{fmt2(planN)}</p>
            </div>
            <div>
              <p style={{ fontFamily: F, fontSize: "14px", letterSpacing: "1.8px", textTransform: "uppercase", color: mutedColor }}>Отработано</p>
              <p style={{ fontFamily: FONT_MONO, fontSize: "42px", fontWeight: 500, color: factN > planN ? dangerColor : textColor, lineHeight: 1.05 }}>{fmt2(factN)}</p>
            </div>
            <div>
              <p style={{ fontFamily: F, fontSize: "14px", letterSpacing: "1.8px", textTransform: "uppercase", color: mutedColor }}>Завершено</p>
              <p style={{ fontFamily: FONT_MONO, fontSize: "42px", fontWeight: 500, color: textColor, lineHeight: 1.05 }}>{completed} / {total}</p>
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: "16px" }}>
            {history.map((h, i) => {
              const isCurrent = i === history.length - 1;
              const width = Math.max(2, (h.factH / peak) * 100);
              const budgetMark = Math.min(100, (h.budget / peak) * 100);
              const fill = h.over ? dangerColor : acA;
              return (
                <div key={`${h.month}-${i}`} style={{ display: "flex", alignItems: "center", gap: "18px" }}>
                  <span style={{
                    fontFamily: F, width: "112px", flex: "none", fontSize: "16px",
                    letterSpacing: "1.4px", textTransform: "uppercase",
                    fontWeight: isCurrent ? 500 : 400, color: textColor,
                  }}>{MONTHS[h.month]}</span>

                  <span style={{
                    flex: 1, height: isCurrent ? "38px" : "30px", position: "relative",
                    border: `2px solid ${acA}`, borderRadius: "4px", overflow: "hidden",
                  }}>
                    <span style={{
                      position: "absolute", inset: 0, width: `${width}%`, display: "block",
                      background: fill, opacity: isCurrent ? 1 : 0.72,
                    }} />
                    {/* Засечка бюджета месяца: видно, дотянули до потолка или нет. */}
                    {budgetMark < 99 && (
                      <span style={{
                        position: "absolute", top: 0, bottom: 0, left: `${budgetMark}%`,
                        width: "2px", background: acA, display: "block",
                      }} />
                    )}
                  </span>

                  <span style={{
                    fontFamily: FONT_MONO, width: "104px", flex: "none", textAlign: "right",
                    fontSize: isCurrent ? "24px" : "21px", fontWeight: isCurrent ? 500 : 400,
                    color: h.over ? dangerColor : textColor,
                  }}>{fmt2(h.factH)}</span>
                </div>
              );
            })}
          </div>
        </div>

        <p style={{ fontFamily: F, fontSize: "18px", lineHeight: 1.5, color: mutedColor, marginTop: "20px", flex: "none" }}>
          {describeMonth(factN, planN, completed, total, diff)}
        </p>
      </div>
    );
  }

  // ───────── 3/4. COMPLETED / IN-PROGRESS — max 4, ×1.5 ─────────
  if (slide.type === "completed" || slide.type === "inprogress") {
    const items = (slide.content.tasks || []) as Array<{ task: Task; currentTotal: number; prevTotal: number; delta: number }>;
    const totalTasks = Number(slide.content.total || items.length);
    const totalHours = Number(slide.content.totalHours) || 0;
    const title = slide.type === "completed" ? "Завершённые задачи" : "Задачи в работе";

    return (
      <div style={{ ...shell, textAlign: "center", maxWidth: "1100px", margin: "auto" }}>
        {sectionH2(title)}
        <div style={{ display: "inline-flex", gap: "30px", marginBottom: "20px", padding: "14px 36px", borderRadius: "14px", border: BDR, flexWrap: "wrap", justifyContent: "center" }}>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontFamily: F, fontSize: "30px", fontWeight: 500, color: acA, lineHeight: 1.2 }}>{totalTasks}</p>
            <p style={{ fontFamily: F, fontSize: "14px", color: mutedColor }}>задач</p>
          </div>
          <div style={{ width: "1px", background: `rgba(${r},${g},${b},1)` }} />
          <div style={{ textAlign: "center" }}>
            <p style={{ fontFamily: F, fontSize: "30px", fontWeight: 500, color: acA, lineHeight: 1.2 }}>{fmt2(totalHours)}ч</p>
            <p style={{ fontFamily: F, fontSize: "14px", color: mutedColor }}>итого</p>
          </div>
        </div>

        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: "14px", justifyItems: "center",
          overflowY: "auto", maxHeight: "580px", textAlign: "left",
        }}>
          {items.map((item) => {
            const t = item.task;
            const col = statusColor(t.status, theme);
            return (
              <div key={t.id} style={{
                width: "100%", borderRadius: "12px", padding: "16px 20px",
                border: BDR,
                display: "flex", flexDirection: "column", gap: "8px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                  {/* Номер — ссылка в PlanFix: со слайда задачу открывают
                      чаще всего именно там, а не в трекере. */}
                  {t.num ? (
                    <a
                      href={`${PLANFIX_BASE_URL}${t.num}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontFamily: FONT_MONO, fontSize: "14px", color: numColor,
                        fontWeight: 500, textDecoration: "underline",
                        textDecorationThickness: "1px", textUnderlineOffset: "3px",
                      }}
                    >
                      #{t.num}
                    </a>
                  ) : (
                    <span style={{ fontFamily: FONT_MONO, fontSize: "14px", color: numColor }}>—</span>
                  )}
                  <span style={{ fontFamily: F, fontSize: "12px", fontWeight: 500, padding: "2px 10px", borderRadius: "8px", border: `1px solid ${acA}`, color: nameColor, display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: col, display: "inline-block", flexShrink: 0 }} />
                    {t.status}
                  </span>
                </div>
                <p style={{ fontFamily: F, fontSize: "17px", color: nameColor, fontWeight: 500, lineHeight: 1.3 }}>{t.name || "—"}</p>
                <div style={{ display: "flex", gap: "12px", alignItems: "baseline", flexWrap: "wrap" }}>
                  <span style={{ fontFamily: F, fontSize: "14px", fontWeight: 600, color: mutedColor }}>
                    <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: ".5px" }}>план </span>
                    <span style={{ color: nameColor, fontSize: "17px", fontWeight: 500 }}>{fmt2(evalExpr(t.planH))}ч</span>
                  </span>
                  <span style={{ fontFamily: F, fontSize: "14px", fontWeight: 600, color: mutedColor }}>
                    <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: ".5px" }}>факт </span>
                    <span style={{ color: nameColor, fontSize: "17px", fontWeight: 500 }}>{fmt2(evalExpr(t.factH))}ч</span>
                  </span>
                  <span style={{ fontFamily: F, fontSize: "14px", fontWeight: 600, color: mutedColor }}>
                    <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: ".5px" }}>итого </span>
                    <span style={{ color: item.currentTotal <= evalExpr(t.planH) ? successColor : dangerColor, fontSize: "17px", fontWeight: 500 }}>{fmt2(item.currentTotal)}ч</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ───────── 5. TABLE — ×1.5 ─────────
  if (slide.type === "table") {
    const rows = ((slide.content.rows || slide.content.tasks || []) as Task[]);
    const totalFactMap = (slide.content.totalFactMap || {}) as Record<string, number>;
    const total = Number(slide.content.total || rows.length);
    const completed = Number(slide.content.completed) || 0;
    const totalHours = Number(slide.content.totalHours) || 0;
    const compPct = total > 0 ? Math.round((completed / total) * 100) : 0;

    const phaseOrder = ["new", "in_progress", "done", "cancel"] as const;
    const phaseLabels: Record<string, string> = { new: "Новая", in_progress: "В работе", done: "Завершенная", cancel: "Отменена" };
    const phaseMap = new Map<string, Task[]>();
    for (const t of rows) {
      const phase = getPhaseForStatus(t.status);
      if (!phaseMap.has(phase)) phaseMap.set(phase, []);
      phaseMap.get(phase)!.push(t);
    }
    const groups = phaseOrder.filter(p => phaseMap.has(p)).map(p => ({ phase: p, label: phaseLabels[p], tasks: phaseMap.get(p)! }));

    return (
      <div style={{ ...shell, textAlign: "center", maxWidth: "1100px", margin: "auto", display: "flex", flexDirection: "column", height: "100%" }}>
        {sectionH2("Задачи месяца")}

        {/* Числа строкой вместо плитки с кольцевой диаграммой:
            процент завершённых уже виден из «7 / 11». */}
        <div style={{ display: "flex", gap: "48px", marginBottom: "18px", textAlign: "left" }}>
          <div>
            <p style={{ fontFamily: F, fontSize: "13px", letterSpacing: "1.5px", textTransform: "uppercase", color: mutedColor }}>Завершено</p>
            <p style={{ fontFamily: FONT_MONO, fontSize: "30px", fontWeight: 500, color: textColor, lineHeight: 1.15 }}>{completed} / {total}</p>
          </div>
          <div>
            <p style={{ fontFamily: F, fontSize: "13px", letterSpacing: "1.5px", textTransform: "uppercase", color: mutedColor }}>Отработано</p>
            <p style={{ fontFamily: FONT_MONO, fontSize: "30px", fontWeight: 500, color: textColor, lineHeight: 1.15 }}>{fmt2(totalHours)}</p>
          </div>
        </div>

        <div style={{ flex: "1 1 auto", overflowX: "hidden", overflowY: "auto", borderRadius: "14px", border: BDR, textAlign: "left" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "18px", fontFamily: F }}>
            <thead>
              <tr style={{ background: acA, position: "sticky", top: 0, zIndex: 2 }}>
                {["№", "Наименование", "Этап", "План ч", "Факт ч", "Итого ч"].map((h, i) => (
                  <th key={i} style={{
                    padding: "12px 18px", textAlign: i >= 3 ? "center" : "left",
                    color: theme.bodyBg, fontSize: "13px", fontWeight: 500,
                    textTransform: "uppercase", letterSpacing: ".8px",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                  <React.Fragment key={group.phase}>
                    <tr>
                      <td colSpan={6} style={{
                        padding: "8px 18px", fontSize: "13px", fontWeight: 500,
                        textTransform: "uppercase", letterSpacing: ".8px",
                        color: mutedColor, borderBottom: BDR, borderTop: BDR,
                      }}>{group.label} ({group.tasks.length})</td>
                    </tr>
                    {group.tasks.map((t, i) => (
                      <tr key={t.id} style={{ borderBottom: `1px solid rgba(${r},${g},${b},.18)` }}>
                        <td style={{ padding: "8px 18px", color: numColor, fontSize: "16px" }}>{t.num || ""}</td>
                        <td style={{ padding: "8px 18px", color: nameColor, maxWidth: "400px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name || "—"}</td>
                        <td style={{ padding: "8px 18px" }}>
                          <span style={{ fontFamily: F, fontSize: "12px", fontWeight: 500, padding: "2px 10px", borderRadius: "8px", border: `1px solid ${acA}`, color: nameColor, display: "inline-flex", alignItems: "center", gap: "6px" }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor(t.status, theme), display: "inline-block", flexShrink: 0 }} />
                            {t.status}
                          </span>
                        </td>
                        <td style={{ padding: "8px 18px", textAlign: "center", fontWeight: 500, color: nameColor }}>{fmt2(evalExpr(t.planH))}</td>
                        <td style={{ padding: "8px 18px", textAlign: "center", fontWeight: 500, color: nameColor }}>{fmt2(evalExpr(t.factH))}</td>
                        <td style={{ padding: "8px 18px", textAlign: "center", fontWeight: 500, color: (t.num ? (totalFactMap[t.num] || evalExpr(t.factH)) : evalExpr(t.factH)) <= evalExpr(t.planH) ? successColor : dangerColor }}>{fmt2(t.num ? (totalFactMap[t.num] || evalExpr(t.factH)) : evalExpr(t.factH))}</td>
                      </tr>
                    ))}
                  </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ───────── 6. SUMMARY — по центру, ×1.5 ─────────
  if (slide.type === "summary") {
    const c = slide.content;
    const planN = Number(c.planH) || 0;
    const factN = Number(c.factH) || 0;
    const compPct = Number(c.compPct) || 0;
    const overPct = Number(c.overPct) || 0;
    const total = Number(c.total) || 0;
    const completed = Number(c.completed) || 0;
    const currentUncompleted = Number(c.currentUncompleted) || 0;
    const prevUncompleted = Number(c.prevUncompleted) || 0;

    /* Заготовка на случай, когда ИИ недоступен.
       Раньше она выносила приговоры: «Отличный результат», «Низкая
       эффективность — необходимо пересмотреть процессы», «Критический
       перерасход требует немедленного вмешательства». Это оценка работы
       людей, выведенная из двух чисел, и в отчёте руководителю она
       читается как мнение системы. Теперь только факты. */
    const factsDone: string[] = [];
    if (completed > 0) factsDone.push(`Закрыто ${completed} задач из ${total}.`);
    if (factN <= planN && planN > 0) factsDone.push(`Уложились в бюджет месяца — ${fmt2(planN - factN)} ч осталось.`);
    if (factsDone.length === 0) factsDone.push(`Отработано ${fmt2(factN)} ч.`);

    const factsRisks: string[] = [];
    if (planN > 0 && factN > planN) factsRisks.push(`Бюджет месяца превышен на ${fmt2(factN - planN)} ч.`);
    if (currentUncompleted > prevUncompleted) {
      factsRisks.push(`Незакрытых задач стало больше: ${currentUncompleted} против ${prevUncompleted} в прошлом месяце.`);
    }

    const factsProgress: string[] = [];
    const inProgressCount = total - completed;
    if (inProgressCount > 0) factsProgress.push(`${inProgressCount} задач переходят на следующий месяц.`);

    const con = aiConclusion ?? {
      achievements: factsDone,
      risks: factsRisks,
      inProgress: factsProgress,
      summary: [] as string[],
    };

    /* Три раздела сверху, вывод широкой полосой снизу — он ключевой.
       Цифр на слайде нет: они уже сказаны на первом и втором. */
    const columns = [
      { key: "achievements", label: "Что получилось", col: successColor, items: con.achievements },
      { key: "risks", label: "Требует внимания", col: dangerColor, items: con.risks },
      { key: "inProgress", label: "В работе", col: acA, items: con.inProgress },
    ].filter((c) => c.items && c.items.length > 0);

    const verdict = (con.summary || []).slice(0, 2);

    return (
      <div style={{ ...shell, height: "100%", display: "flex", flexDirection: "column" }}>
        <h2 style={{
          fontFamily: F, fontSize: "17px", fontWeight: 500, flexShrink: 0,
          letterSpacing: "2.4px", textTransform: "uppercase", color: mutedColor,
          paddingBottom: "12px", marginBottom: "26px", borderBottom: `3px solid ${acA}`,
          display: "flex", alignItems: "baseline", gap: "12px",
        }}>
          <span>Итоги месяца</span>
          {aiConclusion && (
            <span style={{ marginLeft: "auto", letterSpacing: "1px", textTransform: "none", fontSize: "14px" }}>
              {aiConclusion.source === "ai" ? "сгенерировано ИИ" : "заполнено вручную"}
            </span>
          )}
        </h2>

        <div style={{
          flex: "1 1 auto", minHeight: 0, display: "grid",
          gridTemplateColumns: `repeat(${Math.max(columns.length, 1)}, 1fr)`,
          gap: "34px", alignContent: "start",
        }}>
          {columns.map((c) => (
            <div key={c.key}>
              <div style={{ display: "flex", alignItems: "center", gap: "9px", marginBottom: "12px" }}>
                <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: c.col, display: "inline-block", flexShrink: 0 }} />
                <span style={{
                  fontFamily: F, fontSize: "15px", fontWeight: 500, letterSpacing: "1.6px",
                  textTransform: "uppercase", color: c.col,
                }}>{c.label}</span>
              </div>
              {(c.items || []).slice(0, 3).map((item, i) => (
                <p key={i} style={{
                  fontFamily: F, fontSize: "19px", lineHeight: 1.5, color: textColor,
                  marginBottom: "10px",
                }}>{item}</p>
              ))}
            </div>
          ))}
        </div>

        {verdict.length > 0 && (
          <div style={{ flex: "none", borderTop: `3px solid ${acA}`, paddingTop: "20px", marginTop: "20px" }}>
            <p style={{
              fontFamily: F, fontSize: "14px", fontWeight: 500, letterSpacing: "2px",
              textTransform: "uppercase", color: mutedColor, marginBottom: "8px",
            }}>Вывод</p>
            {verdict.map((line, i) => (
              <p key={i} style={{ fontFamily: F, fontSize: "23px", lineHeight: 1.45, color: textColor }}>{line}</p>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={shell}>
      <p style={{ fontFamily: F, color: mutedColor, textAlign: "center" }}>Неизвестный тип слайда: {slide.type}</p>
    </div>
  );
}

export { hexToRgb, statusColor };
