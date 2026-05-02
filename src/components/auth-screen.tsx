"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, User, Eye, EyeOff, ArrowRight, Sparkles } from "lucide-react";

interface AuthScreenProps {
  onAuth: (data: { token: string; workspaceId: string; user: { id: string; username: string; displayName: string; role: string } }) => void;
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
      // Also store in cookie so middleware can protect /admin without localStorage
      document.cookie = `auth_token=${encodeURIComponent(data.token)}; path=/; max-age=2592000; SameSite=Lax`;

      onAuth({
        token: data.token,
        workspaceId: data.workspaceId,
        user: data.user,
      });
    } catch {
      setError("Ошибка подключения к серверу");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #f3f0ff 0%, #fce4f4 40%, #e8f4fd 100%)",
      }}
    >
      {/* Decorative blobs */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: "-120px",
          left: "-100px",
          width: "480px",
          height: "480px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(167,139,250,0.18) 0%, transparent 70%)",
          filter: "blur(40px)",
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          bottom: "-100px",
          right: "-80px",
          width: "400px",
          height: "400px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(236,153,210,0.18) 0%, transparent 70%)",
          filter: "blur(40px)",
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          top: "30%",
          right: "12%",
          width: "220px",
          height: "220px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(125,202,250,0.14) 0%, transparent 70%)",
          filter: "blur(30px)",
        }}
      />

      {/* Floating decorative dots */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[
          { top: "15%", left: "8%", size: 8, color: "rgba(167,139,250,0.35)" },
          { top: "72%", left: "5%", size: 5, color: "rgba(236,153,210,0.4)" },
          { top: "25%", right: "6%", size: 6, color: "rgba(125,202,250,0.4)" },
          { top: "80%", right: "10%", size: 10, color: "rgba(167,139,250,0.25)" },
          { top: "50%", left: "15%", size: 4, color: "rgba(236,153,210,0.3)" },
        ].map((dot, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              top: dot.top,
              left: (dot as Record<string, string | number>).left as string | undefined,
              right: (dot as Record<string, string | number>).right as string | undefined,
              width: dot.size,
              height: dot.size,
              background: dot.color,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 w-full max-w-[400px] mx-4 animate-fade-in-up">
        {/* Logo & Title */}
        <div className="flex flex-col items-center mb-7">
          <div
            className="w-[60px] h-[60px] flex items-center justify-center rounded-2xl mb-4 relative"
            style={{
              background: "linear-gradient(135deg, #a78bfa 0%, #c084fc 100%)",
              boxShadow: "0 8px 24px rgba(167,139,250,0.35), 0 2px 6px rgba(167,139,250,0.2)",
            }}
          >
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#3d2f6e" }}>
            {mode === "login" ? "С возвращением 👋" : "Создание аккаунта"}
          </h1>
          <p className="mt-1.5 text-sm" style={{ color: "#7c6fa0" }}>
            {mode === "login" ? "Войдите, чтобы продолжить работу" : "Зарегистрируйте новый аккаунт"}
          </p>
        </div>

        {/* Form Card */}
        <div
          className="rounded-2xl p-6 border"
          style={{
            background: "rgba(255, 255, 255, 0.82)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            borderColor: "rgba(167,139,250,0.25)",
            boxShadow:
              "0 4px 32px rgba(167,139,250,0.12), 0 1px 4px rgba(167,139,250,0.08)",
          }}
        >
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Username */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" style={{ color: "#4a3a7a" }}>
                Имя пользователя
              </label>
              <div className="relative">
                <User
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
                  style={{ color: "#a78bfa" }}
                />
                <Input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="username"
                  className="pl-9 rounded-xl"
                  style={{
                    borderColor: "rgba(167,139,250,0.35)",
                    background: "rgba(245,243,255,0.7)",
                  }}
                  autoComplete="username"
                  disabled={loading}
                />
              </div>
            </div>

            {/* Display Name (register only) */}
            {mode === "register" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium" style={{ color: "#4a3a7a" }}>
                  Отображаемое имя{" "}
                  <span className="text-xs font-normal" style={{ color: "#9d8fc4" }}>
                    (необязательно)
                  </span>
                </label>
                <Input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Иван Иванов"
                  className="rounded-xl"
                  style={{
                    borderColor: "rgba(167,139,250,0.35)",
                    background: "rgba(245,243,255,0.7)",
                  }}
                  autoComplete="name"
                  disabled={loading}
                />
              </div>
            )}

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" style={{ color: "#4a3a7a" }}>
                Пароль
              </label>
              <div className="relative">
                <div
                  className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-4 h-4"
                  style={{ color: "#a78bfa" }}
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
                  className="pl-9 pr-10 rounded-xl"
                  style={{
                    borderColor: "rgba(167,139,250,0.35)",
                    background: "rgba(245,243,255,0.7)",
                  }}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: "#a78bfa" }}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div
                className="text-sm px-3 py-2.5 rounded-xl"
                style={{
                  background: "rgba(251,191,208,0.3)",
                  color: "#c0435a",
                  border: "1px solid rgba(251,191,208,0.6)",
                }}
              >
                {error}
              </div>
            )}

            {/* Submit */}
            <Button
              type="submit"
              disabled={loading || !username.trim() || !password.trim()}
              className="w-full mt-1 gap-2 rounded-xl h-10 text-sm font-semibold"
              style={{
                background: "linear-gradient(135deg, #a78bfa 0%, #c084fc 100%)",
                color: "#fff",
                boxShadow: "0 4px 16px rgba(167,139,250,0.35)",
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
        </div>

        {/* Toggle mode */}
        <div className="text-center mt-5">
          <button
            onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
            className="text-sm transition-colors hover:underline"
            style={{ color: "#8b6fd4" }}
          >
            {mode === "login" ? "Нет аккаунта? Зарегистрироваться" : "Уже есть аккаунт? Войти"}
          </button>
        </div>
      </div>
    </div>
  );
}
