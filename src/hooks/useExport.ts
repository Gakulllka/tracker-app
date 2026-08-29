"use client";
/**
 * useExport — хуки экспорта/импорта + drag-and-drop.
 * Вынесено из TaskTrackerInner.
 */
import { useState, useCallback } from "react";
import type { Task, Domain } from "@/lib/types";
import { INK } from "@/lib/tokens";
import {
  exportJSON, exportMonthXLSX, exportAllXLSX,
  importJSON,
} from "@/lib/export";

interface UseExportParams {
  allData: Record<number, Task[]>;
  backlog: Task[];
  currentMonth: number;
  totalFactMap: Record<string, number>;
  domains: Domain[];
  activeDomainId: string;
  activeDomainName: string | undefined;
  questions: unknown[];
  presBg: unknown;
  storeSetAllData: (data: Record<number, Task[]>) => void;
  storeSetBacklog: (bl: Task[]) => void;
  storeSetDomains: (d: Domain[]) => void;
  storeSetActiveDomainId: (id: string) => void;
  storeSetPresBg?: (bg: unknown) => void;
  setQuestions?: (q: unknown[]) => void;
}

export function useExport({
  allData, backlog, currentMonth, totalFactMap,
  domains, activeDomainId, activeDomainName,
  questions, presBg,
  storeSetAllData, storeSetBacklog, storeSetDomains,
  storeSetActiveDomainId,
  storeSetPresBg, setQuestions,
}: UseExportParams) {

  const [importConfirm, setImportConfirm] = useState<{
    open: boolean; type: "json" | "xlsx"; file: File | null;
  }>({ open: false, type: "json", file: null });
  const [isImportOpen, setIsImportOpen]   = useState(false);
  const [pendingXlsxFile, setPendingXlsxFile] = useState<File | null>(null);
  const [dragOverlay, setDragOverlay]     = useState(false);
  /** Ошибка операции экспорта/импорта — показывается в контексте действия (вне toast). */
  const [exportError, setExportError]     = useState<string | null>(null);

  const handleExportJSON = useCallback(() => {
    setExportError(null);
    exportJSON(allData, backlog, domains, activeDomainId, activeDomainName, questions, presBg);
  }, [allData, backlog, domains, activeDomainId, activeDomainName, questions, presBg]);

  const handleExportMonthXLSX = useCallback(async () => {
    setExportError(null);
    const monthRows = (allData[currentMonth] || []).filter(r => r.name || r.num);
    if (!monthRows.length) {
      setExportError("Текущий месяц не содержит задач");
      return;
    }
    try {
      await exportMonthXLSX(monthRows, currentMonth, totalFactMap);
    } catch (err) {
      setExportError(String(err));
    }
  }, [allData, currentMonth, totalFactMap, INK]);

  const handleExportAllXLSX = useCallback(async () => {
    setExportError(null);
    try {
      await exportAllXLSX(allData, totalFactMap);
    } catch (err) {
      setExportError(String(err));
    }
  }, [allData, totalFactMap, INK]);

  const handleJSONFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportConfirm({ open: true, type: "json", file });
    e.target.value = "";
  }, []);

  const handleXLSXFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingXlsxFile(file);
    setIsImportOpen(true);
    e.target.value = "";
  }, []);

  const handleConfirmImport = useCallback(async () => {
    const { file } = importConfirm;
    if (!file) return;
    setExportError(null);
    try {
      const result = await importJSON(file);
      storeSetAllData(result.allData);
      storeSetBacklog(result.backlog);
      storeSetDomains(result.domains);
      storeSetActiveDomainId(result.activeDomainId);
      if (result.presBg && storeSetPresBg) storeSetPresBg(result.presBg);
      if (result.questions && setQuestions) setQuestions(result.questions);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Неизвестная ошибка импорта");
    }
    setImportConfirm({ open: false, type: "json", file: null });
  }, [importConfirm, storeSetAllData, storeSetBacklog, storeSetDomains,
      storeSetActiveDomainId,
      storeSetPresBg, setQuestions]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault(); e.stopPropagation();
      setDragOverlay(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragOverlay(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragOverlay(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "json") {
      setImportConfirm({ open: true, type: "json", file });
    } else if (ext === "xlsx" || ext === "xls") {
      setPendingXlsxFile(file);
      setIsImportOpen(true);
    } else {
      setExportError("Неподдерживаемый формат. Поддерживаются только .json и .xlsx");
    }
  }, []);

  return {
    importConfirm, setImportConfirm,
    isImportOpen, setIsImportOpen,
    pendingXlsxFile, setPendingXlsxFile,
    dragOverlay,
    exportError, clearExportError: () => setExportError(null),
    handleExportJSON, handleExportMonthXLSX, handleExportAllXLSX,
    handleJSONFileSelect, handleXLSXFileSelect,
    handleConfirmImport,
    handleDragOver, handleDragLeave, handleDrop,
  };
}
