import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, vi } from "vitest";

import * as apiClient from "../api/client";
import { Apartments } from "./Apartments";

const apartment: apiClient.Apartment = {
  id: 1, name: "Поділ", address: "Київ", rent_amount: "325.00", rent_currency: "USD",
  notes: null, is_active: true, latest_invoice: null, current_tenant_name: "Оксана Коваль",
};

afterEach(() => vi.restoreAllMocks());

describe("Apartments", () => {
  it("renders active and archived management cards with avatars and invoice summaries", async () => {
    vi.spyOn(apiClient, "getApartments").mockResolvedValue([
      {
        ...apartment,
        latest_invoice: { id: 7, period: "2026-07-01", status: "issued", grand_total: "16731.51" },
      },
      { ...apartment, id: 2, name: "Центр", is_active: false, current_tenant_name: null },
    ]);

    render(<MemoryRouter><Apartments /></MemoryRouter>);

    const activeCard = (await screen.findByRole("heading", { name: "Поділ" })).closest("article");
    const archivedCard = screen.getByRole("heading", { name: "Центр" }).closest("article");
    expect(activeCard).toHaveClass("apartment-management-card");
    expect(activeCard?.parentElement).toHaveClass("apartment-management-grid");
    expect(within(activeCard!).getByText("Активна")).toHaveClass("apartment-state-badge", "active");
    expect(within(activeCard!).getByText("Оксана К. · оренда 325 $")).toBeInTheDocument();
    expect(within(activeCard!).getByText("П")).toHaveClass("apartment-avatar");
    expect(within(activeCard!).getByText("останній рахунок")).toBeInTheDocument();
    expect(within(activeCard!).getByText(/16.?731,51 ₴/)).toBeInTheDocument();
    expect(within(activeCard!).getByText("Виставлений")).toBeInTheDocument();

    expect(within(archivedCard!).getByText("Архівна")).toHaveClass("apartment-state-badge", "archived");
    expect(within(archivedCard!).getByText("Квартира вільна")).toBeInTheDocument();
    expect(within(archivedCard!).getByText("Ц")).toHaveClass("apartment-avatar");
    expect(within(archivedCard!).getByText("Без рахунків")).toBeInTheDocument();
    expect(within(archivedCard!).queryByRole("button", { name: "Архівувати" })).not.toBeInTheDocument();

    expect(screen.queryByText("Стан")).not.toBeInTheDocument();
  });

  it("creates, edits and archives apartments", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "getApartments").mockResolvedValue([apartment]);
    const create = vi.spyOn(apiClient, "createApartment").mockResolvedValue(apartment);
    const update = vi.spyOn(apiClient, "updateApartment").mockResolvedValue(apartment);
    const archive = vi.spyOn(apiClient, "archiveApartment").mockResolvedValue();
    render(<MemoryRouter><Apartments /></MemoryRouter>);

    await user.click(await screen.findByRole("button", { name: "Додати квартиру" }));
    await user.type(screen.getByLabelText("Назва"), "Нова");
    await user.type(screen.getByLabelText("Адреса"), "Львів");
    await user.type(screen.getByLabelText("Оренда, USD"), "300");
    await user.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: "Нова", rent_currency: "USD" }));

    await user.click(screen.getByRole("button", { name: "Редагувати" }));
    await user.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(update).toHaveBeenCalledWith(1, expect.objectContaining({ name: "Поділ", is_active: true }));

    await user.click(screen.getByRole("button", { name: "Архівувати" }));
    expect(archive).toHaveBeenCalledWith(1);
  });
});
