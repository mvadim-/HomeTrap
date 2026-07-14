import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, vi } from "vitest";

import * as apiClient from "../api/client";
import { Dashboard } from "./Dashboard";

afterEach(() => vi.restoreAllMocks());

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
        period: "2026-07-01",
        status: "issued",
        grand_total: "4731.51",
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
      latest_invoice: {
        id: 7,
        period: "2026-07-01",
        status: "issued",
        grand_total: "16731.51",
      },
    }]);
    vi.spyOn(apiClient, "getCurrentRate").mockResolvedValue({
      requested_date: "2026-07-14",
      rate_date: "2026-07-14",
      currency: "USD",
      rate: "44.680000",
      is_fallback: false,
    });

    render(<MemoryRouter><Dashboard /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "Дашборд" })).toBeInTheDocument();
    expect(screen.getByText("Нараховано")).toBeInTheDocument();
    expect(screen.getAllByText(/16.?731,51 ₴/).length).toBeGreaterThan(0);
    expect(screen.getByText("44.68 ₴")).toBeInTheDocument();
    expect(screen.getAllByText("Квартира на Подолі")).toHaveLength(2);
    expect(screen.getByText("Виставлений")).toBeInTheDocument();
    expect(screen.getByText("Очікує оплати")).toBeInTheDocument();
  });
});
