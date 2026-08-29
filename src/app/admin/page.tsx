"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Users, ScrollText, Shield, Wifi, Loader2 } from "lucide-react";
import { getToken, type TabKey } from "@/components/admin/shared";
import { UsersTab } from "@/components/admin/users-tab";
import { LogsTab } from "@/components/admin/logs-tab";
import { RolesTab } from "@/components/admin/roles-tab";
import { OnlineTab } from "@/components/admin/online-tab";

/**
 * Админ-панель: оболочка со вкладками и проверкой прав.
 *
 * Содержимое вкладок — в src/components/admin/. Проверка на клиенте здесь
 * нужна только чтобы не рисовать интерфейс лишним людям: настоящая защита —
 * в proxy.ts (редирект без токена) и в самих /api/admin/* (роль admin).
 */

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "users", label: "Пользователи", icon: <Users className="w-4 h-4" /> },
  { key: "logs", label: "Логи", icon: <ScrollText className="w-4 h-4" /> },
  { key: "roles", label: "Роли", icon: <Shield className="w-4 h-4" /> },
  { key: "online", label: "Онлайн", icon: <Wifi className="w-4 h-4" /> },
];

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("users");
  const [checking, setChecking] = useState(true);
  const [isAllowed, setIsAllowed] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) { setChecking(false); return; }
    fetch(`/api/auth/me?token=${token}`)
      .then((r) => r.json())
      .then((data) => {
        // /api/auth/me возвращает role как lowercase-строку ("admin" | "viewer" | …),
        // не объект. Сравниваем напрямую со строкой "admin".
        if (data.success && (data.user.role === "admin" || data.user.role?.name === "Admin")) {
          setIsAllowed(true);
        }
        setChecking(false);
      })
      .catch(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--tracker-bg-main)]">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--tracker-text-muted)]" />
      </div>
    );
  }

  if (!isAllowed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--tracker-bg-main)]">
        <div className="text-center">
          <Shield className="w-12 h-12 text-[var(--tracker-danger)] mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-[var(--tracker-text-main)] mb-2">Доступ запрещён</h2>
          <p className="text-sm text-[var(--tracker-text-muted)]">Эта страница доступна только администраторам.</p>
          <Button variant="outline" className="mt-4" onClick={() => (window.location.href = "/")}>На главную</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--tracker-bg-main)]">
      {/* Header */}
      <div className="bg-[var(--tracker-bg-card)] border-b border-[var(--tracker-border)] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-[var(--tracker-danger)]" />
              <h1 className="text-lg font-bold text-[var(--tracker-text-main)]">Панель администратора</h1>
            </div>
            <Button variant="outline" size="sm" onClick={() => (window.location.href = "/")}>
              ← Назад к приложению
            </Button>
          </div>
          {/* Tabs */}
          <div className="flex gap-1 -mb-px">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? "border-[var(--tracker-danger)] text-[var(--tracker-danger)]"
                    : "border-transparent text-[var(--tracker-text-muted)] hover:text-[var(--tracker-text-main)] hover:border-[var(--tracker-border)]"
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {activeTab === "users" && <UsersTab />}
        {activeTab === "logs" && <LogsTab />}
        {activeTab === "roles" && <RolesTab />}
        {activeTab === "online" && <OnlineTab />}
      </div>
    </div>
  );
}
