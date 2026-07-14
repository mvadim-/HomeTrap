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

export interface ConsumptionPoint {
  period: string;
  consumed: string;
}

export interface ConsumptionSeries {
  service_id: number;
  service_name: string;
  unit: string | null;
  values: ConsumptionPoint[];
}

export interface ConsumptionStats {
  apartment_id: number;
  months: number;
  series: ConsumptionSeries[];
}

export interface IncomePoint {
  period: string;
  rent: string;
  utilities: string;
  total: string;
}

export interface IncomeStats {
  scope: "apartment" | "portfolio";
  apartment_id: number | null;
  months: number;
  values: IncomePoint[];
  totals: {
    rent: string;
    utilities: string;
    total: string;
  };
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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  if (response.status === 401) {
    if (window.location.pathname !== "/login") {
      window.location.assign("/login");
    }
    throw new ApiError(401, "Потрібна авторизація");
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new ApiError(response.status, body?.detail ?? "Помилка запиту");
  }

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

export function getConsumptionStats(apartmentId: number, months = 12): Promise<ConsumptionStats> {
  const query = new URLSearchParams({ apartment_id: String(apartmentId), months: String(months) });
  return request<ConsumptionStats>(`/api/stats/consumption?${query.toString()}`);
}

export function getIncomeStats(apartmentId?: number, months = 12): Promise<IncomeStats> {
  const query = new URLSearchParams({ months: String(months) });
  if (apartmentId) query.set("apartment_id", String(apartmentId));
  return request<IncomeStats>(`/api/stats/income?${query.toString()}`);
}

export function getApartments(): Promise<Apartment[]> {
  return request<Apartment[]>("/api/apartments");
}

export function getApartment(id: number): Promise<Apartment> {
  return request<Apartment>(`/api/apartments/${id}`);
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

export function transitionInvoice(
  id: number,
  action: "issue" | "revert-to-draft" | "mark-paid" | "unmark-paid",
): Promise<Invoice> {
  return request<Invoice>(`/api/invoices/${id}/${action}`, { method: "POST" });
}
