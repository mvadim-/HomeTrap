import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
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
  return <output data-testid="location-search">{useLocation().search}</output>;
}

function renderStats(initialEntry = "/stats") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/stats" element={<><Stats /><LocationProbe /></>} />
        <Route path="/invoices/:invoiceId" element={<h1>Рахунок відкрито</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

function incomeStats(apartmentId?: number): apiClient.IncomeStats {
  return {
    scope: apartmentId === undefined ? "portfolio" : "apartment",
    apartment_id: apartmentId ?? null,
    months: 12,
    values: [{ period: "2026-01-01", rent: "13650.00", utilities: "2210.51", total: "15860.51" }],
    totals: { rent: "13650.00", utilities: "2210.51", total: "15860.51" },
    top_service: { name: "Газ", share_percent: "62.50", peak_period: "2026-01-01" },
  };
}

beforeEach(() => {
  vi.spyOn(apiClient, "getTenants").mockResolvedValue([]);
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
          { period: "2026-05-01", consumed: String(10 + index) },
          { period: "2026-06-01", consumed: String(12 + index) },
        ],
      })),
    });
    const getIncomeStats = vi.spyOn(apiClient, "getIncomeStats").mockResolvedValue({
      scope: "portfolio",
      apartment_id: null,
      months: 12,
      values: [{ period: "2026-06-01", rent: "14521.00", utilities: "2210.51", total: "16731.51" }],
      totals: { rent: "14521.00", utilities: "2210.51", total: "16731.51" },
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
          { period: "2025-09-01", consumed: "12" },
          { period: "2025-11-01", consumed: "18" },
        ],
      }],
    });
    vi.spyOn(apiClient, "getIncomeStats").mockResolvedValue({
      scope: "portfolio",
      apartment_id: null,
      months: 12,
      values: [
        { period: "2025-09-01", rent: "100.00", utilities: "20.00", total: "120.00" },
        { period: "2025-11-01", rent: "100.00", utilities: "30.00", total: "130.00" },
      ],
      totals: { rent: "200.00", utilities: "50.00", total: "250.00" },
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
      {
        id: 11,
        apartment_id: 1,
        full_name: "Іван Петренко",
        phone: null,
        email: null,
        contract_start: "2026-05-15",
        contract_end: null,
        notes: null,
      },
      {
        id: 12,
        apartment_id: 1,
        full_name: "Олена Коваль",
        phone: null,
        email: null,
        contract_start: "2025-07-01",
        contract_end: "2026-04-30",
        notes: null,
      },
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
      {
        id: 11,
        apartment_id: 1,
        full_name: "Іван Петренко",
        phone: null,
        email: null,
        contract_start: "2026-01-31",
        contract_end: "2026-01-31",
        notes: null,
      },
      {
        id: 12,
        apartment_id: 1,
        full_name: "Олена Коваль",
        phone: null,
        email: null,
        contract_start: "2026-03-15",
        contract_end: null,
        notes: null,
      },
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
    const coveringTenant: apiClient.Tenant = {
      id: 11,
      apartment_id: 1,
      full_name: "Іван Петренко",
      phone: null,
      email: null,
      contract_start: "2025-12-15",
      contract_end: "2026-03-01",
      notes: null,
    };
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

  it("renders a correction marker instead of bars for a month with a negative segment", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    vi.spyOn(apiClient, "getConsumptionStats").mockResolvedValue({ apartment_id: 1, months: 12, series: [] });
    vi.spyOn(apiClient, "getIncomeStats").mockResolvedValue({
      scope: "portfolio",
      apartment_id: null,
      months: 12,
      values: [
        { period: "2025-08-01", rent: "14521.00", utilities: "2210.51", total: "16731.51" },
        { period: "2025-09-01", rent: "0.00", utilities: "-10740.93", total: "-10740.93" },
      ],
      totals: { rent: "14521.00", utilities: "-8530.42", total: "5990.58" },
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
      totals: { rent: "0.00", utilities: "0.00", total: "0.00" },
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
      series: [{ service_id: 1, service_name: "Газ", unit: "м³", values: [{ period: "2025-06-01", consumed: "12" }] }],
    });
    const getIncomeStats = vi.spyOn(apiClient, "getIncomeStats").mockResolvedValue({
      scope: "portfolio",
      apartment_id: null,
      months: null,
      values: [{ period: "2025-06-01", rent: "100.00", utilities: "20.00", total: "120.00" }],
      totals: { rent: "100.00", utilities: "20.00", total: "120.00" },
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

  it("restores filters and the matching tenant from URL parameters", async () => {
    const allApartments = [
      apartments[0],
      { ...apartments[0], id: 2, name: "Квартира на Печерську", is_active: false },
    ];
    const tenant: apiClient.Tenant = {
      id: 21,
      apartment_id: 2,
      full_name: "Іван Петренко",
      phone: null,
      email: null,
      contract_start: "2024-03-15",
      contract_end: "2025-02-28",
      notes: null,
    };
    const period = { date_from: "2024-03-01", date_to: "2025-02-01" };
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(allApartments);
    vi.spyOn(apiClient, "getTenants").mockImplementation((apartmentId) => (
      Promise.resolve(apartmentId === 2 ? [tenant] : [])
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
    expect(screen.getAllByText("Оберіть початок і завершення періоду.")).toHaveLength(2);
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
      {
        id: 11,
        apartment_id: 1,
        full_name: "Іван Петренко",
        phone: null,
        email: null,
        contract_start: "2024-03-15",
        contract_end: "2025-02-28",
        notes: null,
      },
      {
        id: 12,
        apartment_id: 1,
        full_name: "Олена Коваль",
        phone: null,
        email: null,
        contract_start: "2025-03-01",
        contract_end: null,
        notes: null,
      },
    ];
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    vi.spyOn(apiClient, "getTenants").mockResolvedValue(tenants);
    const getConsumptionStats = vi.spyOn(apiClient, "getConsumptionStats").mockResolvedValue({ apartment_id: 1, months: null, series: [] });
    const getIncomeStats = vi.spyOn(apiClient, "getIncomeStats").mockResolvedValue({
      scope: "portfolio",
      apartment_id: null,
      months: null,
      values: [],
      totals: { rent: "0.00", utilities: "0.00", total: "0.00" },
      top_service: null,
    });

    renderStats();

    const tenantSelect = await screen.findByLabelText("Орендар для статистики");
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

  it("refreshes tenants when the apartment changes and hides an empty list", async () => {
    const user = userEvent.setup();
    const allApartments = [
      apartments[0],
      { ...apartments[0], id: 2, name: "Квартира на Печерську" },
      { ...apartments[0], id: 3, name: "Квартира на Липках" },
    ];
    const firstTenant: apiClient.Tenant = {
      id: 11,
      apartment_id: 1,
      full_name: "Іван Петренко",
      phone: null,
      email: null,
      contract_start: "2024-03-15",
      contract_end: "2025-02-28",
      notes: null,
    };
    const secondTenant = { ...firstTenant, id: 21, apartment_id: 2, full_name: "Олена Коваль" };
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(allApartments);
    const getTenants = vi.spyOn(apiClient, "getTenants").mockImplementation((apartmentId) => (
      Promise.resolve(apartmentId === 1 ? [firstTenant] : apartmentId === 2 ? [secondTenant] : [])
    ));
    vi.spyOn(apiClient, "getConsumptionStats").mockImplementation((apartmentId) => Promise.resolve({ apartment_id: apartmentId, months: 12, series: [] }));
    vi.spyOn(apiClient, "getIncomeStats").mockResolvedValue(incomeStats());

    renderStats();

    expect(await screen.findByRole("option", { name: "Іван Петренко" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Квартира для статистики"), "2");
    expect(await screen.findByRole("option", { name: "Олена Коваль" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Іван Петренко" })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Квартира для статистики"), "3");
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
      totals: { rent: "0.00", utilities: "0.00", total: "0.00" },
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
      totals: { rent: "0.00", utilities: "0.00", total: "0.00" },
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
});
