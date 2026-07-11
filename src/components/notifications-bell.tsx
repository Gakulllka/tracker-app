"use client";
/**
 * NotificationsBell — колокольчик с запросами доступа к доменам.
 *  - Тем, кто может решать (админ / глобальный редактор / редактор домена):
 *    входящие запросы с кнопками одобрить/отклонить.
 *  - Всем: статус собственных запросов.
 * Опрос раз в 45 секунд.
 */
import React, { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bell, Check, X, Clock } from "lucide-react";

export interface AccessRequest {
  id: string;
  domainId: string;
  domainName: string;
  userId: string;
  username: string;
  displayName: string;
  status: string;
  createdAt: string;
  canResolve: boolean;
}

interface NotificationsBellProps {
  token: string;
  currentUserId: string;
  toast: (opts: { title: string; description?: string }) => void;
  /** Вызывается после одобрения запроса (обновить права/доступы). */
  onResolved?: () => void;
}

export function NotificationsBell({ token, currentUserId, toast, onResolved }: NotificationsBellProps) {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/domains/access", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.requests)) setRequests(data.requests);
    } catch { /* silent */ }
  }, [token]);

  useEffect(() => {
    const t = setTimeout(load, 0); // первый запрос — вне тела эффекта
    const interval = setInterval(load, 45_000);
    return () => { clearTimeout(t); clearInterval(interval); };
  }, [load]);

  const incoming = requests.filter(
    (r) => r.status === "pending" && r.canResolve && r.userId !== currentUserId
  );
  const own = requests.filter((r) => r.userId === currentUserId);
  const count = incoming.length;

  const resolve = async (requestId: string, action: "approve" | "reject") => {
    setBusy(requestId);
    try {
      const res = await fetch("/api/domains/access", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ token, action, requestId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast({
          title: action === "approve" ? "Доступ выдан" : "Запрос отклонён",
        });
        await load();
        if (action === "approve") onResolved?.();
      } else {
        toast({ title: "Ошибка", description: data.error || "Не удалось обработать запрос" });
      }
    } catch {
      toast({ title: "Ошибка", description: "Нет соединения с сервером" });
    } finally {
      setBusy(null);
    }
  };

  if (count === 0 && own.length === 0) {
    return null; // нет ни входящих, ни своих запросов — не шумим
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="rail-iconbtn size-8 shrink-0 relative rounded-lg flex items-center justify-center transition-colors"
          title="Запросы доступа"
        >
          <Bell className="size-3.5" />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full text-[9px] font-bold flex items-center justify-center text-white" style={{ background: "#ef4444" }}>
              {count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3 space-y-3 rounded-xl ink-pop">
        {incoming.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(250,250,248,0.55)" }}>
              Запросы на редактирование
            </p>
            {incoming.map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-xs">
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{r.displayName || r.username}</span>
                  <span style={{ color: "rgba(250,250,248,0.5)" }}> → </span>
                  <span className="font-medium truncate">{r.domainName}</span>
                </div>
                <Button size="icon" variant="ghost" className="size-6 text-green-500 hover:text-green-400 hover:bg-[rgba(74,222,128,0.12)]"
                  disabled={busy === r.id} onClick={() => resolve(r.id, "approve")} title="Выдать доступ">
                  <Check className="size-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="size-6 text-red-400 hover:text-red-300 hover:bg-[rgba(248,113,113,0.12)]"
                  disabled={busy === r.id} onClick={() => resolve(r.id, "reject")} title="Отклонить">
                  <X className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {own.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(250,250,248,0.55)" }}>
              Мои запросы
            </p>
            {own.map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-xs">
                <span className="font-medium truncate flex-1">{r.domainName}</span>
                {r.status === "pending" && (
                  <span className="flex items-center gap-1 text-amber-400"><Clock className="size-3" /> ожидает</span>
                )}
                {r.status === "approved" && (
                  <span className="flex items-center gap-1 text-green-400"><Check className="size-3" /> одобрен</span>
                )}
                {r.status === "rejected" && (
                  <span className="flex items-center gap-1 text-red-400"><X className="size-3" /> отклонён</span>
                )}
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
