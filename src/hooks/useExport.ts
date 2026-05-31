"use client";
/**
 * useExport — хуки экспорта/импорта + drag-and-drop.
 * Вынесено из TaskTrackerInner.
 */
import { useState, useCallback } from "react";
import type { Task, Domain } from "@/lib/types";
import {
  exportJSON, exportMonthXLSX, exportAllXLSX,
  importJSON,
} from "@/lib/export";

interface UseExportParams {
  allData: Record<number, Task[]>;
  backlog: Task[];
  currentMonth: number;
  totalFactMap: Record<string, number>;
  accentHex: string;
  themeId: string;
  customColor: string;
  domains: Domain[];
  activeDomainId: string;
  activeDomainName: string | undefined;
  storeSetAllData: (data: Record<number, Task[]>) => void;
  storeSetBacklog: (bl: Task[]) => void;
  storeSetDomains: (d: Domain[]) => void;
  storeSetActiveDomainId: (id: string) => void;
  storeSetThemeId: (id: string) => void;
  storeSetCustomColor: (c: string, dark: boolean) => void;
  toast: (opts: { title: string; description?: string; variant?: "destructive" }) => void;
}

export function useExport({
  allData, backlog, currentMonth, totalFactMap, accentHex,
  themeId, customColor, domains, activeDomainId, activeDomainName,
  storeSetAllData, storeSetBacklog, storeSetDomains,
  storeSetActiveDomainId, storeSetThemeId, storeSetCustomColor,
  toast,
}: UseExportParams) {

  const [importConfirm, setImportConfirm] = useState<{
    open: boolean; type: "json" | "xlsx"; file: File | null;
  }>({ open: false, type: "json", file: null });
  const [isImportOpen, setIsImportOpen]   = useState(false);
  const [pendingXlsxFile, setPendingXlsxFile] = useState<File | null>(null);
  const [dragOverlay, setDragOverlay]     = useState(false);

  const handleExportJSON = useCallback(() => {
    exportJSON(allData, backlog, themeId, customColor, domains, activeDomainId, activeDomainName);
    toast({ title: "💾 Экспорт", description: "JSON файл сохранён" });
  }, [allData, backlog, themeId, customColor, domains, activeDomainId, activeDomainName, toast]);

  const handleExportMonthXLSX = useCallback(async () => {
    const monthRows = (allData[currentMonth] || []).filter(r => r.name || r.num);
    if (!monthRows.length) {
      toast({ title: "Нет данных", description: "Текущий месяц не содержит задач", variant: "destructive" });
      return;
    }
    try {
      await exportMonthXLSX(monthRows, currentMonth, totalFactMap, accentHex);
      toast({ title: "💾 Сохранить", description: "Excel файл сохранён" });
    } catch (err) {
      toast({ title: "Ошибка", description: String(err), variant: "destructive" });
    }
  }, [allData, currentMonth, totalFactMap, accentHex, toast]);

  const handleExportAllXLSX = useCallback(async () => {
    try {
      await exportAllXLSX(allData, totalFactMap, accentHex);
      toast({ title: "💾 Сохранить", description: "Excel файл (все месяцы) сохранён" });
    } catch (err) {
      toast({ title: "Ошибка", description: String(err), variant: "destructive" });
    }
  }, [allData, totalFactMap, accentHex, toast]);

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
    try {
      const result = await importJSON(file);
      storeSetAllData(result.allData);
      storeSetBacklog(result.backlog);
      storeSetDomains(result.domains);
      storeSetActiveDomainId(result.activeDomainId);
      storeSetThemeId(result.themeId);
      storeSetCustomColor(result.customColor || "", false);
      toast({ title: "📂 Импорт", description: "Данные успешно загружены из JSON" });
    } catch (err) {
      toast({
        title: "Ошибка импорта",
        description: err instanceof Error ? err.message : "Неизвестная ошибка",
        variant: "destructive",
      });
    }
    setImportConfirm({ open: false, type: "json", file: null });
  }, [importConfirm, storeSetAllData, storeSetBacklog, storeSetDomains,
      storeSetActiveDomainId, storeSetThemeId, storeSetCustomColor, toast]);

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
      toast({ title: "Неподдерживаемый формат", description: "Поддерживаются только .json и .xlsx файлы", variant: "destructive" });
    }
  }, [toast]);

  return {
    importConfirm, setImportConfirm,
    isImportOpen, setIsImportOpen,
    pendingXlsxFile, setPendingXlsxFile,
    dragOverlay,
    handleExportJSON, handleExportMonthXLSX, handleExportAllXLSX,
    handleJSONFileSelect, handleXLSXFileSelect,
    handleConfirmImport,
    handleDragOver, handleDragLeave, handleDrop,
  };
}
