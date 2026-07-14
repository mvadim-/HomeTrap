import { FormEvent, useEffect, useState } from "react";

import {
  Apartment,
  ImportReport,
  NotificationSettings,
  getApartments,
  getNotificationSettings,
  importApartmentHistory,
  testNotification,
  updateNotificationSettings,
} from "../api/client";
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

export function Settings() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [apartmentId, setApartmentId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<{ value: ImportReport; dryRun: boolean } | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"save" | "test" | "preview" | "import" | null>(null);

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

  async function runImport(dryRun: boolean) {
    if (!file || !apartmentId) return;
    setBusy(dryRun ? "preview" : "import");
    setError("");
    setReport(null);
    try {
      const value = await importApartmentHistory(Number(apartmentId), file, dryRun);
      setReport({ value, dryRun });
    } catch {
      setError(dryRun ? "Не вдалося перевірити файл імпорту." : "Не вдалося імпортувати файл.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <header className="page-header"><div><h1>Налаштування</h1><p>Сповіщення та імпорт історії</p></div></header>
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
            <div className="form-actions">
              <button className="button" type="submit" disabled={busy !== null}>{busy === "save" ? "Зберігаємо…" : "Зберегти"}</button>
              <button className="secondary-button" type="button" disabled={busy !== null} onClick={sendTest}>{busy === "test" ? "Надсилаємо…" : "Надіслати тестове повідомлення"}</button>
            </div>
          </form>
        )}
      </section>

      <section className="section-card settings-section">
        <div className="section-heading"><div><h2>Імпорт XLSX</h2><p>Спочатку перевірте файл без запису змін</p></div></div>
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
