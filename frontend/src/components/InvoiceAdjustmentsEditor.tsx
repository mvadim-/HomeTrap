import { useRef } from "react";

import {
  EXPENSE_CATEGORY_LABELS,
  ExpenseCategory,
  Invoice,
  InvoiceAdjustmentPayload,
} from "../api/client";
import { amountCents, decimalInput, numberValue, sameNumber } from "../utils/decimal";
import { formatUah } from "../utils/format";

export interface DraftAdjustment extends InvoiceAdjustmentPayload {
  key: string;
  category: ExpenseCategory;
}

const EXPENSE_CATEGORIES = Object.entries(EXPENSE_CATEGORY_LABELS) as [ExpenseCategory, string][];

function amountValid(value: string): boolean {
  const amount = decimalInput(value);
  if (!amount.valid || amount.normalized === null) return false;
  const unsigned = amount.normalized.replace(/^[+-]/, "");
  const [whole, fraction = ""] = unsigned.split(".");
  const wholeDigits = whole.replace(/^0+/, "") || "0";
  return wholeDigits.length <= 10 && fraction.length <= 2;
}

export function invoiceAdjustments(invoice: Invoice): DraftAdjustment[] {
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

export function toAdjustmentPayload(
  adjustments: DraftAdjustment[],
): InvoiceAdjustmentPayload[] {
  return adjustments.map((adjustment) => {
    const amount = decimalInput(adjustment.amount);
    const canRecordExpense = amount.numeric !== null && amount.numeric < 0;
    return {
      ...(adjustment.id === undefined ? {} : { id: adjustment.id }),
      label: adjustment.label.trim(),
      amount: amount.normalized ?? adjustment.amount,
      record_as_expense: canRecordExpense && adjustment.record_as_expense,
      category: canRecordExpense && adjustment.record_as_expense ? adjustment.category : null,
    };
  });
}

export function adjustmentsAreValid(adjustments: DraftAdjustment[]): boolean {
  return adjustments.every((adjustment) => (
    adjustment.label.trim().length > 0
    && adjustment.label.trim().length <= 200
    && amountValid(adjustment.amount)
  ));
}

export function adjustmentsAreDirty(
  adjustments: DraftAdjustment[],
  invoice: Invoice,
): boolean {
  const saved = invoice.lines.filter((line) => line.service_kind === "adjustment");
  return adjustments.length !== saved.length || adjustments.some((adjustment, index) => {
    const line = saved[index];
    return !line
      || adjustment.id !== line.id
      || adjustment.label.trim() !== line.service_name
      || !sameNumber(adjustment.amount, line.amount)
      || adjustment.record_as_expense !== (line.expense !== null)
      || (adjustment.record_as_expense && adjustment.category !== line.expense?.category);
  });
}

interface InvoiceAdjustmentsEditorProps {
  adjustments: DraftAdjustment[];
  isDraft: boolean;
  onChange: (adjustments: DraftAdjustment[]) => void;
}

export function InvoiceAdjustmentsEditor({
  adjustments,
  isDraft,
  onChange,
}: InvoiceAdjustmentsEditorProps) {
  const nextKey = useRef(1);

  if (!isDraft && adjustments.length === 0) return null;

  function update(key: string, changes: Partial<DraftAdjustment>) {
    onChange(adjustments.map((adjustment) => (
      adjustment.key === key ? { ...adjustment, ...changes } : adjustment
    )));
  }

  function add() {
    onChange([...adjustments, {
      key: `new-${nextKey.current++}`,
      label: "Коригування",
      amount: "-0.00",
      record_as_expense: false,
      category: "repair",
    }]);
  }

  return (
    <section className="invoice-adjustments" aria-labelledby="invoice-adjustments-title">
      <div className="adjustments-heading">
        <div>
          <h3 id="invoice-adjustments-title">Коригування</h3>
          <p>Разові знижки або доплати в цьому рахунку.</p>
        </div>
        {isDraft && (
          <button className="secondary-button" type="button" onClick={add}>
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
                    onChange={(event) => update(adjustment.key, { label: event.target.value })}
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
                      update(adjustment.key, {
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
                    onChange={(event) => update(adjustment.key, {
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
                      onChange={(event) => update(adjustment.key, {
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
                  onClick={() => onChange(adjustments.filter((item) => item.key !== adjustment.key))}
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
  );
}
