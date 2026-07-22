import { useEffect, useMemo, useState } from "react";

import {
  Invoice,
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
import {
  adjustmentsAreDirty,
  adjustmentsAreValid,
  DraftAdjustment,
  InvoiceAdjustmentsEditor,
  invoiceAdjustments,
  toAdjustmentPayload,
} from "./InvoiceAdjustmentsEditor";
import "../pages/portal.css";

interface InvoiceCalculatorProps {
  invoice: Invoice;
  onSave: (payload: InvoiceUpdatePayload) => Promise<void>;
  saving?: boolean;
  onDraftChange?: (payload: InvoiceUpdatePayload | null, dirty: boolean) => void;
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

  const adjustmentPayload = useMemo(() => toAdjustmentPayload(adjustments), [adjustments]);

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
  const adjustmentsDirty = adjustmentsAreDirty(adjustments, invoice);
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
  const adjustmentsValid = adjustmentsAreValid(adjustments);
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

      <InvoiceAdjustmentsEditor
        adjustments={adjustments}
        isDraft={isDraft}
        onChange={setAdjustments}
      />

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
