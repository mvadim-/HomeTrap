import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, vi } from "vitest";

import * as apiClient from "../api/client";
import { Expenses } from "./Expenses";

const apartment: apiClient.Apartment = {
  id: 1, name: "Поділ", address: "Київ", rent_amount: "325.00", rent_currency: "USD",
  notes: null, is_active: true, latest_invoice: null, current_tenant_name: null,
};

const expense: apiClient.Expense = {
  id: 10, apartment_id: 1, invoice_line_id: null, date: "2026-07-15", category: "repair",
  amount: "1500.00", currency: "UAH", notes: "Фарба",
};

const generalExpense: apiClient.Expense = {
  id: 11, apartment_id: null, invoice_line_id: null, date: "2026-07-10", category: "tax",
  amount: "800.00", currency: "UAH", notes: null,
};

const linkedExpense: apiClient.Expense = {
  id: 12, apartment_id: 1, invoice_line_id: 42, date: "2026-07-20", category: "repair",
  amount: "2500.00", currency: "UAH", notes: "Ремонт котла",
};

afterEach(() => vi.restoreAllMocks());

describe("Expenses", () => {
  it("renders expenses list including a general (null apartment) expense", async () => {
    vi.spyOn(apiClient, "getApartments").mockResolvedValue([apartment]);
    vi.spyOn(apiClient, "getExpenses").mockResolvedValue([expense, generalExpense]);

    render(<MemoryRouter><Expenses /></MemoryRouter>);

    const repairRow = (await screen.findByText("Ремонт")).closest("tr");
    expect(within(repairRow!).getByText("Поділ")).toBeInTheDocument();
    expect(within(repairRow!).getByText(/1.?500,00 ₴/)).toBeInTheDocument();
    expect(within(repairRow!).getByText("Фарба")).toBeInTheDocument();

    const taxRow = screen.getByText("Податок").closest("tr");
    expect(within(taxRow!).getByText("Загальна")).toBeInTheDocument();
    expect(within(taxRow!).getByText("—")).toBeInTheDocument();
  });

  it("shows empty state when there are no expenses", async () => {
    vi.spyOn(apiClient, "getApartments").mockResolvedValue([apartment]);
    vi.spyOn(apiClient, "getExpenses").mockResolvedValue([]);

    render(<MemoryRouter><Expenses /></MemoryRouter>);

    expect(await screen.findByText(/Витрат ще немає/)).toBeInTheDocument();
  });

  it("creates a general expense mapping to null apartment", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "getApartments").mockResolvedValue([apartment]);
    vi.spyOn(apiClient, "getExpenses").mockResolvedValue([]);
    const create = vi.spyOn(apiClient, "createExpense").mockResolvedValue(generalExpense);

    render(<MemoryRouter><Expenses /></MemoryRouter>);

    await user.click(await screen.findByRole("button", { name: "Додати витрату" }));
    await user.selectOptions(screen.getByLabelText("Категорія"), "tax");
    await user.type(screen.getByLabelText("Сума"), "800");
    await user.click(screen.getByRole("button", { name: "Зберегти" }));

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      apartment_id: null,
      category: "tax",
      amount: "800",
      currency: "UAH",
    }));
  });

  it("edits an existing expense", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "getApartments").mockResolvedValue([apartment]);
    vi.spyOn(apiClient, "getExpenses").mockResolvedValue([expense]);
    const update = vi.spyOn(apiClient, "updateExpense").mockResolvedValue(expense);

    render(<MemoryRouter><Expenses /></MemoryRouter>);

    await user.click(await screen.findByRole("button", { name: "Редагувати" }));
    const amountInput = screen.getByLabelText("Сума");
    await user.clear(amountInput);
    await user.type(amountInput, "2000");
    await user.click(screen.getByRole("button", { name: "Зберегти" }));

    expect(update).toHaveBeenCalledWith(10, expect.objectContaining({
      apartment_id: 1,
      amount: "2000",
    }));
  });

  it("deletes an expense", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "getApartments").mockResolvedValue([apartment]);
    vi.spyOn(apiClient, "getExpenses").mockResolvedValue([expense]);
    const remove = vi.spyOn(apiClient, "deleteExpense").mockResolvedValue();

    render(<MemoryRouter><Expenses /></MemoryRouter>);

    await user.click(await screen.findByRole("button", { name: "Видалити" }));
    expect(remove).toHaveBeenCalledWith(10);
  });

  it("shows a linked invoice expense as read-only", async () => {
    vi.spyOn(apiClient, "getApartments").mockResolvedValue([apartment]);
    vi.spyOn(apiClient, "getExpenses").mockResolvedValue([linkedExpense, expense]);

    render(<MemoryRouter><Expenses /></MemoryRouter>);

    const linkedRow = (await screen.findByText("Ремонт котла")).closest("tr");
    expect(within(linkedRow!).getByText("з рахунку")).toBeInTheDocument();
    expect(within(linkedRow!).getByText("Керується в рахунку")).toBeInTheDocument();
    expect(within(linkedRow!).queryByRole("button", { name: "Редагувати" })).not.toBeInTheDocument();
    expect(within(linkedRow!).queryByRole("button", { name: "Видалити" })).not.toBeInTheDocument();

    const regularRow = screen.getByText("Фарба").closest("tr");
    expect(within(regularRow!).getByRole("button", { name: "Редагувати" })).toBeEnabled();
    expect(within(regularRow!).getByRole("button", { name: "Видалити" })).toBeEnabled();
  });

  it("rejects a non-positive amount without calling the API", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "getApartments").mockResolvedValue([apartment]);
    vi.spyOn(apiClient, "getExpenses").mockResolvedValue([]);
    const create = vi.spyOn(apiClient, "createExpense").mockResolvedValue(expense);

    render(<MemoryRouter><Expenses /></MemoryRouter>);

    await user.click(await screen.findByRole("button", { name: "Додати витрату" }));
    await user.type(screen.getByLabelText("Сума"), "0");
    await user.click(screen.getByRole("button", { name: "Зберегти" }));

    expect(create).not.toHaveBeenCalled();
    expect(screen.getByText("Сума має бути більшою за нуль.")).toBeInTheDocument();
  });

  it("shows a banner on API error and keeps the page rendered", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "getApartments").mockResolvedValue([apartment]);
    vi.spyOn(apiClient, "getExpenses").mockResolvedValue([]);
    vi.spyOn(apiClient, "createExpense").mockRejectedValue(new apiClient.ApiError(400, "Погана витрата"));

    render(<MemoryRouter><Expenses /></MemoryRouter>);

    await user.click(await screen.findByRole("button", { name: "Додати витрату" }));
    await user.type(screen.getByLabelText("Сума"), "500");
    await user.click(screen.getByRole("button", { name: "Зберегти" }));

    expect(await screen.findByText("Погана витрата")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Витрати" })).toBeInTheDocument();
  });
});
