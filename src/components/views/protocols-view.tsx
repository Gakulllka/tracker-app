"use client";
/**
 * ProtocolsView — вкладка "Протоколы встреч".
 * Загрузка, просмотр, скачивание и удаление файлов протоколов.
 */
import React, { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Upload,
  Download,
  Trash2,
  FileText,
  Eye,
  Calendar,
  User,
  Loader2,
  File,
  Image,
  FileSpreadsheet,
  X,
} from "lucide-react";
import type { MeetingProtocol } from "@/lib/protocols";
import {
  formatFileSize,
  fmtProtocolDate,
  getFilePreviewType,
  getFileIcon,
  base64ToArrayBuffer,
} from "@/lib/protocols";
import mammoth from "mammoth";
import {
  ProtocolUploadDialog,
  ProtocolPreviewDialog,
} from "@/components/views/protocol-dialogs";

interface ProtocolsViewProps {
  protocols: MeetingProtocol[];
  loading: boolean;
  uploading: boolean;
  fetchProtocols: () => Promise<void>;
  uploadProtocol: (
    file: File,
    title: string,
    meetingDate: string,
    notes?: string
  ) => Promise<boolean>;
  deleteProtocol: (id: string) => Promise<boolean>;
  downloadProtocol: (protocol: MeetingProtocol) => Promise<void>;
  getPreviewData: (
    id: string
  ) => Promise<{ fileData: string; fileType: string } | null>;
  currentUsername: string;
  isDark: boolean;
  isGuest: boolean;
}

export function ProtocolsView({
  protocols,
  loading,
  uploading,
  fetchProtocols,
  uploadProtocol,
  deleteProtocol,
  downloadProtocol,
  getPreviewData,
  currentUsername,
  isDark,
  isGuest,
}: ProtocolsViewProps) {
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [previewDialog, setPreviewDialog] = useState<{
    open: boolean;
    protocol: MeetingProtocol | null;
  }>({ open: false, protocol: null });
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Загружаем протоколы при монтировании
  useEffect(() => {
    fetchProtocols();
  }, [fetchProtocols]);

  // Открыть предпросмотр
  const handlePreview = useCallback(
    async (protocol: MeetingProtocol) => {
      setPreviewDialog({ open: true, protocol });
      setPreviewContent(null);
      setPreviewLoading(true);

      const data = await getPreviewData(protocol.id);
      if (!data) {
        setPreviewLoading(false);
        return;
      }

      const previewType = getFilePreviewType(data.fileType);

      if (previewType === "image") {
        setPreviewContent(
          `data:${data.fileType};base64,${data.fileData}`
        );
      } else if (previewType === "pdf") {
        const byteCharacters = atob(data.fileData);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        setPreviewContent(url);
      } else if (previewType === "docx") {
        try {
          const arrayBuffer = base64ToArrayBuffer(data.fileData);
          const result = await mammoth.convertToHtml({ arrayBuffer });
          setPreviewContent(result.value);
        } catch {
          setPreviewContent("Ошибка при конвертации DOCX файла");
        }
      } else {
        setPreviewContent("UNSUPPORTED");
      }

      setPreviewLoading(false);
    },
    [getPreviewData]
  );

  // Закрыть предпросмотр
  const handleClosePreview = useCallback(() => {
    // Освобождаем blob URL если был
    if (
      previewContent &&
      previewDialog.protocol?.fileType === "application/pdf" &&
      previewContent.startsWith("blob:")
    ) {
      URL.revokeObjectURL(previewContent);
    }
    setPreviewDialog({ open: false, protocol: null });
    setPreviewContent(null);
  }, [previewContent, previewDialog.protocol]);

  // Удалить протокол
  const handleDelete = useCallback(
    async (id: string) => {
      await deleteProtocol(id);
      setDeleteConfirm(null);
    },
    [deleteProtocol]
  );

  return (
    <div className="space-y-5">
      {/* Заголовок */}
      <div className="flex items-center justify-between">
        <div>
          <p className="paper-eyebrow">ДОКУМЕНТЫ</p>
          <h1 className="mt-0.5 text-[22px] font-bold tracking-tight text-[var(--tracker-text-main)]">
            Протоколы встреч
          </h1>
        </div>
        {!isGuest && (
          <Button
            onClick={() => setUploadDialogOpen(true)}
            className="gap-2"
          >
            <Upload className="size-4" />
            Загрузить
          </Button>
        )}
      </div>

      {/* Список протоколов */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : protocols.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div
            className="size-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: "var(--tracker-accent-bg)" }}
          >
            <FileText
              className="size-7"
              style={{ color: "var(--tracker-accent)" }}
            />
          </div>
          <p className="text-[15px] font-semibold text-[var(--tracker-text-main)]">
            Нет протоколов
          </p>
          <p className="text-[13px] text-muted-foreground mt-1 max-w-[260px]">
            Загрузите первый протокол встречи, чтобы начать
          </p>
          {!isGuest && (
            <Button
              variant="outline"
              className="mt-4 gap-2"
              onClick={() => setUploadDialogOpen(true)}
            >
              <Upload className="size-4" />
              Загрузить файл
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {protocols.map((protocol) => (
            <ProtocolCard
              key={protocol.id}
              protocol={protocol}
              isGuest={isGuest}
              onPreview={() => handlePreview(protocol)}
              onDownload={() => downloadProtocol(protocol)}
              onDelete={() => setDeleteConfirm(protocol.id)}
            />
          ))}
        </div>
      )}

      {/* Диалог загрузки */}
      <ProtocolUploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        onUpload={uploadProtocol}
        uploading={uploading}
        currentUsername={currentUsername}
      />

      {/* Диалог предпросмотра */}
      <ProtocolPreviewDialog
        open={previewDialog.open}
        protocol={previewDialog.protocol}
        previewContent={previewContent}
        loading={previewLoading}
        onClose={handleClosePreview}
      />

      {/* Подтверждение удаления */}
      <Dialog
        open={!!deleteConfirm}
        onOpenChange={() => setDeleteConfirm(null)}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Удалить протокол?</DialogTitle>
            <DialogDescription>
              Это действие нельзя отменить. Протокол будет удалён навсегда.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirm(null)}
            >
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
            >
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// Карточка протокола
// ============================================================================

function ProtocolCard({
  protocol,
  isGuest,
  onPreview,
  onDownload,
  onDelete,
}: {
  protocol: MeetingProtocol;
  isGuest: boolean;
  onPreview: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const previewType = getFilePreviewType(protocol.fileType);
  const canPreview = previewType !== "unsupported";

  return (
    <div
      className="card group hover:translate-y-[-1px] transition-all duration-150"
      style={{
        background: "var(--tracker-card)",
        borderRadius: "var(--radius-card, 14px)",
        padding: "18px 20px",
        boxShadow: "var(--shadow-card)",
        border: "1px solid var(--tracker-border)",
      }}
    >
      <div className="flex items-start gap-4">
        {/* Иконка файла */}
        <div
          className="size-11 rounded-xl flex items-center justify-center shrink-0 text-lg"
          style={{ background: "var(--tracker-accent-bg)" }}
        >
          {getFileIcon(protocol.fileType)}
        </div>

        {/* Информация */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-[14px] font-semibold text-[var(--tracker-text-main)] truncate">
              {protocol.title}
            </h3>
          </div>

          <div className="flex items-center gap-3 mt-1.5 text-[12px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="size-3" />
              {fmtProtocolDate(protocol.meetingDate)}
            </span>
            <span className="flex items-center gap-1">
              <File className="size-3" />
              {formatFileSize(protocol.fileSize)}
            </span>
            {protocol.author && (
              <span className="flex items-center gap-1">
                <User className="size-3" />
                {protocol.author}
              </span>
            )}
          </div>

          {protocol.notes && (
            <p className="text-[12px] text-muted-foreground mt-2 line-clamp-2">
              {protocol.notes}
            </p>
          )}
          {!canPreview && (
            <p className="text-[11px] text-muted-foreground mt-1.5 italic">
              Предпросмотр недоступен для этого типа файла. Скачайте для просмотра.
            </p>
          )}
        </div>

        {/* Действия */}
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="sm"
            onClick={onPreview}
            className="h-8 px-2 gap-1"
            title={canPreview ? "Просмотреть файл" : "Предпросмотр недоступен для этого типа файла"}
          >
            <Eye className="size-3.5" />
            <span className="text-[12px]">Просмотр</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDownload}
            className="h-8 px-2 gap-1"
          >
            <Download className="size-3.5" />
            <span className="text-[12px]">Скачать</span>
          </Button>
          {!isGuest && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="h-8 px-2 gap-1 text-destructive hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Диалог загрузки
// ============================================================================
