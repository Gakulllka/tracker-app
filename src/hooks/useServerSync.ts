"use client";

/**
 * useServerSync — хук синхронизации данных с сервером.
 *
 * Единый общий мир:
 *  - pull: домены приходят с сервера; данные грузятся лениво — при первой
 *    загрузке и переключении домена тянется только активный домен, остальные
 *    подхватываются фоновым полным pull.
 *  - push: отправляется ТОЛЬКО активный домен (меньше трафика и конфликтов).
 *  - статусы честные: "denied" (нет прав) отличается от "offline" (нет сети).
 *  - после pull показываем, какие задачи обновили другие пользователи.
 */

import React, { useCallback, useEffect, useRef } from "react";
import { useTaskStore, undoStore } from "@/lib/store";
import { mapQuestionFromAPI, Question } from "@/lib/questions";

interface UseServerSyncParams {
  workspaceId: string;
  token: string;
  allData: Record<number, unknown[]>;
  backlog: unknown[];
  monthlyPlanByYearMonth: Record<string, number> | undefined;
  isSyncingRef: React.MutableRefObject<boolean>;
  setIsOnline: (v: boolean) => void;
  setLastSync: (d: Date) => void;
  setIsInitialLoading: (v: boolean) => void;
  setQuestions: React.Dispatch<React.SetStateAction<Question[]>>;
  /** username текущего пользователя — чтобы не показывать тосты о своих правках */
  currentUsername?: string;
  /** Колбэк «задачи обновлены другими»: список строк для тоста */
  onRemoteChanges?: (messages: string[]) => void;
  /** Колбэк «сервер пропустил домены без прав» */
  onSkippedDomains?: (domainNames: string[]) => void;
}

/**
 * Построчный LWW-мерж месяца/бэклога: побеждает строка с бОльшим _ts.
 *  - строка есть только на сервере → берём серверную (включая tombstone);
 *  - строка есть только локально → сохраняем (ещё не допушена);
 *  - есть обе → новее по _ts.
 * Именно это делает pull безопасным: пришедший старый снимок больше
 * не может откатить локальную правку или «воскресить» удалённую задачу.
 */
function mergeRows(localRows: SyncTask[] | undefined, incomingRows: SyncTask[] | undefined): SyncTask[] {
  const local = localRows || [];
  const incoming = incomingRows || [];
  if (local.length === 0) return incoming;
  // «Версия» контента для тай-брейка при равных _ts
  const contentKey = (r: SyncTask) => JSON.stringify([
    r.num, r.name, r.planH, r.factH, r.priority, r.status,
    r.comment, r._deleted ?? false, r.commentLog ?? [],
  ]);
  const localById = new Map(local.map((r) => [r.id, r]));
  const result: SyncTask[] = [];
  const used = new Set<string>();
  for (const inc of incoming) {
    const loc = localById.get(inc.id);
    used.add(inc.id);
    if (!loc) { result.push(inc); continue; }
    const lt = loc._ts || 0;
    const it = inc._ts || 0;
    if (lt > it) result.push(loc);
    else if (lt === it && contentKey(loc) !== contentKey(inc)) {
      // Равные метки, разный контент: это наша ещё не подтверждённая
      // правка — оставляем локальную, сервер примет её ближайшим push.
      result.push(loc);
    }
    else result.push(inc);
  }
  // Локальные строки, неизвестные серверу (созданы/изменены и не допушены)
  for (const loc of local) {
    if (!used.has(loc.id)) result.push(loc);
  }
  return result;
}

export type SyncStatus =
  | "initializing" | "synced" | "pending" | "pushing" | "offline" | "denied";

interface SyncTask {
  id: string;
  num?: string;
  name?: string;
  _ts?: number;
  _updatedBy?: string;
  _deleted?: boolean;
  [key: string]: unknown;
}

interface SyncDomainData {
  allData?: Record<string, SyncTask[]>;
  backlog?: SyncTask[];
}

export function useServerSync({
  token,
  allData,
  backlog,
  monthlyPlanByYearMonth,
  isSyncingRef,
  setIsOnline,
  setLastSync,
  setIsInitialLoading,
  setQuestions,
  currentUsername,
  onRemoteChanges,
  onSkippedDomains,
}: UseServerSyncParams) {
  const initialLoadDoneRef = useRef(false);
  const serverUpdatedAtRef = useRef<string>("");
  const lastLocalChangeRef = useRef(0);
  const suppressNextPushRef = useRef(false);
  const [syncStatus, setSyncStatus] = React.useState<SyncStatus>("initializing");
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifiedSkipRef = useRef(false);
  // Колбэки держим в ref: их инлайн-передача из page.tsx не должна
  // пересоздавать pushToServer/pullFromServer на каждый рендер.
  const onRemoteChangesRef = useRef(onRemoteChanges);
  const onSkippedDomainsRef = useRef(onSkippedDomains);
  useEffect(() => { onRemoteChangesRef.current = onRemoteChanges; }, [onRemoteChanges]);
  useEffect(() => { onSkippedDomainsRef.current = onSkippedDomains; }, [onSkippedDomains]);
  const authHeaders = React.useMemo(
    () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` }),
    [token],
  );

  // ── Push (только активный домен) ─────────────────────────────────────────

  const pendingPushRef = useRef(false);

  const pushToServer = useCallback(async () => {
    if (!initialLoadDoneRef.current) return;
    if (isSyncingRef.current) {
      // Push уже идёт: раньше эта правка молча ждала резервной отправки
      // (до 3 минут!) — теперь повторяем сразу после текущего.
      pendingPushRef.current = true;
      return;
    }
    isSyncingRef.current = true;
    setSyncStatus("pushing");
    try {
      const s = useTaskStore.getState();
      const activeDom = s.domainData[s.activeDomainId] as
        | { dataByYearMonth?: Record<string, unknown[]>; monthlyPlanByYearMonth?: Record<string, number> }
        | undefined;
      const existingByKey: Record<string, unknown[]> = activeDom?.dataByYearMonth ?? {};
      const updatedByKey: Record<string, unknown[]> = { ...existingByKey };
      for (let m = 0; m < 12; m++) {
        const key = `${s.currentYear}-${String(m + 1).padStart(2, "0")}`;
        updatedByKey[key] = s.allData[m] || [];
      }
      // Пушим только активный домен: остальные не менялись локально,
      // а их отправка лишь создаёт трафик и риск конфликтов.
      const domainData = {
        [s.activeDomainId]: {
          allData: updatedByKey,
          backlog: s.backlog,
          // План часов по месяцам — теперь общий, живёт на сервере
          monthlyPlanByYearMonth: activeDom?.monthlyPlanByYearMonth,
        },
      };
      const domainNames: Record<string, string> = {};
      const active = s.domains.find(d => d.id === s.activeDomainId);
      if (active) domainNames[active.id] = active.name;

      const res = await fetch("/api/sync", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ domainData, domainNames }),
      });
      if (res.ok) {
        const result = await res.json();
        if (result.updatedAt) serverUpdatedAtRef.current = result.updatedAt;
        setLastSync(new Date());
        setIsOnline(true);
        if (Array.isArray(result.skippedDomains) && result.skippedDomains.length > 0) {
          setSyncStatus("denied");
          if (!notifiedSkipRef.current) {
            notifiedSkipRef.current = true;
            onSkippedDomainsRef.current?.(result.skippedDomains);
          }
        } else {
          notifiedSkipRef.current = false;
          setSyncStatus("synced");
        }
      } else if (res.status === 401 || res.status === 403) {
        // Не «оффлайн»: сеть есть, но прав нет.
        setIsOnline(true);
        setSyncStatus("denied");
        if (!notifiedSkipRef.current) {
          notifiedSkipRef.current = true;
          const errBody = await res.json().catch(() => ({}));
          onSkippedDomainsRef.current?.(errBody.error ? [errBody.error] : []);
        }
      } else {
        const errBody = await res.json().catch(() => ({ error: "Неизвестная ошибка" }));
        console.error("[sync] push failed:", res.status, errBody.error);
        setIsOnline(false);
        setSyncStatus("offline");
      }
    } catch (err) {
      console.error("[sync] push exception:", err);
      setIsOnline(false);
      setSyncStatus("offline");
    } finally {
      isSyncingRef.current = false;
      if (pendingPushRef.current) {
        pendingPushRef.current = false;
        // Немедленный повтор: за время push накопились новые изменения
        setTimeout(() => { pushToServerRef.current?.(); }, 50);
      }
    }
  }, [authHeaders, isSyncingRef, setIsOnline, setLastSync]);

  // Ссылка на самого себя — для повтора из finally без циклической зависимости
  const pushToServerRef = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => { pushToServerRef.current = pushToServer; }, [pushToServer]);

  // ── Диф чужих изменений (для тостов) ─────────────────────────────────────

  const collectRemoteChanges = useCallback((
    incoming: Record<string, SyncDomainData>,
  ): string[] => {
    if (!currentUsername) return [];
    const s = useTaskStore.getState();
    const domId = s.activeDomainId;
    const inDom = incoming[domId];
    if (!inDom) return [];

    // Собираем текущие _ts по id из активного домена (все месяцы + бэклог)
    const localTs = new Map<string, number>();
    const localDom = s.domainData[domId] as unknown as
      | { dataByYearMonth?: Record<string, SyncTask[]>; backlog?: SyncTask[] }
      | undefined;
    const scanLocal = (tasks?: SyncTask[]) => {
      for (const t of tasks || []) if (t?.id) localTs.set(t.id, t._ts || 0);
    };
    if (localDom?.dataByYearMonth) {
      for (const tasks of Object.values(localDom.dataByYearMonth)) scanLocal(tasks);
    }
    for (const tasks of Object.values(s.allData)) scanLocal(tasks as unknown as SyncTask[]);
    scanLocal(s.backlog as unknown as SyncTask[]);

    const messages: string[] = [];
    const scanIncoming = (tasks?: SyncTask[]) => {
      for (const t of tasks || []) {
        if (!t?.id || !t._updatedBy) continue;
        if (t._updatedBy === currentUsername) continue;
        const known = localTs.get(t.id);
        if (known === undefined) continue; // новую задачу не считаем конфликтом
        if ((t._ts || 0) > known) {
          const label = t.num ? `№${t.num}` : (t.name ? `«${String(t.name).slice(0, 30)}»` : t.id.slice(0, 6));
          messages.push(`${label} — ${t._updatedBy}`);
        }
      }
    };
    if (inDom.allData) for (const tasks of Object.values(inDom.allData)) scanIncoming(tasks);
    scanIncoming(inDom.backlog);
    return messages.slice(0, 5);
  }, [currentUsername]);

  // ── Pull ──────────────────────────────────────────────────────────────────

  const pullFromServer = useCallback(async (onlyDomainId?: string) => {
    try {
      const url = onlyDomainId
        ? `/api/sync?domainId=${encodeURIComponent(onlyDomainId)}`
        : "/api/sync";
      const res = await fetch(url, { headers: authHeaders });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: "Неизвестная ошибка" }));
        console.error("[sync] pull failed:", res.status, errBody.error);
        setSyncStatus(res.status === 401 || res.status === 403 ? "denied" : "offline");
        return;
      }
      const data = await res.json();
      if (data.updatedAt) serverUpdatedAtRef.current = data.updatedAt;

      suppressNextPushRef.current = true;
      // Домены глобальны и приходят с сервера — единый общий мир.
      if (Array.isArray(data.domains) && data.domains.length > 0) {
        const current = useTaskStore.getState().domains;
        const incoming = data.domains.map((d: { id: string; name: string }) => ({ id: d.id, name: d.name }));
        const changed =
          current.length !== incoming.length ||
          incoming.some((d: { id: string; name: string }, i: number) => current[i]?.id !== d.id || current[i]?.name !== d.name);
        if (changed) {
          useTaskStore.getState().setDomains(incoming);
        }
      }
      if (data.domainData && Object.keys(data.domainData).length > 0) {
        // Фильтруем пустые задачи (без name и num) при загрузке с сервера
        for (const [, domain] of Object.entries(data.domainData)) {
          const d = domain as { allData?: Record<string, unknown[]>; backlog?: unknown[] };
          if (d.allData) {
            for (const [month, tasks] of Object.entries(d.allData)) {
              d.allData[month] = (tasks as Array<{ name?: string; num?: string; _deleted?: boolean }>).filter(
                (t) => t._deleted || (t.name && t.name !== "EMPTY") || (t.num && t.num !== "EMPTY")
              );
            }
          }
          if (d.backlog) {
            d.backlog = (d.backlog as Array<{ name?: string; num?: string; _deleted?: boolean }>).filter(
              (t) => t._deleted || (t.name && t.name !== "EMPTY") || (t.num && t.num !== "EMPTY")
            );
          }
        }
        // Тосты «кто обновил» — по сырым входящим (до мержа)
        const changes = collectRemoteChanges(data.domainData);

        // Построчный LWW-мерж с текущим локальным состоянием: снимок,
        // сделанный сервером ДО нашей правки, не может её откатить.
        const st = useTaskStore.getState();
        const mergedDomainData: Record<string, {
          allData: Record<string, SyncTask[]>;
          backlog: SyncTask[];
          monthlyPlanByYearMonth?: Record<string, number>;
        }> = {};

        for (const [domId, rawIncoming] of Object.entries(data.domainData)) {
          const incoming = rawIncoming as {
            allData?: Record<string, SyncTask[]>;
            backlog?: SyncTask[];
            monthlyPlanByYearMonth?: Record<string, number>;
          };
          const localDom = st.domainData[domId] as unknown as {
            dataByYearMonth?: Record<string, SyncTask[]>;
            backlog?: SyncTask[];
            monthlyPlanByYearMonth?: Record<string, number>;
          } | undefined;

          // Локальные месяцы: канонично dataByYearMonth; для активного
          // домена текущий год перекрываем «живым» срезом allData.
          const localByMonth: Record<string, SyncTask[]> = { ...(localDom?.dataByYearMonth || {}) };
          if (domId === st.activeDomainId) {
            for (let m = 0; m < 12; m++) {
              const key = `${st.currentYear}-${String(m + 1).padStart(2, "0")}`;
              localByMonth[key] = (st.allData[m] as unknown as SyncTask[]) || [];
            }
          }

          const months = new Set([
            ...Object.keys(localByMonth),
            ...Object.keys(incoming.allData || {}),
          ]);
          const mergedMonths: Record<string, SyncTask[]> = {};
          for (const mk of months) {
            mergedMonths[mk] = mergeRows(localByMonth[mk], incoming.allData?.[mk]);
          }

          const localBacklog = domId === st.activeDomainId
            ? (st.backlog as unknown as SyncTask[])
            : localDom?.backlog;

          mergedDomainData[domId] = {
            allData: mergedMonths,
            backlog: mergeRows(localBacklog, incoming.backlog),
            ...(incoming.monthlyPlanByYearMonth
              ? { monthlyPlanByYearMonth: incoming.monthlyPlanByYearMonth }
              : {}),
          };
        }

        suppressNextPushRef.current = true;
        useTaskStore.getState().setDomainData(mergedDomainData as never);
        if (changes.length > 0) {
          // Локальная история undo содержит снимки БЕЗ этих правок:
          // Ctrl+Z откатил бы задачи коллеги свежим ts и LWW бы это принял.
          undoStore.clear();
          onRemoteChangesRef.current?.(changes);
        }
        // Страховочный push: если React сбатчил применение pull с правкой
        // пользователя, suppressNextPushRef «проглотил» её уведомление.
        // Доотправляем через мгновение — сервер дёшево пропустит no-op строки.
        if (initialLoadDoneRef.current) {
          setTimeout(() => {
            if (!pushTimerRef.current) pushToServerRef.current?.();
          }, 600);
        }
      }
      setLastSync(new Date());
      setIsOnline(true);
      setSyncStatus(prev => prev === "initializing" || prev === "offline" ? "synced" : prev);
    } catch {
      setIsOnline(false);
      setSyncStatus("offline");
    }
  }, [authHeaders, setIsOnline, setLastSync, collectRemoteChanges]);

  // ── Fetch questions helper ────────────────────────────────────────────────

  const fetchQuestions = useCallback(async () => {
    try {
      const res = await fetch("/api/question");
      if (res.ok) {
        const data = await res.json();
        if (data.questions && Array.isArray(data.questions)) {
          setQuestions(data.questions.map(mapQuestionFromAPI));
        }
      }
    } catch { /* silent */ }
  }, [setQuestions]);

  // ── Initial load: активный домен быстро, остальное — фоном ──────────────

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const start = Date.now();
      const activeId = useTaskStore.getState().activeDomainId;
      // Быстрый первый экран: только активный домен (+ список доменов)
      await pullFromServer(activeId);
      await fetchQuestions();
      const elapsed = Date.now() - start;
      if (elapsed < 800) await new Promise(r => setTimeout(r, 800 - elapsed));
      if (!cancelled) {
        initialLoadDoneRef.current = true;
        setIsInitialLoading(false);
        // Догружаем остальные домены фоном
        pullFromServer();
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // ── Pull активного домена при переключении ────────────────────────────────

  const activeDomainId = useTaskStore((s) => s.activeDomainId);
  const prevDomainRef = useRef(activeDomainId);
  useEffect(() => {
    if (!initialLoadDoneRef.current) { prevDomainRef.current = activeDomainId; return; }
    if (prevDomainRef.current === activeDomainId) return;
    prevDomainRef.current = activeDomainId;
    pullFromServer(activeDomainId);
  }, [activeDomainId, pullFromServer]);

  // ── Poll questions every 8s ───────────────────────────────────────────────

  useEffect(() => {
    const interval = setInterval(fetchQuestions, 8_000);
    return () => clearInterval(interval);
  }, [fetchQuestions]);

  // ── Push on data change (debounced 400ms) ─────────────────────────────────

  useEffect(() => {
    if (!initialLoadDoneRef.current) return;
    if (suppressNextPushRef.current) {
      suppressNextPushRef.current = false;
      return;
    }
    lastLocalChangeRef.current = Date.now();
    setSyncStatus("pending");
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(() => {
      pushTimerRef.current = null;
      pushToServer();
    }, 250);
    return () => { if (pushTimerRef.current) { clearTimeout(pushTimerRef.current); pushTimerRef.current = null; } };
  }, [allData, backlog, monthlyPlanByYearMonth, pushToServer]);

  // ── Periodic pull every 12s (активный домен) ─────────────────────────────

  useEffect(() => {
    const interval = setInterval(() => {
      if (!initialLoadDoneRef.current) return;
      // Мерж делает pull безопасным в любой момент, но не создаём лишний
      // трафик и мигание, пока пользователь активно правит или идёт push.
      if (isSyncingRef.current || pushTimerRef.current) return;
      if (Date.now() - lastLocalChangeRef.current > 2_500) {
        pullFromServer(useTaskStore.getState().activeDomainId);
      }
    }, 10_000);
    return () => clearInterval(interval);
  }, [pullFromServer, isSyncingRef]);

  // ── Полный pull раз в минуту (остальные домены, редкие изменения) ────────

  useEffect(() => {
    const interval = setInterval(() => {
      if (!initialLoadDoneRef.current) return;
      if (isSyncingRef.current || pushTimerRef.current) return;
      if (Date.now() - lastLocalChangeRef.current > 2_500) pullFromServer();
    }, 60_000);
    return () => clearInterval(interval);
  }, [pullFromServer, isSyncingRef]);

  // ── Backup push every 3 min ───────────────────────────────────────────────

  useEffect(() => {
    const interval = setInterval(() => {
      if (initialLoadDoneRef.current) pushToServer();
    }, 180_000);
    return () => clearInterval(interval);
  }, [pushToServer]);

  // ── Heartbeat ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const lastInteractionRef = { current: Date.now() };
    const mark = () => { lastInteractionRef.current = Date.now(); };
    const INACTIVITY_MS = 5 * 60 * 1000;

    const ping = async () => {
      const idle = Date.now() - lastInteractionRef.current;
      const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
      if (hidden && idle > INACTIVITY_MS) return;
      try {
        await fetch("/api/auth/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            currentPage: typeof window !== "undefined"
              ? window.location.pathname + window.location.hash
              : "",
          }),
          keepalive: true,
        });
      } catch { /* best-effort */ }
    };

    ping();
    const interval = setInterval(ping, 60_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") { mark(); ping(); }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("mousemove", mark, { passive: true });
    window.addEventListener("keydown",   mark, { passive: true });
    window.addEventListener("scroll",    mark, { passive: true });
    window.addEventListener("touchstart",mark, { passive: true });

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("mousemove", mark);
      window.removeEventListener("keydown",   mark);
      window.removeEventListener("scroll",    mark);
      window.removeEventListener("touchstart",mark);
    };
  }, [token]);

  return { syncStatus };
}
