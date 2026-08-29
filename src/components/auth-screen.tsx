"use client";
/**
 * AuthScreen — вход и регистрация.
 *
 * Фирменная «дверь» продукта: единая для всех, не зависит от темы
 * и акцентного цвета пользователя. Графит и бумага, знак — стек
 * вложенных «дельт» (Δ = разница план/факт). Цвет начинается внутри.
 *
 * Десктоп: брендовая панель слева + форма справа. Мобильный: форма
 * с компактным знаком сверху.
 */
import React, { useState, useEffect } from "react";
import { RAIL, DOOR } from "@/lib/tokens";
import { Loader2, ArrowRight, Eye } from "lucide-react";

/* Фиксированные фирменные токены (сознательно не из темы) */
/* Вход — парадная дверь продукта, и она одинакова для всех.
   Раньше часть цветов бралась из токенов темы, а часть была захардкожена
   светлой: в тёмной теме тёмный текст ложился на тёмный фон. */
const INK = RAIL.bg;
const INK_SOFT = DOOR.inkSoft;
const PAPER = RAIL.text;
const CARD = DOOR.card;
const LINE = DOOR.line;
const TEXT = DOOR.text;
const MUTED = DOOR.muted;
const MONO = "var(--font-geist-mono, ui-monospace, monospace)";

interface AuthScreenProps {
  onAuth: (data: {
    token: string;
    workspaceId: string;
    user: { id: string; username: string; displayName: string; role: string; roleName?: string };
    permissions?: unknown;
    rolePermissions?: unknown;
    editableDomainIds?: "all" | string[];
  }) => void;
}

/** Стек вложенных дельт — фирменный знак на брендовой панели. */
function DeltaStack({ size = 260, stroke = PAPER }: { size?: number; stroke?: string }) {
  return (
    <svg
      className="brand-hero-delta"
      width={size} height={size * 0.9} viewBox="0 0 100 90"
      xmlns="http://www.w3.org/2000/svg" aria-hidden
    >
      <polygon points="50,4 96,86 4,86" fill="none" stroke={stroke} strokeWidth="3.2" strokeLinejoin="round" />
      <polygon points="50,20 86.5,84 13.5,84" fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
      <polygon points="50,36 77,82 23,82" fill="none" stroke={stroke} strokeWidth="1.4" strokeLinejoin="round" />
      <polygon points="50,52 67.5,80 32.5,80" fill="none" stroke={stroke} strokeWidth="1" strokeLinejoin="round" />
      <polygon points="50,66 59,78.5 41,78.5" fill="none" stroke={stroke} strokeWidth="0.8" strokeLinejoin="round" />
    </svg>
  );
}

/** Компактный знак для мобильной версии и словесного знака. */
function DeltaMark({ size = 20, color = PAPER }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size * 0.9} viewBox="0 0 44 40" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <polygon points="22,3 41,37 3,37" fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" />
      <polygon points="22,13 35,35 9,35" fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export default function AuthScreen({ onAuth }: AuthScreenProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [error, setError] = useState("");


  /** Завершение авторизации: сохраняем токен, тянем права, входим. */
  const finishAuth = async (data: {
    token: string;
    workspaceId: string;
    user: { id: string; username: string; displayName: string; role: string };
  }) => {
    localStorage.setItem("auth_token", data.token);
    localStorage.setItem("auth_user", JSON.stringify(data.user));
    localStorage.setItem("auth_workspace", data.workspaceId);
    document.cookie = `auth_token=${encodeURIComponent(data.token)}; path=/; max-age=2592000; SameSite=Lax`;

    let permissions: unknown = null;
    let rolePermissions: unknown = null;
    let editableDomainIds: "all" | string[] = [];
    try {
      const meRes = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${data.token}` },
      });
      if (meRes.ok) {
        const meData = await meRes.json();
        if (meData.success) {
          permissions = meData.permissions ?? null;
          rolePermissions = meData.rolePermissions ?? null;
          editableDomainIds = meData.editableDomainIds ?? [];
          localStorage.setItem("auth_permissions", JSON.stringify(permissions));
          localStorage.setItem("auth_role_permissions", JSON.stringify(rolePermissions));
          localStorage.setItem("auth_editable_domains", JSON.stringify(editableDomainIds));
        }
      }
    } catch { /* ignore */ }

    onAuth({
      token: data.token,
      workspaceId: data.workspaceId,
      user: data.user,
      permissions,
      rolePermissions,
      editableDomainIds,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body: Record<string, string> = { username: username.trim() };
      if (password) body.password = password;
      if (mode === "register" && displayName.trim()) body.displayName = displayName.trim();

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Ошибка"); return; }
      await finishAuth({ token: data.token, workspaceId: data.workspaceId, user: data.user });
    } catch {
      setError("Нет соединения с сервером. Проверьте сеть и попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  };

  const handleGuest = async () => {
    setError("");
    setGuestLoading(true);
    try {
      const res = await fetch("/api/auth/guest", { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Гостевой вход сейчас недоступен"); return; }
      await finishAuth({ token: data.token, workspaceId: data.workspaceId, user: data.user });
    } catch {
      setError("Нет соединения с сервером. Проверьте сеть и попробуйте ещё раз.");
    } finally {
      setGuestLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    background: CARD,
    /* Чернильный контур 2px — тот же, что у карточек и диалогов. */
    border: `2px solid ${INK}`,
    color: TEXT,
  };

  const canSubmit = !loading && !guestLoading && !!username.trim() &&
    (mode === "login" || password.length >= 4);

  return (
    <div className="fixed inset-0 z-[200] flex" style={{ background: PAPER }}>

      {/* ── Брендовая панель (десктоп) ── */}
      <div
        className="hidden lg:flex flex-col justify-between w-[42%] max-w-[560px] shrink-0 p-10"
        style={{ background: INK }}
      >
        {/* Словесный знак */}
        <div className="flex items-center gap-2.5 select-none">
          <DeltaMark size={18} />
          <span
            className="text-[13px] font-semibold uppercase"
            style={{ color: PAPER, letterSpacing: "0.38em", fontFamily: MONO }}
          >
            Delta
          </span>
        </div>

        {/* Знак и мысль */}
        <div className="flex flex-col items-start gap-8">
          <DeltaStack />
          <div>
            <p className="text-[22px] font-semibold leading-snug tracking-tight" style={{ color: PAPER }}>
              Дельта — это разница<br />между планом и фактом.
            </p>
            <p className="mt-3 text-[13.5px] leading-relaxed" style={{ color: "rgba(250,250,248,0.55)" }}>
              Задачи по месяцам, часы, бэклог и вопросы —<br />
              в одном общем пространстве команды.
            </p>
          </div>
        </div>

        <p className="text-[11px] select-none" style={{ color: "rgba(250,250,248,0.30)", fontFamily: MONO }}>
          Δ · трекер задач команды
        </p>
      </div>

      {/* ── Форма ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-10 overflow-y-auto">
        <div className="w-full max-w-[360px]">

          {/* Мобильный знак */}
          <div className="lg:hidden flex flex-col items-center mb-8 select-none">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: INK }}
            >
              <DeltaMark size={24} />
            </div>
            <span
              className="mt-3 text-[11px] font-semibold uppercase"
              style={{ color: TEXT, letterSpacing: "0.38em", marginRight: "-0.38em", fontFamily: MONO }}
            >
              Delta
            </span>
          </div>

          <h1 className="text-[28px] font-medium tracking-tight" style={{ color: TEXT }}>
            {mode === "login" ? "С возвращением" : "Новый аккаунт"}
          </h1>
          {/* Черта под подписью — та же структура титула, что в шапке месяца. */}
          <p
            className="mt-1.5 pb-4 text-[13.5px]"
            style={{ color: MUTED, borderBottom: `2px solid ${INK}` }}
          >
            {mode === "login"
              ? "Войдите, чтобы продолжить работу с задачами"
              : "Пара полей — и вы в общем пространстве команды"}
          </p>

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium" style={{ color: TEXT }}>Логин</label>
              <input
                type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                placeholder="ivan" autoComplete="username" disabled={loading}
                className="h-11 rounded-[10px] px-3.5 text-[14px] outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(23,24,28,0.10)] focus:border-[var(--tracker-accent)]"
                style={inputStyle}
              />
            </div>

            {mode === "register" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium" style={{ color: TEXT }}>
                  Имя <span className="font-normal" style={{ color: MUTED }}>· необязательно</span>
                </label>
                <input
                  type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Иван Петров" autoComplete="name" disabled={loading}
                  className="h-11 rounded-[10px] px-3.5 text-[14px] outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(23,24,28,0.10)] focus:border-[var(--tracker-accent)]"
                  style={inputStyle}
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium" style={{ color: TEXT }}>
                Пароль
                {mode === "login" && <span className="font-normal" style={{ color: MUTED }}> · если был задан</span>}
                {mode === "register" && <span className="font-normal" style={{ color: MUTED }}> · минимум 4 символа</span>}
              </label>
              <input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" disabled={loading}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                className="h-11 rounded-[10px] px-3.5 text-[14px] outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(23,24,28,0.10)] focus:border-[var(--tracker-accent)]"
                style={inputStyle}
              />
            </div>

            {error && (
              <div
                className="text-[13px] px-3.5 py-2.5 rounded-[10px]"
                style={{ background: `color-mix(in srgb, ${DOOR.danger} 8%, ${DOOR.card})`, color: DOOR.danger, border: `1px solid color-mix(in srgb, ${DOOR.danger} 30%, ${DOOR.card})` }}
              >
                {error}
              </div>
            )}

            <button
              type="submit" disabled={!canSubmit}
              className="mt-1 h-11 w-full rounded-[10px] inline-flex items-center justify-center gap-2 text-[14px] font-semibold transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
              style={{ background: INK, color: PAPER }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = INK_SOFT; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = INK; }}
            >
              {loading
                ? <Loader2 className="size-4 animate-spin" />
                : <>{mode === "login" ? "Войти" : "Создать аккаунт"} <ArrowRight className="size-4" /></>}
            </button>
          </form>

          <div className="mt-6 pt-5 flex flex-col items-center gap-2.5" style={{ borderTop: `1px solid ${LINE}` }}>
            <button
              onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
              className="text-[13px] font-medium hover:underline underline-offset-4"
              style={{ color: TEXT }}
            >
              {mode === "login" ? "Нет аккаунта? Зарегистрироваться" : "Уже есть аккаунт? Войти"}
            </button>
            <button
              onClick={handleGuest} disabled={loading || guestLoading}
              className="inline-flex items-center gap-1.5 text-[12px] hover:underline underline-offset-4 disabled:opacity-50"
              style={{ color: MUTED }}
            >
              {guestLoading ? <Loader2 className="size-3 animate-spin" /> : <Eye className="size-3" />}
              Посмотреть как гость
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
