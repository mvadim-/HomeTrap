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

  const formattedRate = rate
    ? new Intl.NumberFormat("uk-UA", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        useGrouping: false,
      }).format(Number(rate.rate))
    : null;

  return (
    <div className="app-shell">
      <header className="app-header">
        <NavLink className="app-logo" to="/" aria-label="HomeTrap — на головну">
          <svg
            className="app-logo-mark"
            viewBox="0 0 24 24"
            role="img"
            aria-label="Будинок"
          >
            <path d="M3.5 10.5 12 3.5l8.5 7v9a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z" />
            <path d="M9 20.5v-6h6v6" />
          </svg>
          <span className="app-logo-name">HomeTrap</span>
        </NavLink>

        <nav className="app-nav" aria-label="Основна навігація">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="header-actions">
          <span className="rate-chip" title={rate?.is_fallback ? `Курс за ${rate.rate_date}` : undefined}>
            {rate ? `${rate.currency} НБУ ${formattedRate} ₴` : "Курс НБУ —"}
          </span>
          <button className="icon-button" type="button" onClick={toggleTheme} aria-label="Змінити тему">
            ◐
          </button>
          <button className="logout-button" type="button" onClick={handleLogout}>Вийти</button>
        </div>
      </header>

      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}
