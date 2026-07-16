import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  Apartment,
  DashboardStats,
  ExchangeRate,
  getApartments,
  getCurrentRate,
  getDashboard,
} from "../api/client";
import { InvoiceStatusBadge } from "../components/InvoiceStatusBadge";
import { formatRate, formatTenantRent, formatUah } from "../utils/format";
import "./portal.css";

export function Dashboard() {
  const [dashboard, setDashboard] = useState<DashboardStats | null>(null);
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [rate, setRate] = useState<ExchangeRate | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([getDashboard(), getApartments(), getCurrentRate()])
      .then(([stats, apartmentItems, exchangeRate]) => {
        if (active) {
          setDashboard(stats);
          setApartments(apartmentItems);
          setRate(exchangeRate);
        }
      })
      .catch(() => active && setError("Не вдалося завантажити дашборд."));
    return () => {
      active = false;
    };
  }, []);

  if (error) return <p className="error-message">{error}</p>;
  if (!dashboard || !rate) return <p className="muted-text">Завантажуємо дашборд…</p>;

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Дашборд</h1>
          <p>Стан портфеля за поточний місяць</p>
        </div>
      </header>

      <section className="dashboard-grid" aria-label="Показники портфеля">
        <article className="metric-card"><span className="metric-label">Нараховано</span><strong>{formatUah(dashboard.charged)}</strong></article>
        <article className="metric-card"><span className="metric-label">Оплачено</span><strong className="metric-note note-pos">{formatUah(dashboard.paid)}</strong></article>
        <article className="metric-card"><span className="metric-label">Заборгованість</span><strong className={Number(dashboard.outstanding) > 0 ? "metric-note note-neg" : undefined}>{formatUah(dashboard.outstanding)}</strong></article>
        <article className="metric-card"><span className="metric-label">Курс НБУ · {rate.currency}</span><strong>{formatRate(rate.rate)} ₴</strong></article>
      </section>

      <div className="content-grid">
        <section className="section-card">
          <div className="section-heading">
            <div><h2>Квартири</h2><p>{apartments.length} об'єктів у портфелі</p></div>
            <Link className="secondary-button" to="/apartments">Усі квартири</Link>
          </div>
          <div className="apartments-grid">
            {apartments.map((apartment) => (
              <Link className="apartment-card" to={`/apartments/${apartment.id}`} key={apartment.id}>
                <span className="apartment-avatar" aria-hidden="true">{apartment.name.trim().charAt(0)}</span>
                <div className="apartment-details">
                  <h3>{apartment.name}</h3>
                  {apartment.address.trim() !== apartment.name.trim() && <p className="apartment-address">{apartment.address}</p>}
                  <span className="apartment-rent">{formatTenantRent(apartment.current_tenant_name, apartment.rent_amount, apartment.rent_currency)}</span>
                </div>
                <div className="apartment-summary">
                  {apartment.latest_invoice && <strong>{formatUah(apartment.latest_invoice.grand_total)}</strong>}
                  <InvoiceStatusBadge status={apartment.latest_invoice?.status ?? null} />
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="section-card">
          <div className="section-heading"><div><h2>Потребує уваги</h2><p>Чернетки та неоплачені рахунки</p></div></div>
          {dashboard.needs_attention.length === 0 ? (
            <p className="empty-state">Усе гаразд — термінових дій немає.</p>
          ) : (
            <ul className="attention-list">
              {dashboard.needs_attention.map((item) => (
                <li className="attention-item" key={item.invoice_id}>
                  <span
                    aria-hidden="true"
                    className={`attention-dot ${item.reason === "draft" ? "amber" : item.period < dashboard.period ? "rose" : "muted"}`}
                  />
                  <div className="attention-details"><Link to={`/apartments/${item.apartment_id}`}>{item.apartment_name}</Link><div className="muted-text">{item.reason === "draft" ? "Завершіть чернетку" : item.period < dashboard.period ? "Прострочена оплата" : "Очікує оплати"}</div></div>
                  <strong>{formatUah(item.grand_total)}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
