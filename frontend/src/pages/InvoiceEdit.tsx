import { useCallback, useEffect, useState } from "react";
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
import "./portal.css";

const statusLabels = { draft: "Чернетка", issued: "Виставлений", paid: "Оплачений" } as const;

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

  const handleDraftChange = useCallback((payload: InvoiceUpdatePayload, dirty: boolean) => {
    setDraftPayload(payload);
    setDraftDirty(dirty);
  }, []);

  const load = useCallback(async () => {
    setInvoice(await getInvoice(id));
  }, [id]);

  useEffect(() => {
    if (!Number.isInteger(id) || id < 1) {
      setError("Некоректний ідентифікатор рахунку.");
      return;
    }
    load().catch(() => setError("Не вдалося завантажити рахунок."));
  }, [id, load]);

  async function save(payload: InvoiceUpdatePayload) {
    setSaving(true);
    setError("");
    try {
      setInvoice(await updateInvoice(id, payload));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Не вдалося зберегти рахунок.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(action: "issue" | "revert-to-draft" | "mark-paid" | "unmark-paid") {
    setSaving(true);
    setError("");
    try {
      if (action === "issue" && draftPayload) {
        await updateInvoice(id, draftPayload);
      }
      setInvoice(await transitionInvoice(id, action));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Не вдалося змінити статус рахунку.");
    } finally {
      setSaving(false);
    }
  }

  async function removeDraft() {
    if (!window.confirm("Видалити цю чернетку рахунку? Цю дію неможливо скасувати.")) return;
    setSaving(true);
    setError("");
    try {
      await deleteInvoice(id);
      navigate("/invoices");
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Не вдалося видалити чернетку.");
      setSaving(false);
    }
  }

  if (error && !invoice) return <p className="error-message">{error}</p>;
  if (!invoice) return <p className="muted-text">Завантажуємо рахунок…</p>;

  return (
    <>
      <header className="page-header invoice-header">
        <div><Link className="muted-text" to="/invoices">← Рахунки</Link><h1>Рахунок за {new Intl.DateTimeFormat("uk-UA", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${invoice.period}T00:00:00Z`))}</h1><p><span className={`status-badge ${invoice.status}`}>{statusLabels[invoice.status]}</span>{invoice.paid_at && <> · Оплачено {dateLabel(invoice.paid_at)}</>}</p></div>
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
