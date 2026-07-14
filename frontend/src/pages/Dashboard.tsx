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
import "./portal.css";

const statusLabels = {
  draft: "Чернетка",
  issued: "Виставлений",
  paid: "Оплачений",
};

function money(value: string): string {
  return `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(Number(value))} ₴`;
}

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
        <article className="metric-card"><span className="metric-label">Нараховано</span><strong>{money(dashboard.charged)}</strong></article>
        <article className="metric-card"><span className="metric-label">Оплачено</span><strong>{money(dashboard.paid)}</strong></article>
        <article className="metric-card"><span className="metric-label">Заборгованість</span><strong>{money(dashboard.outstanding)}</strong></article>
        <article className="metric-card"><span className="metric-label">Курс НБУ · {rate.currency}</span><strong>{Number(rate.rate).toFixed(2)} ₴</strong></article>
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
                <header>
                  <h3>{apartment.name}</h3>
                  <span className={`status-badge ${apartment.latest_invoice?.status ?? "draft"}`}>
                    {apartment.latest_invoice ? statusLabels[apartment.latest_invoice.status] : "Без рахунків"}
                  </span>
                </header>
                <p className="apartment-address">{apartment.address}</p>
                <div className="card-row"><span>Оренда</span><strong>{apartment.rent_amount} {apartment.rent_currency}</strong></div>
                {apartment.latest_invoice && <div className="card-row"><span>Останній рахунок</span><strong>{money(apartment.latest_invoice.grand_total)}</strong></div>}
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
                  <div><Link to={`/apartments/${item.apartment_id}`}>{item.apartment_name}</Link><div className="muted-text">{item.reason === "unpaid" ? "Очікує оплати" : "Завершіть чернетку"}</div></div>
                  <strong>{money(item.grand_total)}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
