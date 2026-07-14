import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, vi } from "vitest";

import * as apiClient from "../api/client";
import { Invoices } from "./Invoices";

afterEach(() => vi.restoreAllMocks());

describe("Invoices", () => {
  it("renders invoice statuses and sends selected filters", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "getApartments").mockResolvedValue([{
      id: 1, name: "Квартира на Подолі", address: "Київ", rent_amount: "325.00",
      rent_currency: "USD", notes: null, is_active: true, latest_invoice: null,
    }]);
    const getInvoices = vi.spyOn(apiClient, "getInvoices").mockResolvedValue([{
      id: 7, apartment_id: 1, period: "2026-06-01", status: "issued",
      issued_at: "2026-06-03T10:00:00Z", paid_at: null, exchange_rate: "44.68",
      rent_amount_usd: "325.00", rent_amount_uah: "14521.00",
      utilities_total: "2210.51", grand_total: "16731.51",
    }]);

    render(<MemoryRouter><Invoices /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "Рахунки" })).toBeInTheDocument();
    expect((await screen.findAllByText("Квартира на Подолі")).length).toBeGreaterThan(1);
    expect(screen.getByText("Прострочений")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Переглянути" })).toHaveAttribute("href", "/invoices/7");

    await user.selectOptions(screen.getByLabelText("Фільтр за статусом"), "issued");
    await waitFor(() => expect(getInvoices).toHaveBeenLastCalledWith({ apartmentId: undefined, status: "issued" }));
  });
});
