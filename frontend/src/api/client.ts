export interface User {
  id: number;
  username: string;
}

export interface ExchangeRate {
  requested_date: string;
  rate_date: string;
  currency: string;
  rate: string;
  is_fallback: boolean;
}

export interface InvoiceSummary {
  id: number;
  period: string;
  status: "draft" | "issued" | "paid";
  grand_total: string;
}

export type InvoiceStatus = "draft" | "issued" | "paid";

export interface InvoiceListItem {
  id: number;
  apartment_id: number;
  period: string;
  status: InvoiceStatus;
  issued_at: string | null;
  paid_at: string | null;
  exchange_rate: string;
  rent_amount_usd: string;
  rent_amount_uah: string;
  utilities_total: string;
  grand_total: string;
}

export interface InvoiceLine {
  id: number;
  service_id: number;
  service_name: string;
  service_kind: "metered" | "fixed";
  prev_reading: string | null;
  curr_reading: string | null;
  consumed: string | null;
  tariff_value: string;
  amount: string;
}

export interface InvoiceWarning {
  code: string;
  service_id: number;
  message: string;
}

export interface Invoice extends InvoiceListItem {
  lines: InvoiceLine[];
  warnings: InvoiceWarning[];
}

export interface InvoiceUpdatePayload {
  exchange_rate: string;
  lines: Array<{ id: number; curr_reading: string | null }>;
}

export interface Apartment {
  id: number;
  name: string;
  address: string;
  rent_amount: string;
  rent_currency: string;
  notes: string | null;
  is_active: boolean;
  latest_invoice: InvoiceSummary | null;
  current_tenant_name: string | null;
}

export interface ApartmentPayload {
  name: string;
  address: string;
  rent_amount: string;
  rent_currency: "USD";
  notes: string | null;
  is_active?: boolean;
}

export interface TenantPayload {
  full_name: string;
  phone: string | null;
  email: string | null;
  contract_start: string;
  contract_end: string | null;
  billing_day: number | null;
  notes: string | null;
}

export interface Tenant extends TenantPayload {
  id: number;
  apartment_id: number;
}

export interface TenantAttachment {
  id: number;
  tenant_id: number;
  original_name: string;
  content_type: string;
  size_bytes: number;
  uploaded_at: string;
}

export interface DashboardAttentionItem {
  invoice_id: number;
  apartment_id: number;
  apartment_name: string;
  period: string;
  status: "draft" | "issued";
  grand_total: string;
  reason: "draft" | "unpaid";
}

export interface DashboardStats {
  period: string;
  charged: string;
  paid: string;
  outstanding: string;
  needs_attention: DashboardAttentionItem[];
}

export interface UpcomingBillingItem {
  apartment_id: number;
  apartment_name: string;
  tenant_id: number;
  tenant_name: string;
  billing_date: string;
  period: string;
  invoice_status: InvoiceStatus | null;
  is_overdue: boolean;
}

export interface ConsumptionPoint {
  period: string;
  consumed: string;
  cost: string;
}

export interface ConsumptionSummary {
  avg: string;
  min: string;
  max: string;
}

export interface ConsumptionSeries {
  service_id: number;
  service_name: string;
  unit: string | null;
  values: ConsumptionPoint[];
  summary: ConsumptionSummary;
}

export interface ConsumptionStats {
  apartment_id: number;
  months: number | null;
  series: ConsumptionSeries[];
}

export type StatsPeriod =
  | { months: number }
  | { all_time: true }
  | { date_from: string; date_to: string };

export interface IncomePoint {
  period: string;
  rent: string;
  utilities: string;
  total: string;
}

export interface IncomeStats {
  scope: "apartment" | "portfolio";
  apartment_id: number | null;
  months: number | null;
  values: IncomePoint[];
  totals: {
    rent: string;
    utilities: string;
    total: string;
  };
  top_service: {
    name: string;
    share_percent: string;
    peak_period: string;
  } | null;
}

export type ExpenseCategory = "repair" | "tax" | "insurance" | "commission" | "other";

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  repair: "Ремонт",
  tax: "Податок",
  insurance: "Страхування",
  commission: "Комісія",
  other: "Інше",
};

export interface Expense {
  id: number;
  apartment_id: number | null;
  date: string;
  category: ExpenseCategory;
  amount: string;
  currency: string;
  notes: string | null;
}

export interface ExpenseCreatePayload {
  apartment_id?: number | null;
  date: string;
  category: ExpenseCategory;
  amount: string;
  currency?: string;
  notes?: string | null;
}

export type ExpenseUpdatePayload = Partial<ExpenseCreatePayload>;

export interface PnlPoint {
  period: string;
  income: string;
  expenses: string;
  net: string;
}

export interface PnlTotals {
  income: string;
  expenses_total: string;
  expenses_by_category: Record<string, string>;
  net: string;
  margin_percent: string | null;
}

export interface PnlUnconverted {
  count: number;
  by_currency: Record<string, string>;
}

export interface PnlStats {
  scope: "apartment" | "portfolio";
  apartment_id: number | null;
  months: number | null;
  values: PnlPoint[];
  totals: PnlTotals;
  unconverted: PnlUnconverted;
}

export interface NotificationSettings {
  telegram: {
    enabled: boolean;
    token: string;
    chat_id: string;
  };
  email: {
    enabled: boolean;
    smtp_host: string;
    smtp_port: number;
    smtp_username: string;
    smtp_password: string;
    from_address: string;
    to_address: string;
    use_tls: boolean;
  };
  billing_reminder: {
    enabled: boolean;
    days_before: number;
    repeat_every_days: number;
    auto_draft: boolean;
  };
  push: {
    enabled: boolean;
  };
  readings_day: number;
  overdue_after_days: number;
  repeat_every_days: number;
}

export interface PushSubscriptionPayload {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PushSubscriptionResponse {
  endpoint: string;
  created_at: string;
}

export interface NotificationTestResult {
  deliveries: number;
  errors: string[];
}

export interface ImportReport {
  invoices_created: number;
  invoices_skipped: number;
  services_created: number;
  tariffs_created: number;
  warnings: string[];
}

export interface RestoreSummary {
  added: Record<string, number>;
  skipped: Record<string, number>;
}

export interface BackupDownload {
  blob: Blob;
  filename: string;
}

export interface Service {
  id: number;
  apartment_id: number;
  name: string;
  kind: "metered" | "fixed";
  unit: string | null;
  provider_account: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface ServicePayload {
  name: string;
  kind: "metered" | "fixed";
  unit: string | null;
  provider_account: string | null;
  sort_order: number;
  is_active?: boolean;
}

export interface Tariff {
  id: number;
  service_id: number;
  value: string;
  valid_from: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const browserNavigation = {
  toLogin: () => window.location.assign("/login"),
};

async function fetchResponse(path: string, options: RequestInit = {}): Promise<Response> {
  const isFormData = options.body instanceof FormData;
  const response = await fetch(path, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body && !isFormData ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  if (response.status === 401) {
    if (window.location.pathname !== "/login") {
      browserNavigation.toLogin();
    }
    throw new ApiError(401, "Потрібна авторизація");
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new ApiError(response.status, body?.detail ?? "Помилка запиту");
  }

  return response;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetchResponse(path, options);

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export function login(username: string, password: string): Promise<User> {
  return request<User>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function getCurrentUser(): Promise<User> {
  return request<User>("/api/auth/me");
}

export function logout(): Promise<void> {
  return request<void>("/api/auth/logout", { method: "POST" });
}

export function getCurrentRate(): Promise<ExchangeRate> {
  return request<ExchangeRate>("/api/rates/current");
}

export function getDashboard(): Promise<DashboardStats> {
  return request<DashboardStats>("/api/stats/dashboard");
}

export function getUpcomingBilling(): Promise<UpcomingBillingItem[]> {
  return request<UpcomingBillingItem[]>("/api/billing/upcoming");
}

function addStatsPeriod(query: URLSearchParams, period: StatsPeriod): void {
  if ("months" in period) {
    query.set("months", String(period.months));
  } else if ("all_time" in period) {
    query.set("all_time", "true");
  } else {
    query.set("date_from", period.date_from);
    query.set("date_to", period.date_to);
  }
}

export function getConsumptionStats(
  apartmentId: number,
  period: StatsPeriod = { months: 12 },
): Promise<ConsumptionStats> {
  const query = new URLSearchParams({ apartment_id: String(apartmentId) });
  addStatsPeriod(query, period);
  return request<ConsumptionStats>(`/api/stats/consumption?${query.toString()}`);
}

export function getIncomeStats(
  apartmentId?: number,
  period: StatsPeriod = { months: 12 },
): Promise<IncomeStats> {
  const query = new URLSearchParams();
  if (apartmentId) query.set("apartment_id", String(apartmentId));
  addStatsPeriod(query, period);
  return request<IncomeStats>(`/api/stats/income?${query.toString()}`);
}

export function getPnlStats(
  apartmentId?: number,
  period: StatsPeriod = { months: 12 },
): Promise<PnlStats> {
  const query = new URLSearchParams();
  if (apartmentId) query.set("apartment_id", String(apartmentId));
  addStatsPeriod(query, period);
  return request<PnlStats>(`/api/stats/pnl?${query.toString()}`);
}

export function getExpenses(
  filters: { apartmentId?: number; dateFrom?: string; dateTo?: string } = {},
): Promise<Expense[]> {
  const query = new URLSearchParams();
  if (filters.apartmentId) query.set("apartment_id", String(filters.apartmentId));
  if (filters.dateFrom) query.set("date_from", filters.dateFrom);
  if (filters.dateTo) query.set("date_to", filters.dateTo);
  const suffix = query.size ? `?${query.toString()}` : "";
  return request<Expense[]>(`/api/expenses${suffix}`);
}

export function createExpense(payload: ExpenseCreatePayload): Promise<Expense> {
  return request<Expense>("/api/expenses", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateExpense(id: number, payload: ExpenseUpdatePayload): Promise<Expense> {
  return request<Expense>(`/api/expenses/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteExpense(id: number): Promise<void> {
  return request<void>(`/api/expenses/${id}`, { method: "DELETE" });
}

export function getApartments(): Promise<Apartment[]> {
  return request<Apartment[]>("/api/apartments");
}

export function getApartment(id: number): Promise<Apartment> {
  return request<Apartment>(`/api/apartments/${id}`);
}

export function createApartment(payload: ApartmentPayload): Promise<Apartment> {
  return request<Apartment>("/api/apartments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateApartment(id: number, payload: ApartmentPayload): Promise<Apartment> {
  return request<Apartment>(`/api/apartments/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function archiveApartment(id: number): Promise<void> {
  return request<void>(`/api/apartments/${id}`, { method: "DELETE" });
}

export function getTenants(apartmentId: number): Promise<Tenant[]> {
  return request<Tenant[]>(`/api/apartments/${apartmentId}/tenants`);
}

export function createTenant(apartmentId: number, payload: TenantPayload): Promise<Tenant> {
  return request<Tenant>(`/api/apartments/${apartmentId}/tenants`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateTenant(tenantId: number, payload: TenantPayload): Promise<Tenant> {
  return request<Tenant>(`/api/tenants/${tenantId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function endTenantContract(tenantId: number, contractEnd: string): Promise<Tenant> {
  return request<Tenant>(`/api/tenants/${tenantId}/end-contract`, {
    method: "POST",
    body: JSON.stringify({ contract_end: contractEnd }),
  });
}

export function getTenantAttachments(tenantId: number): Promise<TenantAttachment[]> {
  return request<TenantAttachment[]>(`/api/tenants/${tenantId}/attachments`);
}

export function uploadTenantAttachments(
  tenantId: number,
  files: File[],
): Promise<TenantAttachment[]> {
  const body = new FormData();
  files.forEach((file) => body.append("files", file));
  return request<TenantAttachment[]>(`/api/tenants/${tenantId}/attachments`, {
    method: "POST",
    body,
  });
}

export function getAttachmentUrl(attachmentId: number): string {
  return `/api/attachments/${attachmentId}`;
}

export function deleteTenantAttachment(attachmentId: number): Promise<void> {
  return request<void>(`/api/attachments/${attachmentId}`, { method: "DELETE" });
}

export function getServices(apartmentId: number): Promise<Service[]> {
  return request<Service[]>(`/api/apartments/${apartmentId}/services`);
}

export function createService(apartmentId: number, payload: ServicePayload): Promise<Service> {
  return request<Service>(`/api/apartments/${apartmentId}/services`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateService(
  apartmentId: number,
  serviceId: number,
  payload: ServicePayload,
): Promise<Service> {
  return request<Service>(`/api/apartments/${apartmentId}/services/${serviceId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function getTariffs(serviceId: number): Promise<Tariff[]> {
  return request<Tariff[]>(`/api/services/${serviceId}/tariffs`);
}

export function createTariff(
  serviceId: number,
  payload: { value: string; valid_from: string },
): Promise<Tariff> {
  return request<Tariff>(`/api/services/${serviceId}/tariffs`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getInvoices(filters: {
  apartmentId?: number;
  status?: InvoiceStatus;
} = {}): Promise<InvoiceListItem[]> {
  const query = new URLSearchParams();
  if (filters.apartmentId) query.set("apartment_id", String(filters.apartmentId));
  if (filters.status) query.set("status", filters.status);
  const suffix = query.size ? `?${query.toString()}` : "";
  return request<InvoiceListItem[]>(`/api/invoices${suffix}`);
}

export function getInvoice(id: number): Promise<Invoice> {
  return request<Invoice>(`/api/invoices/${id}`);
}

export function createInvoice(apartmentId: number, period: string): Promise<Invoice> {
  return request<Invoice>(`/api/apartments/${apartmentId}/invoices`, {
    method: "POST",
    body: JSON.stringify({ period }),
  });
}

export function updateInvoice(id: number, payload: InvoiceUpdatePayload): Promise<Invoice> {
  return request<Invoice>(`/api/invoices/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteInvoice(id: number): Promise<void> {
  return request<void>(`/api/invoices/${id}`, { method: "DELETE" });
}

export function transitionInvoice(
  id: number,
  action: "issue" | "revert-to-draft" | "mark-paid" | "unmark-paid",
): Promise<Invoice> {
  return request<Invoice>(`/api/invoices/${id}/${action}`, { method: "POST" });
}

export function getNotificationSettings(): Promise<NotificationSettings> {
  return request<NotificationSettings>("/api/settings");
}

export function updateNotificationSettings(
  payload: NotificationSettings,
): Promise<NotificationSettings> {
  return request<NotificationSettings>("/api/settings", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function testNotification(): Promise<NotificationTestResult> {
  return request<NotificationTestResult>("/api/settings/test-notification", {
    method: "POST",
  });
}

export async function downloadBackup(): Promise<BackupDownload> {
  const response = await fetchResponse("/api/settings/backup");
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1]
    ?? "hometrap-backup.zip";
  return { blob: await response.blob(), filename };
}

export function restoreBackup(file: File): Promise<RestoreSummary> {
  const body = new FormData();
  body.append("file", file);
  return request<RestoreSummary>("/api/settings/restore", {
    method: "POST",
    body,
  });
}

export function getPushPublicKey(): Promise<{ public_key: string }> {
  return request<{ public_key: string }>("/api/push/public-key");
}

export function createPushSubscription(
  payload: PushSubscriptionPayload,
): Promise<PushSubscriptionResponse> {
  return request<PushSubscriptionResponse>("/api/push/subscriptions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deletePushSubscription(endpoint: string): Promise<void> {
  return request<void>("/api/push/subscriptions", {
    method: "DELETE",
    body: JSON.stringify({ endpoint }),
  });
}

export function importApartmentHistory(
  apartmentId: number,
  file: File,
  dryRun: boolean,
): Promise<ImportReport> {
  const body = new FormData();
  body.append("file", file);
  return request<ImportReport>(
    `/api/apartments/${apartmentId}/import?dry_run=${dryRun}`,
    { method: "POST", body },
  );
}
