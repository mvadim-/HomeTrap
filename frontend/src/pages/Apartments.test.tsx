import { render, screen } from "@testing-library/react";
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
  it("shows tenant rent summary and vacant apartment state", async () => {
    vi.spyOn(apiClient, "getApartments").mockResolvedValue([
      apartment,
      { ...apartment, id: 2, name: "Центр", current_tenant_name: null },
    ]);

    render(<MemoryRouter><Apartments /></MemoryRouter>);

    expect(await screen.findByText("Оксана К. · оренда 325 $")).toBeInTheDocument();
    expect(screen.getByText("Квартира вільна")).toBeInTheDocument();
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
