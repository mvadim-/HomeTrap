import { useEffect, useMemo, useRef, useState } from "react";

import {
  EXPENSE_CATEGORY_LABELS,
  ExpenseCategory,
  Invoice,
  InvoiceAdjustmentPayload,
  InvoiceUpdatePayload,
} from "../api/client";
import {
  amountCents,
  decimalInput,
  normalizeDecimalInput,
  numberValue,
  productCents,
  sameNumber,
  subtractDecimals,
} from "../utils/decimal";
import { formatRate, formatReading, formatTariff, formatUah } from "../utils/format";
import "../pages/portal.css";

interface InvoiceCalculatorProps {
  invoice: Invoice;
  onSave: (payload: InvoiceUpdatePayload) => Promise<void>;
  saving?: boolean;
  onDraftChange?: (payload: InvoiceUpdatePayload | null, dirty: boolean) => void;
}

interface DraftAdjustment extends InvoiceAdjustmentPayload {
  key: string;
  category: ExpenseCategory;
}

const EXPENSE_CATEGORIES = Object.entries(EXPENSE_CATEGORY_LABELS) as [ExpenseCategory, string][];

function adjustmentAmountValid(value: string): boolean {
  const amount = decimalInput(value);
  if (!amount.valid || amount.normalized === null) return false;
  const unsigned = amount.normalized.replace(/^[+-]/, "");
  const [whole, fraction = ""] = unsigned.split(".");
  const wholeDigits = whole.replace(/^0+/, "") || "0";
  return wholeDigits.length <= 10 && fraction.length <= 2;
}

function invoiceAdjustments(invoice: Invoice): DraftAdjustment[] {
  return invoice.lines
    .filter((line) => line.service_kind === "adjustment")
    .map((line) => ({
      key: `saved-${line.id}`,
      id: line.id,
      label: line.service_name,
      amount: line.amount,
      record_as_expense: line.expense !== null,
      category: line.expense?.category ?? "repair",
    }));
}

export function InvoiceCalculator({
  invoice,
  onSave,
  saving = false,
  onDraftChange,
}: InvoiceCalculatorProps) {
  const isDraft = invoice.status === "draft";
  const [exchangeRate, setExchangeRate] = useState({
    display: formatRate(invoice.exchange_rate),
    exact: invoice.exchange_rate,
  });
  const [readings, setReadings] = useState<Record<number, string>>(
    Object.fromEntries(invoice.lines.map((line) => [
      line.id,
      line.curr_reading === null ? "" : formatReading(line.curr_reading),
    ])),
  );
  const [adjustments, setAdjustments] = useState<DraftAdjustment[]>(() => invoiceAdjustments(invoice));
  const nextAdjustmentKey = useRef(1);

  useEffect(() => {
    setExchangeRate({
      display: formatRate(invoice.exchange_rate),
      exact: invoice.exchange_rate,
    });
    setReadings(Object.fromEntries(invoice.lines.map((line) => [
      line.id,
      line.curr_reading === null ? "" : formatReading(line.curr_reading),
    ])));
    setAdjustments(invoiceAdjustments(invoice));
  }, [invoice]);

  const calculated = useMemo(() => {
    const lines = invoice.lines.filter((line) => line.service_kind !== "adjustment").map((line) => {
      if (!isDraft) {
        return {
          ...line,
          calculatedAmount: amountCents(line.amount),
          calculatedConsumed: numberValue(line.consumed),
        };
      }
      if (line.service_kind !== "metered") return { ...line, calculatedAmount: amountCents(line.amount), calculatedConsumed: null };
      const previous = numberValue(line.prev_reading);
      const current = numberValue(readings[line.id] ?? "");
      const consumed = previous === null || current === null ? null : current - previous;
      const consumedExact = previous === null || current === null
        ? null
        : subtractDecimals(readings[line.id] ?? "", line.prev_reading ?? "0");
      return {
        ...line,
        calculatedAmount: consumedExact === null ? 0n : productCents(consumedExact, line.tariff_value),
        calculatedConsumed: consumed,
      };
    });
    const rent = isDraft
      ? productCents(invoice.rent_amount_usd, exchangeRate.exact)
      : amountCents(invoice.rent_amount_uah);
    const utilities = isDraft
      ? lines.reduce((sum, line) => sum + line.calculatedAmount, 0n)
      : amountCents(invoice.utilities_total);
    const adjustmentTotal = isDraft
      ? adjustments.reduce((sum, adjustment) => sum + amountCents(adjustment.amount), 0n)
      : amountCents(invoice.adjustments_total);
    const total = isDraft ? rent + utilities + adjustmentTotal : amountCents(invoice.grand_total);
    return { lines, rent, utilities, adjustments: adjustmentTotal, total };
  }, [adjustments, exchangeRate.exact, invoice, isDraft, readings]);

  const adjustmentPayload = useMemo<InvoiceAdjustmentPayload[]>(() => adjustments.map((adjustment) => {
    const amount = decimalInput(adjustment.amount);
    const canRecordExpense = amount.numeric !== null && amount.numeric < 0;
    return {
      ...(adjustment.id === undefined ? {} : { id: adjustment.id }),
      label: adjustment.label.trim(),
      amount: amount.normalized ?? adjustment.amount,
      record_as_expense: canRecordExpense && adjustment.record_as_expense,
      category: canRecordExpense && adjustment.record_as_expense ? adjustment.category : null,
    };
  }), [adjustments]);

  const payload = useMemo<InvoiceUpdatePayload | null>(() => {
    if (!isDraft) return null;
    return {
      exchange_rate: sameNumber(exchangeRate.exact, invoice.exchange_rate)
        ? invoice.exchange_rate
        : normalizeDecimalInput(exchangeRate.exact),
      lines: invoice.lines
        .filter((line) => line.service_kind === "metered")
        .map((line) => {
          const reading = decimalInput(readings[line.id] || null);
          return {
            id: line.id,
            curr_reading: sameNumber(readings[line.id] || null, line.curr_reading)
              ? line.curr_reading
              : reading.normalized,
          };
        }),
      adjustments: adjustmentPayload,
    };
  }, [adjustmentPayload, exchangeRate.exact, invoice.exchange_rate, invoice.lines, isDraft, readings]);
  const savedAdjustments = invoice.lines.filter((line) => line.service_kind === "adjustment");
  const adjustmentsDirty = adjustments.length !== savedAdjustments.length || adjustments.some((adjustment, index) => {
    const saved = savedAdjustments[index];
    return !saved
      || adjustment.id !== saved.id
      || adjustment.label.trim() !== saved.service_name
      || !sameNumber(adjustment.amount, saved.amount)
      || adjustment.record_as_expense !== (saved.expense !== null)
      || (adjustment.record_as_expense && adjustment.category !== saved.expense?.category);
  });
  const dirty = isDraft && (
    !sameNumber(exchangeRate.exact, invoice.exchange_rate)
    || invoice.lines.some(
      (line) => line.service_kind === "metered" && !sameNumber(readings[line.id] || null, line.curr_reading),
    )
    || adjustmentsDirty
  );
  const readingsValid = isDraft && invoice.lines.every(
    (line) => line.service_kind !== "metered" || decimalInput(readings[line.id] || null).valid,
  );
  const adjustmentsValid = adjustments.every((adjustment) => {
    return adjustment.label.trim().length > 0
      && adjustment.label.trim().length <= 200
      && adjustmentAmountValid(adjustment.amount);
  });
  const draftValid = isDraft && Boolean(numberValue(exchangeRate.exact)) && readingsValid && adjustmentsValid;

  useEffect(() => {
    if (isDraft) onDraftChange?.(draftValid ? payload : null, dirty);
  }, [dirty, draftValid, isDraft, onDraftChange, payload]);

  const localWarnings = isDraft ? calculated.lines.flatMap((line) => {
    if (line.calculatedConsumed === null || line.calculatedConsumed >= 0) return [];
    return [`${line.service_name}: поточний показник менший за попередній.`];
  }) : [];
  const serverWarnings = isDraft ? invoice.warnings.flatMap((warning) => {
    const line = invoice.lines.find((item) => item.service_id === warning.service_id);
    const serviceName = line?.service_name ?? "Послуга";
    if (warning.code === "reading_decreased") {
      const current = line ? numberValue(readings[line.id] ?? "") : null;
      const previous = numberValue(line?.prev_reading ?? null);
      if (current !== null && previous !== null && current < previous) return [];
      return [`${serviceName}: поточний показник менший за попередній.`];
    }
    if (warning.code === "consumption_anomaly") {
      return [`${serviceName}: споживання відхиляється від середнього за 6 місяців більш ніж на 50%.`];
    }
    return [warning.message];
  }) : [];

  async function save() {
    if (!draftValid || payload === null) return;
    await onSave(payload);
  }

  function addAdjustment() {
    setAdjustments([...adjustments, {
      key: `new-${nextAdjustmentKey.current++}`,
      label: "Коригування",
      amount: "-0.00",
      record_as_expense: false,
      category: "repair",
    }]);
  }

  function updateAdjustment(key: string, changes: Partial<DraftAdjustment>) {
    setAdjustments(adjustments.map((adjustment) => (
      adjustment.key === key ? { ...adjustment, ...changes } : adjustment
    )));
  }

  return (
    <section className="section-card invoice-calculator">
      <div className="section-heading">
        <div><h2>Розрахунок</h2><p>Суми оновлюються одразу після зміни показників або курсу.</p></div>
        {isDraft ? (
          <label className="rate-field">
            Курс USD
            <input
              aria-label="Курс USD"
              inputMode="decimal"
              type="text"
              value={exchangeRate.display}
              placeholder={formatRate(invoice.exchange_rate)}
              onChange={(event) => setExchangeRate({
                display: event.target.value,
                exact: normalizeDecimalInput(event.target.value),
              })}
            />
          </label>
        ) : (
          <div className="rate-field">
            <span>Курс USD</span>
            <strong className="invoice-readonly-value">{formatRate(invoice.exchange_rate)}</strong>
          </div>
        )}
      </div>

      <div className="table-wrap">
        <table className="services-table invoice-lines">
          <thead><tr><th>Послуга</th><th>Попередній</th><th>Поточний</th><th>Спожито</th><th>Тариф</th><th>Сума</th></tr></thead>
          <tbody>
            {calculated.lines.map((line) => {
              const metered = line.service_kind === "metered";
              const consumed = line.calculatedConsumed;
              return (
                <tr key={line.id}>
                  <td><strong>{line.service_name}</strong></td>
                  <td>{metered && line.prev_reading !== null ? formatReading(line.prev_reading) : "—"}</td>
                  <td>
                    {metered && isDraft ? (
                      <input
                        aria-label={`Поточний показник ${line.service_name}`}
                        inputMode="decimal"
                        type="text"
                        value={readings[line.id] ?? ""}
                        onChange={(event) => setReadings({ ...readings, [line.id]: event.target.value })}
                      />
                    ) : metered ? (
                      <span className="invoice-readonly-value">
                        {line.curr_reading === null ? "—" : formatReading(line.curr_reading)}
                      </span>
                    ) : "Фіксована"}
                  </td>
                  <td>{consumed === null ? "—" : consumed.toLocaleString("uk-UA", { maximumFractionDigits: 3 })}</td>
                  <td>{formatTariff(line.tariff_value)} ₴</td>
                  <td>{formatUah(Number(line.calculatedAmount) / 100)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isDraft && (localWarnings.length > 0 || serverWarnings.length > 0) && (
        <div className="warning-box" role="alert">
          <strong>Перевірте показники</strong>
          <ul>{[...localWarnings, ...serverWarnings].map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </div>
      )}

      {(isDraft || adjustments.length > 0) && (
        <section className="invoice-adjustments" aria-labelledby="invoice-adjustments-title">
          <div className="adjustments-heading">
            <div>
              <h3 id="invoice-adjustments-title">Коригування</h3>
              <p>Разові знижки або доплати в цьому рахунку.</p>
            </div>
            {isDraft && (
              <button className="secondary-button" type="button" onClick={addAdjustment}>
                Додати коригування
              </button>
            )}
          </div>
          {adjustments.length === 0 ? (
            <p className="muted-text adjustment-empty">Коригувань немає.</p>
          ) : (
            <div className="adjustment-list">
              {adjustments.map((adjustment, index) => {
                const amount = numberValue(adjustment.amount);
                const expenseAvailable = amount !== null && amount < 0;
                return isDraft ? (
                  <div className="adjustment-row" key={adjustment.key}>
                    <label>
                      Мітка
                      <input
                        aria-label={`Мітка коригування ${index + 1}`}
                        maxLength={200}
                        type="text"
                        value={adjustment.label}
                        onChange={(event) => updateAdjustment(adjustment.key, { label: event.target.value })}
                      />
                    </label>
                    <label>
                      Сума
                      <input
                        aria-label={`Сума коригування ${index + 1}`}
                        inputMode="decimal"
                        type="text"
                        value={adjustment.amount}
                        onChange={(event) => {
                          const nextAmount = event.target.value;
                          const nextNumeric = numberValue(nextAmount);
                          updateAdjustment(adjustment.key, {
                            amount: nextAmount,
                            ...(nextNumeric !== null && nextNumeric >= 0 ? { record_as_expense: false } : {}),
                          });
                        }}
                      />
                    </label>
                    <label className="adjustment-expense-check">
                      <input
                        aria-label={`Врахувати коригування ${index + 1} як витрату`}
                        checked={expenseAvailable && adjustment.record_as_expense}
                        disabled={!expenseAvailable}
                        type="checkbox"
                        onChange={(event) => updateAdjustment(adjustment.key, {
                          record_as_expense: event.target.checked,
                        })}
                      />
                      Оплата за рахунок орендаря → врахувати як витрату
                    </label>
                    {expenseAvailable && adjustment.record_as_expense && (
                      <label>
                        Категорія
                        <select
                          aria-label={`Категорія витрати коригування ${index + 1}`}
                          value={adjustment.category}
                          onChange={(event) => updateAdjustment(adjustment.key, {
                            category: event.target.value as ExpenseCategory,
                          })}
                        >
                          {EXPENSE_CATEGORIES.map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    <button
                      aria-label={`Видалити коригування ${index + 1}`}
                      className="danger-button adjustment-remove"
                      type="button"
                      onClick={() => setAdjustments(adjustments.filter((item) => item.key !== adjustment.key))}
                    >
                      Видалити
                    </button>
                  </div>
                ) : (
                  <div className="adjustment-readonly-row" key={adjustment.key}>
                    <span><strong>{adjustment.label}</strong>{adjustment.record_as_expense && ` · ${EXPENSE_CATEGORY_LABELS[adjustment.category]}`}</span>
                    <strong>{formatUah(Number(amountCents(adjustment.amount)) / 100)}</strong>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      <div className="invoice-totals">
        <span>Оренда <strong>{formatUah(Number(calculated.rent) / 100)}</strong></span>
        <span>Комунальні <strong>{formatUah(Number(calculated.utilities) / 100)}</strong></span>
        <span>Коригування <strong>{formatUah(Number(calculated.adjustments) / 100)}</strong></span>
        <span className="grand-total">Разом <strong>{formatUah(Number(calculated.total) / 100)}</strong></span>
      </div>
      {isDraft && <button className="button" type="button" disabled={saving || !draftValid} onClick={save}>{saving ? "Зберігаємо…" : "Зберегти чернетку"}</button>}
    </section>
  );
}
