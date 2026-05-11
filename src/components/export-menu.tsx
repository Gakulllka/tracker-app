'use client';

import React, { useState } from 'react';
import "../lib/buffer-polyfill";
import ExcelJS from "exceljs";
import {
  type Task,
  MONTHS,
  SCOL,
  PCOL,
  STATUSES,
} from "@/lib/types";
import { fixStatus, fixPriority, evalExpr, fmt2, R2 } from "@/lib/metrics";

interface ExportMenuProps {
  tasks: Task[];
  /** Rows as they appear in the table (for Excel export with full data). */
  rows?: Task[];
  selectedIds?: string[];
  columns?: { key: string; label: string }[];
  /** Accent colour hex (e.g. "#5B9BD5") — used to style Excel headers. */
  accentHex?: string;
  /** totalFactMap for computing "Итого" column in Excel. */
  totalFactMap?: Record<string, number>;
  /** 0-11 month index — used for Excel file name. */
  currentMonth?: number;
  /** Whether dark theme is active — adjusts dropdown styles. */
  isDark?: boolean;
}

/* ── helpers ──────────────────────────────────────────────────── */

function hexToArgb(hex: string): string {
  return `FF${hex.replace("#", "")}`;
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

/* ── Excel export (single month, real .xlsx) ─────────────────── */

async function exportToExcel(
  rows: Task[],
  totalFactMap: Record<string, number>,
  accentHex: string,
  month: number,
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(MONTHS[month], {
    properties: { defaultColWidth: 14 },
  });

  const accentRgb = hexToArgb(accentHex);
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
    const isDone = task.status === STATUSES.DONE;
    const prog = isDone ? 100 : (plan > 0 ? Math.min(100, Math.round(totalH / plan * 100)) : 0);

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
    const prioColor = PCOL[task.priority as keyof typeof PCOL];
    if (prioColor) {
      prioCell.font = { color: { argb: prioColor.replace("#", "FF") }, bold: true, size: 10 };
    }

    const statusCell = row.getCell(8);
    const statColor = SCOL[task.status as keyof typeof SCOL];
    if (statColor) {
      statusCell.font = { color: { argb: statColor.replace("#", "FF") }, bold: true, size: 10 };
    }

    const progCell = row.getCell(9);
    const progColor = prog >= 100 ? "FF4A9A5A" : prog >= 50 ? "FF5090B8" : "FFB89830";
    progCell.font = { color: { argb: progColor }, bold: true, size: 10 };
  });

  // Footer row
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

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(blob, `tasks_${MONTHS[month]}.xlsx`);
}

/* ── PDF via native print ────────────────────────────────────── */

function tasksToHTMLTable(tasks: Task[], accentHex: string): string {
  const headerRow = ["#", "№", "Наименование", "План, ч", "Факт, ч", "Приоритет", "Статус", "Комментарий"]
    .map(c => `<th style="padding:10px 14px;text-align:left;border-bottom:2px solid ${accentHex};font-size:13px;color:#475569;font-weight:600">${c}</th>`).join('');

  const bodyRows = tasks.map((task, i) => {
    const bgColor = i % 2 === 0 ? '#ffffff' : '#f8fafc';
    const prioColor = PCOL[task.priority as keyof typeof PCOL] || '#6b7280';
    const statColor = SCOL[task.status as keyof typeof SCOL] || '#6b7280';
    const plan = evalExpr(task.planH);
    const fact = evalExpr(task.factH);
    const cells = [
      `<td style="padding:8px 14px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#64748b">${i + 1}</td>`,
      `<td style="padding:8px 14px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#334155">${task.num || ''}</td>`,
      `<td style="padding:8px 14px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#334155;font-weight:500">${task.name || ''}</td>`,
      `<td style="padding:8px 14px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#334155;text-align:right">${fmt2(plan)}</td>`,
      `<td style="padding:8px 14px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#334155;text-align:right">${fmt2(fact)}</td>`,
      `<td style="padding:8px 14px;border-bottom:1px solid #f1f5f9;font-size:12px"><span style="color:${prioColor};font-weight:600">${task.priority}</span></td>`,
      `<td style="padding:8px 14px;border-bottom:1px solid #f1f5f9;font-size:12px"><span style="color:${statColor};font-weight:600">${task.status}</span></td>`,
      `<td style="padding:8px 14px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#64748b;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${(task.comment || '').replace(/</g, '&lt;')}</td>`,
    ].join('');
    return `<tr style="background:${bgColor}">${cells}</tr>`;
  }).join('');

  return `
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        @page { margin: 15mm; size: landscape; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
      </style>
    </head>
    <body>
      <div style="margin-bottom:20px">
        <h1 style="font-size:20px;color:#1e293b;margin:0 0 4px">Трекер задач</h1>
        <p style="font-size:12px;color:#94a3b8;margin:0">Экспорт от ${new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </div>
      <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
        <thead><tr style="background:${accentHex}15">${headerRow}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
      <div style="margin-top:16px;font-size:11px;color:#94a3b8">
        Всего задач: ${tasks.length}
      </div>
    </body>
    </html>
  `;
}

/* ── Component ────────────────────────────────────────────────── */

export function ExportMenu({
  tasks,
  rows,
  selectedIds,
  accentHex = "#5B9BD5",
  totalFactMap = {},
  currentMonth = new Date().getMonth(),
  isDark = false,
}: ExportMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Use full Task rows for Excel export if available, otherwise fall back to tasks
  const excelRows = (rows || tasks) as Task[];

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      await exportToExcel(excelRows, totalFactMap, accentHex, currentMonth);
    } catch (err) {
      console.error("Excel export error:", err);
    } finally {
      setIsExporting(false);
      setIsOpen(false);
    }
  };

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const html = tasksToHTMLTable(excelRows, accentHex);
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.onload = () => {
          printWindow.print();
        };
      }
    } finally {
      setIsExporting(false);
      setIsOpen(false);
    }
  };

  const handleCopyClipboard = async () => {
    setIsExporting(true);
    try {
      const header = ["#", "№", "Наименование", "План", "Факт", "Приоритет", "Статус", "Комментарий"].join("\t");
      const body = excelRows.map((t, i) =>
        [i + 1, t.num, t.name, fmt2(evalExpr(t.planH)), fmt2(evalExpr(t.factH)), t.priority, t.status, t.comment].join("\t")
      ).join("\n");
      await navigator.clipboard.writeText(header + "\n" + body);
    } finally {
      setIsExporting(false);
      setIsOpen(false);
    }
  };

  // Theme-aware colours
  const bg = isDark ? "bg-[#1a1a2e]" : "bg-white";
  const text = isDark ? "text-gray-200" : "text-gray-700";
  const border = isDark ? "border-gray-600" : "border-gray-200";
  const hoverBg = isDark ? "hover:bg-gray-700/50" : "hover:bg-gray-50";
  const itemHover = isDark ? "hover:bg-gray-700/40" : "hover:bg-gray-50";
  const labelColor = isDark ? "text-gray-400" : "text-gray-400";
  const subColor = isDark ? "text-gray-500" : "text-gray-500";
  const itemName = isDark ? "text-gray-200" : "text-gray-800";
  const itemDesc = isDark ? "text-gray-400" : "text-gray-500";
  const dividerBorder = isDark ? "border-gray-700" : "border-gray-100";

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${border} ${bg} ${hoverBg} transition-colors text-sm font-medium ${text} shadow-sm`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        Экспорт
        {selectedIds && selectedIds.length > 0 && (
          <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs font-bold ${isDark ? "bg-indigo-900 text-indigo-300" : "bg-indigo-100 text-indigo-700"}`}>
            {selectedIds.length}
          </span>
        )}
        <svg className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className={`absolute right-0 top-full mt-2 z-50 w-64 ${bg} rounded-xl shadow-xl border ${border} py-2`}>
            <div className={`px-4 py-2 border-b ${dividerBorder}`}>
              <p className={`text-xs font-semibold ${labelColor} uppercase tracking-wider`}>
                Формат экспорта
              </p>
              <p className={`text-xs ${subColor} mt-0.5`}>
                {excelRows.length} задач(и) будет экспортировано
              </p>
            </div>

            <button
              onClick={handleExportExcel}
              disabled={isExporting}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left ${itemHover} transition-colors group`}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform ${isDark ? "bg-green-900/40" : "bg-green-50"} ${isDark ? "group-hover:bg-green-800/50" : "group-hover:bg-green-100"}`}>
                <svg className={`w-5 h-5 ${isDark ? "text-green-400" : "text-green-600"}`} viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 2l5 5h-5V4zM8.5 13h1.25v4.5L8.5 18.5 7.25 17.5V13H8.5zm3.5 0h1.25c.69 0 1.25.56 1.25 1.25v2.5c0 .69-.56 1.25-1.25 1.25H12v-5zm1.25 3.75v-2.5H13v2.5h.25z"/>
                </svg>
              </div>
              <div>
                <p className={`text-sm font-medium ${itemName}`}>Excel (.xlsx)</p>
                <p className={`text-xs ${itemDesc}`}>Настоящий формат Excel</p>
              </div>
            </button>

            <button
              onClick={handleExportPDF}
              disabled={isExporting}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left ${itemHover} transition-colors group`}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform ${isDark ? "bg-red-900/40" : "bg-red-50"} ${isDark ? "group-hover:bg-red-800/50" : "group-hover:bg-red-100"}`}>
                <svg className={`w-5 h-5 ${isDark ? "text-red-400" : "text-red-600"}`} viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 2l5 5h-5V4zM9 13v5h1.25v-1.5h.75c.83 0 1.5-.67 1.5-1.5v-.5c0-.83-.67-1.5-1.5-1.5H9zm2.25 2h-.75v-1h.75v1z"/>
                </svg>
              </div>
              <div>
                <p className={`text-sm font-medium ${itemName}`}>PDF</p>
                <p className={`text-xs ${itemDesc}`}>Печать / сохранение как PDF</p>
              </div>
            </button>

            <button
              onClick={handleCopyClipboard}
              disabled={isExporting}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left ${itemHover} transition-colors group`}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform ${isDark ? "bg-blue-900/40" : "bg-blue-50"} ${isDark ? "group-hover:bg-blue-800/50" : "group-hover:bg-blue-100"}`}>
                <svg className={`w-5 h-5 ${isDark ? "text-blue-400" : "text-blue-600"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
              </div>
              <div>
                <p className={`text-sm font-medium ${itemName}`}>Буфер обмена</p>
                <p className={`text-xs ${itemDesc}`}>Копировать как текст</p>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
