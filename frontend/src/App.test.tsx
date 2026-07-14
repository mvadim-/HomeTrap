import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Outlet } from "react-router-dom";
import { afterEach, vi } from "vitest";

import * as apiClient from "./api/client";
import { App } from "./App";

vi.mock("./components/Layout", () => ({ Layout: () => <><span>Layout shell</span><Outlet /></> }));
vi.mock("./pages/Dashboard", () => ({ Dashboard: () => <h1>Dashboard page</h1> }));
vi.mock("./pages/Apartments", () => ({ Apartments: () => <h1>Apartments page</h1> }));
vi.mock("./pages/ApartmentDetail", () => ({ ApartmentDetail: () => <h1>Apartment detail page</h1> }));
vi.mock("./pages/Invoices", () => ({ Invoices: () => <h1>Invoices page</h1> }));
vi.mock("./pages/InvoiceEdit", () => ({ InvoiceEdit: () => <h1>Invoice edit page</h1> }));
vi.mock("./pages/Stats", () => ({ Stats: () => <h1>Stats page</h1> }));
vi.mock("./pages/Settings", () => ({ Settings: () => <h1>Settings page</h1> }));

afterEach(() => vi.restoreAllMocks());

describe("protected routes", () => {
  it("redirects an unauthenticated visitor to login", async () => {
    vi.spyOn(apiClient, "getCurrentUser").mockRejectedValue(new apiClient.ApiError(401, "Not authenticated"));
    render(<MemoryRouter initialEntries={["/apartments"]}><App /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Вітаємо в HomeTrap" })).toBeInTheDocument();
  });

  it.each([
    ["/", "Dashboard page"],
    ["/apartments", "Apartments page"],
    ["/apartments/7", "Apartment detail page"],
    ["/invoices", "Invoices page"],
    ["/invoices/9", "Invoice edit page"],
    ["/stats", "Stats page"],
    ["/settings", "Settings page"],
  ])("renders authenticated route %s inside Layout", async (path, heading) => {
    vi.spyOn(apiClient, "getCurrentUser").mockResolvedValue({ id: 1, username: "admin" });
    render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument());
    expect(screen.getByText("Layout shell")).toBeInTheDocument();
  });
});
