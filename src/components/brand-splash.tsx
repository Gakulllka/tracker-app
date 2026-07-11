"use client";
/**
 * BrandSplash — фирменный экран загрузки.
 *
 * Единый для всех: графит и бумага, без привязки к теме пользователя.
 * Знак — стек вложенных «дельт» (Δ — разница план/факт, суть продукта),
 * контур верхней рисуется в цикле. Используется и при проверке сессии,
 * и при первой загрузке данных.
 */
import React from "react";

const INK = "#17181C";
const PAPER = "#FAFAF8";

interface BrandSplashProps {
  /** Показан ли сплэш (false — плавно растворяется и отпускает клики). */
  visible: boolean;
  /** Подпись под знаком. */
  label?: string;
}

export function BrandSplash({ visible, label = "Загрузка..." }: BrandSplashProps) {
  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center transition-opacity duration-700 ${
        visible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
      style={{ background: INK }}
      aria-hidden={!visible}
    >
      <div
        className={`flex flex-col items-center transition-transform duration-500 ${
          visible ? "scale-100" : "scale-[0.97]"
        }`}
      >
        {/* Знак: три вложенные дельты, внешняя — рисуется */}
        <svg width="88" height="80" viewBox="0 0 44 40" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <polygon
            className="brand-delta-draw"
            points="22,3 41,37 3,37"
            fill="none" stroke={PAPER} strokeWidth="2" strokeLinejoin="round"
          />
          <polygon
            className="brand-delta-fade brand-delta-fade-1"
            points="22,11.5 35.5,35 8.5,35"
            fill="none" stroke={PAPER} strokeWidth="1.1" strokeLinejoin="round"
          />
          <polygon
            className="brand-delta-fade brand-delta-fade-2"
            points="22,20 30,34 14,34"
            fill="none" stroke={PAPER} strokeWidth="0.9" strokeLinejoin="round"
          />
        </svg>

        {/* Словесный знак */}
        <p
          className="mt-5 text-[13px] font-semibold uppercase select-none"
          style={{ color: PAPER, letterSpacing: "0.42em", marginRight: "-0.42em", fontFamily: "var(--font-geist-mono, ui-monospace, monospace)" }}
        >
          Delta
        </p>

        {/* Подпись */}
        <p className="mt-6 text-[12px]" style={{ color: "rgba(250,250,248,0.45)" }}>
          {label}
        </p>

        {/* Тонкая линия прогресса */}
        <div className="mt-4 h-px w-40 overflow-hidden rounded-full" style={{ background: "rgba(250,250,248,0.14)" }}>
          <div className="brand-progress-line h-full w-1/3 rounded-full" style={{ background: "rgba(250,250,248,0.75)" }} />
        </div>
      </div>
    </div>
  );
}
