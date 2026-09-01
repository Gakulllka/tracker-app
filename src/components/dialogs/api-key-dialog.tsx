"use client";
/**
 * Диалог ключа Gemini.
 *
 * Раньше жил внутри вкладки «Чат». Со слайдов кнопка «Сгенерировать
 * выводы» вызывала его открытие, но вкладка чата в этот момент не
 * смонтирована — окно не появлялось, человек видел только надпись
 * «Сначала введите API ключ» и никакого способа его ввести.
 *
 * Ключ сохраняется в localStorage этого браузера и на сервер не уходит:
 * это личный ключ пользователя к его собственному аккаунту Google.
 * Раньше он жил в useRef и стирался при каждой перезагрузке.
 */
import React, { useState } from "react";
import { KeyRound, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite-preview",
];

export const API_KEY_STORAGE = "delta-gemini-key";

/** Читает сохранённый ключ. Вызывается один раз при загрузке страницы. */
export function loadStoredApiKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(API_KEY_STORAGE) || "";
  } catch {
    return "";
  }
}

export interface ApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Задан ли ключ. Само значение диалогу не нужно — и читать его
   *  из ref во время отрисовки нельзя. */
  hasKey: boolean;
  onSave: (key: string) => void;
  onClear: () => void;
  model: string;
  setModel: (model: string) => void;
}

export function ApiKeyDialog({
  open, onOpenChange, hasKey, onSave, onClear, model, setModel,
}: ApiKeyDialogProps) {
  const [draft, setDraft] = useState("");

  const save = () => {
    const key = draft.trim();
    if (!key) return;
    onSave(key);
    setDraft("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            <KeyRound className="size-5 inline mr-2" />
            Ключ Gemini
          </DialogTitle>
          <DialogDescription>
            {hasKey
              ? "Ключ сохранён в этом браузере. Введите новый, чтобы заменить."
              : "Ключ хранится только в этом браузере и на сервер не отправляется."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-1">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={hasKey ? "Новый ключ…" : "AIzaSy…"}
            className="font-mono text-sm"
            onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            autoFocus
          />

          <div className="flex items-center gap-2">
            <label className="text-xs font-medium whitespace-nowrap" style={{ color: "var(--tracker-text-muted)" }}>
              Модель
            </label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="h-9 flex-1 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MODELS.map((m) => (
                  <SelectItem key={m} value={m} className="text-xs">
                    {m.replace("gemini-", "")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs" style={{ color: "var(--tracker-text-muted)" }}>
            Получить ключ:{" "}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              aistudio.google.com
            </a>
          </p>
        </div>

        <DialogFooter>
          {hasKey && (
            <Button
              variant="outline"
              className="mr-auto"
              style={{ borderColor: "var(--tracker-danger)", color: "var(--tracker-danger)" }}
              onClick={() => { onClear(); onOpenChange(false); }}
            >
              <Trash2 className="size-4 mr-1.5" />
              Удалить ключ
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button disabled={!draft.trim()} onClick={save}>
            <Check className="size-4 mr-1.5" />
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
