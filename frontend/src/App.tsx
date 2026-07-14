import { useEffect, useState } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";

import { getCurrentUser } from "./api/client";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";

export function ProtectedRoute() {
  const location = useLocation();
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    getCurrentUser()
      .then(() => active && setAuthenticated(true))
      .catch(() => active && setAuthenticated(false));
    return () => {
      active = false;
    };
  }, []);

  if (authenticated === null) {
    return <div className="loading-screen">Перевіряємо авторизацію…</div>;
  }
  if (!authenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

function PlaceholderPage({ title }: { title: string }) {
  return (
    <section className="placeholder-page">
      <h1>{title}</h1>
      <p>Розділ буде наповнено в наступних етапах плану.</p>
    </section>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<PlaceholderPage title="Дашборд" />} />
          <Route path="apartments" element={<PlaceholderPage title="Квартири" />} />
          <Route path="invoices" element={<PlaceholderPage title="Рахунки" />} />
          <Route path="stats" element={<PlaceholderPage title="Статистика" />} />
          <Route path="settings" element={<PlaceholderPage title="Налаштування" />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
