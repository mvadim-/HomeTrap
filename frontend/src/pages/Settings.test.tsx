import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, vi } from "vitest";

import * as apiClient from "../api/client";
import * as pushUtils from "../utils/push";
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
  billing_reminder: {
    enabled: false,
    days_before: 3,
    repeat_every_days: 1,
    auto_draft: true,
  },
  push: { enabled: false },
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
  current_tenant_name: null,
}];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Settings", () => {
  it("explains why import is unavailable without an apartment", async () => {
    vi.spyOn(apiClient, "getNotificationSettings").mockResolvedValue(settings);
    vi.spyOn(apiClient, "getApartments").mockResolvedValue([]);

    render(<MemoryRouter><Settings /></MemoryRouter>);

    expect(await screen.findByText("Спочатку створіть квартиру")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Перейти до квартир" })).toHaveAttribute(
      "href",
      "/apartments",
    );
    expect(screen.getByRole("button", { name: "Попередній перегляд" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Імпортувати" })).toBeDisabled();
  });

  it("renders notification settings without seeded credentials", async () => {
    vi.spyOn(apiClient, "getNotificationSettings").mockResolvedValue(settings);
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);

    render(<Settings />);

    expect(await screen.findByRole("heading", { name: "Налаштування" })).toBeInTheDocument();
    expect(screen.getByLabelText("Bot token")).toHaveValue("");
    expect(screen.getByLabelText("Пароль")).toHaveValue("");
    expect(screen.getByLabelText("SMTP host")).toHaveValue("smtp.example.test");
    expect(screen.getByLabelText("День зняття показників")).toHaveValue(20);
    expect(screen.getByRole("group", { name: "Виставлення рахунків" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Push" })).toBeInTheDocument();
    expect(screen.getByText("Канал Push вимкнено.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Підписати цей пристрій" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Надіслати тестове повідомлення" })).toBeInTheDocument();
  });

  it("renders backup and restore controls", async () => {
    vi.spyOn(apiClient, "getNotificationSettings").mockResolvedValue(settings);
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);

    render(<Settings />);

    expect(await screen.findByRole("heading", { name: "Бекап і відновлення" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Завантажити бекап" })).toBeInTheDocument();
    expect(screen.getByLabelText("Файл бекапу")).toHaveAttribute("accept", ".zip,application/zip");
    expect(screen.getByRole("button", { name: "Відновити з бекапу" })).toBeDisabled();
  });

  it("downloads a backup file", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "getNotificationSettings").mockResolvedValue(settings);
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    const blob = new Blob(["backup"], { type: "application/zip" });
    const download = vi.spyOn(apiClient, "downloadBackup").mockResolvedValue({
      blob,
      filename: "hometrap-backup-20260721.zip",
    });
    const createObjectURL = vi.fn(() => "blob:backup");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    render(<Settings />);
    await user.click(await screen.findByRole("button", { name: "Завантажити бекап" }));

    expect(download).toHaveBeenCalledOnce();
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:backup");
    expect(await screen.findByRole("status")).toHaveTextContent("Бекап завантажено");
  });

  it("confirms restore and shows its summary", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "getNotificationSettings").mockResolvedValue(settings);
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const restore = vi.spyOn(apiClient, "restoreBackup").mockResolvedValue({
      added: { apartments: 2, tenants: 1 },
      skipped: { apartments: 1, tenants: 1 },
    });
    const file = new File(["backup"], "backup.zip", { type: "application/zip" });

    render(<Settings />);
    await user.upload(await screen.findByLabelText("Файл бекапу"), file);
    await user.click(screen.getByRole("button", { name: "Відновити з бекапу" }));

    expect(window.confirm).toHaveBeenCalledOnce();
    expect(restore).toHaveBeenCalledWith(file);
    expect(await screen.findByRole("heading", { name: "Результат відновлення" })).toBeInTheDocument();
    expect(screen.getByText("Додано записів").nextElementSibling).toHaveTextContent("3");
    expect(screen.getByText("Пропущено записів").nextElementSibling).toHaveTextContent("2");
  });

  it("shows restore validation errors", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "getNotificationSettings").mockResolvedValue(settings);
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(apiClient, "restoreBackup").mockRejectedValue(
      new apiClient.ApiError(422, "Ревізія бекапу несумісна"),
    );

    render(<Settings />);
    await user.upload(
      await screen.findByLabelText("Файл бекапу"),
      new File(["backup"], "backup.zip"),
    );
    await user.click(screen.getByRole("button", { name: "Відновити з бекапу" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Ревізія бекапу несумісна");
  });

  it("saves billing reminder and global Push settings", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "getNotificationSettings").mockResolvedValue(settings);
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    const update = vi.spyOn(apiClient, "updateNotificationSettings").mockImplementation(
      async (payload) => payload,
    );

    render(<Settings />);

    await user.click(await screen.findByLabelText("Увімкнути нагадування про виставлення"));
    await user.clear(screen.getByLabelText("Нагадати за, днів"));
    await user.type(screen.getByLabelText("Нагадати за, днів"), "5");
    const billingGroup = screen.getByRole("group", { name: "Виставлення рахунків" });
    await user.clear(within(billingGroup).getByLabelText("Повторювати кожні, днів"));
    await user.type(within(billingGroup).getByLabelText("Повторювати кожні, днів"), "2");
    await user.click(screen.getByLabelText("Автоматично створювати чернетку в день виставлення"));
    await user.click(screen.getByLabelText("Увімкнути Push"));

    expect(screen.getByText("Цей браузер не підтримує Push.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Зберегти" }));

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      billing_reminder: {
        enabled: true,
        days_before: 5,
        repeat_every_days: 2,
        auto_draft: false,
      },
      push: { enabled: true },
    }));
  });

  it("subscribes and unsubscribes this device from the Push controls", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "getNotificationSettings").mockResolvedValue({
      ...settings,
      push: { enabled: true },
    });
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    vi.spyOn(pushUtils, "getPushDeviceStatus").mockResolvedValue("unsubscribed");
    const subscribe = vi.spyOn(pushUtils, "subscribePushDevice").mockResolvedValue("subscribed");
    const unsubscribe = vi.spyOn(pushUtils, "unsubscribePushDevice").mockResolvedValue("unsubscribed");

    render(<Settings />);

    await user.click(await screen.findByRole("button", { name: "Підписати цей пристрій" }));
    expect(subscribe).toHaveBeenCalledOnce();
    expect(await screen.findByText("Цей пристрій підписано на Push.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Відписати цей пристрій" }));
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(await screen.findByText("Цей пристрій відписано від Push.")).toBeInTheDocument();
  });

  it("prevents saving invalid billing reminder values", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "getNotificationSettings").mockResolvedValue(settings);
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    const update = vi.spyOn(apiClient, "updateNotificationSettings").mockResolvedValue(settings);

    render(<Settings />);

    const billingGroup = await screen.findByRole("group", { name: "Виставлення рахунків" });
    const repeatInput = within(billingGroup).getByLabelText("Повторювати кожні, днів");
    await user.clear(repeatInput);
    await user.type(repeatInput, "0");
    expect(repeatInput).toBeInvalid();
    await user.click(screen.getByRole("button", { name: "Зберегти" }));
    expect(update).not.toHaveBeenCalled();
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

  it("shows the XLSX validation detail returned by the API", async () => {
    const user = userEvent.setup();
    vi.spyOn(apiClient, "getNotificationSettings").mockResolvedValue(settings);
    vi.spyOn(apiClient, "getApartments").mockResolvedValue(apartments);
    vi.spyOn(apiClient, "importApartmentHistory").mockRejectedValue(
      new apiClient.ApiError(422, "Не знайдено таблицю у вкладці «Загальна інформація»"),
    );

    render(<Settings />);
    await user.upload(
      screen.getByLabelText("Файл XLSX"),
      new File(["xlsx"], "history.xlsx"),
    );
    await user.click(screen.getByRole("button", { name: "Попередній перегляд" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Не знайдено таблицю у вкладці «Загальна інформація»",
    );
  });
});
