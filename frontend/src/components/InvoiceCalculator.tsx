import { useEffect, useMemo, useState } from "react";

import { Invoice, InvoiceUpdatePayload } from "../api/client";
import { formatRate, formatReading, formatTariff, formatUah } from "../utils/format";
import "../pages/portal.css";

interface InvoiceCalculatorProps {
  invoice: Invoice;
  onSave: (payload: InvoiceUpdatePayload) => Promise<void>;
  saving?: boolean;
  onDraftChange?: (payload: InvoiceUpdatePayload, dirty: boolean) => void;
}

function numberValue(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function inputNumber(value: string, formatter: (input: string) => string): string {
  return formatter(value).replaceAll("\u00a0", "").replace(",", ".");
}

function sameNumber(first: string | null, second: string | null): boolean {
  return numberValue(first) === numberValue(second);
}

function decimalParts(value: string): { sign: bigint; digits: bigint; scale: number } {
  const normalized = value.trim().replace(",", ".");
  const match = normalized.match(/^([+-]?)(\d*)(?:\.(\d*))?$/);
  if (!match || (!match[2] && !match[3])) return { sign: 1n, digits: 0n, scale: 0 };
  const fraction = match[3] ?? "";
  return {
    sign: match[1] === "-" ? -1n : 1n,
    digits: BigInt(`${match[2] || "0"}${fraction}`),
    scale: fraction.length,
  };
}

function productCents(first: string, second: string): bigint {
  const left = decimalParts(first);
  const right = decimalParts(second);
  const sign = left.sign * right.sign;
  const product = left.digits * right.digits;
  const scale = left.scale + right.scale;
  if (scale <= 2) return sign * product * (10n ** BigInt(2 - scale));
  const divisor = 10n ** BigInt(scale - 2);
  const rounded = product / divisor + (product % divisor * 2n >= divisor ? 1n : 0n);
  return sign * rounded;
}

function amountCents(value: string): bigint {
  return productCents(value, "1");
}

function subtractDecimals(first: string, second: string): string {
  const left = decimalParts(first);
  const right = decimalParts(second);
  const scale = Math.max(left.scale, right.scale);
  const leftValue = left.sign * left.digits * (10n ** BigInt(scale - left.scale));
  const rightValue = right.sign * right.digits * (10n ** BigInt(scale - right.scale));
  const result = leftValue - rightValue;
  const sign = result < 0n ? "-" : "";
  const digits = (result < 0n ? -result : result).toString().padStart(scale + 1, "0");
  return scale ? `${sign}${digits.slice(0, -scale)}.${digits.slice(-scale)}` : `${sign}${digits}`;
}

export function InvoiceCalculator({
  invoice,
  onSave,
  saving = false,
  onDraftChange,
}: InvoiceCalculatorProps) {
  const [exchangeRate, setExchangeRate] = useState(
    inputNumber(invoice.exchange_rate, formatRate),
  );
  const [readings, setReadings] = useState<Record<number, string>>(
    Object.fromEntries(invoice.lines.map((line) => [
      line.id,
      line.curr_reading === null ? "" : inputNumber(line.curr_reading, formatReading),
    ])),
  );

  useEffect(() => {
    setExchangeRate(inputNumber(invoice.exchange_rate, formatRate));
    setReadings(Object.fromEntries(invoice.lines.map((line) => [
      line.id,
      line.curr_reading === null ? "" : inputNumber(line.curr_reading, formatReading),
    ])));
  }, [invoice]);

  const calculated = useMemo(() => {
    const lines = invoice.lines.map((line) => {
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
    const rent = productCents(invoice.rent_amount_usd, exchangeRate);
    const utilities = lines.reduce((sum, line) => sum + line.calculatedAmount, 0n);
    return { lines, rent, utilities, total: rent + utilities };
  }, [exchangeRate, invoice, readings]);

  const payload: InvoiceUpdatePayload = useMemo(() => ({
    exchange_rate: exchangeRate,
    lines: invoice.lines
      .filter((line) => line.service_kind === "metered")
      .map((line) => ({ id: line.id, curr_reading: readings[line.id] || null })),
  }), [exchangeRate, invoice.lines, readings]);
  const dirty = !sameNumber(exchangeRate, invoice.exchange_rate) || invoice.lines.some(
    (line) => line.service_kind === "metered" && !sameNumber(readings[line.id] || null, line.curr_reading),
  );

  useEffect(() => {
    onDraftChange?.(payload, dirty);
  }, [dirty, onDraftChange, payload]);

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
    await onSave(payload);
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
            placeholder={inputNumber(invoice.exchange_rate, formatRate)}
            onChange={(event) => setExchangeRate(event.target.value)}
          />
        </label>
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
                  <td>{formatTariff(line.tariff_value)} ₴</td>
                  <td>{formatUah(Number(line.calculatedAmount) / 100)}</td>
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
        <span>Оренда <strong>{formatUah(Number(calculated.rent) / 100)}</strong></span>
        <span>Комунальні <strong>{formatUah(Number(calculated.utilities) / 100)}</strong></span>
        <span className="grand-total">Разом <strong>{formatUah(Number(calculated.total) / 100)}</strong></span>
      </div>
      {invoice.status === "draft" && <button className="button" type="button" disabled={saving || !numberValue(exchangeRate)} onClick={save}>{saving ? "Зберігаємо…" : "Зберегти чернетку"}</button>}
    </section>
  );
}
