/**
 * protocols.ts — типы и утилиты для системы протоколов встреч.
 */

export interface MeetingProtocol {
  id: string;
  domainId: string;
  title: string;
  meetingDate: string; // ISO
  fileName: string;
  fileType: string;
  fileSize: number;
  author: string;
  notes: string;
  createdAt: string;
}

/** Маппинг из API-ответа в клиентский тип */
export function mapProtocolFromAPI(p: Record<string, unknown>): MeetingProtocol {
  return {
    id: p.id as string,
    domainId: p.domainId as string,
    title: p.title as string,
    meetingDate: p.meetingDate as string,
    fileName: p.fileName as string,
    fileType: p.fileType as string,
    fileSize: p.fileSize as number,
    author: (p.author as string) || "",
    notes: (p.notes as string) || "",
    createdAt: p.createdAt as string,
  };
}

/** Форматирует размер файла в читаемый вид */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

/** Форматирует ISO-дату в читаемый вид */
export function fmtProtocolDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

/** Определяет тип файла для предпросмотра */
export function getFilePreviewType(fileType: string): "image" | "pdf" | "docx" | "unsupported" {
  if (fileType.startsWith("image/")) return "image";
  if (fileType === "application/pdf") return "pdf";
  if (fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  return "unsupported";
}

/** Иконка по MIME-типу */
export function getFileIcon(fileType: string): string {
  if (fileType.startsWith("image/")) return "🖼️";
  if (fileType === "application/pdf") return "📄";
  if (fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "📝";
  if (fileType.includes("spreadsheet") || fileType.includes("excel") || fileType.endsWith(".xlsx") || fileType.endsWith(".xls")) return "📊";
  return "📎";
}
