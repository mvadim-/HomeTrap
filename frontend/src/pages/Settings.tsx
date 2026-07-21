import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  ApiError,
  Apartment,
  ImportReport,
  NotificationSettings,
  RestoreSummary,
  downloadBackup,
  getApartments,
  getNotificationSettings,
  importApartmentHistory,
  restoreBackup,
  testNotification,
  updateNotificationSettings,
} from "../api/client";
import {
  PushDeviceStatus,
  getPushDeviceStatus,
  subscribePushDevice,
  unsubscribePushDevice,
} from "../utils/push";
import "./portal.css";

function ImportReportView({ report, dryRun }: { report: ImportReport; dryRun: boolean }) {
  const createdLabel = dryRun ? "буде створено" : "створено";
  return (
    <div className="import-report" aria-live="polite">
      <h3>{dryRun ? "Результат попереднього перегляду" : "Результат імпорту"}</h3>
      <dl className="import-summary">
        <div><dt>Рахунків {createdLabel}</dt><dd>{report.invoices_created}</dd></div>
        <div><dt>Рахунків пропущено</dt><dd>{report.invoices_skipped}</dd></div>
        <div><dt>Послуг {createdLabel}</dt><dd>{report.services_created}</dd></div>
        <div><dt>Тарифів {createdLabel}</dt><dd>{report.tariffs_created}</dd></div>
      </dl>
      {report.warnings.length > 0 && (
        <div className="warning-box">
          <strong>Попередження</strong>
          <ul>{report.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

function RestoreSummaryView({ summary }: { summary: RestoreSummary }) {
  const added = Object.values(summary.added).reduce((total, count) => total + count, 0);
  const skipped = Object.values(summary.skipped).reduce((total, count) => total + count, 0);
  return (
    <div className="import-report" aria-live="polite">
      <h3>Результат відновлення</h3>
      <dl className="import-summary">
        <div><dt>Додано записів</dt><dd>{added}</dd></div>
        <div><dt>Пропущено записів</dt><dd>{skipped}</dd></div>
      </dl>
    </div>
  );
}

export function Settings() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [apartmentId, setApartmentId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<{ value: ImportReport; dryRun: boolean } | null>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreSummary, setRestoreSummary] = useState<RestoreSummary | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"save" | "test" | "preview" | "import" | "push" | "backup" | "restore" | null>(null);
  const [pushStatus, setPushStatus] = useState<PushDeviceStatus | "error">("checking");

  useEffect(() => {
    let active = true;
    Promise.all([getNotificationSettings(), getApartments()])
      .then(([notificationSettings, apartmentItems]) => {
        if (!active) return;
        setSettings(notificationSettings);
        setApartments(apartmentItems);
        setApartmentId(String(apartmentItems.find((item) => item.is_active)?.id ?? apartmentItems[0]?.id ?? ""));
      })
      .catch(() => active && setError("Не вдалося завантажити налаштування."));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    getPushDeviceStatus()
      .then((status) => active && setPushStatus(status))
      .catch(() => active && setPushStatus("error"));
    return () => { active = false; };
  }, []);

  function patchSettings(update: Partial<NotificationSettings>) {
    setSettings((current) => current ? { ...current, ...update } : current);
  }

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setBusy("save");
    setError("");
    setMessage("");
    try {
      setSettings(await updateNotificationSettings(settings));
      setMessage("Налаштування збережено.");
    } catch {
      setError("Не вдалося зберегти налаштування.");
    } finally {
      setBusy(null);
    }
  }

  async function sendTest() {
    setBusy("test");
    setError("");
    setMessage("");
    try {
      const result = await testNotification();
      setMessage(result.errors.length > 0
        ? `Надіслано: ${result.deliveries}. Помилки: ${result.errors.join("; ")}`
        : `Тестове повідомлення надіслано (${result.deliveries}).`);
    } catch {
      setError("Не вдалося надіслати тестове повідомлення.");
    } finally {
      setBusy(null);
    }
  }

  async function changePushSubscription() {
    setBusy("push");
    setError("");
    setMessage("");
    try {
      const status = pushStatus === "subscribed"
        ? await unsubscribePushDevice()
        : await subscribePushDevice();
      setPushStatus(status);
      if (status === "subscribed") setMessage("Цей пристрій підписано на Push.");
      else if (status === "unsubscribed") setMessage("Цей пристрій відписано від Push.");
      else if (status === "denied") setError("Дозвіл на сповіщення заблоковано в браузері.");
      else if (status === "unsupported") setError("Цей браузер не підтримує Push.");
    } catch {
      setError("Не вдалося змінити Push-підписку цього пристрою.");
    } finally {
      setBusy(null);
    }
  }

  function pushStatusText(): string {
    if (!settings?.push.enabled) return "Канал Push вимкнено.";
    if (pushStatus === "checking") return "Перевіряємо Push-підписку цього пристрою…";
    if (pushStatus === "subscribed") return "Цей пристрій підписано.";
    if (pushStatus === "unsubscribed") return "Цей пристрій ще не підписано.";
    if (pushStatus === "denied") return "Дозвіл на сповіщення заблоковано в браузері.";
    if (pushStatus === "unsupported") return "Цей браузер не підтримує Push.";
    return "Не вдалося визначити стан Push-підписки.";
  }

  async function runImport(dryRun: boolean) {
    if (!file || !apartmentId) return;
    setBusy(dryRun ? "preview" : "import");
    setError("");
    setReport(null);
    try {
      const value = await importApartmentHistory(Number(apartmentId), file, dryRun);
      setReport({ value, dryRun });
    } catch (caught) {
      setError(caught instanceof ApiError
        ? caught.message
        : dryRun ? "Не вдалося перевірити файл імпорту." : "Не вдалося імпортувати файл.");
    } finally {
      setBusy(null);
    }
  }

  async function saveBackup() {
    setBusy("backup");
    setError("");
    setMessage("");
    try {
      const backup = await downloadBackup();
      const url = URL.createObjectURL(backup.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = backup.filename;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage("Бекап завантажено.");
    } catch {
      setError("Не вдалося завантажити бекап.");
    } finally {
      setBusy(null);
    }
  }

  async function runRestore() {
    if (!restoreFile || !window.confirm(
      "Імпортувати відсутні дані з цього бекапу? Наявні дані не буде змінено або видалено.",
    )) return;
    setBusy("restore");
    setError("");
    setMessage("");
    setRestoreSummary(null);
    try {
      setRestoreSummary(await restoreBackup(restoreFile));
    } catch (caught) {
      setError(caught instanceof ApiError
        ? caught.message
        : "Не вдалося відновити дані з бекапу.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <header className="page-header"><div><h1>Налаштування</h1><p>Сповіщення, бекап та імпорт історії</p></div></header>
      {error && <p className="error-message" role="alert">{error}</p>}
      {message && <p className="success-message" role="status">{message}</p>}

      <section className="section-card settings-section">
        <div className="section-heading"><div><h2>Нагадування</h2><p>Кожен канал можна вмикати окремо</p></div></div>
        {!settings ? <p className="muted-text">Завантажуємо налаштування…</p> : (
          <form className="settings-form" onSubmit={saveSettings}>
            <fieldset>
              <legend>Telegram</legend>
              <label className="checkbox-field"><input type="checkbox" checked={settings.telegram.enabled} onChange={(event) => patchSettings({ telegram: { ...settings.telegram, enabled: event.target.checked } })} />Увімкнути Telegram</label>
              <label>Bot token<input type="password" autoComplete="off" value={settings.telegram.token} onChange={(event) => patchSettings({ telegram: { ...settings.telegram, token: event.target.value } })} /></label>
              <label>Chat ID<input value={settings.telegram.chat_id} onChange={(event) => patchSettings({ telegram: { ...settings.telegram, chat_id: event.target.value } })} /></label>
            </fieldset>

            <fieldset>
              <legend>Email (SMTP)</legend>
              <label className="checkbox-field"><input type="checkbox" checked={settings.email.enabled} onChange={(event) => patchSettings({ email: { ...settings.email, enabled: event.target.checked } })} />Увімкнути Email</label>
              <div className="settings-grid">
                <label>SMTP host<input value={settings.email.smtp_host} onChange={(event) => patchSettings({ email: { ...settings.email, smtp_host: event.target.value } })} /></label>
                <label>SMTP port<input type="number" min="1" max="65535" value={settings.email.smtp_port} onChange={(event) => patchSettings({ email: { ...settings.email, smtp_port: Number(event.target.value) } })} /></label>
                <label>Користувач<input autoComplete="username" value={settings.email.smtp_username} onChange={(event) => patchSettings({ email: { ...settings.email, smtp_username: event.target.value } })} /></label>
                <label>Пароль<input type="password" autoComplete="new-password" value={settings.email.smtp_password} onChange={(event) => patchSettings({ email: { ...settings.email, smtp_password: event.target.value } })} /></label>
                <label>Від кого<input type="email" value={settings.email.from_address} onChange={(event) => patchSettings({ email: { ...settings.email, from_address: event.target.value } })} /></label>
                <label>Кому<input type="email" value={settings.email.to_address} onChange={(event) => patchSettings({ email: { ...settings.email, to_address: event.target.value } })} /></label>
              </div>
              <label className="checkbox-field"><input type="checkbox" checked={settings.email.use_tls} onChange={(event) => patchSettings({ email: { ...settings.email, use_tls: event.target.checked } })} />Використовувати TLS</label>
            </fieldset>

            <fieldset>
              <legend>Розклад</legend>
              <div className="settings-grid schedule-grid">
                <label>День зняття показників<input type="number" min="1" max="28" value={settings.readings_day} onChange={(event) => patchSettings({ readings_day: Number(event.target.value) })} /></label>
                <label>Нагадати про неоплату через, днів<input type="number" min="1" max="365" value={settings.overdue_after_days} onChange={(event) => patchSettings({ overdue_after_days: Number(event.target.value) })} /></label>
                <label>Повторювати кожні, днів<input type="number" min="1" max="365" value={settings.repeat_every_days} onChange={(event) => patchSettings({ repeat_every_days: Number(event.target.value) })} /></label>
              </div>
            </fieldset>

            <fieldset>
              <legend>Виставлення рахунків</legend>
              <label className="checkbox-field"><input type="checkbox" checked={settings.billing_reminder.enabled} onChange={(event) => patchSettings({ billing_reminder: { ...settings.billing_reminder, enabled: event.target.checked } })} />Увімкнути нагадування про виставлення</label>
              <div className="settings-grid">
                <label>Нагадати за, днів<input type="number" min="0" max="365" required value={settings.billing_reminder.days_before} onChange={(event) => patchSettings({ billing_reminder: { ...settings.billing_reminder, days_before: Number(event.target.value) } })} /></label>
                <label>Повторювати кожні, днів<input type="number" min="1" required value={settings.billing_reminder.repeat_every_days} onChange={(event) => patchSettings({ billing_reminder: { ...settings.billing_reminder, repeat_every_days: Number(event.target.value) } })} /></label>
              </div>
              <label className="checkbox-field"><input type="checkbox" checked={settings.billing_reminder.auto_draft} onChange={(event) => patchSettings({ billing_reminder: { ...settings.billing_reminder, auto_draft: event.target.checked } })} />Автоматично створювати чернетку в день виставлення</label>
            </fieldset>

            <fieldset>
              <legend>Push</legend>
              <label className="checkbox-field"><input type="checkbox" checked={settings.push.enabled} onChange={(event) => patchSettings({ push: { enabled: event.target.checked } })} />Увімкнути Push</label>
              <p className="muted-text" aria-live="polite">{pushStatusText()}</p>
              <div className="form-actions">
                <button
                  className="secondary-button"
                  type="button"
                  disabled={
                    !settings.push.enabled
                    || busy !== null
                    || ["checking", "denied", "unsupported"].includes(pushStatus)
                  }
                  onClick={changePushSubscription}
                >
                  {busy === "push"
                    ? "Оновлюємо…"
                    : pushStatus === "subscribed"
                      ? "Відписати цей пристрій"
                      : "Підписати цей пристрій"}
                </button>
              </div>
            </fieldset>
            <div className="form-actions">
              <button className="button" type="submit" disabled={busy !== null}>{busy === "save" ? "Зберігаємо…" : "Зберегти"}</button>
              <button className="secondary-button" type="button" disabled={busy !== null} onClick={sendTest}>{busy === "test" ? "Надсилаємо…" : "Надіслати тестове повідомлення"}</button>
            </div>
          </form>
        )}
      </section>

      <section className="section-card settings-section">
        <div className="section-heading"><div><h2>Бекап і відновлення</h2><p>Повний знімок даних та недеструктивний імпорт</p></div></div>
        <div className="warning-box">
          <strong>Зберігайте бекап у безпечному місці</strong>
          <p>Архів є секретом: він містить приватні дані, хеш пароля та облікові дані Telegram, SMTP, VAPID і Push. Зберігайте його лише в зашифрованому сховищі з обмеженим доступом. Відновлення лише додає відсутні записи — наявні дані не змінюються й не видаляються.</p>
        </div>
        <div className="import-form backup-form">
          <div>
            <button className="secondary-button" type="button" disabled={busy !== null} onClick={saveBackup}>
              {busy === "backup" ? "Готуємо бекап…" : "Завантажити бекап"}
            </button>
          </div>
          <label>Файл бекапу<input type="file" accept=".zip,application/zip" onChange={(event) => { setRestoreFile(event.target.files?.[0] ?? null); setRestoreSummary(null); }} /></label>
          <div className="form-actions">
            <button className="button" type="button" disabled={!restoreFile || busy !== null} onClick={runRestore}>
              {busy === "restore" ? "Відновлюємо…" : "Відновити з бекапу"}
            </button>
          </div>
        </div>
        {restoreSummary && <RestoreSummaryView summary={restoreSummary} />}
      </section>

      <section className="section-card settings-section">
        <div className="section-heading"><div><h2>Імпорт XLSX</h2><p>Спочатку перевірте файл без запису змін</p></div></div>
        {settings && apartments.length === 0 && (
          <div className="warning-box" role="status">
            <strong>Спочатку створіть квартиру</strong>
            <p>Історія імпортується в конкретну квартиру, тому без неї попередній перегляд та імпорт недоступні.</p>
            <Link to="/apartments">Перейти до квартир</Link>
          </div>
        )}
        <div className="import-form">
          <label>Квартира<select value={apartmentId} onChange={(event) => setApartmentId(event.target.value)} disabled={apartments.length === 0}><option value="">Оберіть квартиру</option>{apartments.map((apartment) => <option key={apartment.id} value={apartment.id}>{apartment.name}</option>)}</select></label>
          <label>Файл XLSX<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setReport(null); }} /></label>
          <div className="form-actions">
            <button className="secondary-button" type="button" disabled={!file || !apartmentId || busy !== null} onClick={() => runImport(true)}>{busy === "preview" ? "Перевіряємо…" : "Попередній перегляд"}</button>
            <button className="button" type="button" disabled={!file || !apartmentId || busy !== null} onClick={() => runImport(false)}>{busy === "import" ? "Імпортуємо…" : "Імпортувати"}</button>
          </div>
        </div>
        {report && <ImportReportView report={report.value} dryRun={report.dryRun} />}
      </section>
    </>
  );
}
