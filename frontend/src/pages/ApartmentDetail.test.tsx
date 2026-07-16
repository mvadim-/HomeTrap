import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, vi } from "vitest";

import * as apiClient from "../api/client";
import { ApartmentDetail } from "./ApartmentDetail";

afterEach(() => vi.restoreAllMocks());

beforeEach(() => {
  vi.spyOn(apiClient, "getTenants").mockResolvedValue([]);
  vi.spyOn(apiClient, "getTenantAttachments").mockResolvedValue([]);
  vi.spyOn(apiClient, "getIncomeStats").mockResolvedValue({
    scope: "apartment",
    apartment_id: 1,
    months: 12,
    values: [],
    totals: { rent: "0.00", utilities: "0.00", total: "0.00" },
    top_service: null,
  });
});

describe("ApartmentDetail", () => {
  it("renders apartment details and the services tariff table", async () => {
    vi.spyOn(apiClient, "getApartment").mockResolvedValue({
      id: 1,
      name: "Квартира на Подолі",
      address: "Київ, вул. Верхній Вал, 10",
      rent_amount: "325.00",
      rent_currency: "USD",
      notes: "Код домофона 42",
      is_active: true,
      latest_invoice: { id: 14, period: "2026-06", status: "paid", grand_total: "15000.00" },
      current_tenant_name: "Оксана Коваль",
    });
    vi.mocked(apiClient.getTenants).mockResolvedValue([{
      id: 8, apartment_id: 1, full_name: "Оксана Коваль", phone: null, email: null,
      contract_start: "2026-01-15", contract_end: null, notes: null,
    }]);
    vi.mocked(apiClient.getIncomeStats).mockResolvedValue({
      scope: "apartment", apartment_id: 1, months: 12,
      values: [
        { period: "2026-05", rent: "13000.00", utilities: "2000.00", total: "15000.00" },
        { period: "2026-06", rent: "13000.00", utilities: "3000.00", total: "16000.00" },
      ],
      totals: { rent: "26000.00", utilities: "5000.00", total: "31000.00" },
      top_service: null,
    });
    vi.spyOn(apiClient, "getServices").mockResolvedValue([
      { id: 5, apartment_id: 1, name: "Газ", kind: "metered", unit: "м³", provider_account: "12345", sort_order: 10, is_active: true },
      { id: 6, apartment_id: 1, name: "Електроенергія", kind: "metered", unit: "кВт·год", provider_account: null, sort_order: 20, is_active: true },
      { id: 7, apartment_id: 1, name: "Холодна вода", kind: "metered", unit: "м³", provider_account: null, sort_order: 30, is_active: true },
      { id: 8, apartment_id: 1, name: "Утримання будинку", kind: "fixed", unit: null, provider_account: null, sort_order: 40, is_active: true },
    ]);
    vi.spyOn(apiClient, "getTariffs").mockImplementation(async (serviceId) => serviceId === 5 ? [{
      id: 9, service_id: 5, value: "7.95689", valid_from: "2026-07-01",
    }] : []);

    render(
      <MemoryRouter initialEntries={["/apartments/1"]}>
        <Routes><Route path="/apartments/:apartmentId" element={<ApartmentDetail />} /></Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Квартира на Подолі" })).toBeInTheDocument();
    const facts = screen.getByRole("region", { name: "Факти квартири" });
    expect(within(facts).getByText("325 $ / міс")).toBeInTheDocument();
    expect(within(facts).getByText("червень 2026 р. · Сплачений")).toBeInTheDocument();
    expect(await within(facts).findByText("2 500,00 ₴")).toBeInTheDocument();
    expect(await within(facts).findByText("2026-01-15")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Реквізити" })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Діє з" })).toBeInTheDocument();
    expect(screen.getByText("Газ").closest("strong")?.querySelector(".service-dot.gas")).toBeInTheDocument();
    expect(screen.getByText("Електроенергія").closest("strong")?.querySelector(".service-dot.elec")).toBeInTheDocument();
    expect(screen.getByText("Холодна вода").closest("strong")?.querySelector(".service-dot.water")).toBeInTheDocument();
    expect(screen.getByText("Утримання будинку").closest("strong")?.querySelector(".service-dot")).not.toBeInTheDocument();
    expect(screen.getByText("7,95689 ₴")).toBeInTheDocument();
    expect(screen.getByText("2026-07-01")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Посилання орендаря" })).toBeDisabled();
    expect(screen.getByRole("heading", { name: "Послуги й тарифи" }).closest("section"))
      .toHaveClass("services-section");
  });

  it("shows empty fact fallbacks when there is no invoice, tenant, or utility history", async () => {
    vi.spyOn(apiClient, "getApartment").mockResolvedValue({
      id: 1, name: "Вільна квартира", address: "Адреса", rent_amount: "320.00",
      rent_currency: "USD", notes: null, is_active: true, latest_invoice: null,
      current_tenant_name: null,
    });
    vi.spyOn(apiClient, "getServices").mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={["/apartments/1"]}>
        <Routes><Route path="/apartments/:apartmentId" element={<ApartmentDetail />} /></Routes>
      </MemoryRouter>,
    );

    const facts = await screen.findByRole("region", { name: "Факти квартири" });
    expect(within(facts).getByText("320 $ / міс")).toBeInTheDocument();
    expect(await within(facts).findByText("вільна")).toBeInTheDocument();
    expect(within(facts).getAllByText("—")).toHaveLength(2);
    expect(apiClient.getIncomeStats).toHaveBeenCalledWith(1, { months: 12 });
  });

  it("keeps the apartment usable when utility statistics fail", async () => {
    vi.spyOn(apiClient, "getApartment").mockResolvedValue({
      id: 1, name: "Квартира", address: "Адреса", rent_amount: "300.00",
      rent_currency: "USD", notes: null, is_active: true, latest_invoice: null,
      current_tenant_name: null,
    });
    vi.spyOn(apiClient, "getServices").mockResolvedValue([]);
    vi.mocked(apiClient.getIncomeStats).mockRejectedValue(new apiClient.ApiError(503, "Unavailable"));

    render(
      <MemoryRouter initialEntries={["/apartments/1"]}>
        <Routes><Route path="/apartments/:apartmentId" element={<ApartmentDetail />} /></Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Квартира" })).toBeInTheDocument();
    const facts = screen.getByRole("region", { name: "Факти квартири" });
    await waitFor(() => expect(within(facts).getAllByText("—")).toHaveLength(2));
    expect(screen.queryByText("Не вдалося завантажити квартиру.")).not.toBeInTheDocument();
  });

  it("opens the service editing form with existing values", async () => {
    vi.spyOn(apiClient, "getApartment").mockResolvedValue({
      id: 1, name: "Квартира", address: "Адреса", rent_amount: "300.00",
      rent_currency: "USD", notes: null, is_active: true, latest_invoice: null,
      current_tenant_name: null,
    });
    vi.spyOn(apiClient, "getServices").mockResolvedValue([{
      id: 5, apartment_id: 1, name: "Газ", kind: "metered", unit: "м³",
      provider_account: "12345", sort_order: 10, is_active: true,
    }]);
    vi.spyOn(apiClient, "getTariffs").mockResolvedValue([]);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/apartments/1"]}>
        <Routes><Route path="/apartments/:apartmentId" element={<ApartmentDetail />} /></Routes>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "Редагувати" }));
    expect(screen.getByLabelText("Назва")).toHaveValue("Газ");
    expect(screen.getByRole("button", { name: "Зберегти" })).toBeInTheDocument();
  });
});
