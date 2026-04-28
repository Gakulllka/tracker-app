'use client';

import React, { useState, useRef } from 'react';

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignee?: string;
  planHours?: number;
  factHours?: number;
  month?: string;
  commentLog?: string[];
}

interface ExportMenuProps {
  tasks: Task[];
  selectedIds?: string[];
  columns?: { key: string; label: string }[];
}

function tasksToCSV(tasks: Task[], columns: { key: string; label: string }[]): string {
  const BOM = '\uFEFF';
  const header = columns.map(c => c.label).join(';');
  const rows = tasks.map(task => {
    return columns.map(col => {
      const val = (task as Record<string, unknown>)[col.key];
      const str = val === null || val === undefined ? '' : String(val);
      return str.includes(';') || str.includes('"')
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    }).join(';');
  });
  return BOM + [header, ...rows].join('\n');
}

function tasksToHTMLTable(tasks: Task[], columns: { key: string; label: string }[]): string {
  const statusColors: Record<string, string> = {
    'Новая': '#3b82f6',
    'В работе': '#f59e0b',
    'На проверке': '#8b5cf6',
    'Завершена': '#10b981',
    'Отменена': '#6b7280',
  };

  const headerRow = columns.map(c => `<th style="padding:10px 14px;text-align:left;border-bottom:2px solid #e2e8f0;font-size:13px;color:#475569;font-weight:600">${c.label}</th>`).join('');
  
  const bodyRows = tasks.map((task, i) => {
    const bgColor = i % 2 === 0 ? '#ffffff' : '#f8fafc';
    const cells = columns.map(col => {
      const val = (task as Record<string, unknown>)[col.key];
      if (col.key === 'status') {
        const color = statusColors[String(val)] || '#6b7280';
        return `<td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:13px">
          <span style="display:inline-block;padding:2px 10px;border-radius:9999px;font-size:12px;font-weight:500;color:${color};background:${color}15">${val}</span>
        </td>`;
      }
      return `<td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#334155">${val ?? ''}</td>`;
    }).join('');
    return `<tr style="background:${bgColor}">${cells}</tr>`;
  }).join('');

  return `
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        @page { margin: 20mm; size: landscape; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
      </style>
    </head>
    <body>
      <div style="margin-bottom:20px">
        <h1 style="font-size:20px;color:#1e293b;margin:0 0 4px">Трекер задач ЕМК</h1>
        <p style="font-size:12px;color:#94a3b8;margin:0">Экспорт от ${new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </div>
      <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">
        <thead><tr style="background:#f1f5f9">${headerRow}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
      <div style="margin-top:16px;font-size:11px;color:#94a3b8">
        Всего задач: ${tasks.length}
      </div>
    </body>
    </html>
  `;
}

export function ExportMenu({ tasks, selectedIds, columns }: ExportMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const defaultColumns: { key: string; label: string }[] = [
    { key: 'title', label: 'Задача' },
    { key: 'status', label: 'Статус' },
    { key: 'priority', label: 'Приоритет' },
    { key: 'assignee', label: 'Исполнитель' },
    { key: 'planHours', label: 'План (ч)' },
    { key: 'factHours', label: 'Факт (ч)' },
    { key: 'month', label: 'Месяц' },
  ];

  const cols = columns || defaultColumns;
  const exportTasks = selectedIds && selectedIds.length > 0
    ? tasks.filter(t => selectedIds.includes(t.id))
    : tasks;

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const csv = tasksToCSV(exportTasks, cols);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `emk-tasks-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
      setIsOpen(false);
    }
  };

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const html = tasksToHTMLTable(exportTasks, cols);
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
      const csv = tasksToCSV(exportTasks, cols);
      await navigator.clipboard.writeText(csv);
    } finally {
      setIsExporting(false);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700 shadow-sm"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        Экспорт
        {selectedIds && selectedIds.length > 0 && (
          <span className="ml-1 px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold">
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
          <div className="absolute right-0 top-full mt-2 z-50 w-64 bg-white rounded-xl shadow-xl border border-gray-200 py-2">
            <div className="px-4 py-2 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Формат экспорта
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {exportTasks.length} задач(и) будет экспортировано
              </p>
            </div>

            <button
              onClick={handleExportCSV}
              disabled={isExporting}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors group"
            >
              <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center group-hover:bg-green-100 transition-colors">
                <svg className="w-5 h-5 text-green-600" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 2l5 5h-5V4zM8.5 13h1.25v4.5L8.5 18.5 7.25 17.5V13H8.5zm3.5 0h1.25c.69 0 1.25.56 1.25 1.25v2.5c0 .69-.56 1.25-1.25 1.25H12v-5zm1.25 3.75v-2.5H13v2.5h.25z"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">Excel (CSV)</p>
                <p className="text-xs text-gray-500">Таблица с разделителями</p>
              </div>
            </button>

            <button
              onClick={handleExportPDF}
              disabled={isExporting}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors group"
            >
              <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center group-hover:bg-red-100 transition-colors">
                <svg className="w-5 h-5 text-red-600" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 2l5 5h-5V4zM9 13v5h1.25v-1.5h.75c.83 0 1.5-.67 1.5-1.5v-.5c0-.83-.67-1.5-1.5-1.5H9zm2.25 2h-.75v-1h.75v1z"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">PDF</p>
                <p className="text-xs text-gray-500">Печать / сохранение как PDF</p>
              </div>
            </button>

            <button
              onClick={handleCopyClipboard}
              disabled={isExporting}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors group"
            >
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">Буфер обмена</p>
                <p className="text-xs text-gray-500">Копировать как CSV</p>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  );
}