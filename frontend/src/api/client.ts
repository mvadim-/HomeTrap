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
