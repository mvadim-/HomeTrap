import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  ApiError,
  deleteInvoice,
  Invoice,
  InvoiceUpdatePayload,
  getInvoice,
  transitionInvoice,
  updateInvoice,
} from "../api/client";
import { InvoiceCalculator } from "../components/InvoiceCalculator";
import { InvoiceStatusBadge } from "../components/InvoiceStatusBadge";
import { formatMonthYear } from "../utils/format";
import "./portal.css";

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium" }).format(new Date(value));
}

export function InvoiceEdit() {
  const { invoiceId } = useParams();
  const id = Number(invoiceId);
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [draftPayload, setDraftPayload] = useState<InvoiceUpdatePayload | null>(null);
  const [draftDirty, setDraftDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const routeGeneration = useRef(0);

  const handleDraftChange = useCallback((payload: InvoiceUpdatePayload | null, dirty: boolean) => {
    setDraftPayload(payload);
    setDraftDirty(dirty);
  }, []);

  useEffect(() => {
    const generation = ++routeGeneration.current;
    setInvoice(null);
    setDraftPayload(null);
    setDraftDirty(false);
    setSaving(false);
    setError("");
    if (!Number.isInteger(id) || id < 1) {
      setError("Некоректний ідентифікатор рахунку.");
      return;
    }
    getInvoice(id)
      .then((loadedInvoice) => {
        if (routeGeneration.current === generation) setInvoice(loadedInvoice);
      })
      .catch(() => {
        if (routeGeneration.current === generation) setError("Не вдалося завантажити рахунок.");
      });
    return () => {
      if (routeGeneration.current === generation) routeGeneration.current += 1;
    };
  }, [id]);

  async function save(payload: InvoiceUpdatePayload) {
    if (!invoice) return;
    const generation = routeGeneration.current;
    const targetId = invoice.id;
    setSaving(true);
    setError("");
    try {
      const updatedInvoice = await updateInvoice(targetId, payload);
      if (routeGeneration.current === generation) setInvoice(updatedInvoice);
    } catch (requestError) {
      if (routeGeneration.current === generation) {
        setError(requestError instanceof ApiError ? requestError.message : "Не вдалося зберегти рахунок.");
      }
    } finally {
      if (routeGeneration.current === generation) setSaving(false);
    }
  }

  async function changeStatus(action: "issue" | "revert-to-draft" | "mark-paid" | "unmark-paid") {
    if (!invoice) return;
    const generation = routeGeneration.current;
    const targetId = invoice.id;
    setSaving(true);
    setError("");
    try {
      if (action === "issue" && draftPayload) {
        await updateInvoice(targetId, draftPayload);
        if (routeGeneration.current !== generation) return;
      }
      const updatedInvoice = await transitionInvoice(targetId, action);
      if (routeGeneration.current === generation) setInvoice(updatedInvoice);
    } catch (requestError) {
      if (routeGeneration.current === generation) {
        setError(requestError instanceof ApiError ? requestError.message : "Не вдалося змінити статус рахунку.");
      }
    } finally {
      if (routeGeneration.current === generation) setSaving(false);
    }
  }

  async function removeDraft() {
    if (!invoice) return;
    if (!window.confirm("Видалити цю чернетку рахунку? Цю дію неможливо скасувати.")) return;
    const generation = routeGeneration.current;
    const targetId = invoice.id;
    setSaving(true);
    setError("");
    try {
      await deleteInvoice(targetId);
      if (routeGeneration.current === generation) navigate("/invoices");
    } catch (requestError) {
      if (routeGeneration.current === generation) {
        setError(requestError instanceof ApiError ? requestError.message : "Не вдалося видалити чернетку.");
        setSaving(false);
      }
    }
  }

  if (error && !invoice) return <p className="error-message">{error}</p>;
  if (!invoice) return <p className="muted-text">Завантажуємо рахунок…</p>;

  return (
    <>
      <header className="page-header invoice-header">
        <div><Link className="muted-text" to="/invoices">← Рахунки</Link><h1>Рахунок за {formatMonthYear(invoice.period)}</h1><p><InvoiceStatusBadge status={invoice.status} />{invoice.paid_at && <> · Оплачено {dateLabel(invoice.paid_at)}</>}</p></div>
        <div className="invoice-actions">
          {invoice.status === "draft" && <><button className="danger-button" disabled={saving} type="button" onClick={removeDraft}>Видалити чернетку</button><button className="button" disabled={saving || !draftPayload} type="button" onClick={() => changeStatus("issue")}>{draftDirty ? "Зберегти й виставити" : "Виставити"}</button></>}
          {invoice.status === "issued" && <><button className="secondary-button" disabled={saving} type="button" onClick={() => changeStatus("revert-to-draft")}>Повернути в чернетку</button><button className="button" disabled={saving} type="button" onClick={() => changeStatus("mark-paid")}>Позначити оплаченим</button></>}
          {invoice.status === "paid" && <button className="secondary-button" disabled={saving} type="button" onClick={() => changeStatus("unmark-paid")}>Скасувати оплату</button>}
        </div>
      </header>
      {error && <p className="error-message">{error}</p>}
      <InvoiceCalculator
        invoice={invoice}
        onSave={save}
        saving={saving}
        onDraftChange={handleDraftChange}
      />
    </>
  );
}
