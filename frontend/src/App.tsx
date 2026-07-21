import { useEffect, useState } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";

import { getCurrentUser } from "./api/client";
import { Layout } from "./components/Layout";
import { ApartmentDetail } from "./pages/ApartmentDetail";
import { Apartments } from "./pages/Apartments";
import { Dashboard } from "./pages/Dashboard";
import { Expenses } from "./pages/Expenses";
import { InvoiceEdit } from "./pages/InvoiceEdit";
import { Invoices } from "./pages/Invoices";
import { Login } from "./pages/Login";
import { Settings } from "./pages/Settings";
import { Stats } from "./pages/Stats";

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
          <Route path="expenses" element={<Expenses />} />
          <Route path="stats" element={<Stats />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
