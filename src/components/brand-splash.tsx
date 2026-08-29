"use client";
/**
 * BrandSplash — фирменный экран загрузки.
 *
 * Единый для всех: графит и бумага, без привязки к теме пользователя.
 * Знак — стек вложенных «дельт» с разной прозрачностью.
 * Используется и при проверке сессии, и при первой загрузке данных.
 */
import React from "react";

const INK = "var(--tracker-accent)";
const PAPER = "var(--tracker-bg-main)";

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
        {/* Delta triangles — три вложенных SVG как в Delta-hub */}
        <div className="relative w-32 h-32 mb-8">
          {/* Внешний треугольник — дыхание */}
          <svg
            width="128"
            height="128"
            viewBox="0 0 100 100"
            fill="none"
            stroke={PAPER}
            strokeWidth="2"
            className="absolute inset-0"
            style={{
              animation: 'brand-hero-breathe 7s ease-in-out infinite',
              transformOrigin: '50% 62%',
            }}
          >
            <polygon points="50,8 92,88 8,88" />
          </svg>

          {/* Средний треугольник — прорисовка контура */}
          <svg
            width="128"
            height="128"
            viewBox="0 0 100 100"
            fill="none"
            stroke={PAPER}
            strokeWidth="2"
            className="absolute inset-0"
            style={{ opacity: 0.5 }}
          >
            <polygon
              points="50,25 78,78 22,78"
              style={{
                strokeDasharray: 118,
                strokeDashoffset: 118,
                animation: 'brand-delta-draw 2.4s ease-in-out infinite',
              }}
            />
          </svg>

          {/* Маленький треугольник */}
          <svg
            width="128"
            height="128"
            viewBox="0 0 100 100"
            fill="none"
            stroke={PAPER}
            strokeWidth="2"
            className="absolute inset-0"
            style={{ opacity: 0.25 }}
          >
            <polygon points="50,40 62,68 38,68" />
          </svg>
        </div>

        {/* Словесный знак */}
        <p
          className="font-mono text-xs font-semibold uppercase"
          style={{ color: 'rgba(250, 250, 248, 0.74)', letterSpacing: '0.2em' }}
        >
          DELTA
        </p>

        {/* Подпись */}
        <p className="mt-6 text-[12px]" style={{ color: "rgba(250,250,248,0.45)" }}>
          {label}
        </p>

        {/* Тонкая линия прогресса */}
        <div className="mt-4 w-24 h-0.5 overflow-hidden rounded-full" style={{ background: "rgba(250,250,248,0.12)" }}>
          <div
            className="h-full w-1/3 rounded-full"
            style={{
              background: PAPER,
              animation: 'brand-progress 1.6s ease-in-out infinite',
            }}
          />
        </div>
      </div>
    </div>
  );
}
