import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { ExchangeRate, getCurrentRate, logout } from "../api/client";
import "./Layout.css";

const navigation = [
  { to: "/", label: "Дашборд", end: true },
  { to: "/apartments", label: "Квартири" },
  { to: "/invoices", label: "Рахунки" },
  { to: "/stats", label: "Статистика" },
  { to: "/settings", label: "Налаштування" },
];

export function Layout() {
  const navigate = useNavigate();
  const [rate, setRate] = useState<ExchangeRate | null>(null);

  useEffect(() => {
    let active = true;
    getCurrentRate()
      .then((value) => active && setRate(value))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  function toggleTheme() {
    const root = document.documentElement;
    const current = root.dataset.theme ??
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    root.dataset.theme = current === "dark" ? "light" : "dark";
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <NavLink className="app-logo" to="/" aria-label="HomeTrap — на головну">
          <span>HT</span>
          HomeTrap
        </NavLink>
        <div className="header-actions">
          <span className="rate-chip" title={rate?.is_fallback ? `Курс за ${rate.rate_date}` : undefined}>
            {rate ? `${rate.currency} · ${Number(rate.rate).toFixed(2)} ₴` : "Курс НБУ —"}
          </span>
          <button className="icon-button" type="button" onClick={toggleTheme} aria-label="Змінити тему">
            ◐
          </button>
          <button className="logout-button" type="button" onClick={handleLogout}>Вийти</button>
        </div>
      </header>

      <nav className="app-nav" aria-label="Основна навігація">
        {navigation.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => isActive ? "active" : undefined}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}
