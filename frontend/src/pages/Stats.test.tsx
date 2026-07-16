import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

    render(<Stats />);

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

    const incomeChart = await screen.findByRole("img", { name: "Стековий графік доходу" });
    expect(incomeChart.querySelector(".income-rent")).toHaveAttribute("fill", "var(--chart-rent)");
    expect(incomeChart.querySelector(".income-utilities")).toHaveAttribute("fill", "var(--chart-util)");
    expect(incomeChart.querySelector(".income-rent")).toHaveAttribute("stroke", "var(--color-surface)");
    expect(incomeChart.querySelector(".income-rent")).toHaveAttribute("stroke-width", "2");
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

  it("renders a correction marker instead of bars for a month with a negative segment", async () => {
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

    render(<Stats />);

    const chart = await screen.findByRole("img", { name: "Стековий графік доходу" });
    const marker = screen.getByLabelText(/вер, коригування:/i);
    expect(marker).toHaveClass("income-adjustment-marker");
    expect(marker).toHaveTextContent(/Оренда: 0,00 ₴/);
    expect(marker).toHaveTextContent(/Комунальні: -10.?740,93 ₴/);
    expect(marker).toHaveTextContent(/Разом: -10.?740,93 ₴/);
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

    render(<Stats />);
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

    render(<Stats />);
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

    render(<Stats />);

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

    render(<Stats />);

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
});
