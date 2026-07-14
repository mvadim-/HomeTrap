import { render, screen } from "@testing-library/react";
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
  grand_total: "14796.05",
  warnings: [],
  lines: [
    { id: 10, service_id: 5, service_name: "Газ", prev_reading: "100.000", curr_reading: "122.000", consumed: "22.000", tariff_value: "7.95689", amount: "175.05" },
    { id: 11, service_id: 6, service_name: "Інтернет", prev_reading: null, curr_reading: null, consumed: null, tariff_value: "100.00", amount: "100.00" },
  ],
};

describe("InvoiceCalculator", () => {
  it("recalculates totals when a reading and exchange rate change", async () => {
    const user = userEvent.setup();
    render(<InvoiceCalculator invoice={invoice} meteredServiceIds={new Set([5])} onSave={vi.fn()} />);

    expect(screen.getByText("14 796,05 ₴")).toBeInTheDocument();

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
    render(<InvoiceCalculator invoice={invoice} meteredServiceIds={new Set([5])} onSave={vi.fn()} />);

    const reading = screen.getByLabelText("Поточний показник Газ");
    await user.clear(reading);
    await user.type(reading, "99");

    expect(screen.getByRole("alert")).toHaveTextContent("Газ: поточний показник менший за попередній.");
  });
});
