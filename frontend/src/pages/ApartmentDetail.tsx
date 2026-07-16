import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  ApiError,
  Apartment,
  IncomeStats,
  Service,
  ServicePayload,
  Tariff,
  createService,
  createTariff,
  getApartment,
  getIncomeStats,
  getServices,
  getTariffs,
  updateService,
} from "../api/client";
import { TenantSection } from "../components/TenantSection";
import { formatTariff, formatUah } from "../utils/format";
import "./portal.css";

const emptyService: ServicePayload = {
  name: "",
  kind: "metered",
  unit: "",
  provider_account: "",
  sort_order: 0,
};

const today = new Date().toISOString().slice(0, 10);

const invoiceStatusLabels = {
  draft: "Чернетка",
  issued: "Виставлений",
  paid: "Сплачений",
} as const;

function monthLabel(period: string): string {
  return new Intl.DateTimeFormat("uk-UA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${period.slice(0, 7)}-01T00:00:00Z`));
}

function averageUtilities(stats: IncomeStats): string | null {
  if (stats.values.length === 0) return null;
  return formatUah(Number(stats.totals.utilities) / stats.values.length);
}

function serviceMarker(name: string): "gas" | "elec" | "water" | null {
  const normalizedName = name.toLocaleLowerCase("uk-UA");
  if (normalizedName.includes("газ")) return "gas";
  if (normalizedName.includes("електр") || normalizedName.includes("світл")) return "elec";
  if (normalizedName.includes("вод")) return "water";
  return null;
}

export function ApartmentDetail() {
  const { apartmentId } = useParams();
  const id = Number(apartmentId);
  const [apartment, setApartment] = useState<Apartment | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [tariffs, setTariffs] = useState<Record<number, Tariff[]>>({});
  const [serviceForm, setServiceForm] = useState<ServicePayload>(emptyService);
  const [editingServiceId, setEditingServiceId] = useState<number | null>(null);
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [tariffServiceId, setTariffServiceId] = useState<number | null>(null);
  const [tariffValue, setTariffValue] = useState("");
  const [tariffDate, setTariffDate] = useState("");
  const [averageUtilitiesValue, setAverageUtilitiesValue] = useState<string | null>(null);
  const [activeTenantStart, setActiveTenantStart] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [apartmentData, serviceItems] = await Promise.all([getApartment(id), getServices(id)]);
    const tariffEntries = await Promise.all(
      serviceItems.map(async (service) => [service.id, await getTariffs(service.id)] as const),
    );
    setApartment(apartmentData);
    setServices(serviceItems);
    setTariffs(Object.fromEntries(tariffEntries));
  }, [id]);

  const handleActiveTenantChange = useCallback((tenant: { contract_start: string } | null) => {
    setActiveTenantStart(tenant?.contract_start ?? null);
  }, []);

  useEffect(() => {
    if (!Number.isInteger(id) || id < 1) {
      setError("Некоректний ідентифікатор квартири.");
      return;
    }
    load().catch(() => setError("Не вдалося завантажити квартиру."));
  }, [id, load]);

  useEffect(() => {
    if (!Number.isInteger(id) || id < 1) return;
    let cancelled = false;
    setAverageUtilitiesValue(null);
    getIncomeStats(id, { months: 12 })
      .then((stats) => {
        if (!cancelled) setAverageUtilitiesValue(averageUtilities(stats));
      })
      .catch(() => {
        if (!cancelled) setAverageUtilitiesValue(null);
      });
    return () => { cancelled = true; };
  }, [id]);

  function beginServiceEdit(service?: Service) {
    if (service) {
      setEditingServiceId(service.id);
      setServiceForm({
        name: service.name,
        kind: service.kind,
        unit: service.unit ?? "",
        provider_account: service.provider_account ?? "",
        sort_order: service.sort_order,
        is_active: service.is_active,
      });
    } else {
      setEditingServiceId(null);
      setServiceForm(emptyService);
    }
    setShowServiceForm(true);
    setError("");
  }

  async function submitService(event: FormEvent) {
    event.preventDefault();
    setError("");
    const payload = {
      ...serviceForm,
      unit: serviceForm.unit || null,
      provider_account: serviceForm.provider_account || null,
    };
    try {
      if (editingServiceId) await updateService(id, editingServiceId, payload);
      else await createService(id, payload);
      setShowServiceForm(false);
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Не вдалося зберегти послугу.");
    }
  }

  async function submitTariff(event: FormEvent, serviceId: number) {
    event.preventDefault();
    setError("");
    try {
      await createTariff(serviceId, { value: tariffValue, valid_from: tariffDate });
      setTariffServiceId(null);
      setTariffValue("");
      setTariffDate("");
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Не вдалося додати тариф.");
    }
  }

  if (error && !apartment) return <p className="error-message">{error}</p>;
  if (!apartment) return <p className="muted-text">Завантажуємо квартиру…</p>;

  return (
    <>
      <header className="page-header">
        <div><Link className="muted-text" to="/apartments">← Квартири</Link><h1>{apartment.name}</h1><p>{apartment.address}</p></div>
        <button className="secondary-button" type="button" disabled title="Функція з'явиться в наступній версії">Посилання орендаря</button>
      </header>
      {error && <p className="error-message">{error}</p>}

      <div className="detail-grid">
        <section className="apartment-facts" aria-label="Факти квартири">
          <article className="apartment-fact"><span>Оренда</span><strong>{Number(apartment.rent_amount).toLocaleString("uk-UA", { maximumFractionDigits: 2 })} {apartment.rent_currency === "USD" ? "$" : apartment.rent_currency} / міс</strong></article>
          <article className="apartment-fact"><span>Останній рахунок</span><strong>{apartment.latest_invoice ? `${monthLabel(apartment.latest_invoice.period)} · ${invoiceStatusLabels[apartment.latest_invoice.status]}` : "—"}</strong></article>
          <article className="apartment-fact"><span>Середня комуналка</span><strong>{averageUtilitiesValue ?? "—"}</strong></article>
          <article className="apartment-fact"><span>Орендар з</span><strong>{activeTenantStart === undefined ? "—" : activeTenantStart ?? "вільна"}</strong></article>
        </section>

        <TenantSection apartmentId={id} onActiveTenantChange={handleActiveTenantChange} />

        <section className="section-card services-section">
          <div className="section-heading">
            <div><h2>Послуги й тарифи</h2><p>Тарифна історія з датою початку дії</p></div>
            <button className="button" type="button" onClick={() => beginServiceEdit()}>Додати послугу</button>
          </div>

          {showServiceForm && (
            <form className="inline-form" onSubmit={submitService}>
              <label>Назва<input required value={serviceForm.name} onChange={(event) => setServiceForm({ ...serviceForm, name: event.target.value })} /></label>
              <label>Тип<select value={serviceForm.kind} onChange={(event) => setServiceForm({ ...serviceForm, kind: event.target.value as ServicePayload["kind"] })}><option value="metered">За лічильником</option><option value="fixed">Фіксована</option></select></label>
              <label>Одиниця<input value={serviceForm.unit ?? ""} onChange={(event) => setServiceForm({ ...serviceForm, unit: event.target.value })} /></label>
              <label>Особовий рахунок<input value={serviceForm.provider_account ?? ""} onChange={(event) => setServiceForm({ ...serviceForm, provider_account: event.target.value })} /></label>
              <label>Порядок<input type="number" value={serviceForm.sort_order} onChange={(event) => setServiceForm({ ...serviceForm, sort_order: Number(event.target.value) })} /></label>
              {editingServiceId && <label className="checkbox-label"><input type="checkbox" checked={serviceForm.is_active ?? true} onChange={(event) => setServiceForm({ ...serviceForm, is_active: event.target.checked })} /> Активна послуга</label>}
              <div className="form-actions"><button className="button" type="submit">{editingServiceId ? "Зберегти" : "Додати"}</button><button className="secondary-button" type="button" onClick={() => setShowServiceForm(false)}>Скасувати</button></div>
            </form>
          )}

          <div className="table-wrap">
            <table className="services-table">
              <thead><tr><th>Послуга</th><th>Рахунок</th><th>Тариф</th><th>Діє з</th><th>Дії</th></tr></thead>
              <tbody>
                {services.map((service) => {
                  const serviceTariffs = tariffs[service.id] ?? [];
                  const effectiveTariffs = serviceTariffs.filter((tariff) => tariff.valid_from <= today);
                  const currentTariff = effectiveTariffs.at(-1);
                  const marker = serviceMarker(service.name);
                  return (
                    <tr key={service.id}>
                      <td><strong className="service-name">{marker && <span aria-hidden="true" className={`service-dot ${marker}`} />}{service.name}</strong><div className="muted-text">{service.kind === "metered" ? `Лічильник${service.unit ? ` · ${service.unit}` : ""}` : "Фіксована"} · {service.is_active ? "активна" : "неактивна"}</div></td>
                      <td>{service.provider_account || "—"}</td>
                      <td>{currentTariff ? `${formatTariff(currentTariff.value)} ₴` : "—"}</td>
                      <td>{currentTariff?.valid_from ?? "—"}</td>
                      <td>
                        <button className="table-action" type="button" onClick={() => beginServiceEdit(service)}>Редагувати</button><br />
                        <button className="table-action" type="button" onClick={() => setTariffServiceId(tariffServiceId === service.id ? null : service.id)}>Новий тариф</button>
                        {serviceTariffs.length > 0 && (
                          <details className="tariff-history">
                            <summary>Історія ({serviceTariffs.length})</summary>
                            <ul>{[...serviceTariffs].reverse().map((tariff) => <li key={tariff.id}>{tariff.valid_from}: {formatTariff(tariff.value)} ₴{tariff.valid_from > today ? " (заплановано)" : ""}</li>)}</ul>
                          </details>
                        )}
                        {tariffServiceId === service.id && (
                          <form className="tariff-form" onSubmit={(event) => submitTariff(event, service.id)}>
                            <label>Сума<input aria-label={`Тариф ${service.name}`} required min="0.00001" step="0.00001" type="number" value={tariffValue} onChange={(event) => setTariffValue(event.target.value)} /></label>
                            <label>Діє з<input aria-label={`Дата тарифу ${service.name}`} required type="date" value={tariffDate} onChange={(event) => setTariffDate(event.target.value)} /></label>
                            <button className="button" type="submit">Додати</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {services.length === 0 && <tr><td className="empty-state" colSpan={5}>Послуг ще немає.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
