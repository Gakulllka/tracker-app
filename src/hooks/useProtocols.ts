"use client";
/**
 * useProtocols — CRUD протоколов встреч.
 * Загрузка, скачивание, удаление файлов протоколов.
 */
import { useState, useCallback } from "react";
import type { AuthData } from "./useAuth";
import {
  type MeetingProtocol,
  mapProtocolFromAPI,
} from "@/lib/protocols";

export function useProtocols(activeDomainId: string, authData: AuthData) {
  const [protocols, setProtocols] = useState<MeetingProtocol[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const currentUsername = authData.user.displayName || authData.user.username;

  /** Загрузить список протоколов */
  const fetchProtocols = useCallback(async () => {
    if (!activeDomainId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/protocols?domainId=${activeDomainId}`,
        { headers: { Authorization: `Bearer ${authData.token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.protocols)) {
          setProtocols(data.protocols.map(mapProtocolFromAPI));
        }
      }
    } catch {
      /* silent */
    }
    setLoading(false);
  }, [activeDomainId, authData.token]);

  /** Загрузить файл протокола */
  const uploadProtocol = useCallback(
    async (
      file: File,
      title: string,
      meetingDate: string,
      notes?: string
    ): Promise<boolean> => {
      if (!activeDomainId || !file) return false;

      // Валидация размера (10 МБ)
      if (file.size > 10 * 1024 * 1024) {
        return false;
      }

      setUploading(true);
      try {
        // Конвертируем файл в base64
        const base64 = await fileToBase64(file);

        const res = await fetch("/api/protocols", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: authData.token,
            domainId: activeDomainId,
            title,
            meetingDate,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            fileData: base64,
            notes: notes || "",
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.protocol) {
            setProtocols((prev) => [
              mapProtocolFromAPI(data.protocol),
              ...prev,
            ]);
            return true;
          }
        }
        return false;
      } catch {
        return false;
      } finally {
        setUploading(false);
      }
    },
    [activeDomainId, authData.token]
  );

  /** Удалить протокол */
  const deleteProtocol = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const res = await fetch(`/api/protocols?id=${id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${authData.token}` },
        });
        if (res.ok) {
          setProtocols((prev) => prev.filter((p) => p.id !== id));
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    [authData.token]
  );

  /** Скачать файл протокола */
  const downloadProtocol = useCallback(
    async (protocol: MeetingProtocol): Promise<void> => {
      try {
        const res = await fetch(
          `/api/protocols/${protocol.id}?token=${authData.token}`
        );
        if (!res.ok) return;

        const data = await res.json();
        if (!data.fileData) return;

        // Конвертируем base64 обратно в Blob и скачиваем
        const blob = base64ToBlob(data.fileData, protocol.fileType);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = protocol.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch {
        /* silent */
      }
    },
    [authData.token]
  );

  /** Получить данные для предпросмотра */
  const getPreviewData = useCallback(
    async (
      id: string
    ): Promise<{ fileData: string; fileType: string } | null> => {
      try {
        const res = await fetch(
          `/api/protocols/${id}?token=${authData.token}`
        );
        if (!res.ok) return null;
        const data = await res.json();
        if (!data.fileData) return null;
        return { fileData: data.fileData, fileType: data.fileType };
      } catch {
        return null;
      }
    },
    [authData.token]
  );

  return {
    protocols,
    loading,
    uploading,
    fetchProtocols,
    uploadProtocol,
    deleteProtocol,
    downloadProtocol,
    getPreviewData,
    currentUsername,
  };
}

/** Конвертирует File в base64 строку */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Убираем префикс "data:...;base64,"
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Конвертирует base64 строку в Blob */
function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}
