import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  Apartment,
  ApiError,
  InvoiceListItem,
  InvoiceStatus,
  createInvoice,
  getApartments,
  getInvoices,
} from "../api/client";
import {
  INVOICE_STATUS_OPTIONS,
  InvoiceStatusBadge,
} from "../components/InvoiceStatusBadge";
import { formatUah } from "../utils/format";
import "./portal.css";

function periodLabel(period: string): string {
  return new Intl.DateTimeFormat("uk-UA", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${period}T00:00:00Z`));
}

function isOverdue(invoice: InvoiceListItem): boolean {
  if (invoice.status !== "issued") return false;
  const period = invoice.period.slice(0, 7);
  const today = new Date();
  const currentPeriod = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  return period < currentPeriod;
}

export function Invoices() {
  const navigate = useNavigate();
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [apartmentFilter, setApartmentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newApartmentId, setNewApartmentId] = useState("");
  const [newPeriod, setNewPeriod] = useState(`${new Date().toISOString().slice(0, 7)}-01`);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const loadInvoices = useCallback(async () => {
    const items = await getInvoices({
      apartmentId: apartmentFilter ? Number(apartmentFilter) : undefined,
      status: statusFilter ? statusFilter as InvoiceStatus : undefined,
    });
    setInvoices(items);
  }, [apartmentFilter, statusFilter]);

  useEffect(() => {
    getApartments().then((items) => {
      setApartments(items);
      if (items.length > 0) setNewApartmentId((current) => current || String(items[0].id));
    }).catch(() => setError("Не вдалося завантажити квартири."));
  }, []);

  useEffect(() => {
    loadInvoices().catch(() => setError("Не вдалося завантажити рахунки."));
  }, [loadInvoices]);

  async function submitCreate(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError("");
    try {
      const invoice = await createInvoice(Number(newApartmentId), newPeriod);
      navigate(`/invoices/${invoice.id}`);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Не вдалося створити рахунок.");
    } finally {
      setCreating(false);
    }
  }

  const apartmentNames = Object.fromEntries(apartments.map((apartment) => [apartment.id, apartment.name]));

  return (
    <>
      <header className="page-header">
        <div><h1>Рахунки</h1><p>Чернетки, виставлені та оплачені рахунки</p></div>
        <button className="button" type="button" onClick={() => setShowCreate(!showCreate)}>Новий рахунок</button>
      </header>
      {error && <p className="error-message">{error}</p>}

      {showCreate && (
        <form className="inline-form invoice-create-form" onSubmit={submitCreate}>
          <label>Квартира<select required value={newApartmentId} onChange={(event) => setNewApartmentId(event.target.value)}>{apartments.map((apartment) => <option key={apartment.id} value={apartment.id}>{apartment.name}</option>)}</select></label>
          <label>Період<input required type="month" value={newPeriod.slice(0, 7)} onChange={(event) => setNewPeriod(`${event.target.value}-01`)} /></label>
          <div className="form-actions"><button className="button" disabled={creating || !newApartmentId} type="submit">{creating ? "Створюємо…" : "Створити чернетку"}</button><button className="secondary-button" type="button" onClick={() => setShowCreate(false)}>Скасувати</button></div>
        </form>
      )}

      <section className="section-card">
        <div className="invoice-filters" aria-label="Фільтри рахунків">
          <label>Квартира<select aria-label="Фільтр за квартирою" value={apartmentFilter} onChange={(event) => setApartmentFilter(event.target.value)}><option value="">Усі квартири</option>{apartments.map((apartment) => <option key={apartment.id} value={apartment.id}>{apartment.name}</option>)}</select></label>
          <label>Статус<select aria-label="Фільтр за статусом" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Усі статуси</option>{INVOICE_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        </div>
        <div className="table-wrap">
          <table className="services-table">
            <thead><tr><th>Період</th><th>Квартира</th><th>Статус</th><th>Оренда</th><th>Комунальні</th><th>Разом</th><th /></tr></thead>
            <tbody>
              {invoices.map((invoice) => {
                const overdue = isOverdue(invoice);
                return (
                  <tr key={invoice.id}>
                    <td><strong>{periodLabel(invoice.period)}</strong></td>
                    <td>{apartmentNames[invoice.apartment_id] ?? `Квартира #${invoice.apartment_id}`}</td>
                    <td><InvoiceStatusBadge status={invoice.status} overdue={overdue} /></td>
                    <td>{formatUah(invoice.rent_amount_uah)}</td>
                    <td>{formatUah(invoice.utilities_total)}</td>
                    <td><strong>{formatUah(invoice.grand_total)}</strong></td>
                    <td><Link className="table-action" to={`/invoices/${invoice.id}`}>{invoice.status === "draft" ? "Редагувати" : "Переглянути"}</Link></td>
                  </tr>
                );
              })}
              {invoices.length === 0 && <tr><td className="empty-state" colSpan={7}>Рахунків за цими фільтрами немає.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
