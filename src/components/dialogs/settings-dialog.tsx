"use client";
/**
 * SettingsDialog — тема и домены.
 *
 * Домены управляются ЧЕРЕЗ СЕРВЕР (/api/domains), а не локально:
 *  - создать может любой не-readonly пользователь (создатель = редактор);
 *  - переименовать — админ и глобальный редактор;
 *  - архивировать (скрыть для всех, кроме админа) и удалить — только админ;
 *  - перед удалением показывается, сколько данных пропадёт.
 */
import React, { useState, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, Plus, Trash2, Archive, ArchiveRestore, Pencil, Loader2, KeyRound, RotateCcw, RefreshCw, Palette, FolderOpen, Settings } from "lucide-react";

export interface SettingsDomain {
  id: string;
  name: string;
  archived?: boolean;
}

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  /** Вкладка, на которой открыть диалог (например, "account"). */
  initialTab?: string;
  // Theme
  themeId: string;
  customColor: string;
  customDark: boolean;
  onSetTheme: (hex: string) => void;
  onSetCustomColor: (hex: string, dark: boolean) => void;
  // Domains
  token: string;
  isAdmin: boolean;
  userRole: string;
  domains: SettingsDomain[];
  activeDomainId: string;
  onSetActiveDomain: (id: string) => void;
  /** Перезагрузить список доменов с сервера (обновляет store). */
  onDomainsChanged: () => Promise<void> | void;
  toast: (opts: { title: string; description?: string }) => void;
}

const QUICK_COLORS = [
  { hex: "#5B9BD5", label: "Небо" },     { hex: "#4DB6AC", label: "Бирюза" },
  { hex: "#4FC3F7", label: "Океан" },    { hex: "#66BB6A", label: "Трава" },
  { hex: "#9CCC65", label: "Мята" },     { hex: "#D4A017", label: "Мёд" },
  { hex: "#E8813A", label: "Закат" },    { hex: "#E86B6B", label: "Коралл" },
  { hex: "#E07BAD", label: "Фуксия" },   { hex: "#9B72CF", label: "Сирень" },
  { hex: "#7986CB", label: "Лаванда" },  { hex: "#C49A6C", label: "Песок" },
];

export function SettingsDialog({
  open, onClose, initialTab,
  themeId, customColor, customDark, onSetTheme, onSetCustomColor,
  token, isAdmin, userRole,
  domains, activeDomainId, onSetActiveDomain, onDomainsChanged,
  toast,
}: SettingsDialogProps) {
  const [tab, setTab] = useState("domains");
  const [colorInput, setColorInput] = useState(customColor || themeId || "#9B72CF");
  const [newDomainName, setNewDomainName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: string; name: string; stats?: { tasks: number; backlog: number; questions: number };
  } | null>(null);

  // ── Аккаунт: смена пароля ──
  const [curPassword, setCurPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  // ── Корзина ──
  interface TrashItem {
    type: "task" | "backlog";
    id: string; num: string; name: string;
    monthKey: string | null; updatedBy: string; deletedAt: string;
  }
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const loadTrash = useCallback(async () => {
    setTrashLoading(true);
    try {
      const res = await fetch(`/api/trash?domainId=${encodeURIComponent(activeDomainId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTrashItems(Array.isArray(data.items) ? data.items : []);
      }
    } catch { /* silent */ }
    setTrashLoading(false);
  }, [activeDomainId, token]);

  const restoreItem = async (item: TrashItem) => {
    setRestoringId(item.id);
    try {
      const res = await fetch("/api/trash", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type: item.type, id: item.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast({ title: "Восстановлено", description: `${item.num ? `#${item.num} ` : ""}${item.name || ""} — появится после синхронизации` });
        setTrashItems(prev => prev.filter(t => t.id !== item.id));
      } else {
        toast({ title: "Ошибка", description: data.error || "Не удалось восстановить" });
      }
    } catch { toast({ title: "Ошибка", description: "Нет соединения" }); }
    setRestoringId(null);
  };

  /** Открытие диалога на конкретной вкладке (из меню пользователя и т.п.). */
  React.useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      if (initialTab) setTab(initialTab);
      if (initialTab === "trash") loadTrash();
    }, 0);
    return () => clearTimeout(t);
  }, [open, initialTab, loadTrash]);

  const changePassword = async () => {
    if (newPassword.length < 4) {
      toast({ title: "Пароль слишком короткий", description: "Минимум 4 символа" });
      return;
    }
    if (newPassword !== newPassword2) {
      toast({ title: "Пароли не совпадают", description: "Проверьте повтор нового пароля" });
      return;
    }
    setPwBusy(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: curPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast({ title: "Пароль изменён" });
        setCurPassword(""); setNewPassword(""); setNewPassword2("");
      } else {
        toast({ title: "Не получилось", description: data.error || "Ошибка смены пароля" });
      }
    } catch { toast({ title: "Ошибка", description: "Нет соединения" }); }
    setPwBusy(false);
  };

  const authHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const canCreate = !["viewer", "guest"].includes(userRole);
  const canRename = isAdmin || userRole === "editor";

  const apiCall = useCallback(async (
    method: string,
    body: Record<string, unknown>,
    okTitle: string,
  ): Promise<boolean> => {
    setBusy(true);
    try {
      const res = await fetch("/api/domains", {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ token, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast({ title: okTitle });
        await onDomainsChanged();
        setBusy(false);
        return true;
      }
      toast({ title: "Ошибка", description: data.error || "Операция не выполнена" });
    } catch {
      toast({ title: "Ошибка", description: "Нет соединения с сервером" });
    }
    setBusy(false);
    return false;
  }, [token, toast, onDomainsChanged]);

  const addDomain = async () => {
    const name = newDomainName.trim();
    if (!name) return;
    const ok = await apiCall("POST", { name }, `Домен «${name}» создан`);
    if (ok) setNewDomainName("");
  };

  const commitRename = async (id: string) => {
    const name = editingName.trim();
    const domain = domains.find(d => d.id === id);
    setEditingId(null);
    if (!name || !domain || name === domain.name) return;
    await apiCall("PATCH", { domainId: id, name }, "Домен переименован");
  };

  const toggleArchive = async (d: SettingsDomain) => {
    await apiCall(
      "PATCH",
      { domainId: d.id, archived: !d.archived },
      d.archived ? `«${d.name}» возвращён из архива` : `«${d.name}» отправлен в архив`,
    );
  };

  const askDelete = async (d: SettingsDomain) => {
    setDeleteConfirm({ id: d.id, name: d.name });
    // Подтягиваем масштаб потерь
    try {
      const res = await fetch(`/api/domains/stats?domainId=${encodeURIComponent(d.id)}`, {
        headers: authHeaders,
      });
      if (res.ok) {
        const data = await res.json();
        setDeleteConfirm(prev => prev && prev.id === d.id ? { ...prev, stats: data.stats } : prev);
      }
    } catch { /* silent */ }
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    const ok = await apiCall("DELETE", { domainId: deleteConfirm.id }, `Домен «${deleteConfirm.name}» удалён`);
    if (ok) setDeleteConfirm(null);
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg ink-scope">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Settings className="size-[18px] text-[var(--tracker-accent)]" /> Настройки</DialogTitle>
          <DialogDescription>Настройка темы и доменов</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            {/* Вкладка «Тема» скрыта: тема продукта зафиксирована («графит и бумага»),
                режим свет/тьма переключается на рельсе. */}
            <TabsTrigger value="domains" className="flex-1 gap-1.5"><FolderOpen className="size-3.5" /> Домены</TabsTrigger>
            {userRole !== "guest" && (
              <TabsTrigger value="account" className="flex-1 gap-1.5"><KeyRound className="size-3.5" /> Аккаунт</TabsTrigger>
            )}
            <TabsTrigger value="trash" className="flex-1 gap-1.5" onClick={() => loadTrash()}><Trash2 className="size-3.5" /> Корзина</TabsTrigger>
          </TabsList>

          {/* ── Theme ── */}
          <TabsContent value="theme" className="space-y-4 pt-2">
            <div>
              <label className="text-sm font-medium mb-2 block">Цвет акцента</label>
              <div className="grid grid-cols-6 gap-2">
                {QUICK_COLORS.map(c => (
                  <button key={c.hex} title={c.label} onClick={() => onSetTheme(c.hex)}
                    className={`relative h-9 w-9 rounded-lg border-2 transition-all hover:scale-110 ${themeId === c.hex && !customColor ? "border-foreground ring-2 ring-foreground/20" : "border-transparent"}`}
                    style={{ backgroundColor: c.hex }}>
                    {themeId === c.hex && !customColor && <Check className="size-3.5 text-white absolute inset-0 m-auto drop-shadow-sm" />}
                  </button>
                ))}
              </div>
            </div>
            <Separator />
            <div>
              <label className="text-sm font-medium mb-2 block">Свой цвет</label>
              <div className="flex items-center gap-2">
                <input type="color" value={colorInput}
                  onChange={e => { setColorInput(e.target.value); onSetCustomColor(e.target.value, false); }}
                  className="h-9 w-12 rounded-lg border cursor-pointer bg-transparent" />
                <Input value={colorInput}
                  onChange={e => { setColorInput(e.target.value); if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) onSetCustomColor(e.target.value, false); }}
                  className="h-9 w-28 font-mono text-sm" placeholder="#RRGGBB" maxLength={7} />
              </div>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium">Тёмный режим</label>
                <p className="text-xs text-muted-foreground mt-0.5">Переключить тему оформления</p>
              </div>
              <Switch checked={customDark}
                onCheckedChange={checked => onSetCustomColor(customColor || themeId || "#5B9BD5", checked)} />
            </div>
          </TabsContent>

          {/* ── Domains ── */}
          <TabsContent value="domains" className="space-y-4 pt-2">
            {canCreate && (
              <div className="flex items-center gap-2">
                <Input value={newDomainName} onChange={e => setNewDomainName(e.target.value)}
                  placeholder="Название нового домена..." className="h-9 text-sm"
                  onKeyDown={e => { if (e.key === "Enter") addDomain(); }} />
                <Button size="sm" className="h-9 shrink-0 bg-[var(--tracker-accent)] text-[var(--tracker-accent-contrast)]" disabled={!newDomainName.trim() || busy} onClick={addDomain}>
                  {busy ? <Loader2 className="size-3.5 mr-1 animate-spin" /> : <Plus className="size-3.5 mr-1" />}Добавить
                </Button>
              </div>
            )}
            <Separator />
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {domains.map(d => (
                <div key={d.id} className={`flex items-center gap-2 rounded-lg px-3 py-2 transition-colors ${d.id === activeDomainId ? "bg-[var(--tracker-accent-soft)] border border-[var(--tracker-accent)]" : "bg-muted/40 border border-transparent hover:bg-muted/60"} ${d.archived ? "opacity-60" : ""}`}>
                  {editingId === d.id ? (
                    <Input value={editingName} onChange={e => setEditingName(e.target.value)}
                      className="h-7 text-sm flex-1" autoFocus
                      onKeyDown={e => { if (e.key === "Enter") commitRename(d.id); if (e.key === "Escape") setEditingId(null); }}
                      onBlur={() => commitRename(d.id)} />
                  ) : (
                    <button className="flex-1 text-left text-sm font-medium truncate"
                      onClick={() => { if (d.id !== activeDomainId && !d.archived) { onSetActiveDomain(d.id); toast({ title: "Домен", description: `Переключено на «${d.name}»` }); } }}>
                      {d.name}
                      {d.archived && <span className="text-[10px] ml-1.5 px-1 py-0.5 rounded bg-muted text-muted-foreground align-middle">архив</span>}
                      {d.id === activeDomainId && <Check className="size-3 inline ml-1.5 text-[var(--tracker-accent-fg)]" />}
                    </button>
                  )}
                  <div className="flex items-center gap-0.5 shrink-0">
                    {editingId !== d.id && (
                      <>
                        {canRename && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Переименовать" disabled={busy}
                            onClick={() => { setEditingId(d.id); setEditingName(d.name); }}>
                            <Pencil className="size-3" />
                          </Button>
                        )}
                        {isAdmin && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" disabled={busy}
                            title={d.archived ? "Вернуть из архива" : "В архив (скрыть от всех, кроме админа)"}
                            onClick={() => toggleArchive(d)}>
                            {d.archived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
                          </Button>
                        )}
                        {isAdmin && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" title="Удалить домен"
                            disabled={busy || domains.length <= 1}
                            onClick={() => askDelete(d)}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {!isAdmin && (
              <p className="text-xs text-muted-foreground">
                Архивировать и удалять домены может только администратор.
              </p>
            )}
          </TabsContent>

          {/* ── Account ── */}
          <TabsContent value="account" className="space-y-4 pt-2">
            <div className="flex items-center gap-2">
              <KeyRound className="size-4 text-[var(--tracker-accent)]" />
              <p className="text-sm font-medium">Смена пароля</p>
            </div>
            <div className="space-y-2">
              <Input type="password" value={curPassword} onChange={e => setCurPassword(e.target.value)}
                placeholder="Текущий пароль (пусто, если не был задан)" className="h-9 text-sm" autoComplete="current-password" />
              <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                placeholder="Новый пароль (минимум 4 символа)" className="h-9 text-sm" autoComplete="new-password" />
              <Input type="password" value={newPassword2} onChange={e => setNewPassword2(e.target.value)}
                placeholder="Новый пароль ещё раз" className="h-9 text-sm" autoComplete="new-password"
                onKeyDown={e => { if (e.key === "Enter") changePassword(); }} />
            </div>
            <Button size="sm" className="w-full bg-[var(--tracker-accent)] text-[var(--tracker-accent-contrast)]"
              disabled={pwBusy || newPassword.length < 4} onClick={changePassword}>
              {pwBusy ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <KeyRound className="size-3.5 mr-1.5" />}
              Сменить пароль
            </Button>
            <p className="text-xs text-muted-foreground">
              После 5 неудачных попыток вход блокируется на 15 минут.
            </p>
          </TabsContent>

          {/* ── Trash ── */}
          <TabsContent value="trash" className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Удалённые задачи текущего домена. Хранятся 60 дней.
              </p>
              <Button variant="ghost" size="icon" className="size-7" title="Обновить" disabled={trashLoading} onClick={loadTrash}>
                <RefreshCw className={`size-3.5 ${trashLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>
            {trashLoading && trashItems.length === 0 && (
              <div className="flex justify-center py-6"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
            )}
            {!trashLoading && trashItems.length === 0 && (
              <p className="text-sm text-center py-6 text-muted-foreground">Корзина пуста</p>
            )}
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {trashItems.map(item => (
                <div key={`${item.type}-${item.id}`} className="flex items-center gap-2 rounded-lg px-3 py-2 bg-muted/40 text-xs">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {item.num ? `#${item.num} ` : ""}{item.name || "Без названия"}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {item.type === "task" ? (item.monthKey || "задача") : "бэклог"}
                      {item.updatedBy ? ` · удалил: ${item.updatedBy}` : ""}
                      {" · "}{new Date(item.deletedAt).toLocaleDateString("ru-RU")}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 gap-1 text-[11px] shrink-0 text-[var(--tracker-accent)]"
                    disabled={restoringId === item.id} onClick={() => restoreItem(item)}>
                    {restoringId === item.id
                      ? <Loader2 className="size-3 animate-spin" />
                      : <RotateCcw className="size-3" />}
                    Вернуть
                  </Button>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {/* ── Подтверждение удаления домена ── */}
        {deleteConfirm && (
          <Dialog open onOpenChange={o => { if (!o) setDeleteConfirm(null); }}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Удалить домен «{deleteConfirm.name}»?</DialogTitle>
                <DialogDescription asChild>
                  <div className="space-y-2 pt-1">
                    {deleteConfirm.stats ? (
                      <span className="block text-sm">
                        Будет безвозвратно удалено: <b>{deleteConfirm.stats.tasks}</b> задач,{" "}
                        <b>{deleteConfirm.stats.backlog}</b> позиций бэклога,{" "}
                        <b>{deleteConfirm.stats.questions}</b> вопросов.
                      </span>
                    ) : (
                      <span className="flex items-center gap-2 text-sm">
                        <Loader2 className="size-3.5 animate-spin" /> Считаем данные домена...
                      </span>
                    )}
                    <span className="block text-xs text-muted-foreground">
                      Если данные ещё могут пригодиться — отправьте домен в архив вместо удаления.
                    </span>
                  </div>
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setDeleteConfirm(null)}>Отмена</Button>
                <Button variant="destructive" size="sm" disabled={busy} onClick={confirmDelete}>
                  {busy ? <Loader2 className="size-3.5 mr-1 animate-spin" /> : <Trash2 className="size-3.5 mr-1" />}
                  Удалить навсегда
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
}
