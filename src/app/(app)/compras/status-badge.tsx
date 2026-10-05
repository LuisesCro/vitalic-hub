import { PAY_STATUS_LABEL, type PayStatus } from "@/lib/payables";

const TONES: Record<PayStatus, { bg: string; fg: string }> = {
  pagada: { bg: "var(--good-bg)", fg: "var(--good)" },
  abonada: { bg: "var(--warn-bg)", fg: "var(--warn)" },
  pendiente: { bg: "var(--surface-2)", fg: "var(--text)" },
  vencida: { bg: "var(--bad-bg)", fg: "var(--bad)" },
};

export function PayBadge({ status, daysOverdue }: { status: PayStatus; daysOverdue?: number }) {
  const t = TONES[status];
  return (
    <span className="badge" style={{ background: t.bg, color: t.fg }}>
      {PAY_STATUS_LABEL[status]}{status === "vencida" && daysOverdue ? ` · ${daysOverdue} d` : ""}
    </span>
  );
}
