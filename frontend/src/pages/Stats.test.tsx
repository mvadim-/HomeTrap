import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, vi } from "vitest";

import * as apiClient from "../api/client";
import { Stats } from "./Stats";

const apartments: apiClient.Apartment[] = [{
  id: 1,
  name: "Квартира на Подолі",
  address: "Київ",
  rent_amount: "325.00",
  rent_currency: "USD",
  notes: null,
  is_active: true,
  latest_invoice: null,
  current_tenant_name: null,
}];

const januaryInvoice: apiClient.InvoiceListItem = {
  id: 42,
  apartment_id: 1,
  period: "2026-01-01",
  status: "paid",
  issued_at: "2026-01-15T12:00:00Z",
  paid_at: "2026-01-20T12:00:00Z",
  exchange_rate: "42.00",
  rent_amount_usd: "325.00",
  rent_amount_uah: "13650.00",
  utilities_total: "2210.51",
  grand_total: "15860.51",
};

function LocationProbe() {
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="location-search">{useLocation().search}</output>
      <button type="button" onClick={() => navigate(-1)}>Назад в історії</button>
      <button type="button" onClick={() => navigate(1)}>Вперед в історії</button>
    </>
  );
}

function renderStats(initialEntry: string | string[] = "/stats", initialIndex?: number) {
  return render(
    <MemoryRouter initialEntries={typeof initialEntry === "string" ? [initialEntry] : initialEntry} initialIndex={initialIndex}>
      <Routes>
        <Route path="/stats" element={<><Stats /><LocationProbe /></>} />
        <Route path="/invoices/:invoiceId" element={<h1>Рахунок відкрито</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

function tenant(overrides: Partial<apiClient.Tenant> = {}): apiClient.Tenant {
  return {
    id: 11,
    apartment_id: 1,
    full_name: "Іван Петренко",
    phone: null,
    email: null,
    contract_start: "2024-03-15",
    contract_end: "2025-02-28",
    billing_day: null,
    notes: null,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function incomeStats(apartmentId?: number): apiClient.IncomeStats {
  return {
    scope: apartmentId === undefined ? "portfolio" : "apartment",
    apartment_id: apartmentId ?? null,
    months: 12,
    values: [{ period: "2026-01-01", rent: "13650.00", utilities: "2210.51", adjustments: "0.00", total: "15860.51" }],
    totals: { rent: "13650.00", utilities: "2210.51", adjustments: "0.00", total: "15860.51" },
    top_service: { name: "Газ", share_percent: "62.50", peak_period: "2026-01-01" },
  };
}

function pnlStats(overrides: Partial<apiClient.PnlStats> = {}): apiClient.PnlStats {
  return {
    scope: "portfolio",
    apartment_id: null,
    months: 12,
    values: [{ period: "2026-06-01", income: "15000.00", expenses: "5000.00", net: "10000.00" }],
    totals: {
      income: "15000.00",
      expenses_total: "5000.00",
      expenses_by_category: { repair: "3000.00", tax: "2000.00" },
      net: "10000.00",
      margin_percent: "66.67",
    },
    unconverted: { count: 0, by_currency: {} },
    ...overrides,
  };
}

function emptyPnlStats(): apiClient.PnlStats {
  return pnlStats({
    values: [],
    totals: { income: "0.00", expenses_total: "0.00", expenses_by_category: {}, net: "0.00", margin_percent: null },
  });
}

beforeEach(() => {
  vi.spyOn(apiClient, "getTenants").mockResolvedValue([]);
  vi.spyOn(apiClient, "getPnlStats").mockResolvedValue(emptyPnlStats());
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Stats", () => {
  it("renders consumption charts, stacked income and changes income scope", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    vi.spyOn(apiClient, "getConsumptionStats").mockResolvedValue({
      apartment_id: 1,
      months: 12,
      series: ["Газ", "Світло", "Вода", "Опалення"].map((service_name, index) => ({
        service_id: index + 1,
        service_name,
        unit: index === 0 ? "м³" : "кВт·год",
        values: [
          { period: "2026-05-01", consumed: String(10 + index), cost: "0" },
          { period: "2026-06-01", consumed: String(12 + index), cost: "0" },
        ],
        summary: { avg: String(11 + index), min: String(10 + index), max: String(12 + index) },
      })),
    });
    const getIncomeStats = vi.spyOn(apiClient, "getIncomeStats").mockResolvedValue({
      scope: "portfolio",
      apartment_id: null,
      months: 12,
      values: [{ period: "2026-06-01", rent: "14521.00", utilities: "2210.51", adjustments: "0.00", total: "16731.51" }],
      totals: { rent: "14521.00", utilities: "2210.51", adjustments: "0.00", total: "16731.51" },
      top_service: { name: "Газ", share_percent: "62.50", peak_period: "2026-06-01" },
    });

    renderStats();

    expect(await screen.findByRole("heading", { name: "Статистика" })).toBeInTheDocument();
    const gasChart = await screen.findByRole("img", { name: "Графік споживання: Газ" });
    const electricityChart = screen.getByRole("img", { name: "Графік споживання: Світло" });
    const waterChart = screen.getByRole("img", { name: "Графік споживання: Вода" });
    const otherChart = screen.getByRole("img", { name: "Графік споживання: Опалення" });
    expect(gasChart.querySelector(".chart-line")).toHaveAttribute("stroke", "var(--chart-gas)");
    expect(electricityChart.querySelector(".chart-line")).toHaveAttribute("stroke", "var(--chart-elec)");
    expect(waterChart.querySelector(".chart-line")).toHaveAttribute("stroke", "var(--chart-water)");
    expect(otherChart.querySelector(".chart-line")).toHaveAttribute("stroke", "var(--color-primary)");
    expect(gasChart.querySelector(".chart-area")).toHaveAttribute("fill", "var(--chart-gas)");
    expect(gasChart.querySelector(".chart-area")).toHaveAttribute("fill-opacity", "0.13");
    expect(gasChart.querySelectorAll(".chart-point")[0]).toHaveAttribute("r", "3");
    expect(gasChart.querySelectorAll(".chart-point")[1]).toHaveAttribute("r", "5");
    expect(gasChart.querySelectorAll(".chart-point")[1]).toHaveAttribute("stroke", "var(--color-surface)");
    expect(gasChart.querySelectorAll(".chart-gridline").length).toBeGreaterThanOrEqual(3);
    expect(gasChart.querySelectorAll(".chart-tick-label").length).toBeGreaterThanOrEqual(3);

    const incomeChart = await screen.findByRole("img", { name: "Стековий графік доходу" });
    expect(incomeChart.querySelector(".income-rent")).toHaveAttribute("fill", "var(--chart-rent)");
    expect(incomeChart.querySelector(".income-utilities")).toHaveAttribute("fill", "var(--chart-util)");
    expect(incomeChart.querySelector(".income-rent")).toHaveAttribute("stroke", "var(--color-surface)");
    expect(incomeChart.querySelector(".income-rent")).toHaveAttribute("stroke-width", "2");
    expect(incomeChart.querySelectorAll(".chart-gridline").length).toBeGreaterThanOrEqual(3);
    expect(incomeChart.querySelectorAll(".chart-tick-label").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByLabelText(/черв, оренда:/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Разом: 16.?731,51 ₴/).length).toBeGreaterThan(0);
    expect(screen.getByText("Оренда за період")).toBeInTheDocument();
    expect(screen.getByText("Комунальні за період")).toBeInTheDocument();
    expect(screen.getByText("Найбільша стаття")).toBeInTheDocument();
    expect(screen.getAllByText("Газ")).toHaveLength(2);
    expect(screen.getByText(/62,5% · пік — черв/)).toBeInTheDocument();
    expect(screen.getByText("16,7")).toHaveClass("income-value-label");

    await user.click(screen.getByRole("button", { name: "Квартира" }));
    await waitFor(() => expect(getIncomeStats).toHaveBeenLastCalledWith(1, { months: 12 }));
  });

  it("stacks negative adjustments to the invoice total, including below zero", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 6, 16));
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    vi.spyOn(apiClient, "getConsumptionStats").mockResolvedValue({ apartment_id: 1, months: 12, series: [] });
    vi.spyOn(apiClient, "getIncomeStats").mockResolvedValue({
      scope: "portfolio",
      apartment_id: null,
      months: 12,
      values: [
        { period: "2026-06-01", rent: "14521.00", utilities: "2210.51", adjustments: "-1000.00", total: "15731.51" },
        { period: "2026-07-01", rent: "100.00", utilities: "20.00", adjustments: "-200.00", total: "-80.00" },
      ],
      totals: { rent: "14621.00", utilities: "2230.51", adjustments: "-1200.00", total: "15651.51" },
      top_service: { name: "Газ", share_percent: "62.50", peak_period: "2026-06-01" },
    });

    renderStats();

    const chart = await screen.findByRole("img", { name: "Стековий графік доходу" });
    const adjustments = chart.querySelectorAll(".income-adjustments");
    expect(adjustments).toHaveLength(2);
    expect(adjustments[0]).toHaveAttribute("fill", "var(--chart-adjustment)");
    expect(screen.getByLabelText(/черв, коригування: -1.?000,00 ₴, разом: 15.?731,51 ₴/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/лип, коригування: -200,00 ₴, разом: -80,00 ₴/i)).toBeInTheDocument();
    expect(screen.getByText("Коригування")).toBeInTheDocument();
    expect(screen.getByText(/Разом: 15.?651,51 ₴/)).toBeInTheDocument();
    chart.querySelectorAll("[d], [points], [x], [y], [cx], [cy], [height]").forEach((element) => {
      expect(element.outerHTML).not.toMatch(/NaN/);
    });
  });

  it("keeps missing months as empty slots and breaks consumption lines", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 6, 16));
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    vi.spyOn(apiClient, "getConsumptionStats").mockResolvedValue({
      apartment_id: 1,
      months: 12,
      series: [{
        service_id: 1,
        service_name: "Газ",
        unit: "м³",
        values: [
          { period: "2025-09-01", consumed: "12", cost: "0" },
          { period: "2025-11-01", consumed: "18", cost: "0" },
        ],
        summary: { avg: "15", min: "12", max: "18" },
      }],
    });
    vi.spyOn(apiClient, "getIncomeStats").mockResolvedValue({
      scope: "portfolio",
      apartment_id: null,
      months: 12,
      values: [
        { period: "2025-09-01", rent: "100.00", utilities: "20.00", adjustments: "0.00", total: "120.00" },
        { period: "2025-11-01", rent: "100.00", utilities: "30.00", adjustments: "0.00", total: "130.00" },
      ],
      totals: { rent: "200.00", utilities: "50.00", adjustments: "0.00", total: "250.00" },
      top_service: null,
    });

    renderStats();

    const consumptionChart = await screen.findByRole("img", { name: "Графік споживання: Газ" });
    const incomeChart = await screen.findByRole("img", { name: "Стековий графік доходу" });
    const consumptionGap = consumptionChart.querySelector('[data-period="2025-10-01"]');
    const incomeGap = incomeChart.querySelector('[data-period="2025-10-01"]');

    expect(consumptionChart.querySelector('[data-period="2025-08-01"]')).toHaveClass("chart-month-slot-empty");
    expect(consumptionChart.querySelector('[data-period="2026-07-01"]')).toHaveClass("chart-month-slot-empty");
    expect(incomeChart.querySelector('[data-period="2025-08-01"]')).toHaveClass("chart-month-slot-empty");
    expect(incomeChart.querySelector('[data-period="2026-07-01"]')).toHaveClass("chart-month-slot-empty");

    expect(consumptionGap).toHaveClass("chart-month-slot-empty");
    expect(consumptionGap).toHaveTextContent("жовт");
    expect(consumptionGap?.querySelector(".chart-point")).not.toBeInTheDocument();
    expect(incomeGap).toHaveClass("chart-month-slot-empty");
    expect(incomeGap).toHaveTextContent("жовт");
    expect(incomeGap?.querySelector("rect")).not.toBeInTheDocument();
    expect(consumptionChart.querySelector(".chart-line")).toHaveAttribute("d", expect.stringMatching(/^M [^L]+ M /));
    [consumptionChart, incomeChart].forEach((chart) => {
      expect(chart.innerHTML).not.toMatch(/NaN/);
    });
  });

  it("shows tenant start markers only for visible apartment months", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 6, 17));
    const user = userEvent.setup();
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    vi.spyOn(apiClient, "getTenants").mockResolvedValue([
      tenant({
        contract_start: "2026-05-15",
        contract_end: null,
      }),
      tenant({
        id: 12,
        full_name: "Олена Коваль",
        contract_start: "2025-07-01",
        contract_end: "2026-04-30",
      }),
    ]);
    vi.spyOn(apiClient, "getConsumptionStats").mockResolvedValue({ apartment_id: 1, months: 12, series: [] });
    const getIncomeStats = vi.spyOn(apiClient, "getIncomeStats").mockImplementation((apartmentId) => (
      Promise.resolve(incomeStats(apartmentId))
    ));

    renderStats();

    expect(await screen.findByRole("img", { name: "Стековий графік доходу" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Початок договору: Іван Петренко, травень 2026")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Квартира" }));
    await waitFor(() => expect(getIncomeStats).toHaveBeenLastCalledWith(1, { months: 12 }));

    const visibleMarker = await screen.findByLabelText("Початок договору: Іван Петренко, травень 2026");
    expect(visibleMarker).toHaveClass("income-tenant-marker");
    expect(visibleMarker).toHaveAttribute("stroke", "var(--chart-tenant-marker)");
    expect(visibleMarker).toHaveAttribute("stroke-dasharray", "5 5");
    expect(visibleMarker.querySelector("title")).toHaveTextContent("Початок договору: Іван Петренко, травень 2026");
    expect(screen.queryByLabelText("Початок договору: Олена Коваль, липень 2025")).not.toBeInTheDocument();
  });

  it("counts uncovered months between contracts only for the apartment scope", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    vi.spyOn(apiClient, "getTenants").mockResolvedValue([
      tenant({
        contract_start: "2026-01-31",
        contract_end: "2026-01-31",
      }),
      tenant({
        id: 12,
        full_name: "Олена Коваль",
        contract_start: "2026-03-15",
        contract_end: null,
      }),
    ]);
    vi.spyOn(apiClient, "getConsumptionStats").mockResolvedValue({ apartment_id: 1, months: null, series: [] });
    vi.spyOn(apiClient, "getIncomeStats").mockImplementation((apartmentId) => Promise.resolve(incomeStats(apartmentId)));

    renderStats();

    await screen.findByLabelText("Орендар для статистики");
    await user.click(screen.getByRole("button", { name: "Довільний період" }));
    fireEvent.change(screen.getByLabelText("Період від"), { target: { value: "2026-01" } });
    fireEvent.change(screen.getByLabelText("Період до"), { target: { value: "2026-03" } });
    expect(screen.queryByText("Простій")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Квартира" }));

    const vacancyTile = (await screen.findByText("Простій")).closest("article");
    expect(vacancyTile).toHaveTextContent("1 міс");
    expect(vacancyTile).toHaveTextContent("без орендаря за період");
  });

  it("shows zero vacancy for full coverage and all months without tenants", async () => {
    const user = userEvent.setup();
    const secondApartment = { ...apartments[0], id: 2, name: "Квартира на Печерську" };
    const coveringTenant = tenant({
      contract_start: "2025-12-15",
      contract_end: "2026-03-01",
    });
    vi.spyOn(apiClient, "getApartments").mockResolvedValue([...apartments, secondApartment]);
    vi.spyOn(apiClient, "getTenants").mockImplementation((apartmentId) => (
      Promise.resolve(apartmentId === 1 ? [coveringTenant] : [])
    ));
    vi.spyOn(apiClient, "getConsumptionStats").mockImplementation((apartmentId) => (
      Promise.resolve({ apartment_id: apartmentId, months: null, series: [] })
    ));
    vi.spyOn(apiClient, "getIncomeStats").mockImplementation((apartmentId) => Promise.resolve(incomeStats(apartmentId)));

    renderStats();

    await screen.findByLabelText("Орендар для статистики");
    await user.click(screen.getByRole("button", { name: "Довільний період" }));
    fireEvent.change(screen.getByLabelText("Період від"), { target: { value: "2026-01" } });
    fireEvent.change(screen.getByLabelText("Період до"), { target: { value: "2026-03" } });
    await user.click(screen.getByRole("button", { name: "Квартира" }));

    expect((await screen.findByText("Простій")).closest("article")).toHaveTextContent("0 міс");

    await user.selectOptions(screen.getByLabelText("Квартира для статистики"), "2");

    await waitFor(() => expect(screen.queryByLabelText("Орендар для статистики")).not.toBeInTheDocument());
    expect(screen.getByText("Простій").closest("article")).toHaveTextContent("3 міс");
  });

  it("waits for tenant data before showing a vacancy count", async () => {
    const tenantsRequest = deferred<apiClient.Tenant[]>();
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    vi.spyOn(apiClient, "getTenants").mockReturnValue(tenantsRequest.promise);
    vi.spyOn(apiClient, "getConsumptionStats").mockResolvedValue({ apartment_id: 1, months: null, series: [] });
    vi.spyOn(apiClient, "getIncomeStats").mockResolvedValue(incomeStats(1));

    renderStats("/stats?apartment=1&scope=apartment&period=custom&from=2026-01&to=2026-03");

    const vacancyTile = (await screen.findByText("Простій")).closest("article");
    expect(vacancyTile).toHaveTextContent("—");
    expect(vacancyTile).toHaveTextContent("завантажуємо дані орендарів");

    await act(async () => tenantsRequest.resolve([]));

    expect(vacancyTile).toHaveTextContent("3 міс");
    expect(vacancyTile).toHaveTextContent("без орендаря за період");
  });

  it("marks vacancy as unavailable when tenant loading fails", async () => {
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    vi.spyOn(apiClient, "getTenants").mockRejectedValue(new Error("offline"));
    vi.spyOn(apiClient, "getConsumptionStats").mockResolvedValue({ apartment_id: 1, months: null, series: [] });
    vi.spyOn(apiClient, "getIncomeStats").mockResolvedValue(incomeStats(1));

    renderStats("/stats?apartment=1&scope=apartment&period=custom&from=2026-01&to=2026-03");

    const vacancyTile = (await screen.findByText("Простій")).closest("article");
    await waitFor(() => expect(vacancyTile).toHaveTextContent("дані орендарів недоступні"));
    expect(vacancyTile).toHaveTextContent("—");
    expect(vacancyTile).not.toHaveTextContent(/\d+ міс/);
  });

  it("waits for both all-time statistics responses before showing vacancy", async () => {
    const consumptionRequest = deferred<apiClient.ConsumptionStats>();
    const incomeRequest = deferred<apiClient.IncomeStats>();
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    vi.spyOn(apiClient, "getConsumptionStats").mockReturnValue(consumptionRequest.promise);
    vi.spyOn(apiClient, "getIncomeStats").mockReturnValue(incomeRequest.promise);

    renderStats("/stats?apartment=1&scope=apartment&period=all");

    const vacancyTile = (await screen.findByText("Простій")).closest("article");
    await waitFor(() => expect(vacancyTile).toHaveTextContent("завантажуємо статистику за весь час"));
    expect(vacancyTile).toHaveTextContent("—");

    await act(async () => consumptionRequest.resolve({
      apartment_id: 1,
      months: null,
      series: [{
        service_id: 1,
        service_name: "Газ",
        unit: "м³",
        values: [{ period: "2026-01-01", consumed: "10", cost: "0" }],
        summary: { avg: "10", min: "10", max: "10" },
      }],
    }));

    expect(vacancyTile).toHaveTextContent("—");
    expect(vacancyTile).toHaveTextContent("завантажуємо статистику за весь час");

    await act(async () => incomeRequest.resolve({
      ...incomeStats(1),
      months: null,
      values: [{ period: "2026-03-01", rent: "100.00", utilities: "20.00", adjustments: "0.00", total: "120.00" }],
    }));

    await waitFor(() => expect(vacancyTile).toHaveTextContent("3 міс"));
    expect(vacancyTile).toHaveTextContent("без орендаря за період");
  });

  it("marks all-time vacancy unavailable when one statistics request fails", async () => {
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    vi.spyOn(apiClient, "getConsumptionStats").mockResolvedValue({
      apartment_id: 1,
      months: null,
      series: [{
        service_id: 1,
        service_name: "Газ",
        unit: "м³",
        values: [{ period: "2026-01-01", consumed: "10", cost: "0" }],
        summary: { avg: "10", min: "10", max: "10" },
      }],
    });
    vi.spyOn(apiClient, "getIncomeStats").mockRejectedValue(new Error("offline"));

    renderStats("/stats?apartment=1&scope=apartment&period=all");

    const vacancyTile = (await screen.findByText("Простій")).closest("article");
    await waitFor(() => expect(vacancyTile).toHaveTextContent("статистика за весь час недоступна"));
    expect(vacancyTile).toHaveTextContent("—");
    expect(vacancyTile).not.toHaveTextContent(/\d+ міс/);
  });

  it("marks vacancy as unavailable for an incomplete custom range", async () => {
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);

    renderStats("/stats?apartment=1&scope=apartment&period=custom");

    const vacancyTile = (await screen.findByText("Простій")).closest("article");
    await waitFor(() => expect(vacancyTile).toHaveTextContent("оберіть коректний період"));
    expect(vacancyTile).toHaveTextContent("—");
    expect(vacancyTile).not.toHaveTextContent(/\d+ міс/);
  });

  it("marks vacancy as unavailable for an invalid custom range", async () => {
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    vi.spyOn(apiClient, "getConsumptionStats").mockResolvedValue({ apartment_id: 1, months: null, series: [] });
    vi.spyOn(apiClient, "getIncomeStats").mockResolvedValue(incomeStats(1));

    renderStats("/stats?apartment=1&scope=apartment&period=custom&from=2026-01&to=2026-03");

    const vacancyTile = (await screen.findByText("Простій")).closest("article");
    await waitFor(() => expect(vacancyTile).toHaveTextContent("3 міс"));
    fireEvent.change(screen.getByLabelText("Період від"), { target: { value: "2026-04" } });

    expect(await screen.findByText("Початок періоду не може бути пізніше завершення.")).toBeInTheDocument();
    expect(vacancyTile).toHaveTextContent("—");
    expect(vacancyTile).toHaveTextContent("оберіть коректний період");
    expect(vacancyTile).not.toHaveTextContent(/\d+ міс/);
  });

  it("renders a correction marker instead of bars for a month with a negative segment", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    vi.spyOn(apiClient, "getConsumptionStats").mockResolvedValue({ apartment_id: 1, months: 12, series: [] });
    vi.spyOn(apiClient, "getIncomeStats").mockResolvedValue({
      scope: "portfolio",
      apartment_id: null,
      months: 12,
      values: [
        { period: "2025-08-01", rent: "14521.00", utilities: "2210.51", adjustments: "0.00", total: "16731.51" },
        { period: "2025-09-01", rent: "0.00", utilities: "-10740.93", adjustments: "0.00", total: "-10740.93" },
      ],
      totals: { rent: "14521.00", utilities: "-8530.42", adjustments: "0.00", total: "5990.58" },
      top_service: null,
    });

    renderStats();

    const chart = await screen.findByRole("img", { name: "Стековий графік доходу" });
    const marker = screen.getByLabelText(/вер, коригування:/i);
    expect(marker).toHaveClass("income-adjustment-marker");
    expect(marker).toHaveAccessibleName(/оренда 0,00 ₴.*комунальні -10.?740,93 ₴.*разом -10.?740,93 ₴/i);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    await user.hover(marker);
    expect(screen.getByRole("tooltip")).toHaveTextContent(/Комунальні: -10.?740,93 ₴/);
    await user.unhover(marker);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.focus(marker);
    expect(screen.getByRole("tooltip")).toHaveTextContent(/Разом: -10.?740,93 ₴/);
    expect(screen.queryByLabelText(/вер, оренда:/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/вер, комунальні:/i)).not.toBeInTheDocument();
    expect(chart.querySelectorAll(".income-rent")).toHaveLength(1);
    expect(chart.querySelectorAll(".income-utilities")).toHaveLength(1);
    expect(chart.querySelectorAll(".income-value-label")).toHaveLength(1);
    chart.querySelectorAll("[d], [points], [x], [y], [cx], [cy]").forEach((element) => {
      expect(element.outerHTML).not.toMatch(/NaN/);
    });
  });

  it("uses the selected preset for consumption and income", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    const getConsumptionStats = vi.spyOn(apiClient, "getConsumptionStats").mockResolvedValue({ apartment_id: 1, months: 6, series: [] });
    const getIncomeStats = vi.spyOn(apiClient, "getIncomeStats").mockResolvedValue({
      scope: "portfolio",
      apartment_id: null,
      months: 6,
      values: [],
      totals: { rent: "0.00", utilities: "0.00", adjustments: "0.00", total: "0.00" },
      top_service: null,
    });

    renderStats();
    await screen.findByText("Ще немає історії споживання для цієї квартири.");
    await waitFor(() => expect(getConsumptionStats).toHaveBeenLastCalledWith(1, { months: 12 }));
    await waitFor(() => expect(getIncomeStats).toHaveBeenLastCalledWith(undefined, { months: 12 }));
    await user.click(screen.getByRole("button", { name: "6 міс" }));

    await waitFor(() => expect(getConsumptionStats).toHaveBeenLastCalledWith(1, { months: 6 }));
    await waitFor(() => expect(getIncomeStats).toHaveBeenLastCalledWith(undefined, { months: 6 }));
    expect(screen.getByText("Споживання та дохід за останні 6 місяців")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "24 міс" }));
    await waitFor(() => expect(getConsumptionStats).toHaveBeenLastCalledWith(1, { months: 24 }));
    await waitFor(() => expect(getIncomeStats).toHaveBeenLastCalledWith(undefined, { months: 24 }));
    expect(screen.getByText("Споживання та дохід за останні 24 місяців")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Весь час" }));
    await waitFor(() => expect(getConsumptionStats).toHaveBeenLastCalledWith(1, { all_time: true }));
    await waitFor(() => expect(getIncomeStats).toHaveBeenLastCalledWith(undefined, { all_time: true }));
    expect(screen.getByText("Споживання та дохід за весь час")).toBeInTheDocument();
  });

  it("requests a custom month range for both charts", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    const getConsumptionStats = vi.spyOn(apiClient, "getConsumptionStats").mockResolvedValue({
      apartment_id: 1,
      months: null,
      series: [{ service_id: 1, service_name: "Газ", unit: "м³", values: [{ period: "2025-06-01", consumed: "12", cost: "0" }], summary: { avg: "12", min: "12", max: "12" } }],
    });
    const getIncomeStats = vi.spyOn(apiClient, "getIncomeStats").mockResolvedValue({
      scope: "portfolio",
      apartment_id: null,
      months: null,
      values: [{ period: "2025-06-01", rent: "100.00", utilities: "20.00", adjustments: "0.00", total: "120.00" }],
      totals: { rent: "100.00", utilities: "20.00", adjustments: "0.00", total: "120.00" },
      top_service: null,
    });

    renderStats();
    await screen.findByRole("img", { name: "Графік споживання: Газ" });
    await user.click(screen.getByRole("button", { name: "Довільний період" }));
    fireEvent.change(screen.getByLabelText("Період від"), { target: { value: "2025-05" } });
    fireEvent.change(screen.getByLabelText("Період до"), { target: { value: "2025-07" } });

    const period = { date_from: "2025-05-01", date_to: "2025-07-01" };
    await waitFor(() => expect(getConsumptionStats).toHaveBeenLastCalledWith(1, period));
    await waitFor(() => expect(getIncomeStats).toHaveBeenLastCalledWith(undefined, period));
    expect(screen.getByText(/Споживання та дохід за травень 2025.*липень 2025/)).toBeInTheDocument();
    const consumptionChart = await screen.findByRole("img", { name: "Графік споживання: Газ" });
    const incomeChart = await screen.findByRole("img", { name: "Стековий графік доходу" });
    for (const chart of [consumptionChart, incomeChart]) {
      expect(chart.querySelector('[data-period="2025-05-01"]')).toHaveClass("chart-month-slot-empty");
      expect(chart.querySelector('[data-period="2025-07-01"]')).toHaveClass("chart-month-slot-empty");
    }

    const consumptionCalls = getConsumptionStats.mock.calls.length;
    const incomeCalls = getIncomeStats.mock.calls.length;
    fireEvent.change(screen.getByLabelText("Період від"), { target: { value: "2025-08" } });
    expect(await screen.findByText("Початок періоду не може бути пізніше завершення.")).toBeInTheDocument();
    expect(getConsumptionStats).toHaveBeenCalledTimes(consumptionCalls);
    expect(getIncomeStats).toHaveBeenCalledTimes(incomeCalls);
  });

  it("supports future months in a custom range", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    const getConsumptionStats = vi.spyOn(apiClient, "getConsumptionStats").mockResolvedValue({
      apartment_id: 1,
      months: null,
      series: [{ service_id: 1, service_name: "Газ", unit: "м³", values: [{ period: "2027-02-01", consumed: "12", cost: "0" }], summary: { avg: "12", min: "12", max: "12" } }],
    });
    const getIncomeStats = vi.spyOn(apiClient, "getIncomeStats").mockImplementation((apartmentId) => Promise.resolve({
      ...incomeStats(apartmentId),
      months: null,
      values: [{ period: "2027-02-01", rent: "100.00", utilities: "20.00", adjustments: "0.00", total: "120.00" }],
      totals: { rent: "100.00", utilities: "20.00", adjustments: "0.00", total: "120.00" },
      top_service: null,
    }));

    renderStats();
    await screen.findByRole("img", { name: "Графік споживання: Газ" });
    await user.click(screen.getByRole("button", { name: "Довільний період" }));
    fireEvent.change(screen.getByLabelText("Період від"), { target: { value: "2027-01" } });
    fireEvent.change(screen.getByLabelText("Період до"), { target: { value: "2027-03" } });
    await user.click(screen.getByRole("button", { name: "Квартира" }));

    const period = { date_from: "2027-01-01", date_to: "2027-03-01" };
    await waitFor(() => expect(getConsumptionStats).toHaveBeenLastCalledWith(1, period));
    await waitFor(() => expect(getIncomeStats).toHaveBeenLastCalledWith(1, period));
    const consumptionChart = await screen.findByRole("img", { name: "Графік споживання: Газ" });
    const incomeChart = await screen.findByRole("img", { name: "Стековий графік доходу" });
    for (const chart of [consumptionChart, incomeChart]) {
      expect(chart.querySelector('[data-period="2027-01-01"]')).toHaveClass("chart-month-slot-empty");
      expect(chart.querySelector('[data-period="2027-03-01"]')).toHaveClass("chart-month-slot-empty");
    }
    expect(screen.getByText("Простій").closest("article")).toHaveTextContent("3 міс");
  });

  it("restores filters and the matching tenant from URL parameters", async () => {
    const allApartments = [
      apartments[0],
      { ...apartments[0], id: 2, name: "Квартира на Печерську", is_active: false },
    ];
    const matchingTenant = tenant({
      id: 21,
      apartment_id: 2,
      contract_start: "2024-03-15",
      contract_end: "2025-02-28",
    });
    const period = { date_from: "2024-03-01", date_to: "2025-02-01" };
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(allApartments);
    vi.spyOn(apiClient, "getTenants").mockImplementation((apartmentId) => (
      Promise.resolve(apartmentId === 2 ? [matchingTenant] : [])
    ));
    const getConsumptionStats = vi.spyOn(apiClient, "getConsumptionStats").mockImplementation((apartmentId) => (
      Promise.resolve({ apartment_id: apartmentId, months: null, series: [] })
    ));
    const getIncomeStats = vi.spyOn(apiClient, "getIncomeStats").mockImplementation((apartmentId) => (
      Promise.resolve(incomeStats(apartmentId))
    ));

    renderStats("/stats?apartment=2&scope=apartment&period=custom&from=2024-03&to=2025-02");

    expect(await screen.findByLabelText("Квартира для статистики")).toHaveValue("2");
    expect(await screen.findByLabelText("Орендар для статистики")).toHaveValue("21");
    expect(screen.getByRole("button", { name: "Квартира" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Довільний період" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Період від")).toHaveValue("2024-03");
    expect(screen.getByLabelText("Період до")).toHaveValue("2025-02");
    expect(screen.getByText("Договір: 15.03.2024 — 28.02.2025 · завершений")).toBeInTheDocument();
    await waitFor(() => expect(getConsumptionStats).toHaveBeenLastCalledWith(2, period));
    await waitFor(() => expect(getIncomeStats).toHaveBeenLastCalledWith(2, period));
  });

  it("writes filter changes to the URL and removes custom dates for a preset", async () => {
    const user = userEvent.setup();
    const allApartments = [
      apartments[0],
      { ...apartments[0], id: 2, name: "Квартира на Печерську", is_active: false },
    ];
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(allApartments);
    vi.spyOn(apiClient, "getConsumptionStats").mockImplementation((apartmentId) => (
      Promise.resolve({ apartment_id: apartmentId, months: null, series: [] })
    ));
    vi.spyOn(apiClient, "getIncomeStats").mockImplementation((apartmentId) => Promise.resolve(incomeStats(apartmentId)));

    renderStats();

    const apartmentSelect = await screen.findByLabelText("Квартира для статистики");
    await user.selectOptions(apartmentSelect, "2");
    await user.click(screen.getByRole("button", { name: "Квартира" }));
    await user.click(screen.getByRole("button", { name: "Довільний період" }));
    fireEvent.change(screen.getByLabelText("Період від"), { target: { value: "2025-01" } });
    fireEvent.change(screen.getByLabelText("Період до"), { target: { value: "2025-03" } });

    await waitFor(() => {
      const current = new URLSearchParams(screen.getByTestId("location-search").textContent ?? "");
      expect(Object.fromEntries(current)).toEqual({
        apartment: "2",
        scope: "apartment",
        period: "custom",
        from: "2025-01",
        to: "2025-03",
      });
    });

    await user.click(screen.getByRole("button", { name: "6 міс" }));
    await waitFor(() => {
      const current = new URLSearchParams(screen.getByTestId("location-search").textContent ?? "");
      expect(Object.fromEntries(current)).toEqual({ apartment: "2", scope: "apartment", period: "6" });
    });
  });

  it("restores filters after browser history navigation", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    vi.spyOn(apiClient, "getConsumptionStats").mockResolvedValue({ apartment_id: 1, months: null, series: [] });
    vi.spyOn(apiClient, "getIncomeStats").mockResolvedValue(incomeStats(1));

    renderStats([
      "/stats?apartment=1&scope=portfolio&period=6",
      "/stats?apartment=1&scope=apartment&period=custom&from=2025-01&to=2025-03",
    ], 1);

    expect(await screen.findByLabelText("Період від")).toHaveValue("2025-01");
    expect(screen.getByRole("button", { name: "Квартира" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Назад в історії" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "6 міс" })).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByRole("button", { name: "Портфель" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByLabelText("Період від")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Вперед в історії" }));

    expect(await screen.findByLabelText("Період від")).toHaveValue("2025-01");
    expect(screen.getByLabelText("Період до")).toHaveValue("2025-03");
    expect(screen.getByRole("button", { name: "Квартира" })).toHaveAttribute("aria-pressed", "true");
  });

  it("normalizes an unknown apartment, scope and period to defaults", async () => {
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    const getConsumptionStats = vi.spyOn(apiClient, "getConsumptionStats").mockResolvedValue({ apartment_id: 1, months: 12, series: [] });
    const getIncomeStats = vi.spyOn(apiClient, "getIncomeStats").mockResolvedValue(incomeStats());

    renderStats("/stats?apartment=999&scope=unknown&period=42&from=2025-01&to=2025-02&extra=value");

    expect(await screen.findByLabelText("Квартира для статистики")).toHaveValue("1");
    expect(screen.getByRole("button", { name: "Портфель" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "12 міс" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByLabelText("Період від")).not.toBeInTheDocument();
    await waitFor(() => expect(getConsumptionStats).toHaveBeenLastCalledWith(1, { months: 12 }));
    await waitFor(() => expect(getIncomeStats).toHaveBeenLastCalledWith(undefined, { months: 12 }));
    await waitFor(() => {
      const current = new URLSearchParams(screen.getByTestId("location-search").textContent ?? "");
      expect(Object.fromEntries(current)).toEqual({ apartment: "1", scope: "portfolio", period: "12" });
    });
  });

  it("clears an incomplete custom range restored from the URL", async () => {
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    const getConsumptionStats = vi.spyOn(apiClient, "getConsumptionStats");
    const getIncomeStats = vi.spyOn(apiClient, "getIncomeStats");

    renderStats("/stats?apartment=1&scope=portfolio&period=custom&from=2025-01");

    expect(await screen.findByLabelText("Період від")).toHaveValue("");
    expect(screen.getByLabelText("Період до")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Довільний період" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByText("Оберіть початок і завершення періоду.")).toHaveLength(3);
    expect(getConsumptionStats).not.toHaveBeenCalled();
    expect(getIncomeStats).not.toHaveBeenCalled();
    await waitFor(() => {
      const current = new URLSearchParams(screen.getByTestId("location-search").textContent ?? "");
      expect(Object.fromEntries(current)).toEqual({ apartment: "1", scope: "portfolio", period: "custom" });
    });
  });

  it("derives the selected tenant and contract details from the custom period", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 6, 17));
    const user = userEvent.setup();
    const tenants: apiClient.Tenant[] = [
      tenant(),
      tenant({
        id: 12,
        full_name: "Олена Коваль",
        contract_start: "2025-03-01",
        contract_end: null,
      }),
    ];
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    vi.spyOn(apiClient, "getTenants").mockResolvedValue(tenants);
    const getConsumptionStats = vi.spyOn(apiClient, "getConsumptionStats").mockResolvedValue({ apartment_id: 1, months: null, series: [] });
    const getIncomeStats = vi.spyOn(apiClient, "getIncomeStats").mockResolvedValue({
      scope: "portfolio",
      apartment_id: null,
      months: null,
      values: [],
      totals: { rent: "0.00", utilities: "0.00", adjustments: "0.00", total: "0.00" },
      top_service: null,
    });

    renderStats();

    const tenantSelect = await screen.findByLabelText("Орендар для статистики");
    expect(screen.getByRole("option", { name: "—" })).toBeDisabled();
    expect(screen.getByRole("option", { name: "Олена Коваль (поточний)" })).toBeInTheDocument();
    await user.selectOptions(tenantSelect, "11");

    expect(screen.getByRole("button", { name: "Довільний період" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Період від")).toHaveValue("2024-03");
    expect(screen.getByLabelText("Період до")).toHaveValue("2025-02");
    expect(tenantSelect).toHaveValue("11");
    expect(screen.getByText("Договір: 15.03.2024 — 28.02.2025 · завершений")).toBeInTheDocument();
    const endedPeriod = { date_from: "2024-03-01", date_to: "2025-02-01" };
    await waitFor(() => expect(getConsumptionStats).toHaveBeenLastCalledWith(1, endedPeriod));
    await waitFor(() => expect(getIncomeStats).toHaveBeenLastCalledWith(undefined, endedPeriod));

    await user.selectOptions(tenantSelect, "12");
    expect(screen.getByLabelText("Період від")).toHaveValue("2025-03");
    expect(screen.getByLabelText("Період до")).toHaveValue("2026-07");
    expect(tenantSelect).toHaveValue("12");
    expect(screen.getByText("Договір: 01.03.2025 — досі · активний")).toBeInTheDocument();
    const activePeriod = { date_from: "2025-03-01", date_to: "2026-07-01" };
    await waitFor(() => expect(getConsumptionStats).toHaveBeenLastCalledWith(1, activePeriod));
    await waitFor(() => expect(getIncomeStats).toHaveBeenLastCalledWith(undefined, activePeriod));

    await user.clear(screen.getByLabelText("Період від"));
    await user.type(screen.getByLabelText("Період від"), "2025-04");
    expect(tenantSelect).toHaveValue("");
    expect(screen.queryByText(/Договір:/)).not.toBeInTheDocument();

    await user.selectOptions(tenantSelect, "12");
    expect(tenantSelect).toHaveValue("12");
    expect(screen.getByText("Договір: 01.03.2025 — досі · активний")).toBeInTheDocument();
  });

  it("uses the Kyiv current month for an active tenant", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-07-31T21:30:00Z"));
    const user = userEvent.setup();
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    vi.spyOn(apiClient, "getTenants").mockResolvedValue([tenant({ contract_start: "2026-01-01", contract_end: null })]);
    const getConsumptionStats = vi.spyOn(apiClient, "getConsumptionStats").mockResolvedValue({ apartment_id: 1, months: null, series: [] });
    vi.spyOn(apiClient, "getIncomeStats").mockResolvedValue(incomeStats());

    renderStats();
    await user.selectOptions(await screen.findByLabelText("Орендар для статистики"), "11");

    expect(screen.getByLabelText("Період до")).toHaveValue("2026-08");
    await waitFor(() => expect(getConsumptionStats).toHaveBeenLastCalledWith(1, {
      date_from: "2026-01-01",
      date_to: "2026-08-01",
    }));
  });

  it("uses the contract start month for a future active tenant", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-07-17T12:00:00Z"));
    const user = userEvent.setup();
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    vi.spyOn(apiClient, "getTenants").mockResolvedValue([tenant({ contract_start: "2026-09-15", contract_end: null })]);
    const getConsumptionStats = vi.spyOn(apiClient, "getConsumptionStats").mockResolvedValue({ apartment_id: 1, months: null, series: [] });
    const getIncomeStats = vi.spyOn(apiClient, "getIncomeStats").mockResolvedValue(incomeStats());

    renderStats();
    await user.selectOptions(await screen.findByLabelText("Орендар для статистики"), "11");

    expect(screen.getByLabelText("Період від")).toHaveValue("2026-09");
    expect(screen.getByLabelText("Період до")).toHaveValue("2026-09");
    expect(screen.queryByText("Початок періоду не може бути пізніше завершення.")).not.toBeInTheDocument();
    const period = { date_from: "2026-09-01", date_to: "2026-09-01" };
    await waitFor(() => expect(getConsumptionStats).toHaveBeenLastCalledWith(1, period));
    await waitFor(() => expect(getIncomeStats).toHaveBeenLastCalledWith(undefined, period));
  });

  it("uses the first tenant when contract month ranges match", async () => {
    const matchingTenants: apiClient.Tenant[] = [
      tenant({
        full_name: "Перший орендар",
        contract_start: "2025-04-01",
        contract_end: "2025-04-14",
      }),
      tenant({
        id: 12,
        full_name: "Другий орендар",
        contract_start: "2025-04-15",
        contract_end: "2025-04-30",
      }),
    ];
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    vi.spyOn(apiClient, "getTenants").mockResolvedValue(matchingTenants);
    vi.spyOn(apiClient, "getConsumptionStats").mockResolvedValue({ apartment_id: 1, months: null, series: [] });
    vi.spyOn(apiClient, "getIncomeStats").mockResolvedValue(incomeStats());

    renderStats("/stats?apartment=1&scope=portfolio&period=custom&from=2025-04&to=2025-04");

    expect(await screen.findByLabelText("Орендар для статистики")).toHaveValue("11");
    expect(screen.getByText("Договір: 01.04.2025 — 14.04.2025 · завершений")).toBeInTheDocument();
    expect(screen.queryByText("Договір: 15.04.2025 — 30.04.2025 · завершений")).not.toBeInTheDocument();
  });

  it("does not match an active tenant from a stale URL in the next month", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 7, 1));
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    vi.spyOn(apiClient, "getTenants").mockResolvedValue([tenant({
      full_name: "Поточний орендар",
      contract_start: "2025-03-01",
      contract_end: null,
    })]);
    vi.spyOn(apiClient, "getConsumptionStats").mockResolvedValue({ apartment_id: 1, months: null, series: [] });
    vi.spyOn(apiClient, "getIncomeStats").mockResolvedValue(incomeStats());

    renderStats("/stats?apartment=1&scope=portfolio&period=custom&from=2025-03&to=2026-07");

    expect(await screen.findByLabelText("Орендар для статистики")).toHaveValue("");
    expect(screen.queryByText(/Договір:/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Період до")).toHaveValue("2026-07");
  });

  it("does not expose tenants from the previous apartment while the next request is pending", async () => {
    const user = userEvent.setup();
    const allApartments = [
      apartments[0],
      { ...apartments[0], id: 2, name: "Квартира на Печерську" },
    ];
    const firstRequest = deferred<apiClient.Tenant[]>();
    const secondRequest = deferred<apiClient.Tenant[]>();
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(allApartments);
    vi.spyOn(apiClient, "getTenants").mockImplementation((apartmentId) => (
      apartmentId === 1 ? firstRequest.promise : secondRequest.promise
    ));
    vi.spyOn(apiClient, "getConsumptionStats").mockImplementation((apartmentId) => Promise.resolve({ apartment_id: apartmentId, months: 12, series: [] }));
    vi.spyOn(apiClient, "getIncomeStats").mockResolvedValue(incomeStats());

    renderStats();

    const apartmentSelect = await screen.findByLabelText("Квартира для статистики");
    await act(async () => firstRequest.resolve([tenant()]));
    expect(await screen.findByRole("option", { name: "Іван Петренко" })).toBeInTheDocument();

    await user.selectOptions(apartmentSelect, "2");

    expect(screen.queryByLabelText("Орендар для статистики")).not.toBeInTheDocument();
    await act(async () => secondRequest.resolve([tenant({
      id: 21,
      apartment_id: 2,
      full_name: "Олена Коваль",
    })]));
    expect(await screen.findByRole("option", { name: "Олена Коваль" })).toBeInTheDocument();
  });

  it("refreshes tenants when the apartment changes and hides an empty list", async () => {
    const user = userEvent.setup();
    const allApartments = [
      apartments[0],
      { ...apartments[0], id: 2, name: "Квартира на Печерську" },
      { ...apartments[0], id: 3, name: "Квартира на Липках" },
    ];
    const firstTenant = tenant();
    const secondTenant = { ...firstTenant, id: 21, apartment_id: 2, full_name: "Олена Коваль" };
    const tenantRequests = new Map<number, ReturnType<typeof deferred<apiClient.Tenant[]>>>();
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(allApartments);
    const getTenants = vi.spyOn(apiClient, "getTenants").mockImplementation((apartmentId) => {
      const request = deferred<apiClient.Tenant[]>();
      tenantRequests.set(apartmentId, request);
      return request.promise;
    });
    vi.spyOn(apiClient, "getConsumptionStats").mockImplementation((apartmentId) => Promise.resolve({ apartment_id: apartmentId, months: 12, series: [] }));
    vi.spyOn(apiClient, "getIncomeStats").mockResolvedValue(incomeStats());

    renderStats();

    const apartmentSelect = await screen.findByLabelText("Квартира для статистики");
    await waitFor(() => expect(getTenants).toHaveBeenCalledWith(1));
    await user.selectOptions(apartmentSelect, "2");
    await waitFor(() => expect(getTenants).toHaveBeenCalledWith(2));
    await act(async () => tenantRequests.get(2)!.resolve([secondTenant]));
    expect(await screen.findByRole("option", { name: "Олена Коваль" })).toBeInTheDocument();

    await act(async () => tenantRequests.get(1)!.resolve([firstTenant]));
    expect(screen.queryByRole("option", { name: "Іван Петренко" })).not.toBeInTheDocument();

    await user.selectOptions(apartmentSelect, "3");
    await waitFor(() => expect(getTenants).toHaveBeenCalledWith(3));
    await act(async () => tenantRequests.get(3)!.resolve([]));
    await waitFor(() => expect(screen.queryByLabelText("Орендар для статистики")).not.toBeInTheDocument());
    expect(getTenants).toHaveBeenCalledWith(1);
    expect(getTenants).toHaveBeenCalledWith(2);
    expect(getTenants).toHaveBeenCalledWith(3);
  });

  it("hides tenant loading errors without blocking statistics", async () => {
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    vi.spyOn(apiClient, "getTenants").mockRejectedValue(new Error("offline"));
    vi.spyOn(apiClient, "getConsumptionStats").mockResolvedValue({ apartment_id: 1, months: 12, series: [] });
    vi.spyOn(apiClient, "getIncomeStats").mockResolvedValue(incomeStats());

    renderStats();

    expect(await screen.findByText("Ще немає історії споживання для цієї квартири.")).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "Стековий графік доходу" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Орендар для статистики")).not.toBeInTheDocument();
    expect(screen.queryByText(/не вдалося завантажити орендар/i)).not.toBeInTheDocument();
  });

  it("shows empty states when history is missing", async () => {
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    vi.spyOn(apiClient, "getConsumptionStats").mockResolvedValue({ apartment_id: 1, months: 12, series: [] });
    vi.spyOn(apiClient, "getIncomeStats").mockResolvedValue({
      scope: "portfolio",
      apartment_id: null,
      months: 12,
      values: [],
      totals: { rent: "0.00", utilities: "0.00", adjustments: "0.00", total: "0.00" },
      top_service: null,
    });

    renderStats();

    expect(await screen.findByText("Ще немає історії споживання для цієї квартири.")).toBeInTheDocument();
    expect(await screen.findByText("Ще немає історії доходу за вибраний період.")).toBeInTheDocument();
    expect(screen.getByText("Немає даних")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("finishes failed requests and clears section errors after a successful retry", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    const getConsumptionStats = vi.spyOn(apiClient, "getConsumptionStats")
      .mockRejectedValue(new Error("offline"));
    const getIncomeStats = vi.spyOn(apiClient, "getIncomeStats")
      .mockRejectedValue(new Error("offline"));

    renderStats();

    expect(await screen.findByText("Не вдалося завантажити статистику споживання.")).toBeInTheDocument();
    expect(await screen.findByText("Не вдалося завантажити статистику доходу.")).toBeInTheDocument();
    expect(screen.queryByText("Завантажуємо споживання…")).not.toBeInTheDocument();
    expect(screen.queryByText("Завантажуємо дохід…")).not.toBeInTheDocument();

    getConsumptionStats.mockResolvedValue({ apartment_id: 1, months: 6, series: [] });
    getIncomeStats.mockResolvedValue({
      scope: "portfolio",
      apartment_id: null,
      months: 6,
      values: [],
      totals: { rent: "0.00", utilities: "0.00", adjustments: "0.00", total: "0.00" },
      top_service: null,
    });

    await user.click(screen.getByRole("button", { name: "6 міс" }));

    expect(await screen.findByText("Ще немає історії споживання для цієї квартири.")).toBeInTheDocument();
    expect(await screen.findByText("Ще немає історії доходу за вибраний період.")).toBeInTheDocument();
    expect(screen.queryByText("Не вдалося завантажити статистику споживання.")).not.toBeInTheDocument();
    expect(screen.queryByText("Не вдалося завантажити статистику доходу.")).not.toBeInTheDocument();
  });

  it("opens the invoice matching the peak month from the apartment scope", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    vi.spyOn(apiClient, "getConsumptionStats").mockResolvedValue({ apartment_id: 1, months: 12, series: [] });
    vi.spyOn(apiClient, "getIncomeStats").mockImplementation((apartmentId) => Promise.resolve(incomeStats(apartmentId)));
    const getInvoices = vi.spyOn(apiClient, "getInvoices").mockResolvedValue([januaryInvoice]);

    renderStats();
    await screen.findByText("Ще немає історії споживання для цієї квартири.");
    await user.click(screen.getByRole("button", { name: "Квартира" }));

    const tile = await screen.findByRole("link", { name: /Найбільша стаття/ });
    expect(getInvoices).toHaveBeenCalledWith({ apartmentId: 1 });
    expect(tile).toHaveAttribute("href", "/invoices/42");
    expect(tile).toHaveAttribute("title", "Відкрити рахунок січня");
    expect(tile).toHaveClass("stats-summary-tile-link");

    await user.click(screen.getByRole("button", { name: "Портфель" }));
    expect(screen.queryByRole("link", { name: /Найбільша стаття/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Квартира" }));
    const refreshedTile = await screen.findByRole("link", { name: /Найбільша стаття/ });
    await user.click(refreshedTile);
    expect(await screen.findByRole("heading", { name: "Рахунок відкрито" })).toBeInTheDocument();
  });

  it("removes a stale peak link synchronously when the apartment changes", async () => {
    const user = userEvent.setup();
    const secondApartment = { ...apartments[0], id: 2, name: "Квартира на Печерську" };
    vi.spyOn(apiClient, "getApartments").mockResolvedValue([...apartments, secondApartment]);
    vi.spyOn(apiClient, "getConsumptionStats").mockResolvedValue({ apartment_id: 1, months: 12, series: [] });
    vi.spyOn(apiClient, "getIncomeStats").mockImplementation((apartmentId) => {
      if (apartmentId === 2) return new Promise(() => undefined);
      return Promise.resolve(incomeStats(apartmentId));
    });
    vi.spyOn(apiClient, "getInvoices").mockResolvedValue([januaryInvoice]);

    renderStats();
    await screen.findByText("Ще немає історії споживання для цієї квартири.");
    await user.click(screen.getByRole("button", { name: "Квартира" }));
    expect(await screen.findByRole("link", { name: /Найбільша стаття/ })).toHaveAttribute("href", "/invoices/42");

    await user.selectOptions(screen.getByLabelText("Квартира для статистики"), "2");

    expect(screen.queryByRole("link", { name: /Найбільша стаття/ })).not.toBeInTheDocument();
  });

  it("keeps the peak tile non-clickable when no invoice matches", async () => {
    const user = userEvent.setup();
    let resolveInvoices!: (invoices: apiClient.InvoiceListItem[]) => void;
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    vi.spyOn(apiClient, "getConsumptionStats").mockResolvedValue({ apartment_id: 1, months: 12, series: [] });
    vi.spyOn(apiClient, "getIncomeStats").mockImplementation((apartmentId) => Promise.resolve(incomeStats(apartmentId)));
    const getInvoices = vi.spyOn(apiClient, "getInvoices").mockImplementation(() => new Promise((resolve) => { resolveInvoices = resolve; }));

    renderStats();
    await screen.findByText("Ще немає історії споживання для цієї квартири.");
    await user.click(screen.getByRole("button", { name: "Квартира" }));
    await waitFor(() => expect(getInvoices).toHaveBeenCalledWith({ apartmentId: 1 }));
    await act(async () => resolveInvoices([{ ...januaryInvoice, id: 43, period: "2026-02-01" }]));

    expect(screen.queryByRole("link", { name: /Найбільша стаття/ })).not.toBeInTheDocument();
    expect(screen.getByText("Найбільша стаття").closest("article")).toHaveClass("stats-summary-tile");
  });

  it("does not request invoices for the portfolio scope", async () => {
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    vi.spyOn(apiClient, "getConsumptionStats").mockResolvedValue({ apartment_id: 1, months: 12, series: [] });
    vi.spyOn(apiClient, "getIncomeStats").mockResolvedValue(incomeStats());
    const getInvoices = vi.spyOn(apiClient, "getInvoices");

    renderStats();

    await screen.findByText(/62,5% · пік — січ/);
    expect(getInvoices).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: /Найбільша стаття/ })).not.toBeInTheDocument();
    expect(screen.getByText("Найбільша стаття").closest("article")).toHaveClass("stats-summary-tile");
  });

  it("keeps the peak tile non-clickable when invoices fail to load", async () => {
    const user = userEvent.setup();
    let rejectInvoices!: (error: Error) => void;
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    vi.spyOn(apiClient, "getConsumptionStats").mockResolvedValue({ apartment_id: 1, months: 12, series: [] });
    vi.spyOn(apiClient, "getIncomeStats").mockImplementation((apartmentId) => Promise.resolve(incomeStats(apartmentId)));
    const getInvoices = vi.spyOn(apiClient, "getInvoices").mockImplementation(() => new Promise((_, reject) => { rejectInvoices = reject; }));

    renderStats();
    await screen.findByText("Ще немає історії споживання для цієї квартири.");
    await user.click(screen.getByRole("button", { name: "Квартира" }));
    await waitFor(() => expect(getInvoices).toHaveBeenCalledWith({ apartmentId: 1 }));
    await act(async () => rejectInvoices(new Error("offline")));

    expect(screen.queryByRole("link", { name: /Найбільша стаття/ })).not.toBeInTheDocument();
    expect(screen.getByText("Найбільша стаття").closest("article")).toHaveClass("stats-summary-tile");
    expect(screen.queryByText(/не вдалося завантажити рахунки/i)).not.toBeInTheDocument();
  });

  it("renders the P&L summary tiles, trend chart and category breakdown", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 6, 16));
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    vi.spyOn(apiClient, "getConsumptionStats").mockResolvedValue({ apartment_id: 1, months: 12, series: [] });
    vi.spyOn(apiClient, "getIncomeStats").mockResolvedValue(incomeStats());
    vi.spyOn(apiClient, "getPnlStats").mockResolvedValue(pnlStats());

    renderStats();

    const pnlChart = await screen.findByRole("img", { name: /Графік P&L/ });
    expect(pnlChart.querySelector(".pnl-income")).toHaveAttribute("fill", "var(--chart-rent)");
    expect(pnlChart.querySelector(".pnl-expense")).toHaveAttribute("fill", "var(--chart-expense)");
    expect(pnlChart.querySelector(".pnl-net-line")).toHaveAttribute("stroke", "var(--chart-net)");
    expect(pnlChart.innerHTML).not.toMatch(/NaN/);

    const pnlSummary = screen.getByLabelText("Підсумки P&L");
    expect(pnlSummary).toHaveTextContent("Дохід");
    expect(pnlSummary).toHaveTextContent("15 000,00 ₴");
    expect(pnlSummary).toHaveTextContent("Витрати");
    expect(pnlSummary).toHaveTextContent("10 000,00 ₴");
    expect(pnlSummary).toHaveTextContent("66,67%");
    expect(pnlSummary).not.toHaveTextContent("неповний показник");

    expect(screen.getByText("Витрати за категоріями")).toBeInTheDocument();
    const breakdown = screen.getByText("Витрати за категоріями").closest(".pnl-breakdown");
    expect(breakdown).toHaveTextContent("Ремонт");
    expect(breakdown).toHaveTextContent("Податок");
    expect(breakdown).not.toHaveTextContent("Страхування");
  });

  it("reloads P&L when the scope and period change", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    vi.spyOn(apiClient, "getConsumptionStats").mockResolvedValue({ apartment_id: 1, months: 12, series: [] });
    vi.spyOn(apiClient, "getIncomeStats").mockImplementation((apartmentId) => Promise.resolve(incomeStats(apartmentId)));
    const getPnlStats = vi.spyOn(apiClient, "getPnlStats").mockImplementation((apartmentId) => (
      Promise.resolve(pnlStats(apartmentId === undefined ? {} : { scope: "apartment", apartment_id: apartmentId }))
    ));

    renderStats();

    await screen.findByRole("img", { name: /Графік P&L/ });
    await waitFor(() => expect(getPnlStats).toHaveBeenLastCalledWith(undefined, { months: 12 }));

    await user.click(screen.getByRole("button", { name: "Квартира" }));
    await waitFor(() => expect(getPnlStats).toHaveBeenLastCalledWith(1, { months: 12 }));

    await user.click(screen.getByRole("button", { name: "6 міс" }));
    await waitFor(() => expect(getPnlStats).toHaveBeenLastCalledWith(1, { months: 6 }));
  });

  it("shows an empty P&L state without a chart", async () => {
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    vi.spyOn(apiClient, "getConsumptionStats").mockResolvedValue({ apartment_id: 1, months: 12, series: [] });
    vi.spyOn(apiClient, "getIncomeStats").mockResolvedValue(incomeStats());
    vi.spyOn(apiClient, "getPnlStats").mockResolvedValue(emptyPnlStats());

    renderStats();

    expect(await screen.findByText("Ще немає даних P&L за вибраний період.")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Графік P&L/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Підсумки P&L")).not.toBeInTheDocument();
  });

  it("shows the unconverted warning when only unconverted expenses exist", async () => {
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    vi.spyOn(apiClient, "getConsumptionStats").mockResolvedValue({ apartment_id: 1, months: 12, series: [] });
    vi.spyOn(apiClient, "getIncomeStats").mockResolvedValue(incomeStats());
    vi.spyOn(apiClient, "getPnlStats").mockResolvedValue(pnlStats({
      values: [],
      totals: { income: "0.00", expenses_total: "0.00", expenses_by_category: {}, net: "0.00", margin_percent: null },
      unconverted: { count: 2, by_currency: { EUR: "300.00" } },
    }));

    renderStats();

    const note = await screen.findByRole("note");
    expect(note).toHaveTextContent(/2 витрат неконвертовано/);
    expect(note).toHaveTextContent(/300 EUR/);
    expect(screen.queryByText("Ще немає даних P&L за вибраний період.")).not.toBeInTheDocument();
  });

  it("flags the net and margin as incomplete when expenses are unconverted", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 6, 16));
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    vi.spyOn(apiClient, "getConsumptionStats").mockResolvedValue({ apartment_id: 1, months: 12, series: [] });
    vi.spyOn(apiClient, "getIncomeStats").mockResolvedValue(incomeStats());
    vi.spyOn(apiClient, "getPnlStats").mockResolvedValue(pnlStats({
      unconverted: { count: 2, by_currency: { EUR: "300.00" } },
    }));

    renderStats();

    const note = await screen.findByRole("note");
    expect(note).toHaveTextContent(/2 витрат неконвертовано/);
    expect(note).toHaveTextContent(/300 EUR/);
    expect(note).toHaveTextContent(/чистий і маржа неповні/);

    const pnlSummary = screen.getByLabelText("Підсумки P&L");
    const netTile = within(pnlSummary).getByText("Чистий").closest("article");
    const marginTile = within(pnlSummary).getByText("Маржа").closest("article");
    expect(netTile).toHaveTextContent("неповний показник");
    expect(netTile).toHaveTextContent("10 000,00 ₴*");
    expect(marginTile).toHaveTextContent("неповний показник");
    expect(marginTile).toHaveTextContent("66,67%*");
  });

  it("shows a year-over-year overlay only when the range spans the previous year", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 6, 16));
    const user = userEvent.setup();
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    vi.spyOn(apiClient, "getConsumptionStats").mockResolvedValue({
      apartment_id: 1,
      months: null,
      series: [{
        service_id: 1,
        service_name: "Газ",
        unit: "м³",
        values: [
          { period: "2024-06-01", consumed: "10", cost: "200" },
          { period: "2025-06-01", consumed: "14", cost: "280" },
        ],
        summary: { avg: "12", min: "10", max: "14" },
      }],
    });
    vi.spyOn(apiClient, "getIncomeStats").mockResolvedValue(incomeStats());

    renderStats();

    const defaultChart = await screen.findByRole("img", { name: "Графік споживання: Газ" });
    expect(defaultChart.querySelector(".chart-yoy-line")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Довільний період" }));
    fireEvent.change(screen.getByLabelText("Період від"), { target: { value: "2024-01" } });
    fireEvent.change(screen.getByLabelText("Період до"), { target: { value: "2025-12" } });

    const spanningChart = await screen.findByRole("img", { name: "Графік споживання: Газ" });
    await waitFor(() => expect(spanningChart.querySelector(".chart-yoy-line")).toBeInTheDocument());
    expect(spanningChart.querySelector(".chart-yoy-line title")).toHaveTextContent("Той самий місяць торік");
  });

  it("shows month-over-month deltas and omits them without a previous month", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 6, 16));
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    vi.spyOn(apiClient, "getConsumptionStats").mockResolvedValue({
      apartment_id: 1,
      months: 12,
      series: [
        {
          service_id: 1,
          service_name: "Газ",
          unit: "м³",
          values: [
            { period: "2026-05-01", consumed: "10", cost: "0" },
            { period: "2026-06-01", consumed: "15", cost: "0" },
          ],
          summary: { avg: "12.5", min: "10", max: "15" },
        },
        {
          service_id: 2,
          service_name: "Вода",
          unit: "м³",
          values: [
            { period: "2026-04-01", consumed: "8", cost: "0" },
            { period: "2026-06-01", consumed: "9", cost: "0" },
          ],
          summary: { avg: "8.5", min: "8", max: "9" },
        },
      ],
    });
    vi.spyOn(apiClient, "getIncomeStats").mockResolvedValue(incomeStats());

    renderStats();

    const gasCard = (await screen.findByRole("img", { name: "Графік споживання: Газ" })).closest("article") as HTMLElement;
    expect(within(gasCard).getByLabelText("До попереднього місяця: зростання на 50%")).toBeInTheDocument();

    const waterCard = screen.getByRole("img", { name: "Графік споживання: Вода" }).closest("article") as HTMLElement;
    expect(within(waterCard).queryByLabelText(/До попереднього місяця/)).not.toBeInTheDocument();
  });

  it("shows the avg/min/max summary for each service", async () => {
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    vi.spyOn(apiClient, "getConsumptionStats").mockResolvedValue({
      apartment_id: 1,
      months: 12,
      series: [{
        service_id: 1,
        service_name: "Газ",
        unit: "м³",
        values: [
          { period: "2026-05-01", consumed: "10", cost: "0" },
          { period: "2026-06-01", consumed: "15", cost: "0" },
        ],
        summary: { avg: "12", min: "10", max: "15" },
      }],
    });
    vi.spyOn(apiClient, "getIncomeStats").mockResolvedValue(incomeStats());

    renderStats();

    const summary = await screen.findByLabelText("Зведення споживання: Газ");
    expect(summary).toHaveTextContent("Сер.");
    expect(summary).toHaveTextContent("12 м³");
    expect(summary).toHaveTextContent("10 м³");
    expect(summary).toHaveTextContent("15 м³");
  });

  it("switches the consumption display between units and hryvnia", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    vi.spyOn(apiClient, "getConsumptionStats").mockResolvedValue({
      apartment_id: 1,
      months: 12,
      series: [{
        service_id: 1,
        service_name: "Газ",
        unit: "м³",
        values: [
          { period: "2026-05-01", consumed: "10", cost: "190" },
          { period: "2026-06-01", consumed: "15", cost: "280" },
        ],
        summary: { avg: "12", min: "10", max: "15" },
      }],
    });
    vi.spyOn(apiClient, "getIncomeStats").mockResolvedValue(incomeStats());

    renderStats();

    const chart = await screen.findByRole("img", { name: "Графік споживання: Газ" });
    const heading = chart.closest("article")!.querySelector(".chart-card-heading") as HTMLElement;
    expect(within(heading).getByText("м³")).toBeInTheDocument();
    expect(within(heading).getByText("15")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "₴" }));

    expect(within(heading).getByText("₴")).toBeInTheDocument();
    expect(within(heading).getByText("280")).toBeInTheDocument();
    const costSummary = await screen.findByLabelText("Зведення споживання: Газ");
    // avg = (190 + 280) / 2 = 235, min = 190, max = 280 (computed from cost).
    expect(costSummary).toHaveTextContent("235 ₴");
    expect(costSummary).toHaveTextContent("190 ₴");
    expect(costSummary).toHaveTextContent("280 ₴");
  });

  it("shows a year-over-year delta badge for the same month last year", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 6, 16));
    const user = userEvent.setup();
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    vi.spyOn(apiClient, "getConsumptionStats").mockResolvedValue({
      apartment_id: 1,
      months: null,
      series: [{
        service_id: 1,
        service_name: "Газ",
        unit: "м³",
        values: [
          { period: "2024-06-01", consumed: "10", cost: "200" },
          { period: "2025-06-01", consumed: "14", cost: "280" },
        ],
        summary: { avg: "12", min: "10", max: "14" },
      }],
    });
    vi.spyOn(apiClient, "getIncomeStats").mockResolvedValue(incomeStats());

    renderStats();

    await user.click(screen.getByRole("button", { name: "Довільний період" }));
    fireEvent.change(screen.getByLabelText("Період від"), { target: { value: "2024-01" } });
    fireEvent.change(screen.getByLabelText("Період до"), { target: { value: "2025-12" } });

    const gasCard = (await screen.findByRole("img", { name: "Графік споживання: Газ" })).closest("article") as HTMLElement;
    // Current 2025-06 (14) vs same month last year 2024-06 (10) = +40%.
    expect(within(gasCard).getByLabelText("Рік до року: зростання на 40%")).toBeInTheDocument();
  });

  it("shows a downward delta and omits it when the previous month is zero", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 6, 16));
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    vi.spyOn(apiClient, "getConsumptionStats").mockResolvedValue({
      apartment_id: 1,
      months: 12,
      series: [
        {
          service_id: 1,
          service_name: "Газ",
          unit: "м³",
          values: [
            { period: "2026-05-01", consumed: "15", cost: "0" },
            { period: "2026-06-01", consumed: "12", cost: "0" },
          ],
          summary: { avg: "13.5", min: "12", max: "15" },
        },
        {
          service_id: 2,
          service_name: "Вода",
          unit: "м³",
          values: [
            { period: "2026-05-01", consumed: "0", cost: "0" },
            { period: "2026-06-01", consumed: "9", cost: "0" },
          ],
          summary: { avg: "4.5", min: "0", max: "9" },
        },
      ],
    });
    vi.spyOn(apiClient, "getIncomeStats").mockResolvedValue(incomeStats());

    renderStats();

    // 15 -> 12 = -20% downward badge.
    const gasCard = (await screen.findByRole("img", { name: "Графік споживання: Газ" })).closest("article") as HTMLElement;
    const downBadge = within(gasCard).getByLabelText("До попереднього місяця: зниження на 20%");
    expect(downBadge).toBeInTheDocument();
    expect(downBadge).toHaveClass("consumption-delta-down");

    // Previous month is zero -> divide-by-zero guard suppresses the badge.
    const waterCard = screen.getByRole("img", { name: "Графік споживання: Вода" }).closest("article") as HTMLElement;
    expect(within(waterCard).queryByLabelText(/До попереднього місяця/)).not.toBeInTheDocument();
  });

  it("shows an error banner when P&L fails to load", async () => {
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    vi.spyOn(apiClient, "getConsumptionStats").mockResolvedValue({ apartment_id: 1, months: 12, series: [] });
    vi.spyOn(apiClient, "getIncomeStats").mockResolvedValue(incomeStats());
    vi.spyOn(apiClient, "getPnlStats").mockRejectedValue(new Error("offline"));

    renderStats();

    expect(await screen.findByText("Не вдалося завантажити P&L.")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Графік P&L/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Підсумки P&L")).not.toBeInTheDocument();
  });
});
