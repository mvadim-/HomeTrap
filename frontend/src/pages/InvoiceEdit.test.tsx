import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, vi } from "vitest";

import * as apiClient from "../api/client";
import { InvoiceEdit } from "./InvoiceEdit";

afterEach(() => vi.restoreAllMocks());

const draft: apiClient.Invoice = {
  id: 7, apartment_id: 1, period: "2026-07-01", status: "draft", issued_at: null,
  paid_at: null, exchange_rate: "44.68", rent_amount_usd: "325.00",
  rent_amount_uah: "14521.00", utilities_total: "0.00", grand_total: "14521.00",
  warnings: [], lines: [{ id: 10, service_id: 5, service_name: "Газ", service_kind: "metered", prev_reading: "100.000", curr_reading: null, consumed: null, tariff_value: "7.95689", amount: "0.00" }],
};

describe("InvoiceEdit", () => {
  it("issues a draft and shows actions for the resulting status", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "getInvoice").mockResolvedValue(draft);
    vi.spyOn(apiClient, "getServices").mockResolvedValue([{
      id: 5, apartment_id: 1, name: "Газ", kind: "metered", unit: "м³",
      provider_account: null, sort_order: 0, is_active: true,
    }]);
    const update = vi.spyOn(apiClient, "updateInvoice").mockResolvedValue(draft);
    const transition = vi.spyOn(apiClient, "transitionInvoice").mockResolvedValue({
      ...draft, status: "issued", issued_at: "2026-07-14T12:00:00Z",
    });

    render(
      <MemoryRouter initialEntries={["/invoices/7"]}>
        <Routes><Route path="/invoices/:invoiceId" element={<InvoiceEdit />} /></Routes>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "Виставити" }));
    expect(update).toHaveBeenCalledWith(7, expect.objectContaining({ exchange_rate: "44.68" }));
    await screen.findByRole("button", { name: "Позначити оплаченим" });
    expect(transition).toHaveBeenCalledWith(7, "issue");
    expect(await screen.findByRole("button", { name: "Позначити оплаченим" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Повернути в чернетку" })).toBeInTheDocument();
  });

  it.each([
    ["issued", "Повернути в чернетку", "revert-to-draft", "draft"],
    ["issued", "Позначити оплаченим", "mark-paid", "paid"],
    ["paid", "Скасувати оплату", "unmark-paid", "issued"],
  ] as const)("maps %s action to the backend transition", async (status, label, action, resultStatus) => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "getInvoice").mockResolvedValue({ ...draft, status });
    const transition = vi.spyOn(apiClient, "transitionInvoice").mockResolvedValue({
      ...draft,
      status: resultStatus,
    });
    render(
      <MemoryRouter initialEntries={["/invoices/7"]}>
        <Routes><Route path="/invoices/:invoiceId" element={<InvoiceEdit />} /></Routes>
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole("button", { name: label }));
    expect(transition).toHaveBeenCalledWith(7, action);
  });

  it("keeps the current status and shows transition errors", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "getInvoice").mockResolvedValue({ ...draft, status: "issued" });
    vi.spyOn(apiClient, "transitionInvoice").mockRejectedValue(new apiClient.ApiError(409, "Later invoice exists"));
    render(
      <MemoryRouter initialEntries={["/invoices/7"]}>
        <Routes><Route path="/invoices/:invoiceId" element={<InvoiceEdit />} /></Routes>
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole("button", { name: "Повернути в чернетку" }));
    expect(await screen.findByText("Later invoice exists")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Повернути в чернетку" })).toBeInTheDocument();
  });
});
