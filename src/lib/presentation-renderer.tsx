"use client";
/**
 * Отрисовка слайдов отчёта.
 *
 * Отчёт показывают вживую и рассказывают, поэтому слайды разреженные:
 * крупные числа, мало слов. Плотный текст на экране конкурирует с
 * говорящим — человек начинает читать вместо того, чтобы слушать.
 *
 * Всё содержимое умещается в 16:9 без прокрутки. Прежняя версия
 * набивала слайды до отказа, и они сжимались до нечитаемости: там,
 * где не хватало высоты, содержимое просто обрезалось.
 */
import React from "react";
import { MONTHS } from "./types";
import type { PresBgSettings } from "./store";
import { fmt2 } from "./metrics";
import { PLANFIX_BASE_URL } from "./planfix";
import {
  buildTheme, hexToRgb, isHexDark,
  FONT_FAMILY, FONT_MONO, FONT_STYLE,
  type PresentationTheme, type TrackerThemeTokens,
} from "./presentation-theme";

export { buildTheme, hexToRgb, isHexDark, FONT_STYLE };
export type { PresentationTheme, TrackerThemeTokens };

export type SlideType = "title" | "month" | "work" | "next" | "verdict";

export interface SlideData {
  id: string;
  type: SlideType;
  content: Record<string, unknown>;
}

export interface AiConclusion {
  achievements?: string[];
  risks?: string[];
  inProgress?: string[];
  summary?: string[];
  source?: string;
}

/** Фон слайда. Ровный: слайды отчёта не украшают. */
export function PresentationBgLayer({ theme }: { theme: PresentationTheme }) {
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: theme.bodyBg }} />
  );
}

export interface PresentationSlideProps {
  slide: SlideData;
  theme: PresentationTheme;
  aiConclusion?: AiConclusion | null;
}

interface TaskLine {
  num: string;
  name: string;
  plan: number;
  done: number;
}

export function PresentationSlide({ slide, theme, aiConclusion }: PresentationSlideProps) {
  const { textColor, mutedColor, rgb } = theme;
  const [r, g, b] = rgb;
  const ink = `rgba(${r},${g},${b},1)`;
  const hair = `rgba(${r},${g},${b},.2)`;
  const F = FONT_FAMILY;
  const danger = theme.dangerColor;
  const success = theme.successColor;

  const shell: React.CSSProperties = {
    fontFamily: F, position: "relative", zIndex: 1,
    width: "100%", height: "100%", display: "flex", flexDirection: "column",
  };

  /** Бровь раздела с чертой — тот же приём, что в шапке месяца трекера. */
  const head = (text: string, aside?: React.ReactNode) => (
    <h2 style={{
      fontFamily: F, fontSize: "17px", fontWeight: 500, flex: "none",
      letterSpacing: "2.4px", textTransform: "uppercase", color: mutedColor,
      paddingBottom: "12px", marginBottom: "26px", borderBottom: `3px solid ${ink}`,
      display: "flex", alignItems: "baseline", gap: "12px",
    }}>
      <span>{text}</span>
      {aside && <span style={{ marginLeft: "auto", letterSpacing: "1px", textTransform: "none", fontSize: "14px" }}>{aside}</span>}
    </h2>
  );

  const label = (text: string) => (
    <p style={{ fontFamily: F, fontSize: "14px", letterSpacing: "1.8px", textTransform: "uppercase", color: mutedColor }}>
      {text}
    </p>
  );

  const figure = (value: React.ReactNode, color = textColor, size = "42px") => (
    <p style={{ fontFamily: FONT_MONO, fontVariantNumeric: "tabular-nums", fontSize: size, fontWeight: 500, color, lineHeight: 1.05 }}>
      {value}
    </p>
  );

  /** Номер задачи — ссылка в PlanFix: со слайда её открывают именно там. */
  const taskNum = (num: string) => (
    num ? (
      <a
        href={`${PLANFIX_BASE_URL}${num}`}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          fontFamily: FONT_MONO, fontSize: "15px", color: mutedColor,
          textDecoration: "underline", textDecorationThickness: "1px", textUnderlineOffset: "3px",
          width: "62px", flex: "none",
        }}
      >
        {num}
      </a>
    ) : (
      <span style={{ fontFamily: FONT_MONO, fontSize: "15px", color: mutedColor, width: "62px", flex: "none" }}>—</span>
    )
  );

  /* ═════════════════════════ 1. Титул ═════════════════════════ */
  if (slide.type === "title") {
    const c = slide.content as { month: string; year: number; domain: string };

    return (
      <div style={shell}>
        <p style={{ fontFamily: FONT_MONO, fontSize: "17px", letterSpacing: "4px", textTransform: "uppercase", color: mutedColor }}>
          Отчёт за месяц{c.domain ? ` · ${c.domain}` : ""}
        </p>

        <div style={{ flex: "1 1 auto", display: "flex", alignItems: "center" }}>
          <div>
            <h1 style={{
              fontFamily: F, fontSize: "clamp(90px,13vw,180px)", fontWeight: 500,
              lineHeight: 0.9, letterSpacing: "-0.045em", color: textColor,
            }}>{c.month}</h1>
            <p style={{ fontFamily: FONT_MONO, fontSize: "34px", color: mutedColor, marginTop: "6px" }}>{c.year}</p>
          </div>
        </div>

        <div style={{ flex: "none", borderTop: `4px solid ${ink}`, paddingTop: "20px" }}>
          <p style={{ fontFamily: FONT_MONO, fontSize: "15px", letterSpacing: "2px", textTransform: "uppercase", color: mutedColor }}>
            Delta · операционный монитор
          </p>
        </div>
      </div>
    );
  }

  /* ═══════════════════ 2. Как прошёл месяц ═══════════════════ */
  if (slide.type === "month") {
    const c = slide.content as {
      total: number; closed: number; open: number;
      factH: number; budget: number; carriedOverrun: number;
      history: { month: number; factH: number; budget: number; over: boolean }[];
    };

    const overBudget = c.budget > 0 && c.factH > c.budget;
    const peak = Math.max(c.budget, ...c.history.map((h) => Math.max(h.factH, h.budget)), 1);

    return (
      <div style={shell}>
        {head("Как прошёл месяц")}

        <div style={{ flex: "none", display: "flex", gap: "40px", flexWrap: "wrap", marginBottom: "24px" }}>
          <div>{label("Задач")}{figure(c.total)}</div>
          <div>{label("Сделано")}{figure(c.closed)}</div>
          <div>{label("Осталось")}{figure(c.open)}</div>
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            {label("Часы из бюджета")}
            {figure(
              <>
                {fmt2(c.factH)}
                <span style={{ fontSize: "22px", color: mutedColor }}> / {fmt2(c.budget)}</span>
              </>,
              overBudget ? danger : textColor,
            )}
          </div>
        </div>

        <div style={{ flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: "14px" }}>
          {c.history.map((h, i) => {
            const isCurrent = i === c.history.length - 1;
            const width = Math.max(2, (h.factH / peak) * 100);
            const mark = Math.min(100, (h.budget / peak) * 100);
            return (
              <div key={`${h.month}-${i}`} style={{ display: "flex", alignItems: "center", gap: "18px" }}>
                <span style={{
                  fontFamily: F, width: "112px", flex: "none", fontSize: "16px",
                  letterSpacing: "1.4px", textTransform: "uppercase",
                  fontWeight: isCurrent ? 500 : 400, color: textColor,
                }}>{MONTHS[h.month]}</span>

                <span style={{
                  flex: 1, height: isCurrent ? "38px" : "30px", position: "relative",
                  border: `2px solid ${h.over ? danger : ink}`, borderRadius: "4px", overflow: "hidden",
                }}>
                  <span style={{
                    position: "absolute", inset: 0, width: `${width}%`, display: "block",
                    background: h.over ? danger : ink, opacity: isCurrent ? 1 : 0.7,
                  }} />
                  {mark < 99 && h.budget > 0 && (
                    <span style={{ position: "absolute", top: 0, bottom: 0, left: `${mark}%`, width: "2px", background: ink, display: "block" }} />
                  )}
                </span>

                <span style={{
                  fontFamily: FONT_MONO, width: "104px", flex: "none", textAlign: "right",
                  fontSize: isCurrent ? "24px" : "21px", fontWeight: isCurrent ? 500 : 400,
                  color: h.over ? danger : textColor,
                }}>{fmt2(h.factH)}</span>
              </div>
            );
          })}
        </div>

        <p style={{ fontFamily: F, fontSize: "19px", lineHeight: 1.5, color: mutedColor, marginTop: "20px", flex: "none" }}>
          {c.budget === 0
            ? `Бюджет месяца — ноль: задачи брать не планировали. Отработанные ${fmt2(c.carriedOverrun)} ч вычтутся из бюджета следующего месяца.`
            : overBudget
              ? `Бюджет превышен на ${fmt2(c.factH - c.budget)} ч — эти часы вычтутся из следующего месяца.`
              : `Переработки нет: ${fmt2(c.factH)} ч из ${fmt2(c.budget)} ч, свободно ${fmt2(c.budget - c.factH)} ч.`}
        </p>
      </div>
    );
  }

  /* ═════════════════════ 3. Работа ═════════════════════ */
  if (slide.type === "work") {
    const c = slide.content as { closed: TaskLine[]; open: TaskLine[] };
    const LIMIT = 6;

    const column = (
      title: string,
      items: TaskLine[],
      dot: string,
      showProgress: boolean,
    ) => {
      const shown = items.slice(0, LIMIT);
      const rest = items.length - shown.length;
      const restHours = items.slice(LIMIT).reduce((sum, t) => sum + t.done, 0);

      return (
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
            <span style={{ width: "11px", height: "11px", borderRadius: "50%", background: dot, display: "inline-block", flex: "none" }} />
            <span style={{
              fontFamily: F, fontSize: "16px", fontWeight: 500, letterSpacing: "1.6px",
              textTransform: "uppercase", color: dot,
            }}>{title} · {items.length}</span>
          </div>

          {shown.map((t, i) => (
            <div key={`${t.num}-${i}`} style={{
              display: "flex", alignItems: "baseline", gap: "12px",
              padding: "8px 0", borderBottom: `1px solid ${hair}`,
            }}>
              {taskNum(t.num)}
              <span style={{
                flex: 1, minWidth: 0, fontFamily: F, fontSize: "17px", color: textColor,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{t.name}</span>
              <span style={{
                fontFamily: FONT_MONO, fontSize: "17px", flex: "none", textAlign: "right",
                color: t.plan > 0 && t.done > t.plan ? danger : textColor,
              }}>
                {showProgress ? `${fmt2(t.done)} / ${fmt2(t.plan)}` : fmt2(t.done)}
              </span>
            </div>
          ))}

          {rest > 0 && (
            <div style={{ display: "flex", gap: "12px", padding: "8px 0", color: mutedColor }}>
              <span style={{ width: "62px", flex: "none" }} />
              <span style={{ flex: 1, fontFamily: F, fontSize: "17px" }}>и ещё {rest}</span>
              <span style={{ fontFamily: FONT_MONO, fontSize: "17px" }}>{fmt2(restHours)}</span>
            </div>
          )}
        </div>
      );
    };

    return (
      <div style={shell}>
        {head("Работа за месяц")}
        <div style={{ flex: "1 1 auto", minHeight: 0, display: "flex", gap: "44px" }}>
          {column("Сделано", c.closed, success, false)}
          <div style={{ width: "2px", background: ink, flex: "none" }} />
          {column("Осталось", c.open, ink, true)}
        </div>
      </div>
    );
  }

  /* ═════════════════════ 4. Что дальше ═════════════════════ */
  if (slide.type === "next") {
    const c = slide.content as {
      committed: number; budget: number; free: number; fullMonth: number;
      backlogTotal: number; backlogCount: number;
      large: { num: string; name: string; left: number }[];
      scenarios: { label: string; lines: string[]; hours: number }[];
    };

    const short = c.free < 0;

    return (
      <div style={shell}>
        {head("Что дальше")}

        <div style={{ flex: "none", display: "flex", gap: "40px", flexWrap: "wrap", marginBottom: "22px" }}>
          <div>{label("Переходит по задачам")}{figure(fmt2(c.committed))}</div>
          <div>{label("Бюджет месяца")}{figure(fmt2(c.budget))}</div>
          <div>
            {label(short ? "Не хватает" : "Свободно")}
            {figure(fmt2(Math.abs(c.free)), short ? danger : success)}
          </div>
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            {label(`В беклоге · ${c.backlogCount}`)}
            {figure(fmt2(c.backlogTotal), mutedColor)}
          </div>
        </div>

        <div style={{ flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: "16px" }}>
          {short ? (
            <p style={{ fontFamily: F, fontSize: "23px", lineHeight: 1.45, color: textColor }}>
              Переходящие задачи не влезают в бюджет: нужно {fmt2(c.committed)} ч при бюджете {fmt2(c.budget)} ч.
              Либо увеличиваем бюджет, либо часть задач переносим. Полный месяц — {c.fullMonth} ч.
            </p>
          ) : c.scenarios.length > 0 ? (
            c.scenarios.map((s, i) => (
              <div key={i} style={{ border: `2px solid ${ink}`, borderRadius: "10px", padding: "16px 20px" }}>
                <p style={{ fontFamily: F, fontSize: "19px", fontWeight: 500, color: textColor, marginBottom: "6px" }}>
                  {s.label}
                </p>
                {s.lines.map((line, j) => (
                  <p key={j} style={{ fontFamily: F, fontSize: "17px", lineHeight: 1.45, color: mutedColor }}>{line}</p>
                ))}
              </div>
            ))
          ) : (
            <p style={{ fontFamily: F, fontSize: "23px", lineHeight: 1.45, color: textColor }}>
              Свободно {fmt2(c.free)} ч, в беклоге {fmt2(c.backlogTotal)} ч — берём целиком.
            </p>
          )}

          {c.large.length > 0 && (
            <div style={{ borderTop: `2px solid ${ink}`, paddingTop: "14px" }}>
              <p style={{ fontFamily: F, fontSize: "14px", letterSpacing: "1.8px", textTransform: "uppercase", color: mutedColor, marginBottom: "8px" }}>
                Крупные задачи
              </p>
              {c.large.slice(0, 3).map((t, i) => (
                <p key={i} style={{ fontFamily: F, fontSize: "18px", color: textColor }}>
                  {t.name} — {fmt2(t.left)} ч
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ═════════════════════ 5. Итог месяца ═════════════════════ */
  if (slide.type === "verdict") {
    const c = slide.content as { facts: string[] };

    /* Позитивы: от ИИ, если он видел комментарии, иначе факты из чисел.
       Заготовка сухая намеренно — лучше сухой факт, чем выдуманная
       бодрость. Оценку работы даёт руководитель, не презентация. */
    const done = aiConclusion?.achievements?.length ? aiConclusion.achievements : c.facts;
    const attention = aiConclusion?.risks ?? [];
    const verdict = aiConclusion?.summary ?? [];

    const section = (title: string, items: string[], dot: string) => (
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
          <span style={{ width: "11px", height: "11px", borderRadius: "50%", background: dot, display: "inline-block", flex: "none" }} />
          <span style={{
            fontFamily: F, fontSize: "16px", fontWeight: 500, letterSpacing: "1.6px",
            textTransform: "uppercase", color: dot,
          }}>{title}</span>
        </div>
        {items.slice(0, 3).map((item, i) => (
          <p key={i} style={{ fontFamily: F, fontSize: "19px", lineHeight: 1.5, color: textColor, marginBottom: "10px" }}>
            {item}
          </p>
        ))}
      </div>
    );

    return (
      <div style={shell}>
        {head("Итог месяца", aiConclusion ? (aiConclusion.source === "ai" ? "сгенерировано ИИ" : "заполнено вручную") : undefined)}

        <div style={{ flex: "1 1 auto", minHeight: 0, display: "flex", gap: "44px", alignItems: "flex-start" }}>
          {done.length > 0 && section("Что сделано", done, success)}
          {attention.length > 0 && section("Требует внимания", attention, danger)}
        </div>

        {verdict.length > 0 && (
          <div style={{ flex: "none", borderTop: `3px solid ${ink}`, paddingTop: "18px", marginTop: "18px" }}>
            {verdict.slice(0, 2).map((line, i) => (
              <p key={i} style={{ fontFamily: F, fontSize: "23px", lineHeight: 1.45, color: textColor }}>{line}</p>
            ))}
          </div>
        )}
      </div>
    );
  }

  return null;
}
