"use client";
/**
 * AppSidebar — графитовая рельса, единственный «пульт» приложения.
 *
 * Редизайн «одна панель»: верхняя шапка удалена, всё управление живёт здесь —
 * домен, навигация, месяц/год, инструменты, уведомления, presence,
 * синхронизация и меню пользователя. Контент остаётся чистым листом.
 */
import React from "react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Check, Users, Undo2, Redo2, Sun, Moon, Share2, Settings, LogOut,
  KeyRound, Shield, Eye, EyeOff, Plus, ChevronUp, Lock,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { MONTHS, MONTHS_SHORT } from "@/lib/types";
import type { Task, Domain } from "@/lib/types";
import type { AuthData } from "@/hooks/useAuth";
import type { SyncStatus } from "@/hooks/useServerSync";
import { undoStore } from "@/lib/store";
import { ExecSignalsPanel } from "@/components/exec-signals-panel";
import { PresenceAvatars } from "@/components/presence-avatars";
import { NotificationsBell } from "@/components/notifications-bell";

export interface SidebarTab {
  key: string;
  icon: LucideIcon;
  label: string;
  disabled?: boolean;
  badge?: number;
}

const ROLE_LABEL: Record<string, string> = {
  admin: "Администратор", editor: "Редактор", viewer: "Наблюдатель",
  member: "Участник", guest: "Гость",
};

/** Компактный индикатор синхронизации: точка + моно-подпись. */
function SyncPill({ syncStatus, lastSync }: { syncStatus: SyncStatus; lastSync: Date | null }) {
  const cfg: Record<SyncStatus, { dot: string; label: string; title: string }> = {
    synced: { dot: "#3FB574", label: "Сохранено", title: lastSync ? `Синхронизировано: ${lastSync.toLocaleTimeString("ru-RU")}` : "Подключение..." },
    pending: { dot: "#E2A93B", label: "Изменения", title: "Есть несохранённые изменения" },
    pushing: { dot: "#E2A93B", label: "Отправка", title: "Отправка данных на сервер..." },
    initializing: { dot: "#8A8A85", label: "Загрузка", title: "Первая загрузка..." },
    denied: { dot: "#E07840", label: "Нет прав", title: "Сеть в порядке, но нет прав на редактирование этого домена" },
    offline: { dot: "#D95C55", label: "Оффлайн", title: "Нет подключения к серверу" },
  };
  const c = cfg[syncStatus];
  return (
    <div className="flex items-center gap-1.5 select-none" title={c.title}>
      <span className={`size-1.5 rounded-full ${syncStatus === "pushing" ? "animate-pulse" : ""}`} style={{ background: c.dot }} />
      <span
        className="text-[9.5px] font-semibold uppercase"
        style={{ color: "rgba(250,250,248,0.5)", letterSpacing: "0.1em", fontFamily: "var(--font-geist-mono, ui-monospace, monospace)" }}
      >
        {c.label}
      </span>
    </div>
  );
}

/** Иконка-кнопка рельсы. */
function RailIcon({ title, onClick, disabled, children }: {
  title: string; onClick?: () => void; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="rail-iconbtn size-8 rounded-lg flex items-center justify-center transition-colors"
    >
      {children}
    </button>
  );
}

interface AppSidebarProps {
  tabs: SidebarTab[];
  view: string;
  setView: (v: string) => void;
  allowedTabs: Set<string> | null;
  currentMonth: number;
  setCurrentMonth: (m: number) => void;
  currentYear: number;
  setCurrentYear: (y: number) => void;
  monthHasData: (m: number) => boolean;
  getAvailableYears: () => number[];
  authData: AuthData;
  workspaceId: string;
  switchWorkspace: (id: string) => void;
  // ── Домены (из бывшей шапки) ──
  activeDomainId: string;
  visibleDomains: Domain[];
  storeSetActiveDomain: (id: string) => void;
  setNewDomainDialog: (v: boolean) => void;
  canCreateDomain: boolean;
  isReadOnlyDomain: boolean;
  requestingAccess: boolean;
  requestAccessToActive: () => void;
  // ── Инструменты ──
  storeUndo: () => void;
  storeRedo: () => void;
  customDark: boolean;
  storeSetCustomDark: (v: boolean) => void;
  setShareDialogOpen: (v: boolean) => void;
  setSettingsOpen: (v: boolean, tab?: string) => void;
  refreshAuth: () => Promise<void> | void;
  toast: (opts: { title: string; description?: string }) => void;
  // ── Exec-сигналы ──
  allData: Record<number, Task[]>;
  backlog: Task[];
  monthlyPlan: number;
  updateTask: (month: number, taskId: string, key: keyof Task, value: unknown) => void;
  addLinkedQuestion: (text: string, author: string, linkedTaskId: string, linkedTaskName: string) => void;
  signalsFilterActive: boolean;
  setSignalsFilterActive: (v: boolean) => void;
  // ── Пользователь ──
  isGuest: boolean;
  isAdmin: boolean;
  clientMode: boolean;
  toggleClientMode: () => void;
  onLogout: () => void;
  // ── Синхронизация ──
  syncStatus: SyncStatus;
  lastSync: Date | null;
}

export function AppSidebar({
  tabs, view, setView, allowedTabs,
  currentMonth, setCurrentMonth, currentYear, setCurrentYear,
  monthHasData, getAvailableYears,
  authData, workspaceId, switchWorkspace,
  activeDomainId, visibleDomains, storeSetActiveDomain, setNewDomainDialog, canCreateDomain,
  isReadOnlyDomain, requestingAccess, requestAccessToActive,
  storeUndo, storeRedo, customDark, storeSetCustomDark,
  setShareDialogOpen, setSettingsOpen, refreshAuth, toast,
  allData, backlog, monthlyPlan, updateTask, addLinkedQuestion,
  signalsFilterActive, setSignalsFilterActive,
  isGuest, isAdmin, clientMode, toggleClientMode, onLogout,
  syncStatus, lastSync,
}: AppSidebarProps) {
  const displayName = authData.user.displayName || authData.user.username;
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <Sidebar collapsible="icon" className="ink-rail rail-enter border-r" style={{ borderColor: "rgba(250,250,248,0.12)" } as React.CSSProperties}>
      {/* ── Знак + словесный знак ── */}
      <SidebarHeader className="px-3 pt-4 pb-2 relative">
        <div className="flex items-center gap-2.5 px-1 select-none">
          <svg width="17" height="15" viewBox="0 0 40 36" xmlns="http://www.w3.org/2000/svg"
            style={{ flexShrink: 0, color: "#FAFAF8" }}>
            <polygon points="20,2 38,34 2,34" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/>
            <polygon points="20,12 31,32 9,32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" opacity="0.4"/>
          </svg>
          <span
            className="text-[12px] font-semibold uppercase group-data-[collapsible=icon]:hidden"
            style={{
              color: "#FAFAF8",
              letterSpacing: "0.34em",
              fontFamily: "var(--font-geist-mono, ui-monospace, monospace)",
            }}
          >
            Delta
          </span>
        </div>

        {/* ── Домен ── */}
        <div className="mt-3 group-data-[collapsible=icon]:hidden">
          <Select
            value={activeDomainId}
            onValueChange={(v) => {
              if (v === "__new__") { setNewDomainDialog(true); return; }
              storeSetActiveDomain(v);
            }}
          >
            <SelectTrigger
              className="rail-hoverable h-9 w-full gap-1.5 rounded-[10px] px-2.5 text-[13px] font-semibold border shadow-none transition-colors"
              style={{ background: "transparent", borderColor: "rgba(250,250,248,0.12)", color: "#FAFAF8" }}
            >
              {isReadOnlyDomain
                ? <Lock className="size-3 shrink-0" style={{ color: "rgba(250,250,248,0.5)" }} />
                : <span className="size-2 rounded-[4px] shrink-0" style={{ background: "#FAFAF8", opacity: 0.9 }} />}
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl ink-pop">
              {visibleDomains.map((d) => (
                <SelectItem key={d.id} value={d.id} className="text-[13px] rounded-lg">{d.name}</SelectItem>
              ))}
              {canCreateDomain && (
                <SelectItem value="__new__" className="text-[13px] rounded-lg">
                  <span className="flex items-center gap-1.5"><Plus className="size-3.5" /> Новый домен</span>
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          {isReadOnlyDomain && (
            <button
              onClick={requestAccessToActive}
              disabled={requestingAccess || isGuest}
              className="rail-hoverable mt-1.5 w-full text-left px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors disabled:opacity-40"
              style={{ color: "rgba(250,250,248,0.74)" }}
            >
              Только просмотр{!isGuest && " · запросить доступ"}
            </button>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* ── Навигация ── */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {tabs
                .filter((tab) => !allowedTabs || allowedTabs.has(tab.key))
                .map((tab) => {
                  const Icon = tab.icon;
                  const isDisabled = Boolean(tab.disabled);
                  return (
                    <SidebarMenuItem key={tab.key}>
                      <SidebarMenuButton
                        isActive={view === tab.key}
                        onClick={isDisabled ? undefined : () => setView(tab.key)}
                        tooltip={isDisabled ? `${tab.label} — в разработке` : tab.label}
                        disabled={isDisabled}
                        className={"rail-nav relative h-10 rounded-lg overflow-hidden text-[13px] font-medium transition-colors"}
                        style={
                          view === tab.key
                            ? { background: "#FAFAF8", color: "#17181C" }
                            : { color: "rgba(250,250,248,0.74)" }
                        }
                      >
                        {view === tab.key && (
                          <span
                            className="absolute left-0 top-1/2 -translate-y-1/2"
                            style={{ width: 3, height: 16, borderRadius: 2, background: "#17181C" }}
                          />
                        )}
                        <Icon className="size-4" />
                        <span>{tab.label}</span>
                        {isDisabled && (
                          <span className="ml-auto text-[9px]" style={{ color: "rgba(250,250,248,0.5)" }}>Скоро</span>
                        )}
                        {!isDisabled && "badge" in tab && (tab.badge as number) > 0 && (
                          <span className="ml-auto min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center"
                            style={view === tab.key
                              ? { background: "#17181C", color: "#FAFAF8" }
                              : { background: "#FAFAF8", color: "#17181C" }}>
                            {tab.badge}
                          </span>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* ── Месяц и год ── */}
        {(view === "table" || view === "slides") && (
          <SidebarGroup>
            <SidebarGroupContent>
              <div className="px-2 space-y-1">
                <p className="rail-eyebrow px-2 pb-1 group-data-[collapsible=icon]:hidden">Месяц</p>
                <div className="grid grid-cols-3 gap-1 group-data-[collapsible=icon]:hidden">
                  {MONTHS.map((m, i) => (
                    <button
                      key={m}
                      onClick={() => setCurrentMonth(i)}
                      className={`relative flex flex-col items-center justify-center rounded-[10px] px-1.5 pt-2 pb-2.5 text-[12px] font-medium transition-all duration-150 ${
                        currentMonth === i ? "" : "rail-hoverable"
                      }`}
                      style={
                        currentMonth === i
                          ? { background: "#FAFAF8", color: "#17181C" }
                          : { color: "rgba(250,250,248,0.74)" }
                      }
                      title={m}
                    >
                      <span>{MONTHS_SHORT[i]}</span>
                      <span
                        className="absolute bottom-1 size-1 rounded-full transition-opacity"
                        style={{
                          background: currentMonth === i ? "#17181C" : "#FAFAF8",
                          opacity: monthHasData(i) ? (currentMonth === i ? 0.85 : 0.65) : 0,
                        }}
                      />
                    </button>
                  ))}
                </div>
                {/* Год */}
                <div className="flex items-center justify-center gap-1 pt-1.5 group-data-[collapsible=icon]:hidden">
                  <button onClick={() => setCurrentYear(currentYear - 1)} className="rail-hoverable size-6 rounded text-xs font-medium transition-colors flex items-center justify-center" style={{ color: "rgba(250,250,248,0.74)" }}>‹</button>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        className="rail-hoverable delta-num h-6 px-2 text-[11px] font-medium rounded flex items-center justify-center min-w-[52px] transition-colors"
                        style={{ border: "1px solid rgba(250,250,248,0.12)", color: "#FAFAF8", background: "transparent" }}
                      >
                        {currentYear}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-2 rounded-xl ink-pop" align="center" side="bottom">
                      <div className="grid grid-cols-4 gap-1">
                        {(() => {
                          const yrs = new Set<number>(getAvailableYears());
                          const now = new Date().getFullYear();
                          for (let dy = -5; dy <= 5; dy++) yrs.add(now + dy);
                          yrs.add(currentYear);
                          return Array.from(yrs).sort((a, b) => b - a).map((y) => (
                            <button
                              key={y}
                              onClick={() => setCurrentYear(y)}
                              className={`delta-num text-[11px] font-medium rounded px-2 py-1 transition-colors ${
                                y === currentYear
                                  ? "bg-[#FAFAF8] text-[#17181C]"
                                  : "text-[rgba(250,250,248,0.8)] hover:bg-[rgba(250,250,248,0.09)]"
                              }`}
                            >
                              {y}
                            </button>
                          ));
                        })()}
                      </div>
                    </PopoverContent>
                  </Popover>
                  <button onClick={() => setCurrentYear(currentYear + 1)} className="rail-hoverable size-6 rounded text-xs font-medium transition-colors flex items-center justify-center" style={{ color: "rgba(250,250,248,0.74)" }}>›</button>
                </div>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* ── Пространства ── */}
        {authData.accessibleWorkspaces.length > 0 && (
          <SidebarGroup>
            <SidebarGroupContent>
              <div className="px-2 space-y-1">
                <p className="rail-eyebrow px-2 pb-1 group-data-[collapsible=icon]:hidden">Пространства</p>
                <div className="space-y-0.5 group-data-[collapsible=icon]:hidden">
                  <button
                    onClick={() => switchWorkspace(authData.workspaceId)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{ background: "rgba(250,250,248,0.12)", color: "#FAFAF8" }}
                  >
                    <div className="w-5 h-5 rounded flex items-center justify-center shrink-0" style={{ background: "#FAFAF8", color: "#17181C" }}>
                      <span className="text-[9px] font-bold">{initial}</span>
                    </div>
                    <span className="truncate">Моё пространство</span>
                    <Check className="size-3 ml-auto shrink-0" style={{ color: "rgba(250,250,248,0.74)" }} />
                  </button>
                  {authData.accessibleWorkspaces.map(ws => (
                    <button
                      key={ws.workspaceId}
                      onClick={() => switchWorkspace(ws.workspaceId)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors ${
                        workspaceId === ws.workspaceId ? "font-medium" : "rail-hoverable"
                      }`}
                      style={workspaceId === ws.workspaceId
                        ? { background: "rgba(250,250,248,0.12)", color: "#FAFAF8" }
                        : { color: "rgba(250,250,248,0.74)" }}
                    >
                      <div className="w-5 h-5 rounded flex items-center justify-center shrink-0" style={{ background: "rgba(250,250,248,0.08)", color: "rgba(250,250,248,0.74)" }}>
                        <Users className="size-3" />
                      </div>
                      <span className="truncate flex-1 text-left">{ws.name}</span>
                      <span className="text-[9px] px-1 py-0.5 rounded shrink-0" style={{ background: "rgba(250,250,248,0.08)", color: "rgba(250,250,248,0.5)" }}>
                        {ws.role === "editor" ? "ред." : "просм."}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <div className="h-px w-full shrink-0" style={{ background: "rgba(250,250,248,0.12)" }} />

      {/* ── Подвал: инструменты · команда · пользователь ── */}
      <SidebarFooter
        className="p-2 space-y-1.5 group-data-[collapsible=icon]:hidden"
        style={{ background: "#17181C", color: "#FAFAF8" }}
      >
        {/* Exec-сигналы (кнопка появляется, когда есть запросы) */}
        <ExecSignalsPanel
          allTasks={allData}
          backlogTasks={backlog}
          monthCapacity={monthlyPlan > 0 ? monthlyPlan : 240}
          isAdmin={isAdmin}
          currentUsername={displayName}
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

        {/* Инструменты */}
        <div className="flex items-center gap-0.5">
          <RailIcon title="Отменить (Ctrl+Z)" onClick={storeUndo} disabled={!undoStore.canUndo()}>
            <Undo2 className="size-3.5" />
          </RailIcon>
          <RailIcon title="Повторить (Ctrl+Shift+Z)" onClick={storeRedo} disabled={!undoStore.canRedo()}>
            <Redo2 className="size-3.5" />
          </RailIcon>
          <div className="w-px h-4 mx-1" style={{ background: "rgba(250,250,248,0.12)" }} />
          {!isGuest && (
            <>
              <NotificationsBell
                token={authData.token}
                currentUserId={authData.user.id}
                toast={toast}
                onResolved={() => { refreshAuth(); }}
              />
              <RailIcon title="Доступ к домену" onClick={() => setShareDialogOpen(true)}>
                <Share2 className="size-3.5" />
              </RailIcon>
              <RailIcon title="Настройки" onClick={() => setSettingsOpen(true)}>
                <Settings className="size-3.5" />
              </RailIcon>
            </>
          )}
          <RailIcon title={customDark ? "Светлая тема" : "Тёмная тема"} onClick={() => storeSetCustomDark(!customDark)}>
            {customDark ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
          </RailIcon>
        </div>

        {/* Команда + синк */}
        <div className="flex items-center justify-between px-1">
          <PresenceAvatars token={authData.token} currentUserId={authData.user.id} />
          <SyncPill syncStatus={syncStatus} lastSync={lastSync} />
        </div>

        {/* Пользователь */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="rail-hoverable w-full flex items-center gap-2 px-1.5 py-1.5 rounded-lg transition-colors outline-none"
              title={displayName}
            >
              <span
                className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                style={{ background: "#FAFAF8", color: "#17181C" }}
              >
                {initial}
              </span>
              <span className="flex-1 min-w-0 text-left">
                <span className="block text-[12px] font-medium truncate" style={{ color: "#FAFAF8" }}>{displayName}</span>
                <span className="block text-[10px] truncate" style={{ color: "rgba(250,250,248,0.5)" }}>{ROLE_LABEL[authData.user.role] || authData.user.role}</span>
              </span>
              <ChevronUp className="size-3 shrink-0" style={{ color: "rgba(250,250,248,0.5)" }} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-60 rounded-xl p-1.5 ink-pop">
            <DropdownMenuLabel className="font-normal px-2.5 py-2">
              <p className="text-[13px] font-semibold truncate" style={{ color: "#FAFAF8" }}>{displayName}</p>
              <p className="text-[11px] mt-0.5" style={{ color: "rgba(250,250,248,0.6)" }}>
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
            <DropdownMenuItem className="gap-2 rounded-lg text-[13px] cursor-pointer" onClick={toggleClientMode}>
              {clientMode ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              {clientMode ? "Выйти из демонстрации" : "Режим демонстрации"}
            </DropdownMenuItem>
            {isAdmin && (
              <DropdownMenuItem className="gap-2 rounded-lg text-[13px] cursor-pointer" onClick={() => { window.location.href = "/admin"; }}>
                <Shield className="size-3.5" /> Админ-панель
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 rounded-lg text-[13px] cursor-pointer text-[var(--tracker-danger)] focus:text-[var(--tracker-danger)]" onClick={onLogout}>
              <LogOut className="size-3.5" /> Выйти
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
