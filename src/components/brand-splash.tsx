"use client";
/**
 * BrandSplash — фирменный экран загрузки.
 *
 * Единый для всех: графит и бумага, без привязки к теме пользователя.
 * Знак — стек вложенных «дельт» с разной прозрачностью.
 * Используется и при проверке сессии, и при первой загрузке данных.
 */
import React from "react";
import { RAIL } from "@/lib/tokens";

/* Заставка графитовая в обеих темах — как рельса. Раньше здесь стояли
   токены темы, и в тёмной теме экран инвертировался, хотя в описании
   значилось «единый для всех, без привязки к теме пользователя». */
const INK = RAIL.bg;
const PAPER = RAIL.text;

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
      {/* Линии концентрации — приём манги для кульминации кадра.
          Единственное место в приложении, где им позволено появиться:
          если поставить их везде, они перестанут что-либо значить. */}
      <svg
        className="brand-speedlines pointer-events-none absolute inset-0 h-full w-full"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="brand-speedlines-fade">
            <stop offset="42%" stopColor="#fff" stopOpacity="0" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0.55" />
          </radialGradient>
          <mask id="brand-speedlines-mask">
            <rect width="100" height="100" fill="url(#brand-speedlines-fade)" />
          </mask>
        </defs>
        <g mask="url(#brand-speedlines-mask)" stroke={PAPER} strokeWidth="0.45">
          {Array.from({ length: 28 }, (_, i) => {
            const angle = (i / 28) * Math.PI * 2;
            return (
              <line
                key={i}
                x1={50 + Math.cos(angle) * 18}
                y1={44 + Math.sin(angle) * 18}
                x2={50 + Math.cos(angle) * 110}
                y2={44 + Math.sin(angle) * 110}
              />
            );
          })}
        </g>
      </svg>

      <div
        className={`relative flex flex-col items-center transition-transform duration-500 ${
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
            strokeWidth="4.5"
            strokeLinejoin="round"
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
            strokeWidth="2.4"
            strokeLinejoin="round"
            className="absolute inset-0"
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
            strokeWidth="1.2"
            strokeLinejoin="round"
            className="absolute inset-0"
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
