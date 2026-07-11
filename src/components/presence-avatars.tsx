"use client";
/**
 * PresenceAvatars — «кто сейчас онлайн».
 * Опрашивает /api/presence раз в 45 секунд и показывает стопку аватарок.
 */
import React, { useEffect, useState, useCallback } from "react";

interface OnlineUser {
  id: string;
  username: string;
  displayName: string;
  role: string;
}

const ROLE_LABEL: Record<string, string> = {
  admin: "админ", editor: "редактор", viewer: "зритель", member: "участник", guest: "гость",
};

export function PresenceAvatars({ token, currentUserId }: { token: string; currentUserId: string }) {
  const [users, setUsers] = useState<OnlineUser[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/presence", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.users)) {
        setUsers(data.users.filter((u: OnlineUser) => u.id !== currentUserId));
      }
    } catch { /* silent */ }
  }, [token, currentUserId]);

  useEffect(() => {
    const t = setTimeout(load, 0); // первый запрос — вне тела эффекта
    const interval = setInterval(load, 45_000);
    return () => { clearTimeout(t); clearInterval(interval); };
  }, [load]);

  if (users.length === 0) return null;

  const shown = users.slice(0, 4);
  const rest = users.length - shown.length;

  return (
    <div
      className="hidden md:flex items-center shrink-0 -space-x-1.5 pr-1"
      title={`Сейчас онлайн: ${users.map(u => u.displayName || u.username).join(", ")}`}
    >
      {shown.map((u) => (
        <div
          key={u.id}
          className="w-6 h-6 rounded-full flex items-center justify-center border-2 border-[#17181C] shrink-0"
          style={{ background: "color-mix(in srgb, var(--tracker-accent, #9B72CF) 25%, #fff)" }}
          title={`${u.displayName || u.username} (${ROLE_LABEL[u.role] || u.role}) — онлайн`}
        >
          <span className="text-[9px] font-bold" style={{ color: "var(--tracker-accent-fg-dark, var(--tracker-accent))" }}>
            {(u.displayName || u.username).charAt(0).toUpperCase()}
          </span>
        </div>
      ))}
      {rest > 0 && (
        <div className="w-6 h-6 rounded-full flex items-center justify-center border-2 border-[#17181C] bg-[rgba(250,250,248,0.16)] shrink-0">
          <span className="text-[8px] font-bold" style={{ color: "rgba(250,250,248,0.8)" }}>+{rest}</span>
        </div>
      )}
      <span className="ml-3 mr-1 size-1.5 rounded-full bg-green-500 shrink-0" />
    </div>
  );
}
