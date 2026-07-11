"use client";
/**
 * DomainAccessDialog — управление правами редактирования домена.
 * Заменяет старый ShareDialog (workspace-шаринг).
 *
 *  - Редакторы домена: список, выдача (админ / глобальный редактор /
 *    редактор этого домена), отзыв.
 *  - Входящие запросы на этот домен: одобрить / отклонить.
 *  - Для тех, кто не может редактировать домен: кнопка «Запросить доступ».
 */
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Check, X, Trash2, UserPlus, Clock, ShieldCheck } from "lucide-react";
import type { Domain } from "@/lib/types";

interface AccessRight {
  domainId: string;
  userId: string;
  username: string;
  displayName: string;
  grantedBy: string;
}

interface AccessRequest {
  id: string;
  domainId: string;
  domainName: string;
  userId: string;
  username: string;
  displayName: string;
  status: string;
  canResolve: boolean;
}

interface AppUser {
  id: string;
  username: string;
  displayName: string;
  role: string;
}

interface DomainAccessDialogProps {
  open: boolean;
  onClose: () => void;
  token: string;
  domains: Domain[];
  activeDomainId: string;
  currentUser: { id: string; role: string };
  editableDomainIds: "all" | string[];
  toast: (opts: { title: string; description?: string }) => void;
  /** После изменения прав (обновить editableDomainIds и т.п.) */
  onChanged?: () => void;
}

export function DomainAccessDialog({
  open, onClose, token, domains, activeDomainId,
  currentUser, editableDomainIds, toast, onChanged,
}: DomainAccessDialogProps) {
  const [domainId, setDomainId] = useState(activeDomainId);
  const [rights, setRights] = useState<AccessRight[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");

  const authHeaders = useMemo(
    () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` }),
    [token],
  );



  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [accessRes, usersRes] = await Promise.all([
        fetch("/api/domains/access", { headers: authHeaders }),
        fetch("/api/users", { headers: authHeaders }),
      ]);
      if (accessRes.ok) {
        const data = await accessRes.json();
        setRights(Array.isArray(data.rights) ? data.rights : []);
        setRequests(Array.isArray(data.requests) ? data.requests : []);
      }
      if (usersRes.ok) {
        const data = await usersRes.json();
        setUsers(Array.isArray(data.users) ? data.users : []);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [authHeaders]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      setDomainId(activeDomainId);
      load();
    }, 0);
    return () => clearTimeout(t);
  // намеренно без activeDomainId: сбрасываем выбор только при открытии
  }, [open, load]);

  const domainRights = rights.filter((r) => r.domainId === domainId);
  const domainRequests = requests.filter((r) => r.domainId === domainId && r.status === "pending");

  const canManage =
    currentUser.role === "admin" ||
    currentUser.role === "editor" ||
    domainRights.some((r) => r.userId === currentUser.id);

  const canEditThisDomain =
    editableDomainIds === "all" || editableDomainIds.includes(domainId);

  const myPendingRequest = domainRequests.find((r) => r.userId === currentUser.id);

  // Кандидаты на выдачу прав: активные не-readonly пользователи без прав на домен
  const candidates = users.filter(
    (u) =>
      !["viewer", "guest"].includes(u.role) &&
      u.role !== "admin" && u.role !== "editor" && // им права не нужны — редактируют всё
      !domainRights.some((r) => r.userId === u.id)
  );

  const grant = async (userId: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/domains/access", {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({ token, action: "grant", domainId, userId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast({ title: "Доступ выдан" });
        setSelectedUserId("");
        await load();
        onChanged?.();
      } else {
        toast({ title: "Ошибка", description: data.error || "Не удалось выдать доступ" });
      }
    } catch { toast({ title: "Ошибка", description: "Нет соединения" }); }
    setBusy(false);
  };

  const revoke = async (userId: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/domains/access", {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({ token, action: "revoke", domainId, userId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast({ title: "Доступ отозван" });
        await load();
        onChanged?.();
      } else {
        toast({ title: "Ошибка", description: data.error || "Не удалось отозвать доступ" });
      }
    } catch { toast({ title: "Ошибка", description: "Нет соединения" }); }
    setBusy(false);
  };

  const resolve = async (requestId: string, action: "approve" | "reject") => {
    setBusy(true);
    try {
      const res = await fetch("/api/domains/access", {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({ token, action, requestId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast({ title: action === "approve" ? "Доступ выдан" : "Запрос отклонён" });
        await load();
        onChanged?.();
      } else {
        toast({ title: "Ошибка", description: data.error || "Не удалось обработать запрос" });
      }
    } catch { toast({ title: "Ошибка", description: "Нет соединения" }); }
    setBusy(false);
  };

  const requestAccess = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/domains/access", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ token, domainId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast({ title: "Запрос отправлен", description: "Редактор домена увидит его в уведомлениях" });
        await load();
      } else {
        toast({ title: "Не получилось", description: data.error || "Ошибка запроса" });
      }
    } catch { toast({ title: "Ошибка", description: "Нет соединения" }); }
    setBusy(false);
  };

  const userLabel = (u: { displayName: string; username: string }) =>
    u.displayName && u.displayName !== u.username ? `${u.displayName} (${u.username})` : u.username;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5" /> Доступ к домену
          </DialogTitle>
          <DialogDescription>
            Право редактирования домена. Смотреть могут все, права не нужны.
          </DialogDescription>
        </DialogHeader>

        {/* Выбор домена */}
        <Select value={domainId} onValueChange={setDomainId}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {domains.map((d) => (
              <SelectItem key={d.id} value={d.id} className="text-sm">{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="size-5 animate-spin text-[var(--tracker-text-muted)]" /></div>
        ) : (
          <div className="space-y-4">
            {/* Редакторы */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--tracker-text-muted)]">
                Редакторы домена
              </p>
              {domainRights.length === 0 && (
                <p className="text-xs text-[var(--tracker-text-muted)]">
                  Пока никто. Админ и глобальные редакторы могут редактировать любой домен без записи здесь.
                </p>
              )}
              {domainRights.map((r) => (
                <div key={r.userId} className="flex items-center gap-2 text-xs py-0.5">
                  <div className="w-5 h-5 rounded-full bg-[var(--tracker-accent-bg)] flex items-center justify-center shrink-0">
                    <span className="text-[9px] font-bold text-[var(--tracker-accent-fg-dark)]">
                      {(r.displayName || r.username).charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="flex-1 truncate">{userLabel(r)}</span>
                  {r.grantedBy && (
                    <span className="text-[10px] text-[var(--tracker-text-muted)] hidden sm:inline">выдал: {r.grantedBy}</span>
                  )}
                  {canManage && (
                    <Button size="icon" variant="ghost" className="size-6 text-red-400 hover:text-red-600"
                      disabled={busy} onClick={() => revoke(r.userId)} title="Отозвать доступ">
                      <Trash2 className="size-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {/* Выдать доступ */}
            {canManage && candidates.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--tracker-text-muted)]">
                  Выдать доступ
                </p>
                <div className="flex gap-2">
                  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger className="h-8 text-xs flex-1">
                      <SelectValue placeholder="Выберите пользователя" />
                    </SelectTrigger>
                    <SelectContent>
                      {candidates.map((u) => (
                        <SelectItem key={u.id} value={u.id} className="text-xs">{userLabel(u)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" className="h-8 gap-1 text-xs" disabled={!selectedUserId || busy}
                    onClick={() => grant(selectedUserId)}>
                    <UserPlus className="size-3.5" /> Выдать
                  </Button>
                </div>
              </div>
            )}

            {/* Входящие запросы */}
            {canManage && domainRequests.filter(r => r.userId !== currentUser.id).length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--tracker-text-muted)]">
                  Запросы на доступ
                </p>
                {domainRequests.filter(r => r.userId !== currentUser.id).map((r) => (
                  <div key={r.id} className="flex items-center gap-2 text-xs">
                    <span className="flex-1 truncate font-medium">{userLabel(r)}</span>
                    <Button size="icon" variant="ghost" className="size-6 text-green-600 hover:text-green-700"
                      disabled={busy} onClick={() => resolve(r.id, "approve")} title="Одобрить">
                      <Check className="size-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="size-6 text-red-500 hover:text-red-600"
                      disabled={busy} onClick={() => resolve(r.id, "reject")} title="Отклонить">
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Запросить доступ себе */}
            {!canEditThisDomain && !["viewer", "guest"].includes(currentUser.role) && (
              myPendingRequest ? (
                <div className="flex items-center gap-2 text-xs text-amber-600">
                  <Clock className="size-3.5" /> Ваш запрос отправлен и ожидает решения
                </div>
              ) : (
                <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs" disabled={busy} onClick={requestAccess}>
                  <UserPlus className="size-3.5" /> Запросить право редактирования
                </Button>
              )
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
