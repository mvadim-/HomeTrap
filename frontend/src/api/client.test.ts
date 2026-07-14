import { afterEach, vi } from "vitest";

import { ApiError, browserNavigation, getCurrentUser, importApartmentHistory, login, logout } from "./client";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("API transport", () => {
  it("sends cookie credentials and JSON headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 1, username: "admin" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await login("admin", "password");
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/login", expect.objectContaining({
      credentials: "include",
      headers: expect.objectContaining({ "Content-Type": "application/json" }),
    }));
  });

  it("does not set a JSON content type for FormData", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      invoices_created: 0, invoices_skipped: 0, services_created: 0, tariffs_created: 0, warnings: [],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await importApartmentHistory(3, new File(["xlsx"], "history.xlsx"), true);
    const options = fetchMock.mock.calls[0][1] as RequestInit;
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.headers).not.toHaveProperty("Content-Type");
  });

  it("handles 204 and non-JSON errors", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response("gateway failure", { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(logout()).resolves.toBeUndefined();
    await expect(getCurrentUser()).rejects.toEqual(new ApiError(502, "Помилка запиту"));
  });

  it("redirects a 401 response to login", async () => {
    window.history.pushState({}, "", "/apartments");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    const redirect = vi.spyOn(browserNavigation, "toLogin").mockImplementation(() => undefined);
    await expect(getCurrentUser()).rejects.toEqual(new ApiError(401, "Потрібна авторизація"));
    expect(redirect).toHaveBeenCalledOnce();
  });
});
