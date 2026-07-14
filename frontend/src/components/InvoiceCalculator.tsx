import { useEffect, useMemo, useState } from "react";

import { Invoice, InvoiceUpdatePayload } from "../api/client";
import "../pages/portal.css";

interface InvoiceCalculatorProps {
  invoice: Invoice;
  meteredServiceIds: Set<number>;
  onSave: (payload: InvoiceUpdatePayload) => Promise<void>;
  saving?: boolean;
}

function numberValue(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function money(value: number): string {
  return value.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function InvoiceCalculator({
  invoice,
  meteredServiceIds,
  onSave,
  saving = false,
}: InvoiceCalculatorProps) {
  const [exchangeRate, setExchangeRate] = useState(invoice.exchange_rate);
  const [readings, setReadings] = useState<Record<number, string>>(
    Object.fromEntries(invoice.lines.map((line) => [line.id, line.curr_reading ?? ""])),
  );

  useEffect(() => {
    setExchangeRate(invoice.exchange_rate);
    setReadings(Object.fromEntries(invoice.lines.map((line) => [line.id, line.curr_reading ?? ""])));
  }, [invoice]);

  const calculated = useMemo(() => {
    const lines = invoice.lines.map((line) => {
      if (!meteredServiceIds.has(line.service_id)) return { ...line, calculatedAmount: Number(line.amount), calculatedConsumed: null };
      const previous = numberValue(line.prev_reading);
      const current = numberValue(readings[line.id] ?? "");
      const consumed = previous === null || current === null ? null : current - previous;
      return {
        ...line,
        calculatedAmount: consumed === null ? 0 : roundMoney(consumed * Number(line.tariff_value)),
        calculatedConsumed: consumed,
      };
    });
    const rent = roundMoney(Number(invoice.rent_amount_usd) * (numberValue(exchangeRate) ?? 0));
    const utilities = roundMoney(lines.reduce((sum, line) => sum + line.calculatedAmount, 0));
    return { lines, rent, utilities, total: roundMoney(rent + utilities) };
  }, [exchangeRate, invoice, meteredServiceIds, readings]);

  const localWarnings = calculated.lines.flatMap((line) => {
    if (line.calculatedConsumed === null || line.calculatedConsumed >= 0) return [];
    return [`${line.service_name}: поточний показник менший за попередній.`];
  });
  const serverWarnings = invoice.warnings.flatMap((warning) => {
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
  });

  async function save() {
    await onSave({
      exchange_rate: exchangeRate,
      lines: invoice.lines
        .filter((line) => meteredServiceIds.has(line.service_id))
        .map((line) => ({ id: line.id, curr_reading: readings[line.id] || null })),
    });
  }

  return (
    <section className="section-card invoice-calculator">
      <div className="section-heading">
        <div><h2>Розрахунок</h2><p>Суми оновлюються одразу після зміни показників або курсу.</p></div>
        <label className="rate-field">
          Курс USD
          <input
            aria-label="Курс USD"
            disabled={invoice.status !== "draft"}
            min="0.000001"
            step="0.000001"
            type="number"
            value={exchangeRate}
            onChange={(event) => setExchangeRate(event.target.value)}
          />
        </label>
      </div>

      <div className="table-wrap">
        <table className="services-table invoice-lines">
          <thead><tr><th>Послуга</th><th>Попередній</th><th>Поточний</th><th>Спожито</th><th>Тариф</th><th>Сума</th></tr></thead>
          <tbody>
            {calculated.lines.map((line) => {
              const metered = meteredServiceIds.has(line.service_id);
              const consumed = line.calculatedConsumed;
              return (
                <tr key={line.id}>
                  <td><strong>{line.service_name}</strong></td>
                  <td>{metered ? line.prev_reading ?? "—" : "—"}</td>
                  <td>
                    {metered ? (
                      <input
                        aria-label={`Поточний показник ${line.service_name}`}
                        disabled={invoice.status !== "draft"}
                        step="0.001"
                        type="number"
                        value={readings[line.id] ?? ""}
                        onChange={(event) => setReadings({ ...readings, [line.id]: event.target.value })}
                      />
                    ) : "Фіксована"}
                  </td>
                  <td>{consumed === null ? "—" : consumed.toLocaleString("uk-UA", { maximumFractionDigits: 3 })}</td>
                  <td>{line.tariff_value} ₴</td>
                  <td>{money(line.calculatedAmount)} ₴</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(localWarnings.length > 0 || serverWarnings.length > 0) && (
        <div className="warning-box" role="alert">
          <strong>Перевірте показники</strong>
          <ul>{[...localWarnings, ...serverWarnings].map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </div>
      )}

      <div className="invoice-totals">
        <span>Оренда <strong>{money(calculated.rent)} ₴</strong></span>
        <span>Комунальні <strong>{money(calculated.utilities)} ₴</strong></span>
        <span className="grand-total">Разом <strong>{money(calculated.total)} ₴</strong></span>
      </div>
      {invoice.status === "draft" && <button className="button" type="button" disabled={saving || !numberValue(exchangeRate)} onClick={save}>{saving ? "Зберігаємо…" : "Зберегти чернетку"}</button>}
    </section>
  );
}
