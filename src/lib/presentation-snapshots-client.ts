export interface SnapshotVersion {
  id: string;
  versionNumber: number;
  monthlyTasksCount: number;
  backlogCount: number;
  ideasCount: number;
  total: number;
  versionType: "system" | "manual" | "rollback";
  createdByUsername: string;
  sourceVersionId: string;
  createdAt: string;
  active: boolean;
}

export interface SnapshotResponse {
  closed: boolean;
  active: SnapshotVersion | null;
  versions: SnapshotVersion[];
}

export async function fetchPresentationSnapshot(domainId: string, monthKey: string): Promise<SnapshotResponse> {
  const res = await fetch(`/api/presentation-snapshots?domainId=${encodeURIComponent(domainId)}&monthKey=${encodeURIComponent(monthKey)}`, { cache: "no-store" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Не удалось загрузить снимок");
  return data;
}

export async function updatePresentationSnapshot(token: string, domainId: string, monthKey: string, values: Pick<SnapshotVersion, "monthlyTasksCount" | "backlogCount" | "ideasCount">) {
  const res = await fetch("/api/presentation-snapshots", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, domainId, monthKey, ...values }) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Не удалось сохранить снимок");
}

export async function rollbackPresentationSnapshot(token: string, domainId: string, monthKey: string, versionId: string) {
  const res = await fetch("/api/presentation-snapshots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, domainId, monthKey, versionId }) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Не удалось выполнить откат");
}
