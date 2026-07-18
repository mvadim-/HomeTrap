import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  Apartment,
  DashboardStats,
  UpcomingBillingItem,
  getApartments,
  getDashboard,
  getIncomeStats,
  getUpcomingBilling,
} from "../api/client";
import { InvoiceStatusBadge } from "../components/InvoiceStatusBadge";
import { formatDate, formatTenantRent, formatUah } from "../utils/format";
import "./portal.css";

export function Dashboard() {
  const [dashboard, setDashboard] = useState<DashboardStats | null>(null);
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [incomeTotal, setIncomeTotal] = useState<string | null>(null);
  const [upcomingBilling, setUpcomingBilling] = useState<UpcomingBillingItem[] | null>(null);
  const [upcomingError, setUpcomingError] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([getDashboard(), getApartments()])
      .then(([stats, apartmentItems]) => {
        if (active) {
          setDashboard(stats);
          setApartments(apartmentItems);
        }
      })
      .catch(() => active && setError("Не вдалося завантажити дашборд."));
    getIncomeStats(undefined, { months: 12 })
      .then((stats) => active && setIncomeTotal(stats.totals.total))
      .catch(() => undefined);
    getUpcomingBilling()
      .then((items) => active && setUpcomingBilling([...items].sort((left, right) => (
        left.next_billing_date.localeCompare(right.next_billing_date)
        || left.apartment_name.localeCompare(right.apartment_name, "uk")
        || left.apartment_id - right.apartment_id
      ))))
      .catch(() => active && setUpcomingError("Не вдалося завантажити найближчі виставлення."));
    return () => {
      active = false;
    };
  }, []);

  if (error) return <p className="error-message">{error}</p>;
  if (!dashboard) return <p className="muted-text">Завантажуємо дашборд…</p>;

  const draftCount = dashboard.needs_attention.filter((item) => item.reason === "draft").length;
  const unpaidCount = dashboard.needs_attention.filter((item) => item.reason === "unpaid").length;
  function billingTarget(item: UpcomingBillingItem): string {
    const invoice = apartments.find((apartment) => (
      apartment.id === item.apartment_id
      && apartment.latest_invoice?.period === item.period
      && apartment.latest_invoice.status === item.invoice_status
    ))?.latest_invoice;
    return invoice ? `/invoices/${invoice.id}` : `/apartments/${item.apartment_id}`;
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Дашборд</h1>
          <p>Стан портфеля за поточний місяць</p>
        </div>
      </header>

      <section className="dashboard-grid" aria-label="Показники портфеля">
        <article className="metric-card">
          <span className="metric-label">Нараховано</span>
          <strong>{formatUah(dashboard.charged)}</strong>
          {draftCount > 0 && <small className="metric-note">Чернеток: {draftCount}</small>}
        </article>
        <article className="metric-card">
          <span className="metric-label">Оплачено</span>
          <strong>{formatUah(dashboard.paid)}</strong>
        </article>
        <article className="metric-card">
          <span className="metric-label">Заборгованість</span>
          <strong>{formatUah(dashboard.outstanding)}</strong>
          {unpaidCount > 0 && <small className="metric-note note-neg">Неоплачених: {unpaidCount}</small>}
        </article>
        <article className="metric-card">
          <span className="metric-label">Дохід за 12 місяців</span>
          <strong>{incomeTotal === null ? "—" : formatUah(incomeTotal)}</strong>
          {incomeTotal !== null && <small className="metric-note note-pos">оренда + комунальні</small>}
        </article>
      </section>

      <section className="section-card upcoming-billing-card">
        <div className="section-heading">
          <div><h2>Найближчі виставлення</h2><p>Заплановані дати на наступні 30 днів</p></div>
        </div>
        {upcomingError ? (
          <p className="error-message" role="alert">{upcomingError}</p>
        ) : upcomingBilling === null ? (
          <p className="muted-text">Завантажуємо найближчі виставлення…</p>
        ) : upcomingBilling.length === 0 ? (
          <p className="empty-state">У найближчі 30 днів виставлень немає.</p>
        ) : (
          <div className="table-wrap">
            <table aria-label="Найближчі виставлення" className="services-table upcoming-billing-table">
              <thead><tr><th>Квартира</th><th>Орендар</th><th>Дата</th><th>Статус рахунка</th></tr></thead>
              <tbody>
                {upcomingBilling.map((item) => {
                  const needsWarning = item.is_overdue;
                  return (
                    <tr className={needsWarning ? "upcoming-billing-warning" : undefined} key={`${item.apartment_id}-${item.next_billing_date}`}>
                      <td><Link className="upcoming-billing-link" to={billingTarget(item)}>{item.apartment_name}</Link></td>
                      <td>{item.tenant_name}</td>
                      <td>{formatDate(item.next_billing_date)}</td>
                      <td><InvoiceStatusBadge status={item.invoice_status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="content-grid">
        <section className="section-card">
          <div className="section-heading">
            <div><h2>Квартири</h2><p>{apartments.length} об'єктів у портфелі</p></div>
            <Link className="secondary-button" to="/apartments">Усі квартири</Link>
          </div>
          <div className="apartments-grid dashboard-apartments-list">
            {apartments.map((apartment) => (
              <Link className="apartment-card dashboard-apartment-row" to={`/apartments/${apartment.id}`} key={apartment.id}>
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
