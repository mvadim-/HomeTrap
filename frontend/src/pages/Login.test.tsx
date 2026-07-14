import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, vi } from "vitest";

import * as apiClient from "../api/client";
import { Login } from "./Login";

afterEach(() => vi.restoreAllMocks());

describe("Login", () => {
  it("renders the authentication form", () => {
    render(<MemoryRouter><Login /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Вітаємо в HomeTrap" })).toBeInTheDocument();
    expect(screen.getByLabelText("Пароль")).toHaveAttribute("type", "password");
  });

  it("submits credentials and returns to the protected route", async () => {
    const user = userEvent.setup();
    const login = vi.spyOn(apiClient, "login").mockResolvedValue({ id: 1, username: "admin" });
    render(
      <MemoryRouter initialEntries={[{ pathname: "/login", state: { from: "/apartments" } }]}>
        <Routes><Route path="/login" element={<Login />} /><Route path="/apartments" element={<h1>Квартири</h1>} /></Routes>
      </MemoryRouter>,
    );
    await user.type(screen.getByLabelText("Логін"), "admin");
    await user.type(screen.getByLabelText("Пароль"), "secret");
    await user.click(screen.getByRole("button", { name: "Увійти" }));
    expect(login).toHaveBeenCalledWith("admin", "secret");
    expect(await screen.findByRole("heading", { name: "Квартири" })).toBeInTheDocument();
  });

  it.each([
    [new apiClient.ApiError(401, "bad"), "Невірний логін або пароль."],
    [new apiClient.ApiError(429, "limited"), "Забагато спроб. Спробуйте ще раз за 15 хвилин."],
  ])("shows an actionable login error", async (failure, message) => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "login").mockRejectedValue(failure);
    render(<MemoryRouter><Login /></MemoryRouter>);
    await user.type(screen.getByLabelText("Логін"), "admin");
    await user.type(screen.getByLabelText("Пароль"), "wrong");
    await user.click(screen.getByRole("button", { name: "Увійти" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });
});
