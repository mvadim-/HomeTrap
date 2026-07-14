import { InvoiceStatus } from "../api/client";

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Чернетка",
  issued: "Виставлений",
  paid: "Оплачений",
};

export const INVOICE_STATUS_OPTIONS: Array<{ value: InvoiceStatus; label: string }> = [
  { value: "draft", label: INVOICE_STATUS_LABELS.draft },
  { value: "issued", label: INVOICE_STATUS_LABELS.issued },
  { value: "paid", label: INVOICE_STATUS_LABELS.paid },
];

export function InvoiceStatusBadge({
  status,
  overdue = false,
}: {
  status: InvoiceStatus | null;
  overdue?: boolean;
}) {
  const className = overdue ? "overdue" : status ?? "draft";
  const label = overdue ? "Прострочений" : status ? INVOICE_STATUS_LABELS[status] : "Без рахунків";
  return <span className={`status-badge ${className}`}>{label}</span>;
}
