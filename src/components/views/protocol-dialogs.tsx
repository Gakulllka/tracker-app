import React, { useState, useEffect, useRef, useCallback } from "react";
import mammoth from "mammoth";
import { File, FileText, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import type { MeetingProtocol } from "@/lib/protocols";
import { base64ToArrayBuffer } from "@/lib/protocols";
import { fmtProtocolDate, formatFileSize, getFilePreviewType } from "@/lib/protocols";

/**
 * Диалоги вкладки «Протоколы»: загрузка файла и просмотр содержимого.
 *
 * Файлы хранятся в базе как base64 (поле MeetingProtocol.fileData, лимит 10 МБ),
 * поэтому просмотр не ходит в сеть за файлом — он декодирует уже полученную
 * строку. DOCX разбирается библиотекой mammoth прямо в браузере.
 */

export function ProtocolUploadDialog({
  open,
  onOpenChange,
  onUpload,
  uploading,
  currentUsername,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onUpload: (
    file: File,
    title: string,
    meetingDate: string,
    notes?: string
  ) => Promise<boolean>;
  uploading: boolean;
  currentUsername: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [notes, setNotes] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((selectedFile: File) => {
    setError("");
    if (selectedFile.size > 10 * 1024 * 1024) {
      setError("Файл слишком большой (максимум 10 МБ)");
      return;
    }
    setFile(selectedFile);
    if (!title) {
      setTitle(selectedFile.name.replace(/\.[^/.]+$/, ""));
    }
  }, [title]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation(); // не всплывать к глобальному drop на <SidebarInset> (импорт задач)
      setDragOver(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) handleFileSelect(droppedFile);
    },
    [handleFileSelect]
  );

  const handleSubmit = async () => {
    if (!file || !title.trim() || !meetingDate) {
      setError("Заполните все обязательные поля");
      return;
    }

    const success = await onUpload(
      file,
      title.trim(),
      meetingDate,
      notes.trim()
    );
    if (success) {
      setFile(null);
      setTitle("");
      setMeetingDate(new Date().toISOString().split("T")[0]);
      setNotes("");
      setError("");
      onOpenChange(false);
    } else {
      setError("Ошибка при загрузке файла");
    }
  };

  const handleClose = () => {
    setFile(null);
    setTitle("");
    setMeetingDate(new Date().toISOString().split("T")[0]);
    setNotes("");
    setError("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Загрузить протокол</DialogTitle>
          <DialogDescription>
            Выберите файл протокола встречи для загрузки
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Зона drag-and-drop */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation(); // не всплывать к глобальному drop на <SidebarInset>
              setDragOver(true);
            }}
            onDragLeave={(e) => { e.stopPropagation(); setDragOver(false); }}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
              dragOver
                ? "border-[var(--tracker-accent)] bg-[var(--tracker-accent-bg)]"
                : "border-muted hover:border-muted-foreground/30"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.docx,.doc,.png,.jpg,.jpeg,.gif,.webp,.xlsx,.xls"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelect(f);
              }}
            />
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileText
                  className="size-8"
                  style={{ color: "var(--tracker-accent)" }}
                />
                <div className="text-left">
                  <p className="text-[13px] font-medium text-[var(--tracker-text-main)]">
                    {file.name}
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    {formatFileSize(file.size)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                  }}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ) : (
              <>
                <Upload className="size-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-[13px] text-muted-foreground">
                  Перетащите файл или нажмите для выбора
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  PDF, DOCX, изображения — до 10 МБ
                </p>
              </>
            )}
          </div>

          {/* Название */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-muted-foreground">
              Название *
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Протокол встречи от 15.07.2026"
            />
          </div>

          {/* Дата встречи */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-muted-foreground">
              Дата встречи *
            </label>
            <Input
              type="date"
              value={meetingDate}
              onChange={(e) => setMeetingDate(e.target.value)}
            />
          </div>

          {/* Заметки */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-muted-foreground">
              Заметки
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Краткое описание протокола..."
              className="w-full h-20 px-3 py-2 text-[13px] rounded-lg border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {error && (
            <p className="text-[12px] text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={uploading}>
            Отмена
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!file || !title.trim() || !meetingDate || uploading}
          >
            {uploading ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Загрузка...
              </>
            ) : (
              <>
                <Upload className="size-4 mr-2" />
                Загрузить
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Диалог предпросмотра
// ============================================================================

export function ProtocolPreviewDialog({
  open,
  protocol,
  previewContent,
  loading,
  onClose,
}: {
  open: boolean;
  protocol: MeetingProtocol | null;
  previewContent: string | null;
  loading: boolean;
  onClose: () => void;
}) {
  if (!protocol) return null;

  const previewType = getFilePreviewType(protocol.fileType);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[800px] max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="pr-8">{protocol.title}</DialogTitle>
          <DialogDescription>
            {fmtProtocolDate(protocol.meetingDate)} · {formatFileSize(protocol.fileSize)} · {protocol.fileName}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-[300px] max-h-[60vh] overflow-auto rounded-lg border bg-background">
          {loading ? (
            <div className="flex items-center justify-center h-[300px]">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : previewContent === "UNSUPPORTED" ? (
            <div className="flex flex-col items-center justify-center h-[300px] text-center p-6">
              <FileText className="size-10 text-muted-foreground mb-3" />
              <p className="text-[14px] font-medium text-[var(--tracker-text-main)]">
                Предпросмотр недоступен
              </p>
              <p className="text-[12px] text-muted-foreground mt-1">
                Скачайте файл для просмотра
              </p>
            </div>
          ) : previewType === "image" && previewContent ? (
            <img
              src={previewContent}
              alt={protocol.title}
              className="max-w-full h-auto mx-auto"
              style={{ maxHeight: "60vh", objectFit: "contain" }}
            />
          ) : previewType === "pdf" && previewContent ? (
            <iframe
              src={previewContent}
              title={protocol.title}
              className="w-full h-full min-h-[500px]"
              style={{ border: "none" }}
            />
          ) : previewType === "docx" && previewContent ? (
            <div
              className="p-6 prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: previewContent }}
              style={{
                maxHeight: "60vh",
                overflow: "auto",
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-[300px]">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Утилиты
// ============================================================================
