import { useCallback, useEffect, useState } from "react";

export interface ServerDomain {
  id: string;
  name: string;
  archived?: boolean;
}

export interface UseDomainsOptions {
  token: string;
  activeDomainId: string | null;
  /** Положить список доменов в стор — оттуда его читает весь интерфейс. */
  setStoreDomains: (domains: Array<{ id: string; name: string }>) => void;
  setActiveDomain: (id: string) => void;
  /** Перечитать права пользователя: создание домена даёт права на него. */
  refreshAuth: () => Promise<void> | void;
  /** Показать ошибку в шапке приложения. */
  onError: (message: string) => void;
}

/**
 * Работа со списком доменов: загрузка, создание, запрос доступа.
 *
 * Домены глобальны и видны всем — воркспейсов в трекере нет. Но право
 * редактировать выдаётся отдельно на каждый домен, поэтому после создания
 * нужно перечитать права: создатель получает их сразу.
 *
 * Полный список с сервера (`domains`) отличается от списка в сторе: он
 * содержит архивные домены и нужен админу в диалогах управления доступом.
 */
export function useDomains({
  token,
  activeDomainId,
  setStoreDomains,
  setActiveDomain,
  refreshAuth,
  onError,
}: UseDomainsOptions) {
  const [domains, setDomains] = useState<ServerDomain[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [requestingAccess, setRequestingAccess] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/domains", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;

      const data = await res.json();
      if (!Array.isArray(data.domains)) return;

      setStoreDomains(
        data.domains.map((d: ServerDomain) => ({ id: d.id, name: d.name })),
      );
      setDomains(data.domains);
    } catch {
      // Список останется прежним: молча, чтобы не мешать работе офлайн.
    }
  }, [token, setStoreDomains]);

  useEffect(() => {
    const timer = setTimeout(refresh, 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  /** Создать домен из шапки и сразу переключиться на него. */
  const create = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;

    setCreating(true);
    try {
      const res = await fetch("/api/domains", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ token, name }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.domain) {
        await refresh();
        await refreshAuth();
        setActiveDomain(data.domain.id);
        setDialogOpen(false);
        setNewName("");
      } else {
        onError(data.error || "Не удалось создать домен");
      }
    } catch {
      onError("Нет соединения с сервером");
    }
    setCreating(false);
  }, [newName, token, refresh, refreshAuth, setActiveDomain, onError]);

  /** Запросить право редактировать активный домен. */
  const requestAccess = useCallback(async () => {
    setRequestingAccess(true);
    try {
      const res = await fetch("/api/domains/access", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ token, domainId: activeDomainId }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        // Успех виден по исчезновению кнопки запроса.
        await refreshAuth();
      } else {
        onError(data.error || "Ошибка запроса доступа");
      }
    } catch {
      onError("Нет соединения с сервером");
    }
    setRequestingAccess(false);
  }, [token, activeDomainId, refreshAuth, onError]);

  return {
    /** Полный список с сервера, включая архивные. */
    domains,
    refresh,
    create,
    creating,
    dialogOpen,
    setDialogOpen,
    newName,
    setNewName,
    requestAccess,
    requestingAccess,
  };
}
