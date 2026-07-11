/**
 * Простейший in-memory rate-limiter для попыток входа.
 *
 * Ограничения серверлесс-среды (Netlify): память живёт в пределах одного
 * инстанса функции и сбрасывается при холодном старте. Это не даёт железной
 * гарантии, но отсекает наивный перебор паролей. Для строгой защиты нужен
 * внешний стор (Redis/Upstash) — сознательно не тащим зависимость.
 */

interface Bucket {
  fails: number;
  blockedUntil: number; // ms epoch, 0 = не заблокирован
  firstFailAt: number;
}

const MAX_FAILS = 5;            // попыток...
const WINDOW_MS = 10 * 60_000;  // ...в течение 10 минут
const BLOCK_MS = 15 * 60_000;   // блок на 15 минут

const buckets = new Map<string, Bucket>();

function prune() {
  // Не даём Map расти бесконечно
  if (buckets.size < 1000) return;
  const now = Date.now();
  for (const [k, b] of buckets) {
    if (b.blockedUntil < now && now - b.firstFailAt > WINDOW_MS) buckets.delete(k);
  }
}

/** Возвращает секунды до разблокировки или 0, если можно пробовать. */
export function loginBlockedFor(key: string): number {
  const b = buckets.get(key);
  if (!b) return 0;
  const now = Date.now();
  if (b.blockedUntil > now) return Math.ceil((b.blockedUntil - now) / 1000);
  return 0;
}

/** Зафиксировать неудачную попытку входа. */
export function recordLoginFail(key: string): void {
  prune();
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.firstFailAt > WINDOW_MS) {
    buckets.set(key, { fails: 1, blockedUntil: 0, firstFailAt: now });
    return;
  }
  b.fails += 1;
  if (b.fails >= MAX_FAILS) {
    b.blockedUntil = now + BLOCK_MS;
    b.fails = 0;
    b.firstFailAt = now;
  }
}

/** Сбросить счётчик после успешного входа. */
export function recordLoginSuccess(key: string): void {
  buckets.delete(key);
}
