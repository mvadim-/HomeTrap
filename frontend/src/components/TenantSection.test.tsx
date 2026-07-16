import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, vi } from "vitest";

import * as apiClient from "../api/client";
import { TenantSection } from "./TenantSection";

const activeTenant: apiClient.Tenant = {
  id: 8,
  apartment_id: 1,
  full_name: "Оксана Коваль",
  phone: "+380501112233",
  email: "oksana@example.com",
  contract_start: "2026-01-15",
  contract_end: null,
  notes: "Кіт у квартирі",
};

const formerTenant: apiClient.Tenant = {
  ...activeTenant,
  id: 7,
  full_name: "Іван Петренко",
  contract_start: "2025-01-01",
  contract_end: "2025-12-31",
};

beforeEach(() => {
  vi.spyOn(apiClient, "getTenants").mockResolvedValue([activeTenant, formerTenant]);
  vi.spyOn(apiClient, "getTenantAttachments").mockImplementation(async (tenantId) => tenantId === 8 ? [{
    id: 12,
    tenant_id: 8,
    original_name: "contract.pdf",
    content_type: "application/pdf",
    size_bytes: 1200,
    uploaded_at: "2026-01-15T10:00:00Z",
  }] : []);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("TenantSection", () => {
  it("renders the active tenant, contract file and collapsed history", async () => {
    render(<TenantSection apartmentId={1} />);

    expect(await screen.findByText("Оксана Коваль")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "+380501112233" })).toHaveAttribute("href", "tel:+380501112233");
    expect(screen.getByRole("link", { name: "+380501112233" })).toHaveClass("tenant-contact-link");
    expect(screen.getByRole("link", { name: "oksana@example.com" })).toHaveClass("tenant-contact-link");
    expect(screen.getByRole("link", { name: "contract.pdf" })).toHaveAttribute("href", "/api/attachments/12");
    expect(screen.getByText("контракт з 15 січ. 2026 р.")).toBeInTheDocument();
    expect(screen.getByText("Колишні орендарі (1)")).toBeInTheDocument();
    expect(screen.getByText("Іван Петренко")).toBeInTheDocument();
    expect(screen.getByText("1 січ. 2025 р. — 31 груд. 2025 р.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Новий орендар" })).not.toBeInTheDocument();
  });

  it("shows the new tenant form after ending the active contract", async () => {
    const endedTenant = { ...activeTenant, contract_end: "2026-07-16" };
    vi.mocked(apiClient.getTenants)
      .mockResolvedValueOnce([activeTenant])
      .mockResolvedValueOnce([endedTenant]);
    vi.spyOn(apiClient, "endTenantContract").mockResolvedValue(endedTenant);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<TenantSection apartmentId={1} />);

    await user.click(await screen.findByRole("button", { name: "Завершити контракт" }));
    await user.clear(screen.getByLabelText("Дата завершення контракту"));
    await user.type(screen.getByLabelText("Дата завершення контракту"), "2026-07-16");
    await user.click(screen.getByRole("button", { name: "Підтвердити" }));

    expect(apiClient.endTenantContract).toHaveBeenCalledWith(8, "2026-07-16");
    expect(await screen.findByLabelText("ПІБ")).toBeInTheDocument();
    expect(screen.getByLabelText("Контракт з")).toHaveValue("2026-07-17");
    expect(screen.getByRole("button", { name: "Додати орендаря" })).toBeInTheDocument();
  });

  it("shows an understandable conflict when the backend rejects a new active tenant", async () => {
    vi.mocked(apiClient.getTenants).mockResolvedValue([]);
    vi.spyOn(apiClient, "createTenant").mockRejectedValue(new apiClient.ApiError(409, "Apartment already has an active tenant"));
    const user = userEvent.setup();
    render(<TenantSection apartmentId={1} />);

    expect(await screen.findByText("Активного орендаря немає.")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Новий орендар" }));
    await user.type(screen.getByLabelText("ПІБ"), "Марія Сидоренко");
    await user.click(screen.getByRole("button", { name: "Додати орендаря" }));

    expect(await screen.findByText(/вже є активний орендар/i)).toBeInTheDocument();
  });

  it("reports refresh failure separately after a tenant was created successfully", async () => {
    vi.mocked(apiClient.getTenants)
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new apiClient.ApiError(503, "Tenants unavailable"));
    vi.spyOn(apiClient, "createTenant").mockResolvedValue({
      ...activeTenant,
      full_name: "Марія Сидоренко",
    });
    const user = userEvent.setup();
    render(<TenantSection apartmentId={1} />);

    await user.click(await screen.findByRole("button", { name: "Новий орендар" }));
    await user.type(screen.getByLabelText("ПІБ"), "Марія Сидоренко");
    await user.click(screen.getByRole("button", { name: "Додати орендаря" }));

    expect(await screen.findByText(/Зміну збережено, але не вдалося оновити дані/)).toBeInTheDocument();
    expect(apiClient.createTenant).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Додати орендаря" })).not.toBeInTheDocument();
    expect(screen.queryByText("Не вдалося зберегти орендаря.")).not.toBeInTheDocument();
  });

  it("shows an explicit empty state when the active tenant has no files", async () => {
    vi.mocked(apiClient.getTenants).mockResolvedValue([activeTenant]);
    vi.mocked(apiClient.getTenantAttachments).mockResolvedValue([]);

    render(<TenantSection apartmentId={1} />);

    expect(await screen.findByText("Оксана Коваль")).toBeInTheDocument();
    expect(screen.getByText("Файлів ще немає.")).toBeInTheDocument();
    expect(screen.getByText("Додати файли").closest("label")).toHaveClass("attachment-picker");
    expect(screen.getByLabelText("Файли контракту")).toHaveClass("file-input");
    expect(screen.queryByRole("button", { name: "Завантажити" })).not.toBeInTheDocument();
  });

  it("uploads multiple selected contract files", async () => {
    vi.spyOn(apiClient, "uploadTenantAttachments").mockResolvedValue([]);
    const user = userEvent.setup();
    render(<TenantSection apartmentId={1} />);
    const files = [
      new File(["photo"], "contract.jpg", { type: "image/jpeg" }),
      new File(["pdf"], "contract.pdf", { type: "application/pdf" }),
    ];

    const input = await screen.findByLabelText("Файли контракту");
    await user.upload(input, files);
    const selectedFiles = screen.getByRole("list", { name: "Вибрані файли" });
    expect(within(selectedFiles).getByText("contract.jpg")).toBeInTheDocument();
    expect(within(selectedFiles).getByText("contract.pdf")).toBeInTheDocument();
    const uploadButton = screen.getByRole("button", { name: "Завантажити" });
    expect(uploadButton).toBeEnabled();
    await user.click(uploadButton);

    await waitFor(() => expect(apiClient.uploadTenantAttachments).toHaveBeenCalledWith(8, files));
    expect(input).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Завантажити" })).not.toBeInTheDocument();
  });

  it("reports the active tenant to the apartment facts", async () => {
    const onOccupancyChange = vi.fn();

    render(<TenantSection apartmentId={1} onOccupancyChange={onOccupancyChange} />);

    await screen.findByText("Оксана Коваль");
    expect(onOccupancyChange).toHaveBeenCalledWith({
      status: "occupied",
      contractStart: activeTenant.contract_start,
    });
  });

  it("keeps the active tenant when loading attachments fails", async () => {
    const onOccupancyChange = vi.fn();
    vi.mocked(apiClient.getTenantAttachments).mockRejectedValue(new apiClient.ApiError(503, "Attachments unavailable"));

    render(<TenantSection apartmentId={1} onOccupancyChange={onOccupancyChange} />);

    expect(await screen.findByText("Оксана Коваль")).toBeInTheDocument();
    expect(screen.getByText("Attachments unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Активного орендаря немає.")).not.toBeInTheDocument();
    expect(onOccupancyChange).toHaveBeenCalledWith({
      status: "occupied",
      contractStart: activeTenant.contract_start,
    });
  });

  it("keeps tenant occupancy unknown when the tenant list fails", async () => {
    const onOccupancyChange = vi.fn();
    vi.mocked(apiClient.getTenants).mockRejectedValue(new apiClient.ApiError(503, "Tenants unavailable"));

    render(<TenantSection apartmentId={1} onOccupancyChange={onOccupancyChange} />);

    expect(await screen.findByText("Tenants unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Активного орендаря немає.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Новий орендар" })).not.toBeInTheDocument();
    expect(onOccupancyChange).toHaveBeenLastCalledWith({ status: "unknown" });
  });

  it("uses a fresh local date whenever a tenant form is opened", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 6, 16, 23, 59));
    vi.mocked(apiClient.getTenants).mockResolvedValue([]);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<TenantSection apartmentId={1} />);

    await user.click(await screen.findByRole("button", { name: "Новий орендар" }));
    expect(screen.getByLabelText("Контракт з")).toHaveValue("2026-07-16");
    await user.click(screen.getByRole("button", { name: "Скасувати" }));

    vi.setSystemTime(new Date(2026, 6, 17, 0, 1));
    await user.click(screen.getByRole("button", { name: "Новий орендар" }));
    expect(screen.getByLabelText("Контракт з")).toHaveValue("2026-07-17");
  });

  it("loads attachments only for the active tenant", async () => {
    render(<TenantSection apartmentId={1} />);

    expect(await screen.findByText("Оксана Коваль")).toBeInTheDocument();
    expect(apiClient.getTenantAttachments).toHaveBeenCalledTimes(1);
    expect(apiClient.getTenantAttachments).toHaveBeenCalledWith(activeTenant.id);
  });

  it("ignores a stale load after apartment changes", async () => {
    let resolveFirst!: (tenants: apiClient.Tenant[]) => void;
    const firstRequest = new Promise<apiClient.Tenant[]>((resolve) => { resolveFirst = resolve; });
    const secondTenant = { ...activeTenant, id: 18, apartment_id: 2, full_name: "Марія Сидоренко" };
    vi.mocked(apiClient.getTenants).mockImplementation((apartmentId) => (
      apartmentId === 1 ? firstRequest : Promise.resolve([secondTenant])
    ));
    vi.mocked(apiClient.getTenantAttachments).mockResolvedValue([]);

    const { rerender } = render(<TenantSection apartmentId={1} />);
    rerender(<TenantSection apartmentId={2} />);

    expect(await screen.findByText("Марія Сидоренко")).toBeInTheDocument();
    resolveFirst([activeTenant]);
    await waitFor(() => expect(apiClient.getTenantAttachments).not.toHaveBeenCalledWith(activeTenant.id));

    expect(screen.getByText("Марія Сидоренко")).toBeInTheDocument();
    expect(screen.queryByText("Оксана Коваль")).not.toBeInTheDocument();
  });

  it("clears tenant forms and selected files when the apartment changes", async () => {
    const secondTenant = { ...activeTenant, id: 18, apartment_id: 2, full_name: "Марія Сидоренко" };
    vi.mocked(apiClient.getTenants).mockImplementation(async (apartmentId) => (
      apartmentId === 1 ? [activeTenant] : [secondTenant]
    ));
    vi.mocked(apiClient.getTenantAttachments).mockResolvedValue([]);
    const user = userEvent.setup();
    const { rerender } = render(<TenantSection apartmentId={1} />);

    await user.click(await screen.findByRole("button", { name: "Редагувати" }));
    await user.clear(screen.getByLabelText("ПІБ"));
    await user.type(screen.getByLabelText("ПІБ"), "Чернетка квартири 1");
    await user.click(screen.getByRole("button", { name: "Завершити контракт" }));
    const fileInput = screen.getByLabelText("Файли контракту");
    await user.upload(fileInput, new File(["pdf"], "private-contract.pdf", { type: "application/pdf" }));
    expect(screen.getByText("private-contract.pdf")).toBeInTheDocument();

    rerender(<TenantSection apartmentId={2} />);

    expect(await screen.findByText("Марія Сидоренко")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Чернетка квартири 1")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Дата завершення контракту")).not.toBeInTheDocument();
    expect(screen.queryByText("private-contract.pdf")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Файли контракту")).toHaveValue("");
  });

  it("ignores a tenant mutation that completes after the apartment changes", async () => {
    let resolveCreate!: (tenant: apiClient.Tenant) => void;
    const createRequest = new Promise<apiClient.Tenant>((resolve) => { resolveCreate = resolve; });
    const secondTenant = { ...activeTenant, id: 18, apartment_id: 2, full_name: "Марія Сидоренко" };
    const requestedApartments: number[] = [];
    vi.mocked(apiClient.getTenants).mockImplementation(async (apartmentId) => {
      requestedApartments.push(apartmentId);
      return apartmentId === 1 ? [] : [secondTenant];
    });
    vi.mocked(apiClient.getTenantAttachments).mockResolvedValue([]);
    vi.spyOn(apiClient, "createTenant").mockReturnValue(createRequest);
    const onOccupancyChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <TenantSection apartmentId={1} onOccupancyChange={onOccupancyChange} />,
    );

    await user.click(await screen.findByRole("button", { name: "Новий орендар" }));
    await user.type(screen.getByLabelText("ПІБ"), "Чернетка квартири 1");
    await user.click(screen.getByRole("button", { name: "Додати орендаря" }));
    expect(apiClient.createTenant).toHaveBeenCalledTimes(1);

    rerender(<TenantSection apartmentId={2} onOccupancyChange={onOccupancyChange} />);
    expect(await screen.findByText("Марія Сидоренко")).toBeInTheDocument();

    await act(async () => {
      resolveCreate({ ...activeTenant, full_name: "Чернетка квартири 1" });
      await createRequest;
    });

    expect(requestedApartments).toEqual([1, 2]);
    expect(screen.getByText("Марія Сидоренко")).toBeInTheDocument();
    expect(screen.queryByText("Чернетка квартири 1")).not.toBeInTheDocument();
    expect(onOccupancyChange).toHaveBeenLastCalledWith({
      status: "occupied",
      contractStart: secondTenant.contract_start,
    });
  });

  it("uses the current local date when the end-contract form opens", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 6, 17, 0, 1));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<TenantSection apartmentId={1} />);

    await user.click(await screen.findByRole("button", { name: "Завершити контракт" }));

    expect(screen.getByLabelText("Дата завершення контракту")).toHaveValue("2026-07-17");
  });
});
