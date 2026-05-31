"use client";
import React, { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, Plus, Trash2 } from "lucide-react";
import type { Domain } from "@/lib/types";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  // Theme
  themeId: string;
  customColor: string;
  customDark: boolean;
  onSetTheme: (hex: string) => void;
  onSetCustomColor: (hex: string, dark: boolean) => void;
  // Domains
  domains: Domain[];
  activeDomainId: string;
  onAddDomain: (name: string) => void;
  onRenameDomain: (id: string, name: string) => void;
  onDeleteDomain: (id: string) => void;
  onSetActiveDomain: (id: string) => void;
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
  open, onClose,
  themeId, customColor, customDark, onSetTheme, onSetCustomColor,
  domains, activeDomainId,
  onAddDomain, onRenameDomain, onDeleteDomain, onSetActiveDomain,
  toast,
}: SettingsDialogProps) {
  const [tab, setTab] = useState("theme");
  const [colorInput, setColorInput] = useState(customColor || themeId || "#9B72CF");
  const [newDomainName, setNewDomainName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const addDomain = () => {
    if (!newDomainName.trim()) return;
    onAddDomain(newDomainName.trim());
    toast({ title: "📁 Домен", description: `Домен «${newDomainName.trim()}» создан` });
    setNewDomainName("");
  };

  const commitRename = (id: string) => {
    if (editingName.trim()) {
      onRenameDomain(id, editingName.trim());
      toast({ title: "📁 Домен", description: "Домен переименован" });
    }
    setEditingId(null);
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>⚙️ Настройки</DialogTitle>
          <DialogDescription>Настройка темы и доменов</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="theme" className="flex-1">🎨 Тема</TabsTrigger>
            <TabsTrigger value="domains" className="flex-1">📁 Домены</TabsTrigger>
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
            <div className="flex items-center gap-2">
              <Input value={newDomainName} onChange={e => setNewDomainName(e.target.value)}
                placeholder="Название нового домена..." className="h-9 text-sm"
                onKeyDown={e => { if (e.key === "Enter") addDomain(); }} />
              <Button size="sm" className="h-9 shrink-0 bg-[var(--tracker-accent)] text-white" disabled={!newDomainName.trim()} onClick={addDomain}>
                <Plus className="size-3.5 mr-1" />Добавить
              </Button>
            </div>
            <Separator />
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {domains.map(d => (
                <div key={d.id} className={`flex items-center gap-2 rounded-lg px-3 py-2 transition-colors ${d.id === activeDomainId ? "bg-[var(--tracker-accent-soft)] border border-[var(--tracker-accent)]" : "bg-muted/40 border border-transparent hover:bg-muted/60"}`}>
                  {editingId === d.id ? (
                    <Input value={editingName} onChange={e => setEditingName(e.target.value)}
                      className="h-7 text-sm flex-1" autoFocus
                      onKeyDown={e => { if (e.key === "Enter") commitRename(d.id); if (e.key === "Escape") setEditingId(null); }}
                      onBlur={() => commitRename(d.id)} />
                  ) : (
                    <button className="flex-1 text-left text-sm font-medium truncate"
                      onClick={() => { if (d.id !== activeDomainId) { onSetActiveDomain(d.id); toast({ title: "📁 Домен", description: `Переключено на «${d.name}»` }); } }}>
                      {d.name}
                      {d.id === activeDomainId && <Check className="size-3 inline ml-1.5 text-[var(--tracker-accent-fg)]" />}
                    </button>
                  )}
                  <div className="flex items-center gap-0.5 shrink-0">
                    {editingId !== d.id && (
                      <>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Переименовать"
                          onClick={() => { setEditingId(d.id); setEditingName(d.name); }}>
                          <span className="text-xs">✏️</span>
                        </Button>
                        {deleteConfirm === d.id ? (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Подтвердить удаление"
                              onClick={() => { onDeleteDomain(d.id); setDeleteConfirm(null); toast({ title: "📁 Домен", description: `Домен «${d.name}» удалён` }); }}>
                              <Check className="size-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Отмена" onClick={() => setDeleteConfirm(null)}>
                              <span className="text-xs">✕</span>
                            </Button>
                          </>
                        ) : (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" title="Удалить домен"
                            disabled={domains.length <= 1}
                            onClick={() => setDeleteConfirm(d.id)}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {domains.length <= 1 && (
              <p className="text-xs text-muted-foreground">Минимум один домен обязателен. Создайте новый, чтобы управлять несколькими.</p>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
