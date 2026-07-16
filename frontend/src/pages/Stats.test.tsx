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
      series: ["Газ", "Світло", "Вода"].map((service_name, index) => ({
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
    expect(await screen.findByRole("img", { name: "Графік споживання: Газ" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Графік споживання: Світло" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Графік споживання: Вода" })).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: "Стековий графік доходу" })).toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: "6 міс" }));

    await waitFor(() => expect(getConsumptionStats).toHaveBeenLastCalledWith(1, { months: 6 }));
    await waitFor(() => expect(getIncomeStats).toHaveBeenLastCalledWith(undefined, { months: 6 }));
    expect(screen.getByText("Споживання та дохід за останні 6 місяців")).toBeInTheDocument();

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
});
