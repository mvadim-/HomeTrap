import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { Invoice } from "../api/client";
import { InvoiceCalculator } from "./InvoiceCalculator";

const invoice: Invoice = {
  id: 7,
  apartment_id: 1,
  period: "2026-07-01",
  status: "draft",
  issued_at: null,
  paid_at: null,
  exchange_rate: "44.680000",
  rent_amount_usd: "325.00",
  rent_amount_uah: "14521.00",
  utilities_total: "275.05",
  adjustments_total: "0.00",
  grand_total: "14796.05",
  warnings: [],
  lines: [
    { id: 10, service_id: 5, service_name: "Газ", kind: "metered", service_kind: "metered", prev_reading: "100.000", curr_reading: "122.000", consumed: "22.000", tariff_value: "7.95689", amount: "175.05", expense: null },
    { id: 11, service_id: 6, service_name: "Інтернет", kind: "fixed", service_kind: "fixed", prev_reading: null, curr_reading: null, consumed: null, tariff_value: "100.00", amount: "100.00", expense: null },
  ],
};

describe("InvoiceCalculator", () => {
  it("recalculates totals when a reading and exchange rate change", async () => {
    const user = userEvent.setup();
    render(<InvoiceCalculator invoice={invoice} onSave={vi.fn()} />);

    expect(screen.getByText("14 796,05 ₴")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("7,95689 ₴")).toBeInTheDocument();
    expect(screen.getByLabelText("Поточний показник Газ")).toHaveValue("122");
    expect(screen.getByLabelText("Курс USD")).toHaveValue("44,68");

    const reading = screen.getByLabelText("Поточний показник Газ");
    await user.clear(reading);
    await user.type(reading, "123");
    expect(screen.getByText("183,01 ₴")).toBeInTheDocument();
    expect(screen.getByText("14 804,01 ₴")).toBeInTheDocument();

    const rate = screen.getByLabelText("Курс USD");
    await user.clear(rate);
    await user.type(rate, "45");
    expect(screen.getByText("14 908,01 ₴")).toBeInTheDocument();
  });

  it("shows a warning when the current reading is below the previous one", async () => {
    const user = userEvent.setup();
    render(<InvoiceCalculator invoice={invoice} onSave={vi.fn()} />);

    const reading = screen.getByLabelText("Поточний показник Газ");
    await user.clear(reading);
    await user.type(reading, "99");

    expect(screen.getByRole("alert")).toHaveTextContent("Газ: поточний показник менший за попередній.");
    expect(screen.getByLabelText("Курс USD")).toBeInTheDocument();
    expect(screen.getByLabelText("Поточний показник Газ")).toBeInTheDocument();
  });

  it("renders paid invoice values as text without inputs or warnings", () => {
    const onDraftChange = vi.fn();
    render(
      <InvoiceCalculator
        invoice={{
          ...invoice,
          status: "paid",
          utilities_total: "300.00",
          grand_total: "14821.00",
          lines: [
            { ...invoice.lines[0], amount: "200.00" },
            invoice.lines[1],
          ],
          warnings: [{
            code: "consumption_anomaly",
            message: "Anomalous consumption",
            service_id: 5,
          }],
        }}
        onSave={vi.fn()}
        onDraftChange={onDraftChange}
      />,
    );

    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.getByText("44,68")).toHaveClass("invoice-readonly-value");
    expect(within(screen.getByText("Газ").closest("tr") as HTMLElement).getByText("122"))
      .toHaveClass("invoice-readonly-value");
    expect(within(screen.getByText("Газ").closest("tr") as HTMLElement).getByText("200,00 ₴"))
      .toBeInTheDocument();
    expect(screen.getByText("300,00 ₴")).toBeInTheDocument();
    expect(screen.getByText("14 821,00 ₴")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Перевірте показники")).not.toBeInTheDocument();
    expect(onDraftChange).not.toHaveBeenCalled();
  });

  it("renders an issued invoice as read-only without warnings", () => {
    render(
      <InvoiceCalculator
        invoice={{
          ...invoice,
          status: "issued",
          warnings: [{
            code: "consumption_anomaly",
            message: "Anomalous consumption",
            service_id: 5,
          }],
        }}
        onSave={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText("Курс USD")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Поточний показник Газ")).not.toBeInTheDocument();
    expect(screen.getByText("44,68")).toHaveClass("invoice-readonly-value");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Перевірте показники")).not.toBeInTheDocument();
  });

  it("rounds decimal halves like backend ROUND_HALF_UP", async () => {
    const user = userEvent.setup();
    const preciseInvoice: Invoice = {
      ...invoice,
      rent_amount_usd: "0.00",
      lines: [{ ...invoice.lines[0], prev_reading: "0.000", curr_reading: null, tariff_value: "1.00000", amount: "0.00" }],
    };
    render(<InvoiceCalculator invoice={preciseInvoice} onSave={vi.fn()} />);
    await user.type(screen.getByLabelText("Поточний показник Газ"), "10.075");
    expect(screen.getAllByText("10,08 ₴").length).toBeGreaterThan(0);
  });

  it("preserves the API rate precision in the draft and save payload", async () => {
    const user = userEvent.setup();
    const onDraftChange = vi.fn();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <InvoiceCalculator
        invoice={{ ...invoice, exchange_rate: "44.791749" }}
        onSave={onSave}
        onDraftChange={onDraftChange}
      />,
    );

    expect(screen.getByLabelText("Курс USD")).toHaveValue("44,7917");
    expect(onDraftChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ exchange_rate: "44.791749" }),
      false,
    );
    await user.click(screen.getByRole("button", { name: "Зберегти чернетку" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ exchange_rate: "44.791749" }));
  });

  it("rejects exponent notation consistently in preview and save flows", async () => {
    const user = userEvent.setup();
    const onDraftChange = vi.fn();
    const onSave = vi.fn();
    render(<InvoiceCalculator invoice={invoice} onSave={onSave} onDraftChange={onDraftChange} />);

    const rate = screen.getByLabelText("Курс USD");
    await user.clear(rate);
    await user.type(rate, "1e3");

    expect(rate).toHaveValue("1e3");
    expect(screen.getByRole("button", { name: "Зберегти чернетку" })).toBeDisabled();
    expect(onDraftChange).toHaveBeenLastCalledWith(null, true);
    await user.click(screen.getByRole("button", { name: "Зберегти чернетку" }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("rejects exponent notation in readings across preview and save flows", async () => {
    const user = userEvent.setup();
    const onDraftChange = vi.fn();
    const onSave = vi.fn();
    render(<InvoiceCalculator invoice={invoice} onSave={onSave} onDraftChange={onDraftChange} />);

    const reading = screen.getByLabelText("Поточний показник Газ");
    await user.clear(reading);
    await user.type(reading, "1e3");

    expect(reading).toHaveValue("1e3");
    expect(within(reading.closest("tr") as HTMLElement).getByText("0,00 ₴")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Зберегти чернетку" })).toBeDisabled();
    expect(onDraftChange).toHaveBeenLastCalledWith(null, true);
    await user.click(screen.getByRole("button", { name: "Зберегти чернетку" }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("trims displayed reading zeroes while preserving the API payload", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const readingInvoice: Invoice = {
      ...invoice,
      lines: [{ ...invoice.lines[0], curr_reading: "9583.500", prev_reading: "9500.000" }],
    };
    render(<InvoiceCalculator invoice={readingInvoice} onSave={onSave} />);

    expect(screen.getByLabelText("Поточний показник Газ")).toHaveValue("9\u00a0583,5");
    expect(screen.getByText("83,5")).toBeInTheDocument();
    expect(screen.getAllByText("664,40 ₴")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Зберегти чернетку" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      lines: [{ id: 10, curr_reading: "9583.500" }],
    }));
  });

  it("adds and edits an adjustment and includes it in the grand total", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<InvoiceCalculator invoice={invoice} onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: "Додати коригування" }));
    const label = screen.getByLabelText("Мітка коригування 1");
    const amount = screen.getByLabelText("Сума коригування 1");
    await user.clear(label);
    await user.type(label, "Компенсація ремонту");
    await user.clear(amount);
    await user.type(amount, "-500");

    expect(screen.getByText("14 296,05 ₴")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Зберегти чернетку" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      adjustments: [{
        label: "Компенсація ремонту",
        amount: "-500",
        record_as_expense: false,
        category: null,
      }],
    }));
  });

  it("records a negative adjustment as an expense with a selected category", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<InvoiceCalculator invoice={invoice} onSave={onSave} />);

    await user.click(screen.getByRole("button", { name: "Додати коригування" }));
    const amount = screen.getByLabelText("Сума коригування 1");
    await user.clear(amount);
    await user.type(amount, "-300");
    const expense = screen.getByLabelText("Врахувати коригування 1 як витрату");
    expect(expense).toBeEnabled();
    await user.click(expense);
    await user.selectOptions(screen.getByLabelText("Категорія витрати коригування 1"), "other");
    await user.click(screen.getByRole("button", { name: "Зберегти чернетку" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      adjustments: [expect.objectContaining({
        record_as_expense: true,
        category: "other",
      })],
    }));
  });

  it("removes a persisted adjustment from the payload and recalculates the total", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const adjustedInvoice: Invoice = {
      ...invoice,
      adjustments_total: "-500.00",
      grand_total: "14296.05",
      lines: [
        ...invoice.lines,
        { id: 12, service_id: null, service_name: "Ремонт", kind: "adjustment", service_kind: "adjustment", prev_reading: null, curr_reading: null, consumed: null, tariff_value: "0.00", amount: "-500.00", expense: null },
      ],
    };
    render(<InvoiceCalculator invoice={adjustedInvoice} onSave={onSave} />);

    expect(screen.getByText("14 296,05 ₴")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Видалити коригування 1" }));
    expect(screen.getByText("14 796,05 ₴")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Зберегти чернетку" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ adjustments: [] }));
  });

  it("disables and clears expense recording for a positive adjustment", async () => {
    const user = userEvent.setup();
    render(<InvoiceCalculator invoice={invoice} onSave={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Додати коригування" }));
    const amount = screen.getByLabelText("Сума коригування 1");
    await user.clear(amount);
    await user.type(amount, "-100");
    const expense = screen.getByLabelText("Врахувати коригування 1 як витрату");
    await user.click(expense);
    expect(screen.getByLabelText("Категорія витрати коригування 1")).toBeInTheDocument();

    await user.clear(amount);
    await user.type(amount, "100");

    expect(expense).toBeDisabled();
    expect(expense).not.toBeChecked();
    expect(screen.queryByLabelText("Категорія витрати коригування 1")).not.toBeInTheDocument();
    expect(screen.getByText("14 896,05 ₴")).toBeInTheDocument();
  });

  it("requires a label and decimal amount before saving an adjustment", async () => {
    const user = userEvent.setup();
    const onDraftChange = vi.fn();
    render(<InvoiceCalculator invoice={invoice} onSave={vi.fn()} onDraftChange={onDraftChange} />);

    await user.click(screen.getByRole("button", { name: "Додати коригування" }));
    await user.clear(screen.getByLabelText("Мітка коригування 1"));
    await user.clear(screen.getByLabelText("Сума коригування 1"));
    await user.type(screen.getByLabelText("Сума коригування 1"), "1e3");

    expect(screen.getByRole("button", { name: "Зберегти чернетку" })).toBeDisabled();
    expect(onDraftChange).toHaveBeenLastCalledWith(null, true);
  });

  it("shows persisted adjustments as read-only for an issued invoice", () => {
    render(<InvoiceCalculator invoice={{
      ...invoice,
      status: "issued",
      adjustments_total: "-250.00",
      grand_total: "14546.05",
      lines: [
        ...invoice.lines,
        { id: 12, service_id: null, service_name: "Компенсація", kind: "adjustment", service_kind: "adjustment", prev_reading: null, curr_reading: null, consumed: null, tariff_value: "0.00", amount: "-250.00", expense: { id: 3, category: "repair" } },
      ],
    }} onSave={vi.fn()} />);

    expect(screen.getByText("Компенсація")).toBeInTheDocument();
    expect(screen.getByText(/Ремонт/)).toBeInTheDocument();
    expect(screen.getAllByText("-250,00 ₴")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Додати коригування" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Мітка коригування 1")).not.toBeInTheDocument();
  });
});
