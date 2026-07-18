import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
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
      latest_invoice: { id: 14, period: "2026-06-01", status: "paid", grand_total: "15000.00" },
      current_tenant_name: "Оксана Коваль",
    });
    vi.mocked(apiClient.getTenants).mockResolvedValue([{
      id: 8, apartment_id: 1, full_name: "Оксана Коваль", phone: null, email: null,
      contract_start: "2026-01-15", contract_end: null, billing_day: null, notes: null,
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
    expect(screen.getByText("Активна")).toBeInTheDocument();
    expect(screen.getByText("Код домофона 42")).toBeInTheDocument();
    const facts = screen.getByRole("region", { name: "Факти квартири" });
    expect(within(facts).getByText("325 $ / міс")).toBeInTheDocument();
    expect(within(facts).getByText("червень 2026 р. · Сплачений")).toBeInTheDocument();
    expect(await within(facts).findByText("2 500,00 ₴")).toBeInTheDocument();
    expect(await within(facts).findByText("15 січ. 2026 р.")).toBeInTheDocument();
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

  it("clears the previous contract date when another apartment tenant load fails", async () => {
    vi.spyOn(apiClient, "getApartment").mockImplementation(async (apartmentId) => ({
      id: apartmentId,
      name: `Квартира ${apartmentId}`,
      address: `Адреса ${apartmentId}`,
      rent_amount: "300.00",
      rent_currency: "USD",
      notes: null,
      is_active: true,
      latest_invoice: null,
      current_tenant_name: apartmentId === 1 ? "Оксана Коваль" : null,
    }));
    vi.spyOn(apiClient, "getServices").mockResolvedValue([]);
    vi.mocked(apiClient.getTenants).mockImplementation(async (apartmentId) => {
      if (apartmentId === 2) throw new apiClient.ApiError(503, "Unavailable");
      return [{
        id: 8, apartment_id: 1, full_name: "Оксана Коваль", phone: null, email: null,
        contract_start: "2026-01-15", contract_end: null, billing_day: null, notes: null,
      }];
    });
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/apartments/1"]}>
        <Routes>
          <Route path="/apartments/:apartmentId" element={<><ApartmentDetail /><Link to="/apartments/2">Наступна квартира</Link></>} />
        </Routes>
      </MemoryRouter>,
    );

    const firstFacts = await screen.findByRole("region", { name: "Факти квартири" });
    expect(await within(firstFacts).findByText("15 січ. 2026 р.")).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Наступна квартира" }));
    expect(await screen.findByRole("heading", { name: "Квартира 2" })).toBeInTheDocument();
    expect(await screen.findByText("Unavailable")).toBeInTheDocument();
    expect(screen.queryByText("15 січ. 2026 р.")).not.toBeInTheDocument();
    const secondFacts = screen.getByRole("region", { name: "Факти квартири" });
    expect(secondFacts).not.toHaveTextContent("вільна");
    expect(within(secondFacts).getAllByText("—")).toHaveLength(3);
  });

  it("ignores an older apartment response after route navigation", async () => {
    let resolveFirst!: (apartment: apiClient.Apartment) => void;
    const firstApartment = new Promise<apiClient.Apartment>((resolve) => { resolveFirst = resolve; });
    vi.spyOn(apiClient, "getApartment").mockImplementation((apartmentId) => (
      apartmentId === 1 ? firstApartment : Promise.resolve({
        id: 2, name: "Квартира 2", address: "Адреса 2", rent_amount: "400.00",
        rent_currency: "USD", notes: null, is_active: true, latest_invoice: null,
        current_tenant_name: null,
      })
    ));
    vi.spyOn(apiClient, "getServices").mockResolvedValue([]);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/apartments/1"]}>
        <Routes>
          <Route path="/apartments/:apartmentId" element={<><ApartmentDetail /><Link to="/apartments/2">Наступна квартира</Link></>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("link", { name: "Наступна квартира" }));
    expect(await screen.findByRole("heading", { name: "Квартира 2" })).toBeInTheDocument();
    resolveFirst({
      id: 1, name: "Квартира 1", address: "Адреса 1", rent_amount: "300.00",
      rent_currency: "USD", notes: null, is_active: true, latest_invoice: null,
      current_tenant_name: null,
    });

    await waitFor(() => expect(screen.queryByRole("heading", { name: "Квартира 1" })).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Квартира 2" })).toBeInTheDocument();
  });

  it("clears the previous apartment while a new route loads and then fails", async () => {
    let rejectSecond!: (error: unknown) => void;
    const secondApartment = new Promise<apiClient.Apartment>((_resolve, reject) => { rejectSecond = reject; });
    vi.spyOn(apiClient, "getApartment").mockImplementation((apartmentId) => (
      apartmentId === 1 ? Promise.resolve({
        id: 1, name: "Квартира 1", address: "Адреса 1", rent_amount: "300.00",
        rent_currency: "USD", notes: null, is_active: true, latest_invoice: null,
        current_tenant_name: null,
      }) : secondApartment
    ));
    vi.spyOn(apiClient, "getServices").mockResolvedValue([]);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/apartments/1"]}>
        <Routes>
          <Route path="/apartments/:apartmentId" element={<><ApartmentDetail /><Link to="/apartments/2">Наступна квартира</Link></>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Квартира 1" })).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Наступна квартира" }));
    expect(screen.queryByRole("heading", { name: "Квартира 1" })).not.toBeInTheDocument();
    expect(screen.getByText("Завантажуємо квартиру…")).toBeInTheDocument();
    rejectSecond(new apiClient.ApiError(503, "Unavailable"));

    expect(await screen.findByText("Не вдалося завантажити квартиру.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Квартира 1" })).not.toBeInTheDocument();
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

  it("reports refresh failure separately after a service was created successfully", async () => {
    vi.spyOn(apiClient, "getApartment").mockResolvedValue({
      id: 1, name: "Квартира", address: "Адреса", rent_amount: "300.00",
      rent_currency: "USD", notes: null, is_active: true, latest_invoice: null,
      current_tenant_name: null,
    });
    vi.spyOn(apiClient, "getServices")
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new apiClient.ApiError(503, "Services unavailable"));
    vi.spyOn(apiClient, "createService").mockResolvedValue({
      id: 5, apartment_id: 1, name: "Газ", kind: "metered", unit: "м³",
      provider_account: null, sort_order: 0, is_active: true,
    });
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/apartments/1"]}>
        <Routes><Route path="/apartments/:apartmentId" element={<ApartmentDetail />} /></Routes>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "Додати послугу" }));
    await user.type(screen.getByLabelText("Назва"), "Газ");
    await user.click(screen.getByRole("button", { name: "Додати" }));

    expect(await screen.findByText(/Зміну збережено, але не вдалося оновити дані/)).toBeInTheDocument();
    expect(apiClient.createService).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Додати" })).not.toBeInTheDocument();
    expect(screen.queryByText("Не вдалося зберегти послугу.")).not.toBeInTheDocument();
  });

  it("reports refresh failure separately after a tariff was created successfully", async () => {
    const service = {
      id: 5, apartment_id: 1, name: "Газ", kind: "metered" as const, unit: "м³",
      provider_account: null, sort_order: 0, is_active: true,
    };
    vi.spyOn(apiClient, "getApartment").mockResolvedValue({
      id: 1, name: "Квартира", address: "Адреса", rent_amount: "300.00",
      rent_currency: "USD", notes: null, is_active: true, latest_invoice: null,
      current_tenant_name: null,
    });
    vi.spyOn(apiClient, "getServices").mockResolvedValue([service]);
    vi.spyOn(apiClient, "getTariffs")
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new apiClient.ApiError(503, "Tariffs unavailable"));
    vi.spyOn(apiClient, "createTariff").mockResolvedValue({
      id: 9, service_id: 5, value: "7.95689", valid_from: "2026-07-16",
    });
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/apartments/1"]}>
        <Routes><Route path="/apartments/:apartmentId" element={<ApartmentDetail />} /></Routes>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "Новий тариф" }));
    await user.type(screen.getByLabelText("Тариф Газ"), "7.95689");
    await user.type(screen.getByLabelText("Дата тарифу Газ"), "2026-07-16");
    await user.click(screen.getByRole("button", { name: "Додати" }));

    expect(await screen.findByText(/Зміну збережено, але не вдалося оновити дані/)).toBeInTheDocument();
    expect(apiClient.createTariff).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("Тариф Газ")).not.toBeInTheDocument();
    expect(screen.queryByText("Не вдалося додати тариф.")).not.toBeInTheDocument();
  });
});
