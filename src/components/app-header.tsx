"use client";
/**
 * AppHeader — верхняя панель. Редизайн (пакет «Дизайн»):
 *  - три смысловые группы с hairline-разделителями:
 *    контекст (домен) · инструменты (демо, undo/redo) · команда и аккаунт;
 *  - меню пользователя вместо россыпи кнопок (аккаунт, админка, выход);
 *  - компактный индикатор синхронизации.
 */
import React from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Eye, EyeOff, Undo2, Redo2, Shield, Sun, Moon, Share2, Settings,
  LogOut, KeyRound, Plus, ChevronDown, Lock,
} from "lucide-react";
import { ExecSignalsPanel } from "@/components/exec-signals-panel";
import { PresenceAvatars } from "@/components/presence-avatars";
import { NotificationsBell } from "@/components/notifications-bell";
import { undoStore } from "@/lib/store";
import type { Task, Domain } from "@/lib/types";
import type { AuthData } from "@/hooks/useAuth";
import type { SyncStatus } from "@/hooks/useServerSync";

const ROLE_LABEL: Record<string, string> = {
  admin: "Администратор", editor: "Редактор", viewer: "Наблюдатель",
  member: "Участник", guest: "Гость",
};

interface AppHeaderProps {
  // Домены
  activeDomainId: string;
  visibleDomains: Domain[];
  storeSetActiveDomain: (id: string) => void;
  setNewDomainDialog: (v: boolean) => void;
  // Права
  authData: AuthData;
  isGuest: boolean;
  isAdmin: boolean;
  isReadOnlyDomain: boolean;
  requestingAccess: boolean;
  requestAccessToActive: () => void;
  refreshAuth: () => Promise<void> | void;
  // Режимы
  clientMode: boolean;
  toggleClientMode: () => void;
  customDark: boolean;
  storeSetCustomDark: (v: boolean) => void;
  // Undo/redo
  storeUndo: () => void;
  storeRedo: () => void;
  // Exec-сигналы
  allData: Record<number, Task[]>;
  backlog: Task[];
  monthlyPlan: number;
  updateTask: (month: number, taskId: string, key: keyof Task, value: unknown) => void;
  addLinkedQuestion: (text: string, author: string, linkedTaskId: string, linkedTaskName: string) => void;
  signalsFilterActive: boolean;
  setSignalsFilterActive: (v: boolean) => void;
  setView: (v: string) => void;
  // Диалоги
  setShareDialogOpen: (v: boolean) => void;
  setSettingsOpen: (v: boolean, tab?: string) => void;
  // Сессия
  onLogout: () => void;
  // Синхронизация
  syncStatus: SyncStatus;
  lastSync: Date | null;
  // Импорт файлов (скрытые input'ы живут в шапке)
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  xlsxInputRef: React.RefObject<HTMLInputElement | null>;
  handleJSONFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleXLSXFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  toast: (opts: { title: string; description?: string }) => void;
}

/** Компактный индикатор синхронизации: точка + короткое слово. */
function SyncPill({ syncStatus, lastSync }: { syncStatus: SyncStatus; lastSync: Date | null }) {
  const cfg: Record<SyncStatus, { dot: string; label: string; title: string }> = {
    synced: { dot: "#22c55e", label: "Сохранено", title: lastSync ? `Синхронизировано: ${lastSync.toLocaleTimeString("ru-RU")}` : "Подключение..." },
    pending: { dot: "#f59e0b", label: "Изменения...", title: "Есть несохранённые изменения" },
    pushing: { dot: "#f59e0b", label: "Сохранение", title: "Отправка данных на сервер..." },
    initializing: { dot: "#9ca3af", label: "Загрузка", title: "Первая загрузка..." },
    denied: { dot: "#f97316", label: "Нет прав", title: "Сеть в порядке, но нет прав на редактирование этого домена" },
    offline: { dot: "#ef4444", label: "Оффлайн", title: "Нет подключения к серверу" },
  };
  const c = cfg[syncStatus];
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-full shrink-0 select-none" title={c.title}>
      <span
        className={`size-1.5 rounded-full ${syncStatus === "pushing" ? "animate-pulse" : ""}`}
        style={{ background: c.dot }}
      />
      <span
        className="hidden lg:inline text-[10px] font-semibold uppercase text-[var(--tracker-text-muted)]"
        style={{ fontFamily: "var(--font-geist-mono, ui-monospace, monospace)", letterSpacing: "0.09em" }}
      >
        {c.label}
      </span>
    </div>
  );
}

export function AppHeader({
  activeDomainId, visibleDomains, storeSetActiveDomain, setNewDomainDialog,
  authData, isGuest, isAdmin, isReadOnlyDomain, requestingAccess, requestAccessToActive, refreshAuth,
  clientMode, toggleClientMode, customDark, storeSetCustomDark,
  storeUndo, storeRedo,
  allData, backlog, monthlyPlan, updateTask, addLinkedQuestion,
  signalsFilterActive, setSignalsFilterActive, setView,
  setShareDialogOpen, setSettingsOpen,
  onLogout, syncStatus, lastSync,
  fileInputRef, xlsxInputRef, handleJSONFileSelect, handleXLSXFileSelect,
  toast,
}: AppHeaderProps) {
  void toast;
  const displayName = authData.user.displayName || authData.user.username;
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <header
      className="sticky top-0 z-30 backdrop-blur-md supports-[backdrop-filter]:bg-[var(--tracker-bg-card)]/90 bg-[var(--tracker-bg-card)]"
      style={{ borderBottom: "1px solid var(--tracker-border)" }}
    >
      <div className="delta-header flex h-14 items-center gap-2 px-3 md:px-5 flex-wrap">

        {/* ── Группа 1: контекст — где я ── */}
        <SidebarTrigger className="md:flex shrink-0 text-[var(--tracker-text-muted)]" />

        <Select
          value={activeDomainId}
          onValueChange={(v) => {
            if (v === "__new__") { setNewDomainDialog(true); return; }
            storeSetActiveDomain(v);
          }}
        >
          <SelectTrigger className="h-9 w-auto min-w-[130px] max-w-[190px] gap-1.5 rounded-lg border-transparent bg-transparent px-2.5 text-[13px] font-semibold text-[var(--tracker-text-main)] shadow-none hover:bg-[var(--tracker-accent-bg)] data-[state=open]:bg-[var(--tracker-accent-bg)] transition-colors shrink-0">
            <span className="size-2 rounded-[4px] shrink-0" style={{ background: "var(--tracker-accent)" }} />
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            {visibleDomains.map((d) => (
              <SelectItem key={d.id} value={d.id} className="text-[13px] rounded-lg">{d.name}</SelectItem>
            ))}
            {!isGuest && !["viewer"].includes(authData.user.role) && (
              <SelectItem value="__new__" className="text-[13px] rounded-lg text-[var(--tracker-accent)]">
                <span className="flex items-center gap-1.5"><Plus className="size-3.5" /> Новый домен</span>
              </SelectItem>
            )}
          </SelectContent>
        </Select>

        {isReadOnlyDomain && (
          <div className="flex items-center gap-1 shrink-0">
            <span
              className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full font-semibold"
              style={{ background: "rgba(245,158,11,0.12)", color: "#b45309" }}
              title="У вас нет прав редактирования этого домена — только просмотр"
            >
              <Lock className="size-2.5" /> Просмотр
            </span>
            <Button
              variant="ghost" size="sm"
              className="h-7 px-2 text-[11px] font-medium shrink-0 text-[var(--tracker-accent)] hover:bg-[var(--tracker-accent-bg)]"
              disabled={requestingAccess}
              onClick={requestAccessToActive}
            >
              Запросить доступ
            </Button>
          </div>
        )}

        {/* ── Группа 2: инструменты ── */}
        {!isGuest && <div className="header-divider hidden md:block" />}

        <Button
          variant="ghost"
          size="sm"
          onClick={toggleClientMode}
          className="h-8 gap-1.5 rounded-lg text-xs text-[var(--tracker-text-muted)] hover:text-[var(--tracker-text-main)] shrink-0"
          title={clientMode ? "Выйти из режима демонстрации" : "Режим демонстрации: скрыть служебные элементы"}
        >
          {clientMode ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          <span className="hidden lg:inline">{clientMode ? "Выйти из демо" : "Демонстрация"}</span>
        </Button>

        <div className="flex items-center shrink-0">
          <Button variant="ghost" size="icon" className="size-8 rounded-lg text-[var(--tracker-text-muted)] hover:text-[var(--tracker-text-main)]" onClick={storeUndo} disabled={!undoStore.canUndo()} title="Отменить (Ctrl+Z)">
            <Undo2 className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="size-8 rounded-lg text-[var(--tracker-text-muted)] hover:text-[var(--tracker-text-main)]" onClick={storeRedo} disabled={!undoStore.canRedo()} title="Повторить (Ctrl+Shift+Z)">
            <Redo2 className="size-3.5" />
          </Button>
        </div>

        <ExecSignalsPanel
          allTasks={allData}
          backlogTasks={backlog}
          monthCapacity={monthlyPlan > 0 ? monthlyPlan : 240}
          isAdmin={isAdmin}
          currentUsername={authData.user.displayName || authData.user.username}
          onUpdateTask={(month, taskId, updates) => {
            Object.entries(updates).forEach(([k, v]) => {
              updateTask(month, taskId, k as keyof Task, v);
            });
          }}
          onCreateLinkedQuestion={addLinkedQuestion}
          onFilterSignals={(on) => setSignalsFilterActive(on)}
          filterActive={signalsFilterActive}
          onGoToQuestions={() => setView("questions")}
        />

        <div className="flex-1 min-w-4" />

        {/* ── Группа 3: команда и аккаунт ── */}
        <PresenceAvatars token={authData.token} currentUserId={authData.user.id} />

        {!isGuest && (
          <>
            <NotificationsBell
              token={authData.token}
              currentUserId={authData.user.id}
              toast={toast}
              onResolved={() => { refreshAuth(); }}
            />

            <Button variant="ghost" size="icon" className="size-8 rounded-lg text-[var(--tracker-text-muted)] hover:text-[var(--tracker-text-main)] shrink-0" onClick={() => setShareDialogOpen(true)} title="Доступ к домену">
              <Share2 className="size-3.5" />
            </Button>

            <Button variant="ghost" size="icon" className="size-8 rounded-lg text-[var(--tracker-text-muted)] hover:text-[var(--tracker-text-main)] shrink-0" onClick={() => setSettingsOpen(true)} title="Настройки">
              <Settings className="size-3.5" />
            </Button>
          </>
        )}

        <Button variant="ghost" size="icon" className="size-8 rounded-lg text-[var(--tracker-text-muted)] hover:text-[var(--tracker-text-main)] shrink-0" onClick={() => storeSetCustomDark(!customDark)} title={customDark ? "Светлая тема" : "Тёмная тема"}>
          {customDark ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
        </Button>

        <div className="header-divider hidden md:block" />

        <SyncPill syncStatus={syncStatus} lastSync={lastSync} />

        {/* Меню пользователя */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-1.5 pl-1 pr-1.5 py-1 rounded-full transition-colors hover:bg-[var(--tracker-accent-bg)] shrink-0 outline-none"
              title={displayName}
            >
              <span
                className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                style={{ background: "var(--tracker-accent)" }}
              >
                {initial}
              </span>
              <ChevronDown className="size-3 text-[var(--tracker-text-muted)] hidden md:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60 rounded-xl p-1.5" style={{ boxShadow: "var(--shadow-pop)" }}>
            <DropdownMenuLabel className="font-normal px-2.5 py-2">
              <p className="text-[13px] font-semibold text-[var(--tracker-text-main)] truncate">{displayName}</p>
              <p className="text-[11px] text-[var(--tracker-text-muted)] mt-0.5">
                {ROLE_LABEL[authData.user.role] || authData.user.role}
                {authData.user.username !== displayName ? ` · ${authData.user.username}` : ""}
              </p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {!isGuest && (
              <DropdownMenuItem className="gap-2 rounded-lg text-[13px] cursor-pointer" onClick={() => setSettingsOpen(true, "account")}>
                <KeyRound className="size-3.5" /> Аккаунт и пароль
              </DropdownMenuItem>
            )}
            {isAdmin && (
              <DropdownMenuItem className="gap-2 rounded-lg text-[13px] cursor-pointer" onClick={() => { window.location.href = "/admin"; }}>
                <Shield className="size-3.5" /> Админ-панель
              </DropdownMenuItem>
            )}
            {(!isGuest || isAdmin) && <DropdownMenuSeparator />}
            <DropdownMenuItem className="gap-2 rounded-lg text-[13px] cursor-pointer text-[var(--tracker-danger)] focus:text-[var(--tracker-danger)]" onClick={onLogout}>
              <LogOut className="size-3.5" /> Выйти
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Hidden file inputs */}
        <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleJSONFileSelect} />
        <input ref={xlsxInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleXLSXFileSelect} />
      </div>
    </header>
  );
}
