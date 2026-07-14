import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, vi } from "vitest";

import * as apiClient from "./api/client";
import { App } from "./App";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("protected routes", () => {
  it("redirects an unauthenticated visitor to login", async () => {
    vi.spyOn(apiClient, "getCurrentUser").mockRejectedValue(
      new apiClient.ApiError(401, "Not authenticated"),
    );

    render(
      <MemoryRouter initialEntries={["/apartments"]}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Вітаємо в HomeTrap" })).toBeInTheDocument();
    });
  });
});
