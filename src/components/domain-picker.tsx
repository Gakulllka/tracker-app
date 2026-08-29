"use client";
/**
 * DomainPickerScreen — экран выбора домена при первом входе.
 *
 * Показывается после авторизации, если пользователь ещё не выбрал домен.
 * Позволяет:
 *  - выбрать существующий домен для входа
 *  - запросить доступ к домену (для удобства)
 *  - создать новый домен
 */
import React, { useState, useEffect, useCallback } from "react";
import { Loader2, Plus, Lock, ArrowRight, Eye } from "lucide-react";
import { RAIL } from "@/lib/tokens";

/* Выбор домена — часть парадной двери, оформление одинаково для всех тем
   (см. auth-screen). Токены темы здесь брать нельзя: TEXT/MUTED светлые. */
const INK = RAIL.bg;
const INK_SOFT = "#26282E";
const PAPER = RAIL.text;
const CARD = "#FFFFFF";
const LINE = "#DEDDD6";
const TEXT = "#1C1D21";
const MUTED = "#8B8A84";
const MONO = "var(--font-geist-mono, ui-monospace, monospace)";

interface Domain {
  id: string;
  name: string;
  archived?: boolean;
}

interface DomainPickerProps {
  domains: Domain[];
  editableDomainIds: "all" | string[];
  currentUser: { id: string; username: string; displayName: string; role: string };
  token: string;
  onSelectDomain: (domainId: string) => void;
  onCreateDomain: (name: string) => Promise<void>;
  onRequestAccess: (domainId: string) => Promise<void>;
  onLogout: () => void;
}

export function DomainPickerScreen({
  domains,
  editableDomainIds,
  currentUser,
  token,
  onSelectDomain,
  onCreateDomain,
  onRequestAccess,
  onLogout,
}: DomainPickerProps) {
  const [creating, setCreating] = useState(false);
  const [newDomainName, setNewDomainName] = useState("");
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);

  const displayName = currentUser.displayName || currentUser.username;
  const initial = displayName.charAt(0).toUpperCase();

  const canEditDomain = useCallback(
    (domainId: string) => {
      if (editableDomainIds === "all") return true;
      return Array.isArray(editableDomainIds) && editableDomainIds.includes(domainId);
    },
    [editableDomainIds]
  );

  const handleCreate = async () => {
    const name = newDomainName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await onCreateDomain(name);
      setNewDomainName("");
      setShowCreate(false);
    } finally {
      setCreating(false);
    }
  };

  const handleRequestAccess = async (domainId: string) => {
    setRequestingId(domainId);
    try {
      await onRequestAccess(domainId);
      setRequestedIds((prev) => new Set(prev).add(domainId));
    } finally {
      setRequestingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex" style={{ background: PAPER }}>
      {/* ── Брендовая панель (десктоп) ── */}
      <div
        className="hidden lg:flex flex-col justify-between w-[42%] max-w-[560px] shrink-0 p-10"
        style={{ background: INK }}
      >
        {/* Словесный знак */}
        <div className="flex items-center gap-2.5 select-none">
          <svg width="18" height="16" viewBox="0 0 44 40" xmlns="http://www.w3.org/2000/svg" style={{ color: PAPER }}>
            <polygon points="22,3 41,37 3,37" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
            <polygon points="22,13 35,35 9,35" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
          <span
            className="text-[13px] font-semibold uppercase"
            style={{ color: PAPER, letterSpacing: "0.38em", fontFamily: MONO }}
          >
            Delta
          </span>
        </div>

        {/* Знак и мысль */}
        <div className="flex flex-col items-start gap-8">
          <svg
            className="brand-hero-delta"
            width={260} height={234} viewBox="0 0 100 90"
            xmlns="http://www.w3.org/2000/svg" aria-hidden
          >
            <polygon points="50,4 96,86 4,86" fill="none" stroke={PAPER} strokeWidth="3.2" strokeLinejoin="round" />
            <polygon points="50,20 86.5,84 13.5,84" fill="none" stroke={PAPER} strokeWidth="2" strokeLinejoin="round" />
            <polygon points="50,36 77,82 23,82" fill="none" stroke={PAPER} strokeWidth="1.4" strokeLinejoin="round" />
            <polygon points="50,52 67.5,80 32.5,80" fill="none" stroke={PAPER} strokeWidth="1" strokeLinejoin="round" />
            <polygon points="50,66 59,78.5 41,78.5" fill="none" stroke={PAPER} strokeWidth="0.8" strokeLinejoin="round" />
          </svg>
          <div>
            <p className="text-[22px] font-semibold leading-snug tracking-tight" style={{ color: PAPER }}>
              Выберите пространство<br />для работы
            </p>
            <p className="mt-3 text-[13.5px] leading-relaxed" style={{ color: "rgba(250,250,248,0.55)" }}>
              Домен — это общее пространство задач<br />
              для команды. Выберите или создайте новый.
            </p>
          </div>
        </div>

        <p className="text-[11px] select-none" style={{ color: "rgba(250,250,248,0.30)", fontFamily: MONO }}>
          Δ · трекер задач команды
        </p>
      </div>

      {/* ── Список доменов ── */}
      <div className="flex-1 flex flex-col items-center justify-start px-5 py-10 overflow-y-auto">
        <div className="w-full max-w-[440px]">

          {/* Мобильный знак */}
          <div className="lg:hidden flex flex-col items-center mb-8 select-none">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: INK }}
            >
              <svg width="24" height="22" viewBox="0 0 44 40" xmlns="http://www.w3.org/2000/svg" style={{ color: PAPER }}>
                <polygon points="22,3 41,37 3,37" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
                <polygon points="22,13 35,35 9,35" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
            </div>
            <span
              className="mt-3 text-[11px] font-semibold uppercase"
              style={{ color: TEXT, letterSpacing: "0.38em", marginRight: "-0.38em", fontFamily: MONO }}
            >
              Delta
            </span>
          </div>

          <h1 className="text-[24px] font-bold tracking-tight" style={{ color: TEXT }}>
            Выберите домен
          </h1>
          <p className="mt-1.5 text-[13.5px]" style={{ color: MUTED }}>
            Домен — это пространство задач. Выберите для работы или создайте новый.
          </p>

          {/* ── Список доменов ── */}
          <div className="mt-6 space-y-2">
            {domains.map((domain) => {
              const editable = canEditDomain(domain.id);
              const isRequested = requestedIds.has(domain.id);
              const isRequesting = requestingId === domain.id;

              return (
                <div
                  key={domain.id}
                  className="flex items-center gap-3 rounded-xl border p-4 transition-all hover:shadow-md"
                  style={{
                    background: CARD,
                    borderColor: LINE,
                  }}
                >
                  {/* Иконка */}
                  <div
                    className="flex items-center justify-center size-10 rounded-lg shrink-0"
                    style={{ background: editable ? INK : "var(--tracker-accent-bg)" }}
                  >
                    {editable ? (
                      <svg width="18" height="16" viewBox="0 0 40 36" xmlns="http://www.w3.org/2000/svg" style={{ color: PAPER }}>
                        <polygon points="20,2 38,34 2,34" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <Lock className="size-4" style={{ color: MUTED }} />
                    )}
                  </div>

                  {/* Название + статус */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold truncate" style={{ color: TEXT }}>
                      {domain.name}
                    </p>
                    <p className="text-[12px]" style={{ color: MUTED }}>
                      {editable ? "Есть доступ" : "Только просмотр"}
                    </p>
                  </div>

                  {/* Кнопки */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => onSelectDomain(domain.id)}
                      className="h-9 px-4 rounded-lg text-[13px] font-semibold inline-flex items-center gap-1.5 transition-colors"
                      style={{ background: INK, color: PAPER }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = INK_SOFT; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = INK; }}
                    >
                      Войти <ArrowRight className="size-3.5" />
                    </button>
                    {!editable && (
                      <button
                        onClick={() => handleRequestAccess(domain.id)}
                        disabled={isRequesting || isRequested}
                        className="h-9 px-3 rounded-lg text-[12px] font-medium inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
                        style={{
                          background: isRequested ? "var(--tracker-accent-bg)" : "transparent",
                          color: isRequested ? MUTED : TEXT,
                          border: `1px solid ${isRequested ? "var(--tracker-border)" : LINE}`,
                        }}
                      >
                        {isRequesting ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : isRequested ? (
                          "✓ Запрос"
                        ) : (
                          "Запросить доступ"
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Создать домен ── */}
          <div className="mt-4">
            {showCreate ? (
              <div
                className="rounded-xl border p-4"
                style={{ background: CARD, borderColor: LINE }}
              >
                <label className="text-[12px] font-medium" style={{ color: TEXT }}>
                  Название домена
                </label>
                <div className="mt-1.5 flex gap-2">
                  <input
                    type="text"
                    value={newDomainName}
                    onChange={(e) => setNewDomainName(e.target.value)}
                    placeholder="Например: Маркетинг"
                    autoFocus
                    className="flex-1 h-10 rounded-lg px-3 text-[14px] outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(23,24,28,0.10)]"
                    style={{ background: PAPER, border: `1px solid ${LINE}`, color: TEXT }}
                    onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
                  />
                  <button
                    onClick={handleCreate}
                    disabled={!newDomainName.trim() || creating}
                    className="h-10 px-4 rounded-lg text-[13px] font-semibold inline-flex items-center gap-1.5 transition-colors disabled:opacity-45"
                    style={{ background: INK, color: PAPER }}
                  >
                    {creating ? <Loader2 className="size-3.5 animate-spin" /> : "Создать"}
                  </button>
                  <button
                    onClick={() => { setShowCreate(false); setNewDomainName(""); }}
                    className="h-10 px-3 rounded-lg text-[13px] font-medium transition-colors"
                    style={{ color: MUTED }}
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowCreate(true)}
                className="w-full h-12 rounded-xl border border-dashed text-[13px] font-medium inline-flex items-center justify-center gap-2 transition-colors hover:bg-black/[0.02]"
                style={{ borderColor: "var(--tracker-border)", color: TEXT }}
              >
                <Plus className="size-4" />
                Создать новый домен
              </button>
            )}
          </div>

          {/* ── Пользователь + выход ── */}
          <div className="mt-8 pt-5 flex items-center justify-between" style={{ borderTop: `1px solid ${LINE}` }}>
            <div className="flex items-center gap-2.5">
              <div
                className="size-8 rounded-full flex items-center justify-center text-[13px] font-bold"
                style={{ background: INK, color: PAPER }}
              >
                {initial}
              </div>
              <div>
                <p className="text-[13px] font-medium" style={{ color: TEXT }}>{displayName}</p>
                <p className="text-[11px]" style={{ color: MUTED }}>
                  {currentUser.role === "admin" ? "Администратор" :
                   currentUser.role === "editor" ? "Редактор" :
                   currentUser.role === "viewer" ? "Наблюдатель" :
                   currentUser.role === "member" ? "Участник" : "Гость"}
                </p>
              </div>
            </div>
            <button
              onClick={onLogout}
              className="text-[12px] font-medium hover:underline underline-offset-4"
              style={{ color: MUTED }}
            >
              Выйти
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
