"use client";

import React, { useState, useMemo, useCallback } from "react";
import * as XLSX from "xlsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Upload,
  Check,
  X,
  Plus,
  ArrowRight,
  ArrowUpDown,
  Loader2,
  FileSpreadsheet,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Square,
} from "lucide-react";
import { type Task, type Status, type Priority, STATUSES, PRIORITIES } from "@/lib/types";
import { fixStatus, fixPriority, evalExpr } from "@/lib/metrics";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ParsedExcelTask {
  num: string;
  name: string;
  planH: string;
  factH: string;
  priority: string;
  status: string;
  comment: string;
}

type DiffFieldType = "name" | "planH" | "factH" | "priority" | "status" | "comment";

interface FieldDiff {
  field: DiffFieldType;
  label: string;
  oldValue: string;
  newValue: string;
  approved: boolean;
}

interface TaskDiff {
  num: string;
  type: "new" | "changed";
  currentTask: Task | null;
  importedTask: ParsedExcelTask;
  fieldDiffs: FieldDiff[];
  allApproved: boolean;
  expanded: boolean;
}

/* ------------------------------------------------------------------ */
/*  Field labels & helpers                                             */
/* ------------------------------------------------------------------ */

const FIELD_LABELS: Record<DiffFieldType, string> = {
  name: "Наименование",
  planH: "План, ч",
  factH: "Факт, ч",
  priority: "Приоритет",
  status: "Статус",
  comment: "Комментарий",
};

function normalizeNum(n: unknown): string {
  return String(n || "").trim();
}

function normalizeStr(v: unknown): string {
  return String(v ?? "").trim();
}

function valuesDiffer(a: string, b: string): boolean {
  return a !== b;
}

/* ------------------------------------------------------------------ */
/*  Excel Parsing                                                      */
/* ------------------------------------------------------------------ */

function parseExcelFile(file: File): Promise<ParsedExcelTask[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as string[][];

        const tasks: ParsedExcelTask[] = [];
        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          // Columns: 0=Номер, 1=Задача, 2=План(ч), 3=Факт(ч), 4=Приоритет, 5=Статус
          if (!row || (!row[0] && !row[1])) continue;

          const name = normalizeStr(row[1]);
          if (!name) continue;

          tasks.push({
            num: normalizeStr(row[0]),
            name,
            planH: normalizeStr(row[2]),
            factH: normalizeStr(row[3]),
            priority: fixPriority(row[4]),
            status: fixStatus(row[5]),
            comment: "",
          });
        }
        resolve(tasks);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsBinaryString(file);
  });
}

/* ------------------------------------------------------------------ */
/*  Diff Engine                                                        */
/* ------------------------------------------------------------------ */

function buildDiffs(
  currentTasks: Task[],
  importedTasks: ParsedExcelTask[]
): TaskDiff[] {
  const currentMap = new Map<string, Task>();
  for (const t of currentTasks) {
    const n = normalizeNum(t.num);
    if (n) currentMap.set(n, t);
  }

  const importedNums = new Set<string>();
  const diffs: TaskDiff[] = [];

  for (const imp of importedTasks) {
    const num = imp.num;
    if (!num) continue;
    importedNums.add(num);

    const cur = currentMap.get(num) || null;

    if (!cur) {
      // New task
      diffs.push({
        num,
        type: "new",
        currentTask: null,
        importedTask: imp,
        fieldDiffs: [],
        allApproved: true,
        expanded: true,
      });
    } else {
      // Compare fields
      const fieldDiffs: FieldDiff[] = [];

      const fields: DiffFieldType[] = ["name", "planH", "factH", "priority", "status", "comment"];
      for (const f of fields) {
        let oldVal: string;
        let newVal: string;

        if (f === "priority") {
          oldVal = cur.priority;
          newVal = imp.priority;
        } else if (f === "status") {
          oldVal = cur.status;
          newVal = imp.status;
        } else {
          oldVal = String((cur as any)[f] || "");
          newVal = String((imp as any)[f] || "");
        }

        // For numeric fields, compare as numbers
        if (f === "planH" || f === "factH") {
          const oldNum = evalExpr(oldVal);
          const newNum = evalExpr(newVal);
          if (Math.abs(oldNum - newNum) > 0.001) {
            fieldDiffs.push({
              field: f,
              label: FIELD_LABELS[f],
              oldValue: oldVal,
              newValue: newVal,
              approved: true,
            });
          }
        } else {
          if (valuesDiffer(oldVal, newVal)) {
            fieldDiffs.push({
              field: f,
              label: FIELD_LABELS[f],
              oldValue: oldVal,
              newValue: newVal,
              approved: true,
            });
          }
        }
      }

      if (fieldDiffs.length > 0) {
        diffs.push({
          num,
          type: "changed",
          currentTask: cur,
          importedTask: imp,
          fieldDiffs,
          allApproved: true,
          expanded: true,
        });
      }
    }
  }

  return diffs;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ExcelImportModal({
  isOpen,
  onClose,
  currentMonthTasks,
  currentMonth,
  onApplyChanges,
}: {
  isOpen: boolean;
  onClose: () => void;
  currentMonthTasks: Task[];
  currentMonth: number;
  onApplyChanges: (changes: { updatedTasks: Task[]; newTasks: ParsedExcelTask[] }) => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [fileName, setFileName] = useState("");
  const [importedTasks, setImportedTasks] = useState<ParsedExcelTask[]>([]);
  const [diffs, setDiffs] = useState<TaskDiff[]>([]);
  const [activeTab, setActiveTab] = useState<"overview" | "diff">("overview");

  /* ---- File Upload ---- */
  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setFileName(file.name);
      setIsLoading(true);

      try {
        const parsed = await parseExcelFile(file);
        setImportedTasks(parsed);
        const computedDiffs = buildDiffs(currentMonthTasks, parsed);
        setDiffs(computedDiffs);
        setActiveTab(computedDiffs.length > 0 ? "diff" : "overview");
      } catch (err) {
        alert("Ошибка чтения файла: " + (err instanceof Error ? err.message : "Неизвестная ошибка"));
      } finally {
        setIsLoading(false);
      }
    },
    [currentMonthTasks]
  );

  /* ---- Toggle helpers ---- */
  const toggleFieldApproval = useCallback((diffIndex: number, fieldIndex: number) => {
    setDiffs((prev) => {
      const next = [...prev];
      const diff = { ...next[diffIndex] };
      const fields = [...diff.fieldDiffs];
      fields[fieldIndex] = { ...fields[fieldIndex], approved: !fields[fieldIndex].approved };
      diff.fieldDiffs = fields;
      diff.allApproved = fields.every((f) => f.approved);
      next[diffIndex] = diff;
      return next;
    });
  }, []);

  const toggleTaskApproval = useCallback((diffIndex: number) => {
    setDiffs((prev) => {
      const next = [...prev];
      const diff = { ...next[diffIndex] };
      diff.allApproved = !diff.allApproved;
      diff.fieldDiffs = diff.fieldDiffs.map((f) => ({
        ...f,
        approved: diff.allApproved,
      }));
      next[diffIndex] = diff;
      return next;
    });
  }, []);

  const toggleExpand = useCallback((diffIndex: number) => {
    setDiffs((prev) => {
      const next = [...prev];
      next[diffIndex] = { ...next[diffIndex], expanded: !next[diffIndex].expanded };
      return next;
    });
  }, []);

  const toggleAllApprovals = useCallback((approve: boolean) => {
    setDiffs((prev) =>
      prev.map((diff) => ({
        ...diff,
        allApproved: approve,
        fieldDiffs: diff.fieldDiffs.map((f) => ({ ...f, approved: approve })),
      }))
    );
  }, []);

  /* ---- Computed stats ---- */
  const stats = useMemo(() => {
    const newTasks = diffs.filter((d) => d.type === "new");
    const changedTasks = diffs.filter((d) => d.type === "changed");
    const approvedNew = newTasks.filter((d) => d.allApproved).length;
    const approvedChanged = changedTasks.filter((d) =>
      d.fieldDiffs.some((f) => f.approved)
    ).length;
    const totalApprovedFields = changedTasks.reduce(
      (sum, d) => sum + d.fieldDiffs.filter((f) => f.approved).length,
      0
    );
    return {
      newCount: newTasks.length,
      changedCount: changedTasks.length,
      approvedNew,
      approvedChanged,
      totalApprovedFields,
      hasAnyApproval: approvedNew > 0 || totalApprovedFields > 0,
    };
  }, [diffs]);

  /* ---- Current task map for overview ---- */
  const currentMap = useMemo(() => {
    const m = new Map<string, Task>();
    for (const t of currentMonthTasks) {
      const n = normalizeNum(t.num);
      if (n) m.set(n, t);
    }
    return m;
  }, [currentMonthTasks]);

  /* ---- Apply Changes ---- */
  const handleApply = useCallback(async () => {
    setIsApplying(true);

    try {
      const updatedTasks: Task[] = [];
      const newTasks: ParsedExcelTask[] = [];

      for (const diff of diffs) {
        if (diff.type === "new" && diff.allApproved) {
          newTasks.push(diff.importedTask);
        } else if (diff.type === "changed" && diff.currentTask) {
          const approvedFieldDiffs = diff.fieldDiffs.filter((f) => f.approved);
          if (approvedFieldDiffs.length === 0) continue;

          const updated = { ...diff.currentTask };
          for (const fd of approvedFieldDiffs) {
            (updated as any)[fd.field] = fd.newValue;
          }
          updatedTasks.push(updated);
        }
      }

      onApplyChanges({ updatedTasks, newTasks });
    } finally {
      setIsApplying(false);
    }
  }, [diffs, onApplyChanges]);

  /* ---- Reset on close ---- */
  const handleClose = useCallback(() => {
    setFileName("");
    setImportedTasks([]);
    setDiffs([]);
    setIsLoading(false);
    setIsApplying(false);
    setActiveTab("overview");
    onClose();
  }, [onClose]);

  /* ---- Render ---- */
  const newDiffs = diffs.filter((d) => d.type === "new");
  const changedDiffs = diffs.filter((d) => d.type === "changed");

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-[1100px] h-[90vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <FileSpreadsheet className="w-5 h-5" />
            Синхронизация данных из Excel
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Загрузите Excel файл, чтобы сравнить задачи с текущими данными и выборочно применить изменения
          </p>
        </DialogHeader>

        {/* File Upload */}
        <div className="px-6 pb-3">
          <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-4 text-center hover:border-muted-foreground/50 transition-colors cursor-pointer relative">
            <input
              type="file"
              accept=".xlsx, .xls"
              onChange={handleFileUpload}
              className="hidden"
              id="excel-sync-upload"
            />
            <label htmlFor="excel-sync-upload" className="cursor-pointer flex flex-col items-center gap-1">
              <Upload className="w-6 h-6 text-muted-foreground" />
              {fileName ? (
                <span className="text-sm font-medium">{fileName}</span>
              ) : (
                <span className="text-sm text-muted-foreground">Нажмите, чтобы выбрать Excel файл</span>
              )}
            </label>
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Обработка файла...</span>
            </div>
          </div>
        )}

        {/* Main Content */}
        {!isLoading && importedTasks.length > 0 && (
          <>
            {/* Stats Bar */}
            <div className="px-6 pb-3">
              <div className="flex items-center gap-4 flex-wrap">
                <Badge variant="secondary" className="text-xs gap-1">
                  <FileSpreadsheet className="w-3 h-3" />
                  В файле: {importedTasks.length}
                </Badge>
                <Badge variant="outline" className="text-xs gap-1">
                  Новых: {stats.newCount}
                </Badge>
                <Badge variant="outline" className="text-xs gap-1">
                  Изменённых: {stats.changedCount}
                </Badge>
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => toggleAllApprovals(true)}
                  >
                    <CheckSquare className="w-3.5 h-3.5 mr-1" />
                    Выбрать все
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => toggleAllApprovals(false)}
                  >
                    <Square className="w-3.5 h-3.5 mr-1" />
                    Снять все
                  </Button>
                </div>
              </div>
            </div>

            {/* Tab Switcher */}
            <div className="px-6 pb-2">
              <div className="flex border-b">
                <button
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === "overview"
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setActiveTab("overview")}
                >
                  Обзор ({currentMonthTasks.filter(t => t.num || t.name).length} текущих / {importedTasks.length} из файла)
                </button>
                <button
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === "diff"
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setActiveTab("diff")}
                >
                  Изменения ({diffs.length})
                </button>
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden px-6 pb-3">
              {activeTab === "overview" ? (
                <ScrollArea className="h-full">
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    {/* Left: Current tasks */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                        <h3 className="text-sm font-semibold">Текущие задачи</h3>
                        <Badge variant="secondary" className="text-xs">
                          {currentMonthTasks.filter((t) => t.num || t.name).length}
                        </Badge>
                      </div>
                      <div className="space-y-1.5">
                        {currentMonthTasks
                          .filter((t) => t.num || t.name)
                          .map((task) => {
                            const isChanged = diffs.some((d) => d.num === normalizeNum(task.num));
                            const isNewInFile = importedTasks.some(
                              (imp) => normalizeNum(imp.num) === normalizeNum(task.num)
                            );
                            return (
                              <div
                                key={task.id}
                                className={`rounded-md border px-3 py-2 text-xs transition-colors ${
                                  isChanged
                                    ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20"
                                    : isNewInFile
                                    ? "border-muted bg-background"
                                    : "border-muted/50 bg-muted/30"
                                }`}
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-mono font-bold text-muted-foreground">
                                    #{task.num}
                                  </span>
                                  <span className="font-medium truncate flex-1">{task.name}</span>
                                  {isChanged && (
                                    <Badge className="text-[10px] px-1.5 py-0 h-4 bg-amber-100 text-amber-700 border-amber-200">
                                      Изменено
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex gap-3 text-muted-foreground">
                                  <span>План: {task.planH || "—"}</span>
                                  <span>Факт: {task.factH || "—"}</span>
                                  <span>{task.priority}</span>
                                  <span>{task.status}</span>
                                </div>
                              </div>
                            );
                          })}
                        {currentMonthTasks.filter((t) => t.num || t.name).length === 0 && (
                          <div className="text-xs text-muted-foreground text-center py-8">
                            Нет текущих задач
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right: Imported tasks */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                        <h3 className="text-sm font-semibold">Задачи из файла</h3>
                        <Badge variant="secondary" className="text-xs">
                          {importedTasks.length}
                        </Badge>
                      </div>
                      <div className="space-y-1.5">
                        {importedTasks.map((task, idx) => {
                          const cur = currentMap.get(task.num);
                          const diff = diffs.find((d) => d.num === task.num);
                          const isChanged = diff?.type === "changed";
                          const isNew = diff?.type === "new";
                          return (
                            <div
                              key={task.num || idx}
                              className={`rounded-md border px-3 py-2 text-xs transition-colors ${
                                isNew
                                  ? "border-green-300 bg-green-50 dark:bg-green-950/20"
                                  : isChanged
                                  ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20"
                                  : "border-muted/50 bg-muted/30"
                              }`}
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-mono font-bold text-muted-foreground">
                                  #{task.num}
                                </span>
                                <span className="font-medium truncate flex-1">{task.name}</span>
                                {isNew && (
                                  <Badge className="text-[10px] px-1.5 py-0 h-4 bg-green-100 text-green-700 border-green-200">
                                    Новая
                                  </Badge>
                                )}
                                {isChanged && (
                                  <Badge className="text-[10px] px-1.5 py-0 h-4 bg-amber-100 text-amber-700 border-amber-200">
                                    Изменено
                                  </Badge>
                                )}
                              </div>
                              <div className="flex gap-3 text-muted-foreground">
                                <span>План: {task.planH || "—"}</span>
                                <span>Факт: {task.factH || "—"}</span>
                                <span>{task.priority}</span>
                                <span>{task.status}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              ) : (
                /* Diff Tab */
                <ScrollArea className="h-full">
                  <div className="space-y-2 pt-2">
                    {diffs.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <Check className="w-10 h-10 mb-3 opacity-40" />
                        <p className="text-sm font-medium">Нет различий</p>
                        <p className="text-xs">Все задачи в файле совпадают с текущими данными</p>
                      </div>
                    )}

                    {/* New Tasks Section */}
                    {newDiffs.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 mb-1">
                          <Plus className="w-4 h-4 text-green-600" />
                          <span className="text-sm font-semibold text-green-700 dark:text-green-400">
                            Новые задачи ({newDiffs.length})
                          </span>
                        </div>
                        {newDiffs.map((diff, idx) => {
                          const origIdx = diffs.indexOf(diff);
                          return (
                            <div
                              key={diff.num}
                              className="rounded-lg border border-green-200 bg-green-50/50 dark:bg-green-950/10 dark:border-green-900/50 overflow-hidden"
                            >
                              <div className="flex items-center gap-3 px-4 py-2.5">
                                <Checkbox
                                  checked={diff.allApproved}
                                  onCheckedChange={() => toggleTaskApproval(origIdx)}
                                  className="data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600"
                                />
                                <span className="font-mono text-xs font-bold text-muted-foreground">
                                  #{diff.num}
                                </span>
                                <span className="text-sm font-medium flex-1 truncate">
                                  {diff.importedTask.name}
                                </span>
                                <div className="flex gap-2 text-xs text-muted-foreground">
                                  <span>План: {diff.importedTask.planH}</span>
                                  <span>Факт: {diff.importedTask.factH}</span>
                                  <span>{diff.importedTask.priority}</span>
                                  <span>{diff.importedTask.status}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Changed Tasks Section */}
                    {changedDiffs.length > 0 && (
                      <div className="space-y-1.5 mt-4">
                        <div className="flex items-center gap-2 mb-1">
                          <ArrowUpDown className="w-4 h-4 text-amber-600" />
                          <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                            Изменённые задачи ({changedDiffs.length})
                          </span>
                        </div>
                        {changedDiffs.map((diff) => {
                          const origIdx = diffs.indexOf(diff);
                          const approvedFields = diff.fieldDiffs.filter((f) => f.approved).length;
                          return (
                            <div
                              key={diff.num}
                              className="rounded-lg border border-amber-200 bg-amber-50/50 dark:bg-amber-950/10 dark:border-amber-900/50 overflow-hidden"
                            >
                              {/* Task Header */}
                              <div
                                className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-amber-100/50 dark:hover:bg-amber-900/20 transition-colors"
                                onClick={() => toggleExpand(origIdx)}
                              >
                                <Checkbox
                                  checked={diff.allApproved}
                                  onCheckedChange={(e) => {
                                    e && toggleTaskApproval(origIdx);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="data-[state=checked]:bg-amber-600 data-[state=checked]:border-amber-600"
                                />
                                <span className="font-mono text-xs font-bold text-muted-foreground">
                                  #{diff.num}
                                </span>
                                <span className="text-sm font-medium flex-1 truncate">
                                  {diff.importedTask.name}
                                </span>
                                <Badge variant="outline" className="text-[10px] h-5">
                                  {approvedFields}/{diff.fieldDiffs.length} изменений
                                </Badge>
                                {diff.expanded ? (
                                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                )}
                              </div>

                              {/* Expanded: Field diffs */}
                              {diff.expanded && (
                                <div className="border-t border-amber-200/50 dark:border-amber-900/30 px-4 py-2">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-muted-foreground">
                                        <th className="text-left py-1.5 pr-2 w-8"></th>
                                        <th className="text-left py-1.5 pr-2 w-28">Поле</th>
                                        <th className="text-left py-1.5 pr-2">Текущее</th>
                                        <th className="text-center py-1.5 px-1 w-6"></th>
                                        <th className="text-left py-1.5">Из файла</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {diff.fieldDiffs.map((fd, fi) => (
                                        <tr
                                          key={fd.field}
                                          className={`${
                                            fd.approved
                                              ? "bg-transparent"
                                              : "opacity-50"
                                          }`}
                                        >
                                          <td className="py-1.5 pr-2">
                                            <Checkbox
                                              checked={fd.approved}
                                              onCheckedChange={() =>
                                                toggleFieldApproval(origIdx, fi)
                                              }
                                              className="scale-90"
                                            />
                                          </td>
                                          <td className="py-1.5 pr-2 font-medium">
                                            {fd.label}
                                          </td>
                                          <td className="py-1.5 pr-2">
                                            <span className="line-through text-red-500/80">
                                              {fd.oldValue || "—"}
                                            </span>
                                          </td>
                                          <td className="py-1.5 px-1 text-center">
                                            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground inline" />
                                          </td>
                                          <td className="py-1.5">
                                            <span className="font-medium text-green-600 dark:text-green-400">
                                              {fd.newValue || "—"}
                                            </span>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t bg-muted/30 flex items-center justify-between">
              <div className="text-xs text-muted-foreground space-y-0.5">
                <div>
                  К применению:{" "}
                  <span className="font-bold text-green-600">{stats.approvedNew} новых</span>
                  {" и "}
                  <span className="font-bold text-amber-600">
                    {stats.approvedChanged} обновлённых
                  </span>
                  {" задач"}
                </div>
                {stats.totalApprovedFields > 0 && (
                  <div className="text-muted-foreground/70">
                    Полей для обновления: {stats.totalApprovedFields}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleClose}>
                  Отмена
                </Button>
                <Button
                  onClick={handleApply}
                  disabled={isApplying || !stats.hasAnyApproval}
                >
                  {isApplying ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Check className="w-4 h-4 mr-2" />
                  )}
                  Применить выбранные
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Empty State (no file loaded) */}
        {!isLoading && importedTasks.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <FileSpreadsheet className="w-12 h-12 opacity-30" />
              <p className="text-sm">Загрузите Excel файл для сравнения</p>
              <p className="text-xs opacity-70">
                Формат: .xlsx с колонками №, Наименование, План, Факт, Приоритет, Статус
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
