import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, vi } from "vitest";

import * as apiClient from "../api/client";
import { Layout } from "./Layout";

vi.mock("../api/client", () => ({
  getCurrentRate: vi.fn(),
  logout: vi.fn(),
}));

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(apiClient.getCurrentRate).mockReset();
  vi.mocked(apiClient.getCurrentRate).mockImplementation(() => new Promise(() => undefined));
  vi.mocked(apiClient.logout).mockReset();
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("Layout", () => {
  it("renders the mockup navigation, house mark and formatted NBU rate", async () => {
    vi.mocked(apiClient.getCurrentRate).mockResolvedValue({
      requested_date: "2026-07-16",
      rate_date: "2026-07-16",
      currency: "USD",
      rate: "44.748000",
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

  it("restores the stored theme after remounting", () => {
    window.localStorage.setItem("theme", "dark");

    const view = render(<MemoryRouter><Layout /></MemoryRouter>);
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");

    view.unmount();
    document.documentElement.dataset.theme = "light";
    render(<MemoryRouter><Layout /></MemoryRouter>);

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  });

  it("uses the system preference when no theme is stored", () => {
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      matches: query === "(prefers-color-scheme: dark)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(<MemoryRouter><Layout /></MemoryRouter>);

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.getItem("theme")).toBeNull();
  });

  it("stores and applies the selected theme", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><Layout /></MemoryRouter>);

    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    await user.click(screen.getByRole("button", { name: "Змінити тему" }));

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.getItem("theme")).toBe("dark");
  });
});
