import { FormEvent, useCallback, useEffect, useState } from "react";

import {
  ApiError,
  Apartment,
  EXPENSE_CATEGORY_LABELS,
  Expense,
  ExpenseCategory,
  ExpenseCreatePayload,
  createExpense,
  deleteExpense,
  getApartments,
  getExpenses,
  updateExpense,
} from "../api/client";
import { formatDate } from "../utils/format";
import "./portal.css";

const CATEGORY_OPTIONS = (Object.entries(EXPENSE_CATEGORY_LABELS) as [ExpenseCategory, string][])
  .map(([value, label]) => ({ value, label }));

interface ExpenseForm {
  apartmentId: string;
  date: string;
  category: ExpenseCategory;
  amount: string;
  currency: string;
  notes: string;
}

function emptyForm(): ExpenseForm {
  return {
    apartmentId: "",
    date: new Date().toISOString().slice(0, 10),
    category: "repair",
    amount: "",
    currency: "UAH",
    notes: "",
  };
}

function formatAmount(amount: string, currency: string): string {
  const value = Number(amount).toLocaleString("uk-UA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency === "UAH" ? `${value} ₴` : `${value} ${currency}`;
}

export function Expenses() {
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [form, setForm] = useState<ExpenseForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => setExpenses(await getExpenses()), []);

  useEffect(() => {
    getApartments()
      .then(setApartments)
      .catch(() => setError("Не вдалося завантажити квартири."));
  }, []);

  useEffect(() => {
    load().catch(() => setError("Не вдалося завантажити витрати."));
  }, [load]);

  function beginEdit(expense?: Expense) {
    setEditingId(expense?.id ?? null);
    setForm(expense ? {
      apartmentId: expense.apartment_id ? String(expense.apartment_id) : "",
      date: expense.date,
      category: expense.category,
      amount: expense.amount,
      currency: expense.currency,
      notes: expense.notes ?? "",
    } : emptyForm());
    setShowForm(true);
    setError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!(Number(form.amount) > 0)) {
      setError("Сума має бути більшою за нуль.");
      return;
    }
    const payload: ExpenseCreatePayload = {
      apartment_id: form.apartmentId ? Number(form.apartmentId) : null,
      date: form.date,
      category: form.category,
      amount: form.amount,
      currency: form.currency,
      notes: form.notes || null,
    };
    try {
      if (editingId) await updateExpense(editingId, payload);
      else await createExpense(payload);
      setShowForm(false);
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Не вдалося зберегти витрату.");
    }
  }

  async function remove(id: number) {
    setError("");
    try {
      await deleteExpense(id);
      await load();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Не вдалося видалити витрату.");
    }
  }

  const apartmentNames = Object.fromEntries(apartments.map((apartment) => [apartment.id, apartment.name]));

  function apartmentLabel(apartmentId: number | null): string {
    if (apartmentId === null) return "Загальна";
    return apartmentNames[apartmentId] ?? `Квартира #${apartmentId}`;
  }

  return (
    <>
      <header className="page-header">
        <div><h1>Витрати</h1><p>Ремонт, податки, страхування та інші видатки</p></div>
        <button className="button" type="button" onClick={() => beginEdit()}>Додати витрату</button>
      </header>
      {error && <p className="error-message">{error}</p>}
      {showForm && (
        <form className="inline-form expense-form" onSubmit={submit}>
          <label>Квартира<select value={form.apartmentId} onChange={(event) => setForm({ ...form, apartmentId: event.target.value })}><option value="">Загальна</option>{apartments.map((apartment) => <option key={apartment.id} value={apartment.id}>{apartment.name}</option>)}</select></label>
          <label>Дата<input required type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
          <label>Категорія<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as ExpenseCategory })}>{CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label>Сума<input required min="0" step="0.01" type="number" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label>
          <label>Валюта<input required maxLength={3} value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} /></label>
          <label>Нотатки<input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
          <div className="form-actions"><button className="button" type="submit">Зберегти</button><button className="secondary-button" type="button" onClick={() => setShowForm(false)}>Скасувати</button></div>
        </form>
      )}
      {!expenses ? <p className="muted-text">Завантажуємо витрати…</p> : (
        <section className="section-card">
          <div className="table-wrap">
            <table className="services-table">
              <thead><tr><th>Дата</th><th>Квартира</th><th>Категорія</th><th>Сума</th><th>Нотатки</th><th /></tr></thead>
              <tbody>
                {expenses.map((expense) => (
                  <tr key={expense.id}>
                    <td>{formatDate(expense.date)}</td>
                    <td>{apartmentLabel(expense.apartment_id)}</td>
                    <td>{EXPENSE_CATEGORY_LABELS[expense.category] ?? expense.category}</td>
                    <td><strong>{formatAmount(expense.amount, expense.currency)}</strong></td>
                    <td>{expense.notes ?? "—"}</td>
                    <td>
                      <button className="table-action" type="button" onClick={() => beginEdit(expense)}>Редагувати</button>
                      {" · "}
                      <button className="table-action" type="button" onClick={() => remove(expense.id)}>Видалити</button>
                    </td>
                  </tr>
                ))}
                {expenses.length === 0 && <tr><td className="empty-state" colSpan={6}>Витрат ще немає. Додайте першу витрату, щоб почати облік.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
