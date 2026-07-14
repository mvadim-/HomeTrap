import { useEffect, useState } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";

import { getCurrentUser } from "./api/client";
import { Layout } from "./components/Layout";
import { ApartmentDetail } from "./pages/ApartmentDetail";
import { Apartments } from "./pages/Apartments";
import { Dashboard } from "./pages/Dashboard";
import { InvoiceEdit } from "./pages/InvoiceEdit";
import { Invoices } from "./pages/Invoices";
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
          <Route index element={<Dashboard />} />
          <Route path="apartments" element={<Apartments />} />
          <Route path="apartments/:apartmentId" element={<ApartmentDetail />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="invoices/:invoiceId" element={<InvoiceEdit />} />
          <Route path="stats" element={<PlaceholderPage title="Статистика" />} />
          <Route path="settings" element={<PlaceholderPage title="Налаштування" />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
