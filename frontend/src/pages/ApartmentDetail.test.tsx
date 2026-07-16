import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, vi } from "vitest";

import * as apiClient from "../api/client";
import { ApartmentDetail } from "./ApartmentDetail";

afterEach(() => vi.restoreAllMocks());

beforeEach(() => {
  vi.spyOn(apiClient, "getTenants").mockResolvedValue([]);
  vi.spyOn(apiClient, "getTenantAttachments").mockResolvedValue([]);
});

describe("ApartmentDetail", () => {
  it("renders apartment details and the services tariff table", async () => {
    vi.spyOn(apiClient, "getApartment").mockResolvedValue({
      id: 1,
      name: "Квартира на Подолі",
      address: "Київ, вул. Верхній Вал, 10",
      rent_amount: "325.00",
      rent_currency: "USD",
      notes: "Код домофона 42",
      is_active: true,
      latest_invoice: null,
      current_tenant_name: null,
    });
    vi.spyOn(apiClient, "getServices").mockResolvedValue([{
      id: 5,
      apartment_id: 1,
      name: "Газ",
      kind: "metered",
      unit: "м³",
      provider_account: "12345",
      sort_order: 10,
      is_active: true,
    }]);
    vi.spyOn(apiClient, "getTariffs").mockResolvedValue([{
      id: 9,
      service_id: 5,
      value: "7.95689",
      valid_from: "2026-07-01",
    }]);

    render(
      <MemoryRouter initialEntries={["/apartments/1"]}>
        <Routes><Route path="/apartments/:apartmentId" element={<ApartmentDetail />} /></Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Квартира на Подолі" })).toBeInTheDocument();
    expect(screen.getByText("325.00 USD")).toBeInTheDocument();
    expect(screen.getByText("Код домофона 42")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Діє з" })).toBeInTheDocument();
    expect(screen.getByText("Газ")).toBeInTheDocument();
    expect(screen.getByText("7.95689 ₴")).toBeInTheDocument();
    expect(screen.getByText("2026-07-01")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Посилання орендаря" })).toBeDisabled();
  });

  it("opens the service editing form with existing values", async () => {
    vi.spyOn(apiClient, "getApartment").mockResolvedValue({
      id: 1, name: "Квартира", address: "Адреса", rent_amount: "300.00",
      rent_currency: "USD", notes: null, is_active: true, latest_invoice: null,
      current_tenant_name: null,
    });
    vi.spyOn(apiClient, "getServices").mockResolvedValue([{
      id: 5, apartment_id: 1, name: "Газ", kind: "metered", unit: "м³",
      provider_account: "12345", sort_order: 10, is_active: true,
    }]);
    vi.spyOn(apiClient, "getTariffs").mockResolvedValue([]);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/apartments/1"]}>
        <Routes><Route path="/apartments/:apartmentId" element={<ApartmentDetail />} /></Routes>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "Редагувати" }));
    expect(screen.getByLabelText("Назва")).toHaveValue("Газ");
    expect(screen.getByRole("button", { name: "Зберегти" })).toBeInTheDocument();
  });
});
