import { Badge } from "@platform/ui";

const ORDER: Record<string, { label: string; tone: "neutral" | "info" | "warning" | "success" | "danger" | "primary" }> = {
  draft: { label: "Draft", tone: "neutral" },
  confirmed: { label: "Confirmed", tone: "info" },
  processing: { label: "Processing", tone: "info" },
  ready: { label: "Ready", tone: "primary" },
  dispatched: { label: "Dispatched", tone: "warning" },
  delivered: { label: "Delivered", tone: "success" },
  cancelled: { label: "Cancelled", tone: "danger" },
};
const PAYMENT: Record<string, { label: string; tone: "neutral" | "warning" | "success" | "danger" }> = {
  unpaid: { label: "Unpaid", tone: "danger" },
  partially_paid: { label: "Part-paid", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  refunded: { label: "Refunded", tone: "neutral" },
};
const PRIORITY: Record<string, { label: string; tone: "neutral" | "info" | "warning" | "danger" }> = {
  low: { label: "Low", tone: "neutral" }, medium: { label: "Medium", tone: "info" }, high: { label: "High", tone: "warning" }, urgent: { label: "Urgent", tone: "danger" },
};

export const ORDER_STATUSES = Object.keys(ORDER);
export const orderStatusLabel = (s: string) => ORDER[s]?.label ?? s;

export function OrderStatusBadge({ status }: { status: string }) {
  const s = ORDER[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}
export function PaymentStatusBadge({ status }: { status: string }) {
  const s = PAYMENT[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
export function PriorityBadge({ priority }: { priority: string }) {
  const s = PRIORITY[priority] ?? { label: priority, tone: "neutral" as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
