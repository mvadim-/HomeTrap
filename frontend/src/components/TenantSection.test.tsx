import { render, screen, waitFor } from "@testing-library/react";
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

afterEach(() => vi.restoreAllMocks());

describe("TenantSection", () => {
  it("renders the active tenant, contract file and collapsed history", async () => {
    render(<TenantSection apartmentId={1} />);

    expect(await screen.findByText("Оксана Коваль")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "+380501112233" })).toHaveAttribute("href", "tel:+380501112233");
    expect(screen.getByRole("link", { name: "contract.pdf" })).toHaveAttribute("href", "/api/attachments/12");
    expect(screen.getByText("Колишні орендарі (1)")).toBeInTheDocument();
    expect(screen.getByText("Іван Петренко")).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "Додати орендаря" })).toBeInTheDocument();
  });

  it("shows an understandable conflict when the backend rejects a new active tenant", async () => {
    vi.mocked(apiClient.getTenants).mockResolvedValue([]);
    vi.spyOn(apiClient, "createTenant").mockRejectedValue(new apiClient.ApiError(409, "Apartment already has an active tenant"));
    const user = userEvent.setup();
    render(<TenantSection apartmentId={1} />);

    await user.click(await screen.findByRole("button", { name: "Новий орендар" }));
    await user.type(screen.getByLabelText("ПІБ"), "Марія Сидоренко");
    await user.click(screen.getByRole("button", { name: "Додати орендаря" }));

    expect(await screen.findByText(/вже є активний орендар/i)).toBeInTheDocument();
  });

  it("uploads multiple selected contract files", async () => {
    vi.spyOn(apiClient, "uploadTenantAttachments").mockResolvedValue([]);
    const user = userEvent.setup();
    render(<TenantSection apartmentId={1} />);
    const files = [
      new File(["photo"], "contract.jpg", { type: "image/jpeg" }),
      new File(["pdf"], "contract.pdf", { type: "application/pdf" }),
    ];

    await user.upload(await screen.findByLabelText("Файли контракту"), files);
    await user.click(screen.getByRole("button", { name: "Завантажити" }));

    await waitFor(() => expect(apiClient.uploadTenantAttachments).toHaveBeenCalledWith(8, files));
  });
});
