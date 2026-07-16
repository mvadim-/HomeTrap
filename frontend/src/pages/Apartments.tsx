import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  ApiError,
  Apartment,
  ApartmentPayload,
  archiveApartment,
  createApartment,
  getApartments,
  updateApartment,
} from "../api/client";
import { InvoiceStatusBadge } from "../components/InvoiceStatusBadge";
import { formatTenantRent } from "../utils/format";
import "./portal.css";

const emptyApartment: ApartmentPayload = {
  name: "",
  address: "",
  rent_amount: "",
  rent_currency: "USD",
  notes: "",
  is_active: true,
};

export function Apartments() {
  const [apartments, setApartments] = useState<Apartment[] | null>(null);
  const [form, setForm] = useState<ApartmentPayload>(emptyApartment);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => setApartments(await getApartments()), []);

  useEffect(() => {
    load().catch(() => setError("Не вдалося завантажити квартири."));
  }, [load]);

  function beginEdit(apartment?: Apartment) {
    setEditingId(apartment?.id ?? null);
    setForm(apartment ? {
      name: apartment.name,
      address: apartment.address,
      rent_amount: apartment.rent_amount,
      rent_currency: "USD",
      notes: apartment.notes ?? "",
      is_active: apartment.is_active,
    } : emptyApartment);
    setShowForm(true);
    setError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const payload = { ...form, notes: form.notes || null };
    try {
      if (editingId) await updateApartment(editingId, payload);
      else await createApartment(payload);
      setShowForm(false);
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Не вдалося зберегти квартиру.");
    }
  }

  async function archive(id: number) {
    setError("");
    try {
      await archiveApartment(id);
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Не вдалося архівувати квартиру.");
    }
  }

  return (
    <>
      <header className="page-header">
        <div><h1>Квартири</h1><p>Реквізити, оренда й комунальні послуги</p></div>
        <button className="button" type="button" onClick={() => beginEdit()}>Додати квартиру</button>
      </header>
      {error && <p className="error-message">{error}</p>}
      {showForm && (
        <form className="inline-form apartment-form" onSubmit={submit}>
          <label>Назва<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label>Адреса<input required value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></label>
          <label>Оренда, USD<input required min="0" step="0.01" type="number" value={form.rent_amount} onChange={(event) => setForm({ ...form, rent_amount: event.target.value })} /></label>
          <label>Примітки<input value={form.notes ?? ""} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
          {editingId && <label className="checkbox-label"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} /> Активна</label>}
          <div className="form-actions"><button className="button" type="submit">Зберегти</button><button className="secondary-button" type="button" onClick={() => setShowForm(false)}>Скасувати</button></div>
        </form>
      )}
      {!apartments ? <p className="muted-text">Завантажуємо квартири…</p> : (
        <div className="apartments-grid apartment-management-grid">
          {apartments.map((apartment) => (
            <article className="apartment-card apartment-management-card" key={apartment.id}>
              <header>
                <h2><Link to={`/apartments/${apartment.id}`}>{apartment.name}</Link></h2>
                <InvoiceStatusBadge status={apartment.latest_invoice?.status ?? null} />
              </header>
              <p className="apartment-address">{apartment.address}</p>
              <div className="card-row"><span>{formatTenantRent(apartment.current_tenant_name, apartment.rent_amount, apartment.rent_currency)}</span></div>
              <div className="card-row"><span>Стан</span><strong>{apartment.is_active ? "Активна" : "Архівна"}</strong></div>
              <div className="form-actions">
                <button className="table-action" type="button" onClick={() => beginEdit(apartment)}>Редагувати</button>
                {apartment.is_active && <button className="table-action" type="button" onClick={() => archive(apartment.id)}>Архівувати</button>}
              </div>
            </article>
          ))}
          {apartments.length === 0 && <p className="empty-state">Квартир ще немає. Додайте першу квартиру, щоб почати облік.</p>}
        </div>
      )}
    </>
  );
}
