"use client";

/**
 * useServerSync — хук синхронизации данных с сервером.
 * Вынесено из TaskTrackerInner в page.tsx.
 *
 * Возвращает: { isOnline, lastSync }
 * Управляет: push/pull данных, опросом вопросов, heartbeat присутствия.
 */

import React, { useCallback, useEffect, useRef } from "react";
import { useTaskStore } from "@/lib/store";
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
}

export type SyncStatus = "initializing" | "synced" | "pending" | "pushing" | "offline";

export function useServerSync({
  workspaceId,
  token,
  allData,
  backlog,
  monthlyPlanByYearMonth,
  isSyncingRef,
  setIsOnline,
  setLastSync,
  setIsInitialLoading,
  setQuestions,
}: UseServerSyncParams) {
  const initialLoadDoneRef = useRef(false);
  const serverUpdatedAtRef = useRef<string>("");
  const lastLocalChangeRef = useRef(0);
  const suppressNextPushRef = useRef(false);
  const [syncStatus, setSyncStatus] = React.useState<SyncStatus>("initializing");
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Push ──────────────────────────────────────────────────────────────────

  const pushToServer = useCallback(async () => {
    if (isSyncingRef.current) return;
    if (!initialLoadDoneRef.current) return;
    isSyncingRef.current = true;
    setSyncStatus("pushing");
    try {
      const s = useTaskStore.getState();
      const activeDom = s.domainData[s.activeDomainId];
      const existingByKey: Record<string, unknown[]> = activeDom?.dataByYearMonth ?? {};
      const updatedByKey: Record<string, unknown[]> = { ...existingByKey };
      for (let m = 0; m < 12; m++) {
        const key = `${s.currentYear}-${String(m + 1).padStart(2, "0")}`;
        updatedByKey[key] = s.allData[m] || [];
      }
      const domainData = {
        ...s.domainData,
        [s.activeDomainId]: {
          allData: updatedByKey,
          backlog: s.backlog,
          monthlyPlanByYearMonth: activeDom?.monthlyPlanByYearMonth ?? {},
        },
      };
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: workspaceId,
          domainData,
          clientUpdatedAt: serverUpdatedAtRef.current || new Date().toISOString(),
          token,
        }),
      });
      if (res.ok) {
        const result = await res.json();
        if (result.updatedAt) serverUpdatedAtRef.current = result.updatedAt;
        setLastSync(new Date());
        setIsOnline(true);
        setSyncStatus("synced");
      } else {
        setIsOnline(false);
        setSyncStatus("offline");
      }
    } catch {
      setIsOnline(false);
      setSyncStatus("offline");
    } finally {
      isSyncingRef.current = false;
    }
  }, [workspaceId, token, isSyncingRef, setIsOnline, setLastSync]);

  // ── Pull ──────────────────────────────────────────────────────────────────

  const pullFromServer = useCallback(async () => {
    try {
      const url = `/api/sync?id=${encodeURIComponent(workspaceId)}&token=${encodeURIComponent(token)}`;
      const res = await fetch(url);
      if (!res.ok) {
        setSyncStatus("offline");
        return;
      }
      const data = await res.json();
      if (data.updatedAt) serverUpdatedAtRef.current = data.updatedAt;
      if (data.domainData && Object.keys(data.domainData).length > 0) {
        suppressNextPushRef.current = true;
        useTaskStore.getState().setDomainData(data.domainData);
      }
      setLastSync(new Date());
      setIsOnline(true);
      setSyncStatus(prev => prev === "initializing" || prev === "offline" ? "synced" : prev);
    } catch {
      setIsOnline(false);
      setSyncStatus("offline");
    }
  }, [workspaceId, token, setIsOnline, setLastSync]);

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

  // ── Initial load ──────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const start = Date.now();
      await pullFromServer();
      await fetchQuestions();
      const elapsed = Date.now() - start;
      if (elapsed < 800) await new Promise(r => setTimeout(r, 800 - elapsed));
      if (!cancelled) {
        initialLoadDoneRef.current = true;
        setIsInitialLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [pullFromServer, fetchQuestions, setIsInitialLoading]);

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
    }, 400);
    return () => { if (pushTimerRef.current) { clearTimeout(pushTimerRef.current); pushTimerRef.current = null; } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allData, backlog, monthlyPlanByYearMonth, pushToServer]);

  // ── Periodic pull every 12s ───────────────────────────────────────────────

  useEffect(() => {
    const interval = setInterval(() => {
      if (!initialLoadDoneRef.current) return;
      if (Date.now() - lastLocalChangeRef.current > 600) pullFromServer();
    }, 12_000);
    return () => clearInterval(interval);
  }, [pullFromServer]);

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
