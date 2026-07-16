import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, vi } from "vitest";

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

function renderStats() {
  return render(
    <MemoryRouter initialEntries={["/stats"]}>
      <Routes>
        <Route path="/stats" element={<Stats />} />
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

afterEach(() => vi.restoreAllMocks());

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
    await screen.findByText("Ще немає історії споживання для цієї квартири.");
    await user.click(screen.getByRole("button", { name: "Довільний період" }));
    fireEvent.change(screen.getByLabelText("Період від"), { target: { value: "2025-05" } });
    fireEvent.change(screen.getByLabelText("Період до"), { target: { value: "2025-07" } });

    const period = { date_from: "2025-05-01", date_to: "2025-07-01" };
    await waitFor(() => expect(getConsumptionStats).toHaveBeenLastCalledWith(1, period));
    await waitFor(() => expect(getIncomeStats).toHaveBeenLastCalledWith(undefined, period));
    expect(screen.getByText(/Споживання та дохід за травень 2025.*липень 2025/)).toBeInTheDocument();

    const consumptionCalls = getConsumptionStats.mock.calls.length;
    const incomeCalls = getIncomeStats.mock.calls.length;
    fireEvent.change(screen.getByLabelText("Період від"), { target: { value: "2025-08" } });
    expect(await screen.findByText("Початок періоду не може бути пізніше завершення.")).toBeInTheDocument();
    expect(getConsumptionStats).toHaveBeenCalledTimes(consumptionCalls);
    expect(getIncomeStats).toHaveBeenCalledTimes(incomeCalls);
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

    await user.click(tile);
    expect(await screen.findByRole("heading", { name: "Рахунок відкрито" })).toBeInTheDocument();
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
