/* ================================================================ *
 *  PRESENTATION RENDERER — single source of truth for slides       *
 * ================================================================ */

import React from "react";
import type { Task } from "./types";
import { getPhaseForStatus, MONTHS } from "./types";
import type { PresBgSettings } from "./store";
import { fmt2, evalExpr, R2 } from "./metrics";
import { describeMonth } from "./task-history";
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
    const history = (c.history || []) as { month: number; factH: number }[];
    const peak = Math.max(planN, ...history.map((h) => h.factH), 1);

    const prevFact = history.length > 1 ? history[history.length - 2].factH : null;
    const diff = prevFact === null ? 0 : R2(factN - prevFact);

    /* Динамика полосами по месяцам вместо трёх плиток «план / факт /
       перерасход». Плитки показывали три числа, но не отвечали на главный
       вопрос: месяц выдался обычным или нет. Полосы отвечают сразу. */
    return (
      <div style={{ ...shell, height: "100%", display: "flex", flexDirection: "column" }}>
        {sectionH2("Показатели месяца")}

        <div style={{ display: "flex", gap: "56px", flexWrap: "wrap", marginBottom: "28px" }}>
          <div>
            <p style={{ fontFamily: F, fontSize: "14px", letterSpacing: "1.6px", textTransform: "uppercase", color: mutedColor }}>Бюджет</p>
            <p style={{ fontFamily: FONT_MONO, fontSize: "38px", fontWeight: 500, color: textColor, lineHeight: 1.1 }}>{fmt2(planN)}</p>
          </div>
          <div>
            <p style={{ fontFamily: F, fontSize: "14px", letterSpacing: "1.6px", textTransform: "uppercase", color: mutedColor }}>Отработано</p>
            <p style={{ fontFamily: FONT_MONO, fontSize: "38px", fontWeight: 500, color: factN > planN ? dangerColor : textColor, lineHeight: 1.1 }}>{fmt2(factN)}</p>
          </div>
          <div>
            <p style={{ fontFamily: F, fontSize: "14px", letterSpacing: "1.6px", textTransform: "uppercase", color: mutedColor }}>Завершено</p>
            <p style={{ fontFamily: FONT_MONO, fontSize: "38px", fontWeight: 500, color: textColor, lineHeight: 1.1 }}>{completed} / {total}</p>
          </div>
        </div>

        <div style={{ flex: "1 1 auto", display: "flex", flexDirection: "column", justifyContent: "center", gap: "12px" }}>
          {history.map((h, i) => {
            const isCurrent = i === history.length - 1;
            const width = Math.max(2, (h.factH / peak) * 100);
            return (
              <div key={`${h.month}-${i}`} style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <span style={{
                  fontFamily: F, width: "104px", fontSize: "15px",
                  letterSpacing: "1.2px", textTransform: "uppercase",
                  fontWeight: isCurrent ? 500 : 400,
                  color: textColor,
                }}>{MONTHS[h.month]}</span>

                <span style={{
                  flex: 1, height: "34px", position: "relative", overflow: "hidden",
                  border: `2px solid ${acA}`, borderRadius: "4px",
                }}>
                  {/* Прошлые месяцы — штриховка, текущий — сплошная заливка.
                      Раньше прошлые гасились прозрачностью, и пять строк
                      из шести становились еле различимы. */}
                  <span style={{
                    position: "absolute", inset: 0, width: `${width}%`, display: "block",
                    background: isCurrent
                      ? (factN > planN ? dangerColor : acA)
                      : `repeating-linear-gradient(135deg, ${acA} 0 3px, transparent 3px 8px)`,
                  }} />
                </span>

                <span style={{
                  fontFamily: FONT_MONO, width: "96px", textAlign: "right", fontSize: "22px",
                  fontWeight: isCurrent ? 500 : 400,
                  color: textColor,
                }}>{fmt2(h.factH)}</span>
              </div>
            );
          })}
        </div>

        <p style={{ fontFamily: F, fontSize: "19px", lineHeight: 1.5, color: mutedColor, marginTop: "22px" }}>
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
                  <span style={{ fontFamily: F, fontSize: "14px", color: numColor, fontWeight: 600 }}>#{t.num || ""}</span>
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

    const fallbackAchievements: string[] = [];
    if (compPct >= 70) fallbackAchievements.push(`${compPct}% задач выполнено — высокая эффективность`);
    if (completed > 0) fallbackAchievements.push(`Завершено ${completed} из ${total} задач`);
    if (overPct < 0) fallbackAchievements.push(`Экономия ${Math.abs(overPct)}% бюджета`);
    if (fallbackAchievements.length === 0) fallbackAchievements.push("Месяц в процессе, данные накапливаются");

    const fallbackRisks: string[] = [];
    if (overPct > 20) fallbackRisks.push(`Перерасход ${overPct}% — превышен лимит бюджета`);
    if (overPct > 0 && overPct <= 20) fallbackRisks.push(`Незначительный перерасход ${overPct}%`);
    if (currentUncompleted > prevUncompleted) fallbackRisks.push(`Рост невыполненных задач: ${currentUncompleted} (+${currentUncompleted - prevUncompleted})`);
    if (currentUncompleted === 0 && total > 0) fallbackRisks.push("Все задачи закрыты");

    const fallbackInProgress: string[] = [];
    const inProgressCount = total - completed;
    if (inProgressCount > 0) fallbackInProgress.push(`${inProgressCount} задач в работе`);
    if (planN > factN) fallbackInProgress.push(`Остаток бюджета: ${fmt2(planN - factN)}ч`);

    const fallbackSummary: string[] = [];
    if (compPct >= 80 && overPct <= 10) fallbackSummary.push("Отличный результат — задачи выполнены в рамках бюджета");
    else if (compPct >= 50 && overPct <= 20) fallbackSummary.push("Результат удовлетворительный, есть области для оптимизации");
    else if (compPct < 50) fallbackSummary.push("Низкая эффективность — необходимо пересмотреть процессы");
    if (overPct > 20) fallbackSummary.push("Критический перерасход требует немедленного вмешательства");

    const con = aiConclusion ?? {
      achievements: fallbackAchievements, risks: fallbackRisks,
      inProgress: fallbackInProgress, summary: fallbackSummary,
    };

    const sections = [
      { key: "achievements" as const, label: "Достижения", col: successColor, items: con.achievements },
      { key: "risks" as const, label: "Риски", col: dangerColor, items: con.risks },
      { key: "inProgress" as const, label: "В процессе", col: "acA", items: con.inProgress },
      { key: "summary" as const, label: "Выводы", col: "acA", items: con.summary },
    ].filter((s) => s.items && s.items.length > 0);

    return (
      <div style={{ ...shell, textAlign: "center", maxWidth: "1000px", margin: "auto" }}>
        {sectionH2("Итоги и выводы")}
        <div style={{ display: "grid", gridTemplateColumns: sections.length > 2 ? "1fr 1fr" : "1fr", gap: "20px", textAlign: "left" }}>
          {sections.map((s) => (
            <div key={s.key} style={{
              borderRadius: "14px", padding: "24px 28px",
              border: BDR,
            }}>
              <h4 style={{
                fontFamily: F, fontSize: "13px", fontWeight: 500, textTransform: "uppercase",
                letterSpacing: ".12em", color: s.col, marginBottom: "14px",
                display: "flex", alignItems: "center", gap: "8px",
              }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: s.col, display: "inline-block", flexShrink: 0 }} />
                {s.label}
              </h4>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
                {(s.items || []).map((item, i) => (
                  <li key={i} style={{
                    fontFamily: F, fontSize: "16px",
                    color: theme.isLight ? "rgba(30,41,59,.85)" : "rgba(255,255,255,.82)",
                    paddingLeft: "18px", position: "relative", lineHeight: 1.45,
                  }}>
                    <span style={{ position: "absolute", left: 0, top: "7px", width: "6px", height: "6px", borderRadius: "50%", background: s.col, display: "inline-block" }} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {aiConclusion && (
          <p style={{ fontFamily: F, fontSize: "14px", color: mutedColor, textAlign: "center", marginTop: "16px" }}>
            AI-анализ · {aiConclusion.source === "ai" ? "сгенерировано ИИ" : "заполнено вручную"}
          </p>
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
