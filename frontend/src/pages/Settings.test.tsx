import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, vi } from "vitest";

import * as apiClient from "../api/client";
import { Settings } from "./Settings";

const settings: apiClient.NotificationSettings = {
  telegram: { enabled: false, token: "", chat_id: "" },
  email: {
    enabled: false,
    smtp_host: "smtp.example.test",
    smtp_port: 587,
    smtp_username: "test-user",
    smtp_password: "",
    from_address: "owner@example.test",
    to_address: "owner@example.test",
    use_tls: true,
  },
  readings_day: 20,
  overdue_after_days: 3,
  repeat_every_days: 3,
};

const apartments: apiClient.Apartment[] = [{
  id: 7,
  name: "Квартира на Подолі",
  address: "Київ",
  rent_amount: "325.00",
  rent_currency: "USD",
  notes: null,
  is_active: true,
  latest_invoice: null,
}];

afterEach(() => vi.restoreAllMocks());

describe("Settings", () => {
  it("renders notification settings without seeded credentials", async () => {
    vi.spyOn(apiClient, "getNotificationSettings").mockResolvedValue(settings);
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);

    render(<Settings />);

    expect(await screen.findByRole("heading", { name: "Налаштування" })).toBeInTheDocument();
    expect(screen.getByLabelText("Bot token")).toHaveValue("");
    expect(screen.getByLabelText("Пароль")).toHaveValue("");
    expect(screen.getByLabelText("SMTP host")).toHaveValue("smtp.example.test");
    expect(screen.getByLabelText("День зняття показників")).toHaveValue(20);
    expect(screen.getByRole("button", { name: "Надіслати тестове повідомлення" })).toBeInTheDocument();
  });

  it("shows the dry-run import report and warnings", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "getNotificationSettings").mockResolvedValue(settings);
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    const importHistory = vi.spyOn(apiClient, "importApartmentHistory").mockResolvedValue({
      invoices_created: 2,
      invoices_skipped: 1,
      services_created: 3,
      tariffs_created: 4,
      warnings: ["Пропущено нечислову клітинку"],
    });

    render(<Settings />);
    await screen.findByRole("option", { name: "Квартира на Подолі" });
    const file = new File(["xlsx"], "history.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    await user.upload(screen.getByLabelText("Файл XLSX"), file);
    await user.click(screen.getByRole("button", { name: "Попередній перегляд" }));

    expect(await screen.findByRole("heading", { name: "Результат попереднього перегляду" })).toBeInTheDocument();
    expect(screen.getByText("Пропущено нечислову клітинку")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(importHistory).toHaveBeenCalledWith(7, file, true);
  });

  it("saves settings, reports partial delivery and performs an import", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "getNotificationSettings").mockResolvedValue(settings);
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    const update = vi.spyOn(apiClient, "updateNotificationSettings").mockResolvedValue(settings);
    vi.spyOn(apiClient, "testNotification").mockResolvedValue({ deliveries: 1, errors: ["Email failed"] });
    const importHistory = vi.spyOn(apiClient, "importApartmentHistory").mockResolvedValue({
      invoices_created: 1, invoices_skipped: 0, services_created: 0, tariffs_created: 0, warnings: [],
    });
    render(<Settings />);
    await user.click(await screen.findByRole("button", { name: "Зберегти" }));
    expect(update).toHaveBeenCalledWith(settings);
    expect(await screen.findByRole("status")).toHaveTextContent("Налаштування збережено");
    await user.click(screen.getByRole("button", { name: "Надіслати тестове повідомлення" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Email failed");
    const file = new File(["xlsx"], "history.xlsx");
    await user.upload(screen.getByLabelText("Файл XLSX"), file);
    await user.click(screen.getByRole("button", { name: "Імпортувати" }));
    expect(await screen.findByRole("heading", { name: "Результат імпорту" })).toBeInTheDocument();
    expect(importHistory).toHaveBeenCalledWith(7, file, false);
  });

  it("shows rejected action errors", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "getNotificationSettings").mockResolvedValue(settings);
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    vi.spyOn(apiClient, "updateNotificationSettings").mockRejectedValue(new Error("save"));
    vi.spyOn(apiClient, "testNotification").mockRejectedValue(new Error("test"));
    vi.spyOn(apiClient, "importApartmentHistory").mockRejectedValue(new Error("import"));
    render(<Settings />);
    await user.click(await screen.findByRole("button", { name: "Зберегти" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Не вдалося зберегти");
    await user.click(screen.getByRole("button", { name: "Надіслати тестове повідомлення" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Не вдалося надіслати");
    await user.upload(screen.getByLabelText("Файл XLSX"), new File(["xlsx"], "history.xlsx"));
    await user.click(screen.getByRole("button", { name: "Попередній перегляд" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Не вдалося перевірити файл");
    await user.click(screen.getByRole("button", { name: "Імпортувати" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Не вдалося імпортувати файл");
  });
});
