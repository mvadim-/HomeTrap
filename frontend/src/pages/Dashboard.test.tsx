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
    vi.spyOn(apiClient, "getCurrentRate").mockResolvedValue({
      requested_date: "2026-07-14",
      rate_date: "2026-07-14",
      currency: "USD",
      rate: "44.748000",
      is_fallback: false,
    });

    render(<MemoryRouter><Dashboard /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "Дашборд" })).toBeInTheDocument();
    expect(screen.getByText("Нараховано")).toBeInTheDocument();
    expect(screen.getAllByText(/16.?731,51 ₴/).length).toBeGreaterThan(0);
    expect(screen.getByText("44,75 ₴")).toBeInTheDocument();
    expect(screen.getAllByText("Квартира на Подолі")).toHaveLength(2);
    expect(screen.getByText("Виставлений")).toBeInTheDocument();
    expect(screen.getByText("Прострочена оплата")).toBeInTheDocument();
    expect(screen.getByText("Завершіть чернетку")).toBeInTheDocument();
    expect(screen.getByText("Очікує оплати")).toBeInTheDocument();
    expect(screen.getByText("Оксана К. · оренда 325 $")).toBeInTheDocument();
    expect(screen.getByText("Квартира вільна")).toBeInTheDocument();

    expect(screen.getByText("Оплачено").nextElementSibling).toHaveClass("note-pos");
    expect(screen.getByText("Заборгованість").nextElementSibling).toHaveClass("note-neg");
    expect(screen.getByText("Квартира на Подолі", { selector: "h3" }).closest(".apartment-card")?.querySelector(".apartment-avatar")).toHaveTextContent("К");
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
    vi.spyOn(apiClient, "getCurrentRate").mockResolvedValue({
      requested_date: "2026-07-14",
      rate_date: "2026-07-14",
      currency: "USD",
      rate: "44.680000",
      is_fallback: false,
    });

    render(<MemoryRouter><Dashboard /></MemoryRouter>);

    expect(await screen.findByText("Заборгованість")).toBeInTheDocument();
    expect(screen.getByText("Заборгованість").nextElementSibling).not.toHaveClass("note-neg");
  });
});
