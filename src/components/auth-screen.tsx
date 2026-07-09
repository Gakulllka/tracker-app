"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowRight, Plus, Trash2, Check } from "lucide-react";

interface AuthScreenProps {
  onAuth: (data: {
    token: string;
    workspaceId: string;
    user: { id: string; username: string; displayName: string; role: string; roleName?: string };
    permissions?: unknown;
    rolePermissions?: unknown;
  }) => void;
}

interface Domain {
  id: string;
  name: string;
}

export default function AuthScreen({ onAuth }: AuthScreenProps) {
  const [step, setStep] = useState<"auth" | "domains">("auth");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Domain selection
  const [domains, setDomains] = useState<Domain[]>([]);
  const [selectedDomains, setSelectedDomains] = useState<Set<string>>(new Set());
  const [newDomainName, setNewDomainName] = useState("");
  const [creatingDomain, setCreatingDomain] = useState(false);

  const [authData, setAuthData] = useState<{
    token: string;
    workspaceId: string;
    user: { id: string; username: string; displayName: string; role: string };
  } | null>(null);

  // Default theme — мята
  useEffect(() => {
    try {
      const raw = localStorage.getItem("task-tracker-storage");
      if (!raw) {
        localStorage.setItem("task-tracker-storage", JSON.stringify({
          state: { themeId: "spring", customDark: false },
          version: 0,
        }));
      }
    } catch { /* silent */ }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body: Record<string, string> = { username: username.trim() };
      if (password) body.password = password;
      if (mode === "register" && displayName.trim()) body.displayName = displayName.trim();

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) { setError(data.error || "Ошибка"); return; }

      setAuthData({ token: data.token, workspaceId: data.workspaceId, user: data.user });
      await loadDomains();
      setStep("domains");
    } catch {
      setError("Ошибка подключения к серверу");
    } finally {
      setLoading(false);
    }
  };

  const loadDomains = async () => {
    try {
      const res = await fetch("/api/domains");
      if (res.ok) {
        const data = await res.json();
        if (data.domains) {
          setDomains(data.domains);
          // Автоматически выбрать все домены
          setSelectedDomains(new Set(data.domains.map((d: Domain) => d.id)));
        }
      }
    } catch { /* ignore */ }
  };

  const handleCreateDomain = async () => {
    if (!newDomainName.trim() || !authData) return;
    setCreatingDomain(true);
    try {
      const res = await fetch("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: authData.token, name: newDomainName.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        const newDomain = { id: data.domain.id, name: data.domain.name };
        setDomains([...domains, newDomain]);
        setSelectedDomains(new Set([...selectedDomains, newDomain.id]));
        setNewDomainName("");
      }
    } catch { /* ignore */ }
    setCreatingDomain(false);
  };

  const handleDeleteDomain = async (domainId: string) => {
    if (!authData) return;
    try {
      await fetch("/api/domains", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: authData.token, domainId }),
      });
      setDomains(domains.filter(d => d.id !== domainId));
      const newSelected = new Set(selectedDomains);
      newSelected.delete(domainId);
      setSelectedDomains(newSelected);
    } catch { /* ignore */ }
  };

  const toggleDomain = (id: string) => {
    const next = new Set(selectedDomains);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedDomains(next);
  };

  const handleContinue = async () => {
    if (!authData) return;
    setLoading(true);

    // Сохраняем выбранные домены
    try {
      await fetch("/api/domains/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: authData.token,
          domainIds: Array.from(selectedDomains),
        }),
      });
    } catch { /* ignore */ }

    localStorage.setItem("auth_token", authData.token);
    localStorage.setItem("auth_user", JSON.stringify(authData.user));
    localStorage.setItem("auth_workspace", authData.workspaceId);
    document.cookie = `auth_token=${encodeURIComponent(authData.token)}; path=/; max-age=2592000; SameSite=Lax`;

    let permissions: unknown = null;
    let rolePermissions: unknown = null;
    try {
      const meRes = await fetch(`/api/auth/me?token=${encodeURIComponent(authData.token)}`);
      if (meRes.ok) {
        const meData = await meRes.json();
        if (meData.success) {
          permissions = meData.permissions ?? null;
          rolePermissions = meData.rolePermissions ?? null;
          localStorage.setItem("auth_permissions", JSON.stringify(permissions));
          localStorage.setItem("auth_role_permissions", JSON.stringify(rolePermissions));
        }
      }
    } catch { /* ignore */ }

    onAuth({
      token: authData.token,
      workspaceId: authData.workspaceId,
      user: authData.user,
      permissions,
      rolePermissions,
    });
  };

  // Мятные цвета
  const mint = {
    bg: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 50%, #ecfdf5 100%)",
    card: "#ffffff",
    cardBorder: "#bbf7d0",
    cardShadow: "0 8px 40px rgba(34,197,94,0.08), 0 2px 8px rgba(34,197,94,0.04)",
    accent: "#16a34a",
    accentHover: "#15803d",
    accentLight: "#dcfce7",
    text: "#14532d",
    textMuted: "#6b7280",
    inputBg: "#f0fdf4",
    inputBorder: "#bbf7d0",
    blob1: "rgba(34,197,94,0.08)",
    blob2: "rgba(74,222,128,0.06)",
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden"
      style={{ background: mint.bg }}
    >
      <div className="absolute pointer-events-none" style={{
        top: "-150px", left: "-120px", width: "500px", height: "500px",
        borderRadius: "50%", background: `radial-gradient(circle, ${mint.blob1} 0%, transparent 70%)`,
        filter: "blur(60px)",
      }} />
      <div className="absolute pointer-events-none" style={{
        bottom: "-120px", right: "-100px", width: "450px", height: "450px",
        borderRadius: "50%", background: `radial-gradient(circle, ${mint.blob2} 0%, transparent 70%)`,
        filter: "blur(60px)",
      }} />

      <div className="relative z-10 w-full max-w-[400px] mx-4 animate-fade-in-up">
        {/* Логотип — ЧБ */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 flex items-center justify-center rounded-2xl mb-4 bg-gray-900 shadow-lg">
            <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
              <polygon points="16,3 30.5,29 1.5,29" fill="white" opacity="0.95"/>
              <polygon points="16,11.5 25,27.5 7,27.5" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: mint.text }}>
            {step === "auth"
              ? (mode === "login" ? "Вход в систему" : "Регистрация")
              : "Выберите домены"
            }
          </h1>
          <p className="mt-1.5 text-sm" style={{ color: mint.textMuted }}>
            {step === "auth"
              ? (mode === "login" ? "Введите данные для входа" : "Создайте новый аккаунт")
              : "Выберите домены для работы или пропустите"
            }
          </p>
        </div>

        {/* Auth Form */}
        {step === "auth" && (
          <div className="rounded-2xl p-6" style={{
            background: mint.card,
            border: `1px solid ${mint.cardBorder}`,
            boxShadow: mint.cardShadow,
          }}>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: mint.textMuted }}>Логин</label>
                <Input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                  placeholder="Введите логин" className="h-11 rounded-xl text-sm"
                  style={{ borderColor: mint.inputBorder, background: mint.inputBg, color: mint.text }}
                  autoComplete="username" disabled={loading} />
              </div>

              {mode === "register" && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: mint.textMuted }}>
                    Имя <span className="font-normal opacity-60">(необязательно)</span>
                  </label>
                  <Input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Как вас зовут?" className="h-11 rounded-xl text-sm"
                    style={{ borderColor: mint.inputBorder, background: mint.inputBg, color: mint.text }}
                    autoComplete="name" disabled={loading} />
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: mint.textMuted }}>
                  Пароль <span className="font-normal opacity-60">(необязательно)</span>
                </label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "login" ? "Введите пароль" : "Можно оставить пустым"}
                  className="h-11 rounded-xl text-sm"
                  style={{ borderColor: mint.inputBorder, background: mint.inputBg, color: mint.text }}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  disabled={loading} />
              </div>

              {error && (
                <div className="text-sm px-4 py-2.5 rounded-xl bg-red-50 text-red-600 border border-red-200">{error}</div>
              )}

              <Button type="submit" disabled={loading || !username.trim()}
                className="w-full h-11 gap-2 rounded-xl text-sm font-semibold text-white transition-all shadow-lg"
                style={{ background: mint.accent, boxShadow: `0 4px 20px ${mint.accent}35` }}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                  <>{mode === "login" ? "Войти" : "Создать аккаунт"} <ArrowRight className="h-4 w-4" /></>
                )}
              </Button>
            </form>

            <div className="mt-4 pt-4 text-center" style={{ borderTop: `1px solid ${mint.cardBorder}` }}>
              <button onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
                className="text-sm transition-colors hover:underline" style={{ color: mint.accent }}>
                {mode === "login" ? "Нет аккаунта? Зарегистрироваться" : "Уже есть аккаунт? Войти"}
              </button>
            </div>
          </div>
        )}

        {/* Domain Selector */}
        {step === "domains" && (
          <div className="rounded-2xl p-6" style={{
            background: mint.card,
            border: `1px solid ${mint.cardBorder}`,
            boxShadow: mint.cardShadow,
          }}>
            <div className="flex flex-col gap-3">
              {domains.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: mint.textMuted }}>Ваши домены</p>
                  {domains.map((d) => {
                    const selected = selectedDomains.has(d.id);
                    return (
                      <div key={d.id} className="flex items-center gap-2">
                        <button
                          onClick={() => toggleDomain(d.id)}
                          className="flex-1 flex items-center gap-3 p-3 rounded-xl border transition-all"
                          style={{
                            borderColor: selected ? mint.accent : mint.cardBorder,
                            background: selected ? mint.accentLight : "transparent",
                          }}
                        >
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                            style={{ background: selected ? mint.accent : "#e5e7eb" }}>
                            {selected && <Check className="w-4 h-4 text-white" />}
                          </div>
                          <span className="text-sm font-medium" style={{ color: mint.text }}>{d.name}</span>
                        </button>
                        <button onClick={() => handleDeleteDomain(d.id)}
                          className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                          title="Удалить домен">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="pt-2" style={{ borderTop: `1px solid ${mint.cardBorder}` }}>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: mint.textMuted }}>Новый домен</p>
                <div className="flex gap-2">
                  <Input type="text" value={newDomainName} onChange={(e) => setNewDomainName(e.target.value)}
                    placeholder="Название домена" className="h-10 rounded-xl text-sm flex-1"
                    style={{ borderColor: mint.inputBorder, background: mint.inputBg, color: mint.text }}
                    disabled={creatingDomain} onKeyDown={(e) => e.key === "Enter" && handleCreateDomain()} />
                  <Button type="button" size="sm" onClick={handleCreateDomain}
                    disabled={creatingDomain || !newDomainName.trim()}
                    className="h-10 px-4 rounded-xl text-white"
                    style={{ background: mint.accent }}>
                    {creatingDomain ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setStep("auth")}
                  className="flex-1 h-11 rounded-xl text-sm"
                  style={{ borderColor: mint.cardBorder, color: mint.textMuted }}>
                  Назад
                </Button>
                <Button type="button" onClick={handleContinue} disabled={loading}
                  className="flex-1 h-11 rounded-xl text-sm font-semibold text-white shadow-lg"
                  style={{ background: mint.accent, boxShadow: `0 4px 20px ${mint.accent}35` }}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Продолжить"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
