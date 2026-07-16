import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, vi } from "vitest";

import * as apiClient from "../api/client";
import { Layout } from "./Layout";

vi.mock("../api/client", () => ({
  getCurrentRate: vi.fn(),
  logout: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(apiClient.getCurrentRate).mockReset();
  vi.mocked(apiClient.logout).mockReset();
});

describe("Layout", () => {
  it("renders the mockup navigation, house mark and formatted NBU rate", async () => {
    vi.mocked(apiClient.getCurrentRate).mockResolvedValue({
      requested_date: "2026-07-16",
      rate_date: "2026-07-16",
      currency: "USD",
      rate: "44.750000",
      is_fallback: false,
    });

    render(<MemoryRouter initialEntries={["/invoices"]}><Layout /></MemoryRouter>);

    expect(screen.getByRole("img", { name: "Будинок" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Рахунки" })).toHaveClass("active");
    expect(screen.getByRole("link", { name: "Квартири" })).not.toHaveClass("active");
    expect(await screen.findByText("USD НБУ 44,75 ₴")).toBeInTheDocument();
  });

  it("keeps the unavailable-rate fallback when the API request fails", async () => {
    vi.mocked(apiClient.getCurrentRate).mockRejectedValue(new Error("rate unavailable"));

    render(<MemoryRouter><Layout /></MemoryRouter>);

    expect(await screen.findByText("Курс НБУ —")).toBeInTheDocument();
  });
});
