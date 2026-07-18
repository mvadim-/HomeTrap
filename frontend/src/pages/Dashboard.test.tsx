import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, vi } from "vitest";

import * as apiClient from "../api/client";
import { Dashboard } from "./Dashboard";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function mockDashboardShell(apartments: apiClient.Apartment[] = []) {
  vi.spyOn(apiClient, "getDashboard").mockResolvedValue({
    period: "2026-07-01",
    charged: "0.00",
    paid: "0.00",
    outstanding: "0.00",
    needs_attention: [],
  });
  vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
  vi.spyOn(apiClient, "getIncomeStats").mockResolvedValue({
    scope: "portfolio",
    apartment_id: null,
    months: 12,
    values: [],
    totals: { rent: "0.00", utilities: "0.00", total: "0.00" },
    top_service: null,
  });
}

describe("Dashboard", () => {
  it("renders portfolio metrics, apartment statuses and attention items", async () => {
    vi.spyOn(apiClient, "getDashboard").mockResolvedValue({
      period: "2026-07-01",
      charged: "16731.51",
      paid: "12000.00",
      outstanding: "4731.51",
      needs_attention: [{
        invoice_id: 7,
        apartment_id: 1,
        apartment_name: "Квартира на Подолі",
        period: "2026-06-01",
        status: "issued",
        grand_total: "4731.51",
        reason: "unpaid",
      }, {
        invoice_id: 8,
        apartment_id: 2,
        apartment_name: "Вільна квартира",
        period: "2026-07-01",
        status: "draft",
        grand_total: "4500.00",
        reason: "draft",
      }, {
        invoice_id: 9,
        apartment_id: 3,
        apartment_name: "Квартира на Печерську",
        period: "2026-07-01",
        status: "issued",
        grand_total: "5100.00",
        reason: "unpaid",
      }],
    });
    vi.spyOn(apiClient, "getApartments").mockResolvedValue([{
      id: 1,
      name: "Квартира на Подолі",
      address: "Київ, вул. Верхній Вал, 10",
      rent_amount: "325.00",
      rent_currency: "USD",
      notes: null,
      is_active: true,
      current_tenant_name: "Оксана Коваль",
      latest_invoice: {
        id: 7,
        period: "2026-07-01",
        status: "issued",
        grand_total: "16731.51",
      },
    }, {
      id: 2,
      name: "Вільна квартира",
      address: "Вільна квартира",
      rent_amount: "450.00",
      rent_currency: "USD",
      notes: null,
      is_active: true,
      current_tenant_name: null,
      latest_invoice: null,
    }]);
    const getIncomeStats = vi.spyOn(apiClient, "getIncomeStats").mockResolvedValue({
      scope: "portfolio",
      apartment_id: null,
      months: 12,
      values: [],
      totals: { rent: "120000.00", utilities: "23456.78", total: "143456.78" },
      top_service: null,
    });
    vi.spyOn(apiClient, "getUpcomingBilling").mockResolvedValue([]);

    render(<MemoryRouter><Dashboard /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "Дашборд" })).toBeInTheDocument();
    expect(screen.getByText("Нараховано")).toBeInTheDocument();
    expect(screen.getAllByText(/16.?731,51 ₴/).length).toBeGreaterThan(0);
    expect(await screen.findByText(/143.?456,78 ₴/)).toBeInTheDocument();
    expect(screen.getByText("оренда + комунальні")).toHaveClass("metric-note", "note-pos");
    expect(screen.getByText("Чернеток: 1")).toHaveClass("metric-note");
    expect(screen.getByText("Неоплачених: 2")).toHaveClass("metric-note", "note-neg");
    expect(getIncomeStats).toHaveBeenCalledWith(undefined, { months: 12 });
    expect(screen.getAllByText("Квартира на Подолі")).toHaveLength(2);
    expect(screen.getByText("Виставлений")).toBeInTheDocument();
    expect(screen.getByText("Прострочена оплата")).toBeInTheDocument();
    expect(screen.getByText("Завершіть чернетку")).toBeInTheDocument();
    expect(screen.getByText("Очікує оплати")).toBeInTheDocument();
    expect(screen.getByText("Оксана К. · оренда 325 $")).toBeInTheDocument();
    expect(screen.getByText("Квартира вільна")).toBeInTheDocument();

    for (const label of ["Оплачено", "Заборгованість"]) {
      const value = screen.getByText(label).nextElementSibling;
      expect(value).not.toHaveClass("metric-note");
      expect(value).not.toHaveClass("note-pos");
      expect(value).not.toHaveClass("note-neg");
    }
    const apartmentCard = screen.getByText("Квартира на Подолі", { selector: "h3" }).closest(".apartment-card");
    expect(apartmentCard).toHaveClass("dashboard-apartment-row");
    expect(apartmentCard?.parentElement).toHaveClass("dashboard-apartments-list");
    expect(apartmentCard?.querySelector(".apartment-avatar")).toHaveTextContent("К");
    expect(screen.queryByText("Вільна квартира", { selector: ".apartment-address" })).not.toBeInTheDocument();

    const attentionItems = screen.getAllByRole("listitem");
    expect(attentionItems[0].querySelector(".attention-dot")).toHaveClass("rose");
    expect(attentionItems[1].querySelector(".attention-dot")).toHaveClass("amber");
    expect(attentionItems[2].querySelector(".attention-dot")).toHaveClass("muted");
  });

  it("does not mark zero outstanding debt as negative", async () => {
    vi.spyOn(apiClient, "getDashboard").mockResolvedValue({
      period: "2026-07-01",
      charged: "0.00",
      paid: "0.00",
      outstanding: "0.00",
      needs_attention: [],
    });
    vi.spyOn(apiClient, "getApartments").mockResolvedValue([]);
    vi.spyOn(apiClient, "getIncomeStats").mockResolvedValue({
      scope: "portfolio",
      apartment_id: null,
      months: 12,
      values: [],
      totals: { rent: "0.00", utilities: "0.00", total: "0.00" },
      top_service: null,
    });
    vi.spyOn(apiClient, "getUpcomingBilling").mockResolvedValue([]);

    render(<MemoryRouter><Dashboard /></MemoryRouter>);

    expect(await screen.findByText("Заборгованість")).toBeInTheDocument();
    expect(screen.queryByText(/Чернеток:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Неоплачених:/)).not.toBeInTheDocument();
  });

  it("keeps the dashboard available when income statistics fail", async () => {
    vi.spyOn(apiClient, "getDashboard").mockResolvedValue({
      period: "2026-07-01",
      charged: "1000.00",
      paid: "1000.00",
      outstanding: "0.00",
      needs_attention: [],
    });
    vi.spyOn(apiClient, "getApartments").mockResolvedValue([]);
    vi.spyOn(apiClient, "getIncomeStats").mockRejectedValue(new Error("income unavailable"));
    vi.spyOn(apiClient, "getUpcomingBilling").mockResolvedValue([]);

    render(<MemoryRouter><Dashboard /></MemoryRouter>);

    expect(await screen.findByText("Дохід за 12 місяців")).toBeInTheDocument();
    const incomeCard = screen.getByText("Дохід за 12 місяців").closest(".metric-card");
    expect(incomeCard).toHaveTextContent("—");
    expect(incomeCard).not.toHaveTextContent("оренда + комунальні");
    expect(screen.queryByText("Не вдалося завантажити дашборд.")).not.toBeInTheDocument();
  });

  it("renders upcoming billing sorted by date, highlights missing invoices and links to details", async () => {
    mockDashboardShell([{
      id: 2,
      name: "Печерськ",
      address: "Київ",
      rent_amount: "500.00",
      rent_currency: "USD",
      notes: null,
      is_active: true,
      current_tenant_name: "Ірина",
      latest_invoice: {
        id: 42,
        period: "2099-07-01",
        status: "draft",
        grand_total: "1000.00",
      },
    }]);
    vi.spyOn(apiClient, "getUpcomingBilling").mockResolvedValue([
      {
        apartment_id: 3,
        apartment_name: "Липки",
        tenant_id: 13,
        tenant_name: "Марія Бондар",
        next_billing_date: "2099-07-20",
        period: "2099-07-01",
        invoice_status: null,
        is_overdue: false,
      },
      {
        apartment_id: 2,
        apartment_name: "Печерськ",
        tenant_id: 12,
        tenant_name: "Ірина Коваль",
        next_billing_date: "2099-07-19",
        period: "2099-07-01",
        invoice_status: "draft",
        is_overdue: false,
      },
      {
        apartment_id: 1,
        apartment_name: "Поділ",
        tenant_id: 11,
        tenant_name: "Олег Шевченко",
        next_billing_date: "2099-07-18",
        period: "2099-07-01",
        invoice_status: null,
        is_overdue: true,
      },
    ]);

    render(<MemoryRouter><Dashboard /></MemoryRouter>);

    const table = await screen.findByRole("table", { name: "Найближчі виставлення" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell")[0].textContent)).toEqual([
      "Поділ",
      "Печерськ",
      "Липки",
    ]);
    expect(within(rows[0]).getByText("Без рахунків")).toBeInTheDocument();
    expect(rows[0]).toHaveClass("upcoming-billing-warning");
    expect(rows[1]).not.toHaveClass("upcoming-billing-warning");
    expect(rows[2]).not.toHaveClass("upcoming-billing-warning");
    expect(within(table).getByRole("link", { name: "Поділ" })).toHaveAttribute("href", "/apartments/1");
    expect(within(table).getByRole("link", { name: "Печерськ" })).toHaveAttribute("href", "/invoices/42");
    expect(within(table).getByText("Ірина Коваль")).toBeInTheDocument();
    expect(within(table).getByText("Чернетка")).toBeInTheDocument();
  });

  it("shows the upcoming billing empty state", async () => {
    mockDashboardShell();
    vi.spyOn(apiClient, "getUpcomingBilling").mockResolvedValue([]);

    render(<MemoryRouter><Dashboard /></MemoryRouter>);

    expect(await screen.findByText("У найближчі 30 днів виставлень немає.")).toBeInTheDocument();
  });

  it("keeps the dashboard available when upcoming billing fails", async () => {
    mockDashboardShell();
    vi.spyOn(apiClient, "getUpcomingBilling").mockRejectedValue(new Error("upcoming unavailable"));

    render(<MemoryRouter><Dashboard /></MemoryRouter>);

    expect(await screen.findByText("Не вдалося завантажити найближчі виставлення.")).toHaveAttribute("role", "alert");
    expect(screen.getByRole("heading", { name: "Дашборд" })).toBeInTheDocument();
    expect(screen.queryByText("Не вдалося завантажити дашборд.")).not.toBeInTheDocument();
  });
});
