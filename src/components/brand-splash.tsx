"use client";
/**
 * BrandSplash — экран загрузки.
 *
 * Композиция титульного кадра: знак, слово Delta, название продукта,
 * черта прогресса и подпись. Единственный жест — знак прочерчивается
 * за секунду, от толстого контура к тонкому, и останавливается.
 *
 * Почему так, а не иначе. Заставку видят десятки раз в день по полсекунды.
 * Раньше здесь крутились четыре несинхронизированные бесконечные анимации
 * (дыхание, прорисовка, полоса, вращающиеся лучи), причём лучи были
 * растянуты на весь экран через preserveAspectRatio="none" и при вращении
 * неравномерно искажались. Осталось одно движение, у которого есть конец.
 *
 * Цвета фиксированные: графит и бумага в обеих темах, как рельса.
 */
import React from "react";
import { RAIL } from "@/lib/tokens";

interface BrandSplashProps {
  /** Показан ли экран (false — плавно растворяется и отпускает клики). */
  visible: boolean;
  /** Что именно грузится. */
  label?: string;
}

export function BrandSplash({ visible, label = "Загрузка..." }: BrandSplashProps) {
  return (
    <div
      className={`splash ${visible ? "" : "splash--hidden"}`}
      style={{ background: RAIL.bg }}
      aria-hidden={!visible}
      role="status"
    >
      <div className="splash-frame">
        <div className="splash-mark-row">
          <svg
            className="splash-mark"
            width="96"
            height="96"
            viewBox="0 0 100 100"
            fill="none"
            stroke={RAIL.text}
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {/* Толщина линии убывает от внешнего контура к внутреннему —
                иерархия набирается весом, а не прозрачностью. */}
            <polygon className="splash-stroke" points="50,8 92,88 8,88" strokeWidth="6" />
            <polygon className="splash-stroke splash-stroke--2" points="50,34 74,80 26,80" strokeWidth="2.6" />
          </svg>

          <div className="splash-titles">
            <p className="splash-wordmark">Delta</p>
            <p className="splash-product">Tasker</p>
          </div>
        </div>

        <div className="splash-rule">
          <i />
        </div>

        <p className="splash-label">{label}</p>
      </div>
    </div>
  );
}
