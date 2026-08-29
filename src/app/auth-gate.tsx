"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAuth, type AuthData } from "@/hooks/useAuth";
import { useTaskStore } from "@/lib/store";
import AuthScreen from "@/components/auth-screen";
import { BrandSplash } from "@/components/brand-splash";
import { DomainPickerScreen } from "@/components/domain-picker";

export interface AuthGateChildProps {
  authData: AuthData;
  onLogout: () => void;
  switchWorkspace: (id: string) => void;
  refreshAuth: () => Promise<void> | void;
}

/**
 * Всё, что происходит до появления самого трекера: проверка сессии,
 * экран входа и экран выбора домена.
 *
 * Пока пользователь не прошёл эти шаги, основное приложение не монтируется —
 * поэтому внутренности отданы через render-prop, а не через обычные children.
 */
export function AuthGate({ children }: { children: (props: AuthGateChildProps) => React.ReactNode }) {
  const { authData, authChecking, handleAuth, handleLogout, switchWorkspace, refreshAuth } = useAuth();
  const [showDomainPicker, setShowDomainPicker] = useState(false);
  const [pickerDomains, setPickerDomains] = useState<Array<{ id: string; name: string }>>([]);
  const [pickerLoading, setPickerLoading] = useState(false);

  /** Загрузить домены для экрана выбора. */
  const loadPickerDomains = useCallback(async (token: string) => {
    setPickerLoading(true);
    try {
      const res = await fetch("/api/domains", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.domains)) {
          setPickerDomains(data.domains.map((d: { id: string; name: string }) => ({ id: d.id, name: d.name })));
        }
      }
    } catch { /* silent */ }
    setPickerLoading(false);
  }, []);

  /** Проверить, нужно ли показать экран выбора домена. */
  useEffect(() => {
    if (!authData) return;
    // Показываем экран выбора, если у пользователя нет закэшированного выбора
    const role = authData.user.role;
    const hasChosenDomain = localStorage.getItem("domain_picker_chosen");
    if (!hasChosenDomain) {
      setShowDomainPicker(true);
      loadPickerDomains(authData.token);
    }
  }, [authData, loadPickerDomains]);

  /** Выбор домена на экране выбора. */
  const handlePickerSelectDomain = useCallback((domainId: string) => {
    localStorage.setItem("domain_picker_chosen", "true");
    setShowDomainPicker(false);
    // Переключаемся на выбранный домен
    useTaskStore.getState().setActiveDomain(domainId);
  }, []);

  /** Создание домена из экрана выбора. */
  const handlePickerCreateDomain = useCallback(async (name: string) => {
    if (!authData) return;
    const res = await fetch("/api/domains", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authData.token}` },
      body: JSON.stringify({ token: authData.token, name }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.domain) {
      // Обновляем список доменов в экране выбора
      setPickerDomains((prev) => [...prev, { id: data.domain.id, name: data.domain.name }]);
      // Обновляем store
      await refreshAuth();
      useTaskStore.getState().setActiveDomain(data.domain.id);
      // Обновляем список доменов в store
      const domainsRes = await fetch("/api/domains", {
        headers: { Authorization: `Bearer ${authData.token}` },
      });
      if (domainsRes.ok) {
        const domainsData = await domainsRes.json();
        if (Array.isArray(domainsData.domains)) {
          useTaskStore.getState().setDomains(domainsData.domains.map((d: { id: string; name: string }) => ({ id: d.id, name: d.name })));
        }
      }
    } else {
      throw new Error(data.error || "Не удалось создать домен");
    }
  }, [authData, refreshAuth]);

  /** Запрос доступа к домену из экрана выбора. */
  const handlePickerRequestAccess = useCallback(async (domainId: string) => {
    if (!authData) return;
    const res = await fetch("/api/domains/access", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authData.token}` },
      body: JSON.stringify({ token: authData.token, domainId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Ошибка запроса");
    }
  }, [authData]);

  if (authChecking) {
    return <BrandSplash visible label="Проверяем доступ..." />;
  }

  if (!authData) return <AuthScreen onAuth={handleAuth} />;

  // Показать экран выбора домена
  if (showDomainPicker) {
    // Скрываем экран выбора, если нет доменов (пользователь создаст первый)
    // или если загрузка ещё идёт
    if (pickerLoading) {
      return <BrandSplash visible label="Загружаем домены..." />;
    }
    return (
      <DomainPickerScreen
        domains={pickerDomains}
        editableDomainIds={authData.editableDomainIds}
        currentUser={authData.user}
        token={authData.token}
        onSelectDomain={handlePickerSelectDomain}
        onCreateDomain={handlePickerCreateDomain}
        onRequestAccess={handlePickerRequestAccess}
        onLogout={handleLogout}
      />
    );
  }

  return <>{children({ authData, onLogout: handleLogout, switchWorkspace, refreshAuth })}</>;
}
