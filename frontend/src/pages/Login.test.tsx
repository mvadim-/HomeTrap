import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { Login } from "./Login";

describe("Login", () => {
  it("renders the authentication form", () => {
    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Вітаємо в HomeTrap" })).toBeInTheDocument();
    expect(screen.getByLabelText("Логін")).toBeInTheDocument();
    expect(screen.getByLabelText("Пароль")).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Увійти" })).toBeInTheDocument();
  });
});
