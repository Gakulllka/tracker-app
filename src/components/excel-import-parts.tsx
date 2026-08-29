import React, { useState, useRef } from "react";
import { AlertTriangle, ArrowRight, Check, FileSpreadsheet, Info, Loader2, RefreshCw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RowKind, DiffRow } from "@/lib/excel-import";

/**
 * Части интерфейса импорта Excel: значки, чипы, строка сверки, зона
 * перетаскивания файла, подсказка по формату и блок ошибки.
 *
 * Разбор файла и сверка с месяцем — в lib/excel-import.ts. Здесь только
 * отображение результата, никакой логики.
 */

export function KindBadge({ kind }: { kind: RowKind }) {
  const map: Record<RowKind, { label: string; bg: string; color: string; border: string }> = {
    new: {
      label: "НОВАЯ",
      bg: "var(--tracker-accent)",
      color: "#fff",
      border: "var(--tracker-accent)",
    },
    changed: {
      label: "ИЗМЕНЕНА",
      bg: "rgba(245,158,11,.15)",
      color: "#b45309",
      border: "rgba(245,158,11,.35)",
    },
    same: {
      label: "БЕЗ ИЗМЕНЕНИЙ",
      bg: "rgba(148,163,184,.10)",
      color: "var(--tracker-text-muted)",
      border: "var(--tracker-border)",
    },
  };
  const s = map[kind];
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 99,
        background: s.bg,
        color: s.color,
        letterSpacing: ".06em",
        border: `1px solid ${s.border}`,
        flexShrink: 0,
        whiteSpace: "nowrap",
        lineHeight: 1.6,
      }}
    >
      {s.label}
    </span>
  );
}

export function Chip({ label, color, dim = false }: { label: string; color: string; dim?: boolean }) {
  return (
    <span
      style={{
        fontSize: 11,
        padding: "2px 8px",
        borderRadius: 99,
        border: `1px solid ${color}33`,
        color: dim ? "var(--tracker-text-muted)" : color,
        background: dim ? "transparent" : `${color}12`,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        maxWidth: 200,
      }}
    >
      {label}
    </span>
  );
}

export function StatPill({
  count,
  label,
  color,
  bg,
  active,
  onClick,
  icon,
}: {
  count: number;
  label: string;
  color: string;
  bg: string;
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        padding: "6px 12px",
        borderRadius: 8,
        background: active ? bg : "transparent",
        border: `1px solid ${active ? color : "var(--tracker-border)"}`,
        color: active ? color : "var(--tracker-text-muted)",
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        transition: "all .15s",
        whiteSpace: "nowrap",
      }}
    >
      {icon}
      <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{count}</span>
      <span>{label}</span>
    </button>
  );
}

/* ───────────────────────────────────────────────────────────────────────── */
/*  Single row in the diff list                                              */
/* ───────────────────────────────────────────────────────────────────────── */

export function TaskRow({
  row,
  onToggle,
  onToggleChange,
}: {
  row: DiffRow;
  onToggle: () => void;
  onToggleChange: (i: number) => void;
}) {
  const borderColor =
    row.kind === "new"
      ? "var(--tracker-accent)"
      : row.kind === "changed"
      ? "rgba(245,158,11,.45)"
      : "var(--tracker-border)";
  const dimmed = !row.selected && row.kind !== "same";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.2fr)",
        borderRadius: 10,
        overflow: "hidden",
        border: `1px solid ${borderColor}`,
        opacity: dimmed ? 0.45 : 1,
        transition: "opacity .15s, transform .15s, box-shadow .15s",
        boxShadow: row.selected && row.kind !== "same" ? `0 1px 3px ${borderColor}33` : "none",
      }}
    >
      {/* LEFT — task identity */}
      <div
        onClick={row.kind !== "same" ? onToggle : undefined}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          padding: "11px 14px",
          background: "var(--tracker-bg-card)",
          cursor: row.kind !== "same" ? "pointer" : "default",
          borderRight: "1px solid var(--tracker-border)",
        }}
      >
        {row.kind !== "same" && (
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              flexShrink: 0,
              marginTop: 2,
              border: `2px solid ${row.selected ? borderColor : "var(--tracker-border)"}`,
              background: row.selected ? borderColor : "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all .15s",
            }}
          >
            {row.selected && <Check style={{ width: 11, height: 11, color: "#fff", strokeWidth: 3 }} />}
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4, flexWrap: "wrap" }}>
            {row.imported.num && (
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontWeight: 700,
                  color: row.kind === "new" ? "var(--tracker-accent)" : "var(--tracker-text-muted)",
                }}
              >
                #{row.imported.num}
              </span>
            )}
            <KindBadge kind={row.kind} />
            {row.imported.warnings.length > 0 && (
              <span
                title={row.imported.warnings.join("\n")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "2px 7px",
                  borderRadius: 99,
                  background: "rgba(245,158,11,.12)",
                  color: "#b45309",
                  border: "1px solid rgba(245,158,11,.35)",
                }}
              >
                <AlertTriangle style={{ width: 10, height: 10 }} />
                {row.imported.warnings.length} замеч.
              </span>
            )}
          </div>
          <p
            style={{
              fontSize: 13,
              color: "var(--tracker-text-main)",
              lineHeight: 1.4,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {row.imported.name || (
              <span style={{ color: "var(--tracker-text-muted)", fontStyle: "italic" }}>
                без названия (стр. {row.imported.rowIndex})
              </span>
            )}
          </p>
        </div>
      </div>

      {/* RIGHT — changes / preview */}
      <div
        style={{
          padding: "11px 14px",
          background: "var(--tracker-bg-main)",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          justifyContent: "center",
          minWidth: 0,
        }}
      >
        {row.kind === "new" && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            <Chip label={row.imported.status} color="var(--tracker-accent)" />
            <Chip label={row.imported.priority} color="var(--tracker-text-muted)" dim />
            {row.imported.planH && (
              <Chip label={`план ${row.imported.planH} ч`} color="var(--tracker-text-muted)" dim />
            )}
            {row.imported.factH && (
              <Chip label={`факт ${row.imported.factH} ч`} color="var(--tracker-text-muted)" dim />
            )}
          </div>
        )}

        {row.kind === "changed" &&
          row.changes.map((c, i) => (
            <div
              key={c.key}
              onClick={() => onToggleChange(i)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                cursor: "pointer",
                opacity: row.selectedChanges[i] ? 1 : 0.35,
                transition: "opacity .15s",
                minWidth: 0,
              }}
            >
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  flexShrink: 0,
                  border: `1.5px solid ${row.selectedChanges[i] ? "rgba(245,158,11,.85)" : "var(--tracker-border)"}`,
                  background: row.selectedChanges[i] ? "rgba(245,158,11,.85)" : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {row.selectedChanges[i] && <Check style={{ width: 9, height: 9, color: "#fff", strokeWidth: 3 }} />}
              </div>
              <span style={{ fontSize: 11, color: "var(--tracker-text-muted)", flexShrink: 0, width: 76 }}>
                {c.label}
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: "var(--tracker-text-muted)",
                  flexShrink: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  textDecoration: "line-through",
                  textDecorationColor: "var(--tracker-border)",
                }}
              >
                {c.from || "—"}
              </span>
              <ArrowRight style={{ width: 12, height: 12, color: "var(--tracker-accent)", flexShrink: 0 }} />
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--tracker-accent)",
                  flexShrink: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {c.to || "—"}
              </span>
            </div>
          ))}

        {row.kind === "same" && (
          <span
            style={{
              fontSize: 12,
              color: "var(--tracker-text-muted)",
              fontStyle: "italic",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Check style={{ width: 12, height: 12 }} />
            совпадает с текущей
          </span>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────────── */
/*  Drop zone                                                                */
/* ───────────────────────────────────────────────────────────────────────── */

export function DropZone({ onFile, loading }: { onFile: (f: File) => void; loading: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation(); // изоляция от глобального drop на <SidebarInset>
        setDrag(true);
      }}
      onDragLeave={(e) => { e.stopPropagation(); setDrag(false); }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDrag(false);
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
      onClick={() => ref.current?.click()}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "18px 22px",
        borderRadius: 12,
        cursor: "pointer",
        transition: "all .18s",
        border: `2px dashed ${drag ? "var(--tracker-accent)" : "#17181C"}`,
        background: drag ? "var(--tracker-accent-bg)" : "transparent",
      }}
    >
      <input
        ref={ref}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      {loading ? (
        <>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "var(--tracker-accent-bg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Loader2
              style={{ width: 20, height: 20, color: "var(--tracker-accent)" }}
              className="animate-spin"
            />
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--tracker-text-main)" }}>Читаем файл…</p>
            <p style={{ fontSize: 11, color: "var(--tracker-text-muted)", marginTop: 2 }}>
              Сравним содержимое с задачами текущего месяца
            </p>
          </div>
        </>
      ) : (
        <>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "var(--tracker-accent-bg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <FileSpreadsheet style={{ width: 20, height: 20, color: "var(--tracker-accent)" }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--tracker-text-main)" }}>
              Перетащите файл или нажмите, чтобы выбрать
            </p>
            <p style={{ fontSize: 11, color: "var(--tracker-text-muted)", marginTop: 3 }}>
              .xlsx или .xls · сверка по колонке <b style={{ color: "var(--tracker-text-main)" }}>«Номер»</b>
            </p>
          </div>
          <Upload
            style={{
              width: 18,
              height: 18,
              color: "var(--tracker-text-muted)",
              flexShrink: 0,
            }}
          />
        </>
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────────── */
/*  Empty/help states                                                        */
/* ───────────────────────────────────────────────────────────────────────── */

export function FormatHint() {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "12px 14px",
        borderRadius: 10,
        background: "var(--tracker-bg-card)",
        border: "2px solid #17181C",
      }}
    >
      <Info
        style={{ width: 16, height: 16, color: "var(--tracker-accent)", flexShrink: 0, marginTop: 2 }}
      />
      <div style={{ fontSize: 12, color: "var(--tracker-text-muted)", lineHeight: 1.55 }}>
        <p style={{ color: "var(--tracker-text-main)", fontWeight: 600, marginBottom: 4 }}>
          Какой формат файла поддерживается
        </p>
        <p>
          Первая строка листа — заголовки. Распознаются:{" "}
          <b style={{ color: "var(--tracker-text-main)" }}>Номер</b>,{" "}
          <b style={{ color: "var(--tracker-text-main)" }}>Задача</b>,{" "}
          <b style={{ color: "var(--tracker-text-main)" }}>Трудоёмкость предв, ч</b>,{" "}
          <b style={{ color: "var(--tracker-text-main)" }}>Часы фактические</b>,{" "}
          <b style={{ color: "var(--tracker-text-main)" }}>Приоритет</b>,{" "}
          <b style={{ color: "var(--tracker-text-main)" }}>Статус</b>,{" "}
          <b style={{ color: "var(--tracker-text-main)" }}>Комментарий</b>. Порядок колонок неважен; синонимы тоже
          подойдут. Удобнее всего: экспортировать месяц в Excel, поправить в любимой программе, импортировать обратно.
        </p>
      </div>
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "14px 16px",
        borderRadius: 10,
        background: "rgba(239,68,68,.06)",
        border: "1px solid rgba(239,68,68,.35)",
      }}
    >
      <AlertTriangle style={{ width: 18, height: 18, color: "#dc2626", flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "#b91c1c", marginBottom: 4 }}>Не получилось прочитать файл</p>
        <p
          style={{
            fontSize: 12,
            color: "var(--tracker-text-main)",
            whiteSpace: "pre-wrap",
            lineHeight: 1.55,
          }}
        >
          {message}
        </p>
      </div>
      <Button variant="outline" size="sm" className="h-7 gap-1.5" onClick={onRetry}>
        <RefreshCw style={{ width: 12, height: 12 }} />
        Заново
      </Button>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────────────── */
/*  Main component                                                           */
/* ───────────────────────────────────────────────────────────────────────── */
