import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
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

  it("shows trimmed readings and tariff values in the invoice table", async () => {
    vi.spyOn(apiClient, "getInvoice").mockResolvedValue({
      ...draft,
      exchange_rate: "44.791700",
      lines: [{
        ...draft.lines[0],
        prev_reading: "9582.000",
        curr_reading: "9583.500",
        tariff_value: "197.91000",
      }],
    });

    render(
      <MemoryRouter initialEntries={["/invoices/7"]}>
        <Routes><Route path="/invoices/:invoiceId" element={<InvoiceEdit />} /></Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/9.?582/)).toBeInTheDocument();
    expect(screen.getByLabelText("Поточний показник Газ")).toHaveValue("9\u00a0583,5");
    expect(screen.getByText("197,91 ₴")).toBeInTheDocument();
    expect(screen.getByLabelText("Курс USD")).toHaveValue("44,7917");
  });

  it("shows a paid invoice as read-only text without the readings warning", async () => {
    vi.spyOn(apiClient, "getInvoice").mockResolvedValue({
      ...draft,
      status: "paid",
      paid_at: "2026-07-16T12:00:00Z",
      exchange_rate: "44.791700",
      warnings: [{
        code: "consumption_anomaly",
        message: "Anomalous consumption",
        service_id: 5,
      }],
      lines: [{ ...draft.lines[0], curr_reading: "9583.500" }],
    });

    render(
      <MemoryRouter initialEntries={["/invoices/7"]}>
        <Routes><Route path="/invoices/:invoiceId" element={<InvoiceEdit />} /></Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("44,7917")).toHaveClass("invoice-readonly-value");
    expect(screen.getByText(/9.583,5/)).toHaveClass("invoice-readonly-value");
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not issue a draft with an invalid exponent rate", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "getInvoice").mockResolvedValue(draft);
    const update = vi.spyOn(apiClient, "updateInvoice").mockResolvedValue(draft);
    const transition = vi.spyOn(apiClient, "transitionInvoice").mockResolvedValue(draft);
    render(
      <MemoryRouter initialEntries={["/invoices/7"]}>
        <Routes><Route path="/invoices/:invoiceId" element={<InvoiceEdit />} /></Routes>
      </MemoryRouter>,
    );

    const rate = await screen.findByLabelText("Курс USD");
    await user.clear(rate);
    await user.type(rate, "1e3");

    expect(screen.getByRole("button", { name: "Зберегти й виставити" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Зберегти чернетку" })).toBeDisabled();
    expect(update).not.toHaveBeenCalled();
    expect(transition).not.toHaveBeenCalled();
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

  it("deletes a confirmed draft", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "getInvoice").mockResolvedValue(draft);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const remove = vi.spyOn(apiClient, "deleteInvoice").mockResolvedValue();
    render(
      <MemoryRouter initialEntries={["/invoices/7"]}>
        <Routes>
          <Route path="/invoices/:invoiceId" element={<InvoiceEdit />} />
          <Route path="/invoices" element={<p>Invoice list</p>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "Видалити чернетку" }));

    expect(window.confirm).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith(7);
  });

  it("ignores stale route loads and mutates only the current invoice", async () => {
    const user = userEvent.setup();
    let resolveFirstRequest: (invoice: apiClient.Invoice) => void = () => undefined;
    const firstRequest = new Promise<apiClient.Invoice>((resolve) => {
      resolveFirstRequest = resolve;
    });
    const currentInvoice: apiClient.Invoice = {
      ...draft,
      id: 8,
      period: "2026-08-01",
      lines: [{ ...draft.lines[0], id: 20, curr_reading: "208.000" }],
    };
    vi.spyOn(apiClient, "getInvoice").mockImplementation((invoiceId) => (
      invoiceId === 7 ? firstRequest : Promise.resolve(currentInvoice)
    ));
    const update = vi.spyOn(apiClient, "updateInvoice").mockResolvedValue(currentInvoice);
    const transition = vi.spyOn(apiClient, "transitionInvoice").mockResolvedValue({
      ...currentInvoice,
      status: "issued",
    });

    render(
      <MemoryRouter initialEntries={["/invoices/7"]}>
        <Link to="/invoices/8">Наступний рахунок</Link>
        <Routes><Route path="/invoices/:invoiceId" element={<InvoiceEdit />} /></Routes>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("link", { name: "Наступний рахунок" }));
    expect(await screen.findByLabelText("Поточний показник Газ")).toHaveValue("208");
    await act(async () => resolveFirstRequest(draft));
    expect(screen.getByLabelText("Поточний показник Газ")).toHaveValue("208");

    await user.click(screen.getByRole("button", { name: "Виставити" }));
    expect(update).toHaveBeenCalledWith(8, expect.any(Object));
    expect(transition).toHaveBeenCalledWith(8, "issue");
  });
});
