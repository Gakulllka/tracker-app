'use client';

import React, { useState } from 'react';

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignee?: string;
  planHours?: number;
  factHours?: number;
}

interface HoverableTableRowProps {
  task: Task;
  isSelected?: boolean;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onComment?: (id: string) => void;
  children: React.ReactNode;
}

export function HoverableTableRow({
  task,
  isSelected = false,
  onEdit,
  onDelete,
  onDuplicate,
  onComment,
  children,
}: HoverableTableRowProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <tr
      className={`group transition-all duration-150 ${
        isSelected
          ? 'bg-indigo-50'
          : isHovered
          ? 'bg-slate-50'
          : 'hover:bg-slate-50/50'
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}

      <td className="px-2 py-3 w-[120px]">
        <div
          className={`flex items-center gap-1 transition-all duration-200 ${
            isHovered || isSelected
              ? 'opacity-100 translate-x-0'
              : 'opacity-0 -translate-x-2 pointer-events-none'
          }`}
        >
          <ActionButton
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            }
            tooltip="Редактировать"
            onClick={() => onEdit?.(task.id)}
          />

          <ActionButton
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            }
            tooltip="Дублировать"
            onClick={() => onDuplicate?.(task.id)}
          />

          <ActionButton
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            }
            tooltip="Комментарий"
            onClick={() => onComment?.(task.id)}
          />

          <ActionButton
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            }
            tooltip="Удалить"
            variant="danger"
            onClick={() => onDelete?.(task.id)}
          />
        </div>
      </td>
    </tr>
  );
}

function ActionButton({
  icon,
  tooltip,
  variant = 'default',
  onClick,
}: {
  icon: React.ReactNode;
  tooltip: string;
  variant?: 'default' | 'danger';
  onClick: () => void;
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={`p-1.5 rounded-lg transition-all duration-150 ${
          variant === 'danger'
            ? 'text-gray-400 hover:text-red-500 hover:bg-red-50'
            : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
        }`}
      >
        {icon}
      </button>

      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 bg-gray-800 text-white text-xs rounded-lg whitespace-nowrap z-50">
          {tooltip}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
            <div className="w-2 h-2 bg-gray-800 rotate-45" />
          </div>
        </div>
      )}
    </div>
  );
}

export function TaskTableWithHover({
  tasks,
  onEdit,
  onDelete,
  onDuplicate,
  onComment,
}: {
  tasks: Task[];
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onComment?: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Задача</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Статус</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Приоритет</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Исполнитель</th>
            <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">План/Факт</th>
            <th className="w-[120px] px-2 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {tasks.map(task => (
            <HoverableTableRow
              key={task.id}
              task={task}
              onEdit={onEdit}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              onComment={onComment}
            >
              <td className="px-4 py-3 text-sm font-medium text-gray-800">{task.title}</td>
              <td className="px-4 py-3 text-sm text-gray-600">{task.status}</td>
              <td className="px-4 py-3 text-sm text-gray-600">{task.priority}</td>
              <td className="px-4 py-3 text-sm text-gray-600">{task.assignee || '—'}</td>
              <td className="px-4 py-3 text-sm text-gray-600 text-right">
                {task.planHours ?? 0} / {task.factHours ?? 0}
              </td>
            </HoverableTableRow>
          ))}
        </tbody>
      </table>
    </div>
  );
}