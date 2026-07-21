import { afterEach, vi } from "vitest";

import { ApiError, browserNavigation, createExpense, deleteExpense, deleteInvoice, downloadBackup, getCurrentUser, getExpenses, getPnlStats, importApartmentHistory, login, logout, restoreBackup, updateExpense, uploadTenantAttachments } from "./client";

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

  it("uploads multiple tenant attachments as multipart files", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("[]", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const files = [new File(["one"], "one.pdf"), new File(["two"], "two.pdf")];

    await uploadTenantAttachments(7, files);

    const options = fetchMock.mock.calls[0][1] as RequestInit;
    const body = options.body as FormData;
    expect(fetchMock.mock.calls[0][0]).toBe("/api/tenants/7/attachments");
    expect(body.getAll("files")).toEqual(files);
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

  it("deletes a draft invoice", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(deleteInvoice(7)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith("/api/invoices/7", expect.objectContaining({
      method: "DELETE",
      credentials: "include",
    }));
  });

  it("redirects a 401 response to login", async () => {
    window.history.pushState({}, "", "/apartments");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    const redirect = vi.spyOn(browserNavigation, "toLogin").mockImplementation(() => undefined);
    await expect(getCurrentUser()).rejects.toEqual(new ApiError(401, "Потрібна авторизація"));
    expect(redirect).toHaveBeenCalledOnce();
  });

  it("downloads a backup with credentials and parses its filename", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("backup", {
      status: 200,
      headers: {
        "Content-Disposition": "attachment; filename=\"snapshot.zip\"",
        "Content-Type": "application/zip",
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const download = await downloadBackup();
    expect(download.filename).toBe("snapshot.zip");
    expect(download.blob).toEqual(expect.objectContaining({
      size: 6,
      type: "application/zip",
    }));
    expect(fetchMock).toHaveBeenCalledWith("/api/settings/backup", expect.objectContaining({
      credentials: "include",
    }));
  });

  it("restores a backup as multipart without a manual content type", async () => {
    const summary = { added: { apartments: 1 }, skipped: { apartments: 0 } };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(summary), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["backup"], "backup.zip", { type: "application/zip" });

    await expect(restoreBackup(file)).resolves.toEqual(summary);
    const options = fetchMock.mock.calls[0][1] as RequestInit;
    expect(fetchMock.mock.calls[0][0]).toBe("/api/settings/restore");
    expect(options.credentials).toBe("include");
    expect(options.body).toBeInstanceOf(FormData);
    expect((options.body as FormData).get("file")).toBe(file);
    expect(options.headers).not.toHaveProperty("Content-Type");
  });

  it("serializes P&L stats period as a months query", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await getPnlStats(4, { months: 24 });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/stats/pnl?apartment_id=4&months=24");
  });

  it("omits the apartment id for a portfolio P&L request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await getPnlStats(undefined, { date_from: "2026-01-01", date_to: "2026-06-30" });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/stats/pnl?date_from=2026-01-01&date_to=2026-06-30",
    );
  });

  it("builds expense list filters for apartment and date range", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await getExpenses({ apartmentId: 2, dateFrom: "2026-01-01", dateTo: "2026-03-31" });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/expenses?apartment_id=2&date_from=2026-01-01&date_to=2026-03-31",
    );
  });

  it("requests all expenses without query when no filters are given", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await getExpenses();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/expenses");
  });

  it("creates an expense with a JSON body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    await createExpense({
      apartment_id: 5,
      date: "2026-07-10",
      category: "repair",
      amount: "1200.50",
      currency: "UAH",
      notes: null,
    });
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/expenses");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body as string)).toEqual({
      apartment_id: 5,
      date: "2026-07-10",
      category: "repair",
      amount: "1200.50",
      currency: "UAH",
      notes: null,
    });
  });

  it("patches an expense by id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await updateExpense(9, { amount: "50.00", category: "tax" });
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/expenses/9");
    expect(options.method).toBe("PATCH");
    expect(JSON.parse(options.body as string)).toEqual({ amount: "50.00", category: "tax" });
  });

  it("deletes an expense by id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(deleteExpense(9)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith("/api/expenses/9", expect.objectContaining({
      method: "DELETE",
      credentials: "include",
    }));
  });

  it("surfaces restore API validation errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ detail: "Backup archive exceeds the upload size limit" }),
      { status: 413 },
    )));

    await expect(restoreBackup(new File(["backup"], "backup.zip"))).rejects.toEqual(
      new ApiError(413, "Backup archive exceeds the upload size limit"),
    );
  });
});
