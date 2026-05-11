/* ================================================================ *
 *  Phase 7.3: Парсер формул в комментариях.                       *
 * ================================================================ *
 *
 *  Юзер пишет комментарий вида:
 *    @факт+10  @план-5 ок сделал
 *    @факт*2
 *    @план/3
 *    @факт=20
 *
 *  При сохранении (blur поля):
 *  1. Распознаём все формулы.
 *  2. Применяем к task.factH / task.planH (с учётом текущего значения).
 *  3. Заменяем сам комментарий на системную запись:
 *     "🧮 факт изменён: 30 → 40 ч (формула: @факт+10)"
 *  4. Если формул несколько — несколько строк системной записи.
 *  5. Невалидные формулы (например `@факт+abc`) — игнорируются,
 *     текст остаётся как есть, ничего не применяется.
 *
 *  Поддерживаемые операции: + - * / =
 *  Поддерживаемые цели: @факт, @план (kase-insensitive)
 *  Пробелы вокруг оператора и операнда — допустимы. */

export type FormulaTarget = "fact" | "plan";
export type FormulaOp = "+" | "-" | "*" | "/" | "=";

export interface ParsedFormula {
  /** Исходная подстрока формулы (для замены в тексте) */
  raw: string;
  target: FormulaTarget;
  op: FormulaOp;
  operand: number;
}

const FORMULA_RE = /@(факт|план)\s*([+\-*/=])\s*(\d+(?:[.,]\d+)?)/giu;

/** Парсит все формулы из текста. Возвращает массив + текст с вырезанными формулами. */
export function parseFormulas(text: string): { formulas: ParsedFormula[]; remainingText: string } {
  const formulas: ParsedFormula[] = [];
  let remainingText = text;
  let match: RegExpExecArray | null;
  // Reset regex
  FORMULA_RE.lastIndex = 0;
  while ((match = FORMULA_RE.exec(text)) !== null) {
    const [raw, targetWord, opChar, operandStr] = match;
    const target: FormulaTarget = targetWord.toLowerCase() === "факт" ? "fact" : "plan";
    const op = opChar as FormulaOp;
    const operand = Number(operandStr.replace(",", "."));
    if (isNaN(operand)) continue;
    formulas.push({ raw, target, op, operand });
  }
  // Удалим формулы из текста (для случая когда формулы среди обычного текста)
  for (const f of formulas) {
    remainingText = remainingText.replace(f.raw, "");
  }
  // Убрать лишние пробелы
  remainingText = remainingText.replace(/\s+/g, " ").trim();
  return { formulas, remainingText };
}

/** Применяет операцию к значению. Если op = "=" — заменяет полностью. */
export function applyFormula(currentValue: number, op: FormulaOp, operand: number): number {
  switch (op) {
    case "+": return currentValue + operand;
    case "-": return currentValue - operand;
    case "*": return currentValue * operand;
    case "/": return operand === 0 ? currentValue : currentValue / operand;
    case "=": return operand;
  }
}

/** Описание формулы для системной записи. */
export function describeFormula(f: ParsedFormula, oldValue: number, newValue: number): string {
  const targetLabel = f.target === "fact" ? "факт" : "план";
  return `${targetLabel} ${formatNumber(oldValue)} → ${formatNumber(newValue)} ч`;
}

function formatNumber(n: number): string {
  if (isNaN(n) || !isFinite(n)) return "0";
  // Округление до 2 знаков, без лишних нулей
  const rounded = Math.round(n * 100) / 100;
  return String(rounded);
}
