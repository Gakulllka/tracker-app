"use client";
/**
 * MobileDomainPicker — выбор домена через Bottom Sheet.
 *
 * Паттерн: Список доменов с иконками и кнопками действий.
 */
import React, { useState, useCallback } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Loader2, Plus, Lock, ArrowRight, Check } from "lucide-react";

interface Domain {
  id: string;
  name: string;
  archived?: boolean;
}

interface MobileDomainPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  domains: Domain[];
  activeDomainId: string;
  editableDomainIds: "all" | string[];
  onSelectDomain: (domainId: string) => void;
  onCreateDomain: (name: string) => Promise<void>;
  onRequestAccess: (domainId: string) => Promise<void>;
}

export function MobileDomainPicker({
  open, onOpenChange,
  domains, activeDomainId, editableDomainIds,
  onSelectDomain, onCreateDomain, onRequestAccess,
}: MobileDomainPickerProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [newDomainName, setNewDomainName] = useState("");
  const [creating, setCreating] = useState(false);
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());

  const canEditDomain = useCallback(
    (domainId: string) => {
      if (editableDomainIds === "all") return true;
      return Array.isArray(editableDomainIds) && editableDomainIds.includes(domainId);
    },
    [editableDomainIds]
  );

  const handleCreate = async () => {
    const name = newDomainName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await onCreateDomain(name);
      setNewDomainName("");
      setShowCreate(false);
    } finally {
      setCreating(false);
    }
  };

  const handleRequestAccess = async (domainId: string) => {
    setRequestingId(domainId);
    try {
      await onRequestAccess(domainId);
      setRequestedIds((prev) => new Set(prev).add(domainId));
    } finally {
      setRequestingId(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl ink-pop p-0 max-h-[80vh]">
        <SheetHeader className="px-4 pt-4 pb-2">
          <SheetTitle className="text-[15px] font-semibold" style={{ color: "var(--tracker-bg-main)" }}>
            Выберите домен
          </SheetTitle>
        </SheetHeader>
        <div className="px-2 pb-4 overflow-y-auto max-h-[calc(80vh-80px)] space-y-1">
          {domains.map((domain) => {
            const editable = canEditDomain(domain.id);
            const isActive = domain.id === activeDomainId;
            const isRequested = requestedIds.has(domain.id);
            const isRequesting = requestingId === domain.id;

            return (
              <div
                key={domain.id}
                className="flex items-center gap-3 px-3 py-3 rounded-xl transition-colors active:scale-[0.98]"
                style={{
                  background: isActive ? "rgba(250,250,248,0.1)" : "transparent",
                }}
              >
                {/* Иконка */}
                <div
                  className="flex items-center justify-center size-9 rounded-lg shrink-0"
                  style={{ background: editable ? "var(--tracker-bg-main)" : "rgba(250,250,248,0.08)" }}
                >
                  {editable ? (
                    <svg width="16" height="14" viewBox="0 0 40 36" xmlns="http://www.w3.org/2000/svg" style={{ color: "var(--tracker-accent)" }}>
                      <polygon points="20,2 38,34 2,34" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <Lock className="size-3.5" style={{ color: "rgba(250,250,248,0.5)" }} />
                  )}
                </div>

                {/* Название */}
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium truncate" style={{ color: "var(--tracker-bg-main)" }}>
                    {domain.name}
                  </p>
                  <p className="text-[11px]" style={{ color: "rgba(250,250,248,0.45)" }}>
                    {isActive ? "Текущий" : editable ? "Есть доступ" : "Только просмотр"}
                  </p>
                </div>

                {/* Кнопки */}
                <div className="flex items-center gap-2 shrink-0">
                  {isActive ? (
                    <Check className="size-4" style={{ color: "var(--tracker-success)" }} />
                  ) : editable ? (
                    <button
                      onClick={() => { onSelectDomain(domain.id); onOpenChange(false); }}
                      className="h-8 px-3 rounded-lg text-[12px] font-semibold flex items-center gap-1 transition-colors active:scale-[0.95]"
                      style={{ background: "var(--tracker-bg-main)", color: "var(--tracker-accent)" }}
                    >
                      Войти <ArrowRight className="size-3" />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleRequestAccess(domain.id)}
                      disabled={isRequesting || isRequested}
                      className="h-8 px-3 rounded-lg text-[12px] font-medium flex items-center gap-1 transition-colors disabled:opacity-50 active:scale-[0.95]"
                      style={{
                        background: isRequested ? "rgba(250,250,248,0.08)" : "transparent",
                        color: isRequested ? "rgba(250,250,248,0.45)" : "var(--tracker-bg-main)",
                        border: "1px solid rgba(250,250,248,0.15)",
                      }}
                    >
                      {isRequesting ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : isRequested ? (
                        "✓ Запрос"
                      ) : (
                        "Запросить"
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Создать домен */}
          <div className="pt-2">
            {showCreate ? (
              <div className="px-3 py-3 rounded-xl" style={{ background: "rgba(250,250,248,0.05)" }}>
                <input
                  type="text"
                  value={newDomainName}
                  onChange={(e) => setNewDomainName(e.target.value)}
                  placeholder="Название домена"
                  autoFocus
                  className="w-full h-10 rounded-lg px-3 text-[14px] outline-none"
                  style={{ background: "rgba(250,250,248,0.08)", color: "var(--tracker-bg-main)", border: "1px solid rgba(250,250,248,0.12)" }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handleCreate}
                    disabled={!newDomainName.trim() || creating}
                    className="flex-1 h-9 rounded-lg text-[13px] font-semibold flex items-center justify-center gap-1 active:scale-[0.95] disabled:opacity-40"
                    style={{ background: "var(--tracker-bg-main)", color: "var(--tracker-accent)" }}
                  >
                    {creating ? <Loader2 className="size-3.5 animate-spin" /> : "Создать"}
                  </button>
                  <button
                    onClick={() => { setShowCreate(false); setNewDomainName(""); }}
                    className="h-9 px-4 rounded-lg text-[13px] font-medium active:scale-[0.95]"
                    style={{ color: "rgba(250,250,248,0.5)" }}
                  >
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowCreate(true)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-medium transition-colors active:scale-[0.98]"
                style={{ color: "rgba(250,250,248,0.6)", border: "1px dashed rgba(250,250,248,0.2)" }}
              >
                <Plus className="size-4" />
                Создать новый домен
              </button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
