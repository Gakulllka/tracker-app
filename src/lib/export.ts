import "./buffer-polyfill";
import ExcelJS from "exceljs";
import {
  type Task,
  type AllData,
  type Domain,
  MONTHS,
  SCOL,
  PCOL,
  STATUSES,
} from "./types";
import { fixStatus, fixPriority, evalExpr, fmt2, R2 } from "./metrics";

/* ------------------------------------------------------------------ */
/*  JSON Export / Import                                               */
/* ------------------------------------------------------------------ */

export interface ImportResult {
  allData: AllData;
  backlog: Task[];
  themeId: string;
  customColor: string;
  domains: Domain[];
  activeDomainId: string;
}

export function exportJSON(
  allData: AllData,
  backlog: Task[],
  themeId: string,
  customColor: string,
  domains: Domain[],
  activeDomainId: string,
  domainName?: string,
): void {
  const payload = {
    data: allData,
    backlog,
    themeId,
    customColor,
    domains,
    activeDomainId,
    _version: "1.0.0",
    _saved: new Date().toISOString(),
  };

  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}-${now.getFullYear()}`;
  const fileName = `tracker_${domainName || "export"}_${dateStr}.json`;

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  downloadBlob(blob, fileName);
}

export async function importJSON(file: File): Promise<ImportResult> {
  const text = await file.text();
  const raw = JSON.parse(text);

  if (!raw.data || typeof raw.data !== "object") {
    throw new Error("Неверный формат файла: отсутствует поле 'data'");
  }

  const allData: AllData = {};
  for (const [key, value] of Object.entries(raw.data)) {
    const monthIdx = Number(key);
    if (isNaN(monthIdx) || monthIdx < 0 || monthIdx > 11) continue;
    const arr = Array.isArray(value) ? value : [];
    allData[monthIdx] = arr.map((t: Record<string, unknown>) => ({
      id: (t.id as string) || crypto.randomUUID(),
      num: String(t.num || ""),
      name: String(t.name || ""),
      planH: String(t.planH ?? ""),
      factH: String(t.factH ?? ""),
      priority: fixPriority(t.priority),
      status: fixStatus(t.status),
      comment: String(t.comment || ""),
      commentLog: Array.isArray(t.commentLog) ? t.commentLog : [],
      _hidden: Boolean(t._hidden),
    }));
  }

  // Ensure all 12 months exist
  for (let i = 0; i < 12; i++) {
    if (!allData[i]) allData[i] = [];
  }

  const backlog: Task[] = Array.isArray(raw.backlog)
    ? raw.backlog.map((t: Record<string, unknown>) => ({
        id: (t.id as string) || crypto.randomUUID(),
        num: String(t.num || ""),
        name: String(t.name || ""),
        planH: String(t.planH ?? ""),
        factH: String(t.factH ?? ""),
        priority: fixPriority(t.priority),
        status: fixStatus(t.status),
        comment: String(t.comment || ""),
        commentLog: Array.isArray(t.commentLog) ? t.commentLog : [],
      }))
    : [];

  const domains: Domain[] = Array.isArray(raw.domains)
    ? raw.domains.filter((d: Record<string, unknown>) => d.id && d.name)
    : [];

  return {
    allData,
    backlog,
    themeId: String(raw.themeId || "#5B9BD5"),
    customColor: String(raw.customColor || ""),
    domains: domains.length > 0 ? domains : [{ id: "default", name: "По умолчанию" }],
    activeDomainId: String(raw.activeDomainId || "default"),
  };
}

/* ------------------------------------------------------------------ */
/*  XLSX Export – single month                                        */
/* ------------------------------------------------------------------ */

export async function exportMonthXLSX(
  rows: Task[],
  month: number,
  totalFactMap: Record<string, number>,
  accentHex: string,
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(MONTHS[month]);

  const acc = accentHex.replace("#", "FF");
  const accLight = accentHex.replace("#", "1A"); // ~10% opacity bg

  // ── Columns — matching user's format exactly ──────────────────────
  // Номер | Задача | Трудоёмкость предв, ч | Часы фактические | Приоритет | Статус
  // + extra: Итого, ч | Прогресс | Комментарий
  ws.columns = [
    { key: "num",      width: 12  },
    { key: "name",     width: 48  },
    { key: "planH",    width: 22  },
    { key: "factH",    width: 20  },
    { key: "priority", width: 18  },
    { key: "status",   width: 26  },
    { key: "totalH",   width: 14  },
    { key: "progress", width: 13  },
    { key: "comment",  width: 40  },
  ];

  // ── Header row ────────────────────────────────────────────────────
  const HEADERS = ["Номер", "Задача", "Трудоёмкость предв, ч", "Часы фактические", "Приоритет", "Статус", "Итого, ч", "Прогресс", "Комментарий"];
  const headerRow = ws.addRow(HEADERS);
  headerRow.height = 30;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10, name: "Arial" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: acc } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: false };
    cell.border = {
      bottom: { style: "medium", color: { argb: "FFFFFFFF" } },
      right: { style: "thin", color: { argb: "33FFFFFF" } },
    };
  });

  // ── Data rows ─────────────────────────────────────────────────────
  rows.forEach((task, idx) => {
    const plan   = evalExpr(task.planH);
    const fact   = evalExpr(task.factH);
    const totalH = task.num ? (totalFactMap[task.num] || 0) : fact;
    const isClosed = [STATUSES.DONE, STATUSES.COMPLETED, STATUSES.PROD_CHECK].includes(task.status as typeof STATUSES.DONE);
    const prog   = isClosed ? 100 : (plan > 0 ? Math.min(100, Math.round(totalH / plan * 100)) : 0);
    const over   = isClosed && totalH > plan;
    const isEven = idx % 2 === 0;

    const row = ws.addRow({
      num:      task.num || "",
      name:     task.name || "",
      planH:    plan  > 0 ? fmt2(plan)   : "",
      factH:    fact  > 0 ? fmt2(fact)   : "",
      priority: task.priority,
      status:   task.status,
      totalH:   totalH > 0 ? fmt2(R2(totalH)) : "",
      progress: prog > 0 ? `${prog}%` : "",
      comment:  task.comment || "",
    });
    row.height = 20;

    // Base row style
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { size: 10, name: "Arial" };
      cell.alignment = { vertical: "middle" };
      cell.fill = isEven
        ? { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } }
        : { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F7F9" } };
      cell.border = {
        bottom: { style: "hair", color: { argb: "FFE0E0E0" } },
      };
    });

    // Num — monospace, muted
    const numCell = row.getCell(1);
    numCell.font = { size: 10, name: "Courier New", color: { argb: "FF8888AA" } };
    numCell.alignment = { horizontal: "center", vertical: "middle" };

    // Name — left aligned, slightly bolder
    const nameCell = row.getCell(2);
    nameCell.font = { size: 10, name: "Arial", bold: false };

    // Plan / Fact — right aligned, numeric
    [3, 4, 7].forEach(c => {
      const cell = row.getCell(c);
      cell.alignment = { horizontal: "right", vertical: "middle" };
      cell.font = { size: 10, name: "Arial" };
    });

    // Priority — colored
    const prioCell = row.getCell(5);
    const prioColor = PCOL[task.priority];
    if (prioColor) {
      prioCell.font = { color: { argb: prioColor.replace("#", "FF") }, bold: true, size: 10, name: "Arial" };
    }
    prioCell.alignment = { horizontal: "center", vertical: "middle" };

    // Status — colored
    const statusCell = row.getCell(6);
    const statColor = SCOL[task.status];
    if (statColor) {
      statusCell.font = { color: { argb: statColor.replace("#", "FF") }, bold: true, size: 10, name: "Arial" };
    }
    statusCell.alignment = { horizontal: "center", vertical: "middle" };

    // Progress — colored
    const progCell = row.getCell(8);
    const progArgb = isClosed
      ? (over ? "FFEF4444" : "FF22C55E")
      : "FFF59E0B";
    progCell.font = { color: { argb: progArgb }, bold: true, size: 10, name: "Arial" };
    progCell.alignment = { horizontal: "center", vertical: "middle" };
  });

  // ── Footer ────────────────────────────────────────────────────────
  if (rows.length > 0) {
    let totPlan = 0, totFact = 0, totTotalH = 0;
    rows.forEach((t) => {
      totPlan  += evalExpr(t.planH);
      totFact  += evalExpr(t.factH);
      totTotalH += t.num ? (totalFactMap[t.num] || 0) : evalExpr(t.factH);
    });

    // Blank separator row
    const sepRow = ws.addRow([]);
    sepRow.height = 4;
    sepRow.eachCell({ includeEmpty: true }, cell => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: acc } };
    });

    const footerRow = ws.addRow(["", "ИТОГО", fmt2(R2(totPlan)), fmt2(R2(totFact)), "", "", fmt2(R2(totTotalH))]);
    footerRow.height = 24;
    footerRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F4FF" } };
      cell.font  = { bold: true, size: 10, name: "Arial", color: { argb: acc } };
      cell.alignment = { vertical: "middle" };
      cell.border = { top: { style: "medium", color: { argb: acc } } };
    });
    footerRow.getCell(3).alignment = { horizontal: "right", vertical: "middle" };
    footerRow.getCell(4).alignment = { horizontal: "right", vertical: "middle" };
    footerRow.getCell(7).alignment = { horizontal: "right", vertical: "middle" };
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(blob, `tasks_${MONTHS[month]}.xlsx`);
}

/* ------------------------------------------------------------------ */
/*  XLSX Export – all months                                          */
/* ------------------------------------------------------------------ */

export async function exportAllXLSX(
  allData: AllData,
  totalFactMap: Record<string, number>,
  accentHex: string,
): Promise<void> {
  const wb = new ExcelJS.Workbook();

  for (let m = 0; m < 12; m++) {
    const rows = (allData[m] || []).filter((r) => r.name || r.num);
    if (rows.length === 0) continue;

    const ws = wb.addWorksheet(MONTHS[m], {
      properties: { defaultColWidth: 14 },
    });

    const accentRgb = hexToRgbObj(accentHex);
    const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    const headerFill: ExcelJS.FillPattern = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: accentRgb },
    };

    ws.columns = [
      { header: "#", key: "idx", width: 5 },
      { header: "№", key: "num", width: 10 },
      { header: "Наименование", key: "name", width: 40 },
      { header: "План, ч", key: "planH", width: 12 },
      { header: "Факт, ч", key: "factH", width: 12 },
      { header: "Итого, ч", key: "totalH", width: 12 },
      { header: "Приоритет", key: "priority", width: 16 },
      { header: "Статус", key: "status", width: 24 },
      { header: "Прогресс", key: "progress", width: 12 },
      { header: "Комментарий", key: "comment", width: 36 },
    ];

    const headerRow = ws.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = headerFont;
      cell.fill = headerFill;
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = { bottom: { style: "thin", color: { argb: "FFD0D0D0" } } };
    });
    headerRow.height = 28;

    rows.forEach((task, idx) => {
      const plan = evalExpr(task.planH);
      const fact = evalExpr(task.factH);
      const totalH = task.num ? (totalFactMap[task.num] || 0) : fact;
      const isClosed = [STATUSES.DONE, STATUSES.COMPLETED, STATUSES.PROD_CHECK].includes(task.status as typeof STATUSES.DONE);
      const prog = isClosed ? 100 : (plan > 0 ? Math.min(100, Math.round(totalH / plan * 100)) : 0);

      const row = ws.addRow({
        idx: idx + 1,
        num: task.num || "",
        name: task.name || "",
        planH: fmt2(plan),
        factH: fmt2(fact),
        totalH: fmt2(R2(totalH)),
        priority: task.priority,
        status: task.status,
        progress: `${prog}%`,
        comment: task.comment || "",
      });

      const isEven = idx % 2 === 0;
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = {
          bottom: { style: "hair", color: { argb: isEven ? "FFF0F0F0" : "FFFFFFFF" } },
        };
        if (!isEven) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8F8F8" } };
        }
      });

      const prioCell = row.getCell(7);
      const prioColor = PCOL[task.priority];
      if (prioColor) {
        prioCell.font = { color: { argb: prioColor.replace("#", "FF") }, bold: true, size: 10 };
      }

      const statusCell = row.getCell(8);
      const statColor = SCOL[task.status];
      if (statColor) {
        statusCell.font = { color: { argb: statColor.replace("#", "FF") }, bold: true, size: 10 };
      }

      const progCell = row.getCell(9);
      const pc = prog >= 100 ? "FF4A9A5A" : prog >= 50 ? "FF5090B8" : "FFB89830";
      progCell.font = { color: { argb: pc }, bold: true, size: 10 };
    });

    // Footer
    if (rows.length > 0) {
      let totPlan = 0;
      let totFact = 0;
      let totTotalH = 0;
      rows.forEach((t) => {
        const p = evalExpr(t.planH);
        const f = evalExpr(t.factH);
        const th = t.num ? (totalFactMap[t.num] || 0) : f;
        totPlan += p;
        totFact += f;
        totTotalH += th;
      });
      const footerRow = ws.addRow({});
      footerRow.height = 24;
      const fc = footerRow.getCell(3);
      fc.value = "ИТОГО";
      fc.font = { bold: true, size: 11, color: { argb: accentRgb } };
      footerRow.getCell(4).value = fmt2(R2(totPlan));
      footerRow.getCell(5).value = fmt2(R2(totFact));
      footerRow.getCell(6).value = fmt2(R2(totTotalH));
      footerRow.getCell(4).font = { bold: true, size: 10 };
      footerRow.getCell(5).font = { bold: true, size: 10 };
      footerRow.getCell(6).font = { bold: true, size: 10 };
      footerRow.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = { top: { style: "thin", color: { argb: accentRgb } } };
      });
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(blob, "tasks_all_months.xlsx");
}

/* ------------------------------------------------------------------ */
/*  XLSX Import – single month                                        */
/* ------------------------------------------------------------------ */

export async function importMonthXLSX(file: File, targetMonth: number): Promise<Task[]> {
  const buffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const ws = wb.worksheets[0];
  if (!ws) throw new Error("В файле нет листов");

  const rows: Task[] = [];
  // Skip header row (row 1), start from row 2
  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= 1) return;
    // Columns: 1=Номер, 2=Задача, 3=План(ч), 4=Факт(ч), 5=Приоритет, 6=Статус

    const name = String(row.getCell(2).value || "");
    if (!name.trim()) return; // skip empty rows

    rows.push({
      id: crypto.randomUUID(),
      num: String(row.getCell(1).value || ""),
      name: name.trim(),
      planH: String(row.getCell(3).value || ""),
      factH: String(row.getCell(4).value || ""),
      priority: fixPriority(row.getCell(5).value),
      status: fixStatus(row.getCell(6).value),
      comment: "",
      commentLog: [],
    });
  });

  return rows;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function hexToRgbObj(hex: string): string {
  const cleaned = hex.replace("#", "");
  return `FF${cleaned}`;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
