import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { Apartment, getApartments } from "../api/client";
import "./portal.css";

const statusLabels = { draft: "Чернетка", issued: "Виставлений", paid: "Оплачений" };

export function Apartments() {
  const [apartments, setApartments] = useState<Apartment[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getApartments()
      .then((items) => active && setApartments(items))
      .catch(() => active && setError("Не вдалося завантажити квартири."));
    return () => { active = false; };
  }, []);

  return (
    <>
      <header className="page-header"><div><h1>Квартири</h1><p>Реквізити, оренда й комунальні послуги</p></div></header>
      {error && <p className="error-message">{error}</p>}
      {!apartments ? <p className="muted-text">Завантажуємо квартири…</p> : (
        <div className="apartments-grid">
          {apartments.map((apartment) => (
            <Link className="apartment-card" to={`/apartments/${apartment.id}`} key={apartment.id}>
              <header>
                <h2>{apartment.name}</h2>
                <span className={`status-badge ${apartment.latest_invoice?.status ?? "draft"}`}>
                  {apartment.latest_invoice ? statusLabels[apartment.latest_invoice.status] : "Без рахунків"}
                </span>
              </header>
              <p className="apartment-address">{apartment.address}</p>
              <div className="card-row"><span>Оренда</span><strong>{apartment.rent_amount} {apartment.rent_currency}</strong></div>
              <div className="card-row"><span>Стан</span><strong>{apartment.is_active ? "Активна" : "Архівна"}</strong></div>
            </Link>
          ))}
          {apartments.length === 0 && <p className="empty-state">Квартир ще немає.</p>}
        </div>
      )}
    </>
  );
}
