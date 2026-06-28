"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, User, Eye, EyeOff, ArrowRight, UserCheck } from "lucide-react";

interface AuthScreenProps {
  onAuth: (data: {
    token: string;
    workspaceId: string;
    user: { id: string; username: string; displayName: string; role: string; roleName?: string };
    permissions?: unknown;
    rolePermissions?: unknown;
  }) => void;
}

export default function AuthScreen({ onAuth }: AuthScreenProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username.trim() || !password.trim()) {
      setError("Заполните все поля");
      return;
    }

    setLoading(true);

    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body: Record<string, string> = { username: username.trim(), password };
      if (mode === "register" && displayName.trim()) {
        body.displayName = displayName.trim();
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Произошла ошибка");
        return;
      }

      localStorage.setItem("auth_token", data.token);
      localStorage.setItem("auth_user", JSON.stringify(data.user));
      localStorage.setItem("auth_workspace", data.workspaceId);
      document.cookie = `auth_token=${encodeURIComponent(data.token)}; path=/; max-age=2592000; SameSite=Lax`;

      let permissions: unknown = null;
      let rolePermissions: unknown = null;
      try {
        const meRes = await fetch(`/api/auth/me?token=${encodeURIComponent(data.token)}`);
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
        token: data.token,
        workspaceId: data.workspaceId,
        user: data.user,
        permissions,
        rolePermissions,
      });
    } catch {
      setError("Ошибка подключения к серверу");
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/guest", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Ошибка гостевого входа");
        return;
      }

      localStorage.setItem("auth_token", data.token);
      localStorage.setItem("auth_user", JSON.stringify(data.user));
      localStorage.setItem("auth_workspace", data.workspaceId);
      document.cookie = `auth_token=${encodeURIComponent(data.token)}; path=/; max-age=86400; SameSite=Lax`;

      let permissions: unknown = null;
      let rolePermissions: unknown = null;
      try {
        const meRes = await fetch(`/api/auth/me?token=${encodeURIComponent(data.token)}`);
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
        token: data.token,
        workspaceId: data.workspaceId,
        user: data.user,
        permissions,
        rolePermissions,
      });
    } catch {
      setError("Ошибка подключения к серверу");
    } finally {
      setLoading(false);
    }
  };

  const [isDark] = React.useState<boolean>(() => {
    try {
      const raw = localStorage.getItem("task-tracker-storage");
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed?.state?.customDark === true;
      }
    } catch { /* silent */ }
    return false;
  });

  const [accentColor] = React.useState<string>(() => {
    try {
      const raw = localStorage.getItem("task-tracker-storage");
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed?.state?.themeId || parsed?.state?.customColor || "#9B72CF";
      }
    } catch { /* silent */ }
    return "#9B72CF";
  });

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden"
      style={{
        background: isDark
          ? "linear-gradient(135deg, #0d0d1a 0%, #12091f 50%, #0a0f1e 100%)"
          : "linear-gradient(135deg, #f3f0ff 0%, #fce4f4 40%, #e8f4fd 100%)",
      }}
    >
      {/* Decorative blobs — softened */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: "-150px",
          left: "-120px",
          width: "500px",
          height: "500px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(167,139,250,0.12) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          bottom: "-120px",
          right: "-100px",
          width: "450px",
          height: "450px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(236,153,210,0.10) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />

      <div className="relative z-10 w-full max-w-[420px] mx-4 animate-fade-in-up">
        {/* Logo & Title */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-[68px] h-[68px] flex items-center justify-center rounded-2xl mb-5 relative"
            style={{
              background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}cc 100%)`,
              boxShadow: `0 12px 32px ${accentColor}40, 0 4px 12px ${accentColor}20`,
            }}
          >
            <svg width="34" height="34" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
              <polygon points="16,3 30.5,29 1.5,29" fill="white" opacity="0.95"/>
              <polygon points="16,11.5 25,27.5 7,27.5" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.8"/>
            </svg>
          </div>
          <h1
            className="text-3xl font-bold tracking-tight"
            style={{ color: isDark ? "#ede9fe" : "#2d1b69" }}
          >
            {mode === "login" ? "Добро пожаловать" : "Создание аккаунта"}
          </h1>
          <p
            className="mt-2 text-base"
            style={{ color: isDark ? "rgba(196,181,253,0.7)" : "#6b5b95" }}
          >
            {mode === "login" ? "Войдите, чтобы продолжить работу" : "Зарегистрируйте новый аккаунт"}
          </p>
        </div>

        {/* Form Card */}
        <div
          className="rounded-2xl p-7 border"
          style={{
            background: isDark ? "rgba(18, 12, 30, 0.9)" : "rgba(255, 255, 255, 0.92)",
            borderColor: isDark ? "rgba(167,139,250,0.15)" : "rgba(167,139,250,0.2)",
            boxShadow: isDark
              ? "0 8px 40px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)"
              : "0 8px 40px rgba(167,139,250,0.10), 0 2px 8px rgba(167,139,250,0.06)",
          }}
        >
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {/* Username */}
            <div className="flex flex-col gap-2">
              <label
                className="text-sm font-semibold"
                style={{ color: isDark ? "#c4b5fd" : "#3d2264" }}
              >
                Имя пользователя
              </label>
              <div className="relative">
                <User
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4"
                  style={{ color: isDark ? "rgba(167,139,250,0.6)" : accentColor }}
                />
                <Input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="username"
                  className="pl-10 h-11 rounded-xl text-sm"
                  style={{
                    borderColor: isDark ? "rgba(167,139,250,0.25)" : "rgba(167,139,250,0.3)",
                    background: isDark ? "rgba(30,20,50,0.8)" : "rgba(248,246,255,0.8)",
                    color: isDark ? "#ede9fe" : "#1a1a2e",
                  }}
                  autoComplete="username"
                  disabled={loading}
                />
              </div>
            </div>

            {/* Display Name (register only) */}
            {mode === "register" && (
              <div className="flex flex-col gap-2">
                <label
                  className="text-sm font-semibold"
                  style={{ color: isDark ? "#c4b5fd" : "#3d2264" }}
                >
                  Отображаемое имя{" "}
                  <span
                    className="text-xs font-normal"
                    style={{ color: isDark ? "rgba(196,181,253,0.5)" : "#9d8fc4" }}
                  >
                    (необязательно)
                  </span>
                </label>
                <Input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Иван Иванов"
                  className="h-11 rounded-xl text-sm"
                  style={{
                    borderColor: isDark ? "rgba(167,139,250,0.25)" : "rgba(167,139,250,0.3)",
                    background: isDark ? "rgba(30,20,50,0.8)" : "rgba(248,246,255,0.8)",
                    color: isDark ? "#ede9fe" : "#1a1a2e",
                  }}
                  autoComplete="name"
                  disabled={loading}
                />
              </div>
            )}

            {/* Password */}
            <div className="flex flex-col gap-2">
              <label
                className="text-sm font-semibold"
                style={{ color: isDark ? "#c4b5fd" : "#3d2264" }}
              >
                Пароль
              </label>
              <div className="relative">
                <div
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center justify-center w-4 h-4"
                  style={{ color: isDark ? "rgba(167,139,250,0.6)" : accentColor }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </div>
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "login" ? "Введите пароль" : "Минимум 4 символа"}
                  className="pl-10 pr-10 h-11 rounded-xl text-sm"
                  style={{
                    borderColor: isDark ? "rgba(167,139,250,0.25)" : "rgba(167,139,250,0.3)",
                    background: isDark ? "rgba(30,20,50,0.8)" : "rgba(248,246,255,0.8)",
                    color: isDark ? "#ede9fe" : "#1a1a2e",
                  }}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: isDark ? "rgba(167,139,250,0.6)" : accentColor }}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div
                className="text-sm px-4 py-3 rounded-xl"
                style={{
                  background: isDark ? "rgba(226,75,74,0.12)" : "rgba(251,191,208,0.25)",
                  color: isDark ? "#fca5a5" : "#c0435a",
                  border: `1px solid ${isDark ? "rgba(226,75,74,0.25)" : "rgba(251,191,208,0.5)"}`,
                }}
              >
                {error}
              </div>
            )}

            {/* Submit */}
            <Button
              type="submit"
              disabled={loading || !username.trim() || !password.trim()}
              className="w-full h-12 gap-2 rounded-xl text-sm font-semibold transition-all hover:shadow-lg active:scale-[0.98]"
              style={{
                background: `linear-gradient(135deg, ${accentColor} 0%, ${accentColor}dd 100%)`,
                color: "#fff",
                boxShadow: `0 4px 20px ${accentColor}35`,
                border: "none",
              }}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {mode === "login" ? "Вход..." : "Создание..."}
                </>
              ) : (
                <>
                  {mode === "login" ? "Войти" : "Создать аккаунт"}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          {/* Divider + Guest Login */}
          <div className="mt-6 pt-5 border-t" style={{ borderColor: isDark ? "rgba(167,139,250,0.12)" : "rgba(167,139,250,0.15)" }}>
            <Button
              type="button"
              variant="outline"
              onClick={handleGuestLogin}
              disabled={loading}
              className="w-full h-11 gap-2 rounded-xl text-sm font-medium transition-all hover:shadow-md active:scale-[0.98]"
              style={{
                borderColor: isDark ? "rgba(167,139,250,0.25)" : "rgba(167,139,250,0.3)",
                color: isDark ? "#c4b5fd" : "#6b5b95",
                background: "transparent",
              }}
            >
              <UserCheck className="h-4 w-4" />
              Войти как гость (тест)
            </Button>
            <p
              className="text-center text-xs mt-2.5"
              style={{ color: isDark ? "rgba(196,181,253,0.4)" : "#9d8fc4" }}
            >
              Полный доступ для тестирования
            </p>
          </div>
        </div>

        {/* Toggle mode */}
        <div className="text-center mt-6">
          <button
            onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
            className="text-sm font-medium transition-colors hover:underline"
            style={{ color: isDark ? "#c4b5fd" : "#8b6fd4" }}
          >
            {mode === "login" ? "Нет аккаунта? Зарегистрироваться" : "Уже есть аккаунт? Войти"}
          </button>
        </div>
      </div>
    </div>
  );
}
