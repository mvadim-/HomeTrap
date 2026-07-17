import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  Apartment,
  ConsumptionSeries,
  IncomeStats,
  StatsPeriod,
  Tenant,
  getApartments,
  getConsumptionStats,
  getIncomeStats,
  getInvoices,
  getTenants,
} from "../api/client";
import { formatUah } from "../utils/format";
import { niceScale } from "../utils/ticks";
import { utilityKind } from "../utils/utility";
import "./portal.css";

const CHART_WIDTH = 360;
const CHART_HEIGHT = 150;
const PADDING = { top: 16, right: 14, bottom: 30, left: 38 };
const MONTH_FORMATTER = new Intl.DateTimeFormat("uk-UA", { month: "short", timeZone: "UTC" });
const SELECTED_MONTH_FORMATTER = new Intl.DateTimeFormat("uk-UA", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const INVOICE_MONTH_FORMATTER = new Intl.DateTimeFormat("uk-UA", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
const NUMBER_FORMATTERS = [0, 1, 2].map((maximumFractionDigits) => (
  new Intl.NumberFormat("uk-UA", { maximumFractionDigits })
));

function monthLabel(period: string): string {
  return MONTH_FORMATTER.format(new Date(`${period}T00:00:00Z`))
    .replace(".", "");
}

function numberLabel(value: number, maximumFractionDigits = 2): string {
  return NUMBER_FORMATTERS[maximumFractionDigits].format(value);
}

function compactAmountLabel(value: number): string {
  return numberLabel(Math.abs(value) >= 1000 ? value / 1000 : value, Math.abs(value) >= 1000 ? 1 : 0);
}

function selectedMonthLabel(month: string): string {
  return SELECTED_MONTH_FORMATTER.format(new Date(`${month}-01T00:00:00Z`));
}

function invoiceMonthLabel(period: string): string {
  return INVOICE_MONTH_FORMATTER.format(new Date(`${period.slice(0, 7)}-01T00:00:00Z`))
    .replace(/^\d+\s+/, "");
}

function contractDateLabel(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}.${month}.${year}`;
}

function contractStartMonthLabel(date: string): string {
  return selectedMonthLabel(date.slice(0, 7)).replace(/\s+р\.$/, "");
}

function tenantPeriod(tenant: Tenant): { from: string; to: string } {
  const today = new Date();
  return {
    from: tenant.contract_start.slice(0, 7),
    to: tenant.contract_end?.slice(0, 7)
      ?? `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`,
  };
}

function seriesColor(name: string): string {
  const kind = utilityKind(name);
  return kind === "other" ? "var(--color-primary)" : `var(--chart-${kind})`;
}

function fullMonthPeriods(periods: string[]): string[] {
  if (periods.length === 0) return [];
  const months = periods.map((period) => period.slice(0, 7)).sort();
  const [startYear, startMonth] = months[0].split("-").map(Number);
  const [endYear, endMonth] = months.at(-1)!.split("-").map(Number);
  const result: string[] = [];
  let year = startYear;
  let month = startMonth;

  while (year < endYear || (year === endYear && month <= endMonth)) {
    result.push(`${year}-${String(month).padStart(2, "0")}-01`);
    month += 1;
    if (month === 13) {
      year += 1;
      month = 1;
    }
  }
  return result;
}

function chartMonthPeriods(statsPeriod: StatsPeriod | null, dataPeriods: string[]): string[] {
  if (statsPeriod === null) return [];
  if ("date_from" in statsPeriod) {
    return fullMonthPeriods([statsPeriod.date_from, statsPeriod.date_to]);
  }
  if ("months" in statsPeriod) {
    const end = new Date();
    const start = new Date(end.getFullYear(), end.getMonth() - statsPeriod.months + 1, 1);
    return fullMonthPeriods([
      `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`,
      `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-01`,
    ]);
  }
  return fullMonthPeriods(dataPeriods);
}

function scaleTicks(max: number, step: number): number[] {
  return Array.from({ length: Math.round(max / step) + 1 }, (_, index) => index * step);
}

function MiniLineChart({ series, periods }: { series: ConsumptionSeries; periods: string[] }) {
  const pointsByPeriod = new Map(series.values.map((point) => [point.period.slice(0, 7), point]));
  const slots = periods.map((period) => pointsByPeriod.get(period.slice(0, 7)) ?? null);
  const values = series.values.map((point) => Number(point.consumed));
  const scale = niceScale(Math.max(...values, 1));
  const ticks = scaleTicks(scale.max, scale.step);
  const plotWidth = CHART_WIDTH - PADDING.left - PADDING.right;
  const plotHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  const x = (index: number) => PADDING.left + (slots.length === 1 ? plotWidth / 2 : (index / (slots.length - 1)) * plotWidth);
  const y = (value: number) => PADDING.top + plotHeight - (value / scale.max) * plotHeight;
  let previousPoint = false;
  const path = slots.map((point, index) => {
    if (!point) {
      previousPoint = false;
      return "";
    }
    const command = previousPoint ? "L" : "M";
    previousPoint = true;
    return `${command} ${x(index)} ${y(Number(point.consumed))}`;
  }).filter(Boolean).join(" ");
  const baseline = PADDING.top + plotHeight;
  const areaPaths: string[] = [];
  let areaPoints: string[] = [];
  let areaStart = 0;
  slots.forEach((point, index) => {
    if (point) {
      if (areaPoints.length === 0) areaStart = index;
      areaPoints.push(`${areaPoints.length === 0 ? "M" : "L"} ${x(index)} ${y(Number(point.consumed))}`);
    }
    if ((!point || index === slots.length - 1) && areaPoints.length > 0) {
      const areaEnd = point && index === slots.length - 1 ? index : index - 1;
      areaPaths.push(`${areaPoints.join(" ")} L ${x(areaEnd)} ${baseline} L ${x(areaStart)} ${baseline} Z`);
      areaPoints = [];
    }
  });
  const color = seriesColor(series.service_name);

  return (
    <article className="consumption-card">
      <div className="chart-card-heading">
        <div><h3>{series.service_name}</h3><span>{series.unit ?? "од."}</span></div>
        <strong>{numberLabel(values.at(-1) ?? 0)}</strong>
      </div>
      <svg className="mini-chart" role="img" aria-label={`Графік споживання: ${series.service_name}`} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}>
        {ticks.slice(1).map((tick) => (
          <g key={tick}>
            <line className="chart-gridline" x1={PADDING.left} x2={CHART_WIDTH - PADDING.right} y1={y(tick)} y2={y(tick)} />
            <text className="chart-label chart-tick-label" x="4" y={y(tick) + 4}>{numberLabel(tick)}</text>
          </g>
        ))}
        <line className="chart-axis" x1={PADDING.left} x2={CHART_WIDTH - PADDING.right} y1={baseline} y2={baseline} />
        <text className="chart-label" x="25" y={baseline + 4}>0</text>
        {areaPaths.map((areaPath, index) => <path key={index} className="chart-area" d={areaPath} fill={color} fillOpacity="0.13" />)}
        {path && <path className="chart-line" d={path} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />}
        {slots.map((point, index) => (
          <g key={periods[index]} className={point ? "chart-month-slot" : "chart-month-slot chart-month-slot-empty"} data-period={periods[index]}>
            {point && (
            <circle
              className="chart-point"
              cx={x(index)}
              cy={y(Number(point.consumed))}
              fill={color}
              r={point === series.values.at(-1) ? 5 : 3}
              stroke={point === series.values.at(-1) ? "var(--color-surface)" : undefined}
              strokeWidth={point === series.values.at(-1) ? 2 : undefined}
              tabIndex={0}
              aria-label={`${monthLabel(point.period)}: ${numberLabel(Number(point.consumed))} ${series.unit ?? "од."}`}
            >
              <title>{monthLabel(point.period)}: {numberLabel(Number(point.consumed))} {series.unit ?? "од."}</title>
            </circle>
            )}
            <text className="chart-label month-label" textAnchor="middle" x={x(index)} y={CHART_HEIGHT - 8}>{monthLabel(periods[index])}</text>
          </g>
        ))}
      </svg>
    </article>
  );
}

type TenantStartMarker = {
  tenantId: number;
  tenantName: string;
  period: string;
};

function IncomeChart({ stats, periods, tenantStarts }: {
  stats: IncomeStats;
  periods: string[];
  tenantStarts: TenantStartMarker[];
}) {
  const [activeCorrection, setActiveCorrection] = useState<string | null>(null);
  const width = 760;
  const height = 270;
  const padding = { top: 28, right: 18, bottom: 38, left: 56 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const pointsByPeriod = new Map(stats.values.map((point) => [point.period.slice(0, 7), point]));
  const periodIndexes = new Map(periods.map((period, index) => [period.slice(0, 7), index]));
  const scale = niceScale(Math.max(...stats.values.map((point) => Math.max(Number(point.total), 0)), 1));
  const ticks = scaleTicks(scale.max, scale.step);
  const slotWidth = plotWidth / Math.max(periods.length, 1);
  const barWidth = Math.min(42, slotWidth * 0.62);
  const barHeight = (value: number) => (value / scale.max) * plotHeight;
  const tickY = (value: number) => padding.top + plotHeight - (value / scale.max) * plotHeight;

  return (
    <svg className="income-chart" role="img" aria-label="Стековий графік доходу" viewBox={`0 0 ${width} ${height}`}>
      {ticks.slice(1).map((tick) => (
        <g key={tick}>
          <line className="chart-gridline" x1={padding.left} x2={width - padding.right} y1={tickY(tick)} y2={tickY(tick)} />
          <text className="chart-label chart-tick-label" x="4" y={tickY(tick) + 4}>{numberLabel(tick, 0)} ₴</text>
        </g>
      ))}
      <line className="chart-axis" x1={padding.left} x2={width - padding.right} y1={padding.top + plotHeight} y2={padding.top + plotHeight} />
      <text className="chart-label" x="37" y={padding.top + plotHeight + 4}>0</text>
      {tenantStarts.map((tenantStart) => {
        const index = periodIndexes.get(tenantStart.period);
        if (index === undefined) return null;
        const x = padding.left + slotWidth * index;
        const label = `Початок договору: ${tenantStart.tenantName}, ${contractStartMonthLabel(tenantStart.period)}`;
        return (
          <line
            key={tenantStart.tenantId}
            className="income-tenant-marker"
            x1={x}
            x2={x}
            y1={padding.top}
            y2={padding.top + plotHeight}
            stroke="var(--chart-tenant-marker)"
            strokeDasharray="5 5"
            strokeWidth="2"
            tabIndex={0}
            aria-label={label}
          >
            <title>{label}</title>
          </line>
        );
      })}
      {periods.map((period, index) => {
        const x = padding.left + slotWidth * index + (slotWidth - barWidth) / 2;
        const point = pointsByPeriod.get(period.slice(0, 7));
        if (!point) {
          return (
            <g key={period} className="chart-month-slot chart-month-slot-empty" data-period={period}>
              <text className="chart-label month-label" textAnchor="middle" x={x + barWidth / 2} y={height - 11}>{monthLabel(period)}</text>
            </g>
          );
        }
        const rent = Number(point.rent);
        const utilities = Number(point.utilities);
        const total = Number(point.total);
        const hasNegativeSegment = rent < 0 || utilities < 0 || total < 0;
        const rentHeight = barHeight(rent);
        const utilitiesHeight = barHeight(utilities);
        const baseline = padding.top + plotHeight;
        return (
          <g key={point.period} className="chart-month-slot" data-period={point.period}>
            {hasNegativeSegment ? (
              <polygon
                className="income-adjustment-marker"
                points={`${x + barWidth / 2},${baseline - 7} ${x + barWidth / 2 + 7},${baseline} ${x + barWidth / 2},${baseline + 7} ${x + barWidth / 2 - 7},${baseline}`}
                tabIndex={0}
                aria-label={`${monthLabel(point.period)}, коригування: оренда ${formatUah(point.rent)}, комунальні ${formatUah(point.utilities)}, разом ${formatUah(point.total)}`}
                aria-describedby={activeCorrection === point.period ? `correction-${index}` : undefined}
                onBlur={() => setActiveCorrection(null)}
                onFocus={() => setActiveCorrection(point.period)}
                onMouseEnter={() => setActiveCorrection(point.period)}
                onMouseLeave={() => setActiveCorrection(null)}
              />
            ) : (
              <>
                <rect className="income-rent" fill="var(--chart-rent)" stroke="var(--color-surface)" strokeWidth="2" x={x} y={baseline - rentHeight} width={barWidth} height={rentHeight} tabIndex={0} aria-label={`${monthLabel(point.period)}, оренда: ${formatUah(point.rent)}`}>
                  <title>{monthLabel(point.period)} · Оренда: {formatUah(point.rent)}</title>
                </rect>
                <rect className="income-utilities" fill="var(--chart-util)" stroke="var(--color-surface)" strokeWidth="2" x={x} y={baseline - rentHeight - utilitiesHeight} width={barWidth} height={utilitiesHeight} tabIndex={0} aria-label={`${monthLabel(point.period)}, комунальні: ${formatUah(point.utilities)}`}>
                  <title>{monthLabel(point.period)} · Комунальні: {formatUah(point.utilities)} · Разом: {formatUah(point.total)}</title>
                </rect>
                <text className="income-value-label" textAnchor="middle" x={x + barWidth / 2} y={Math.max(13, baseline - rentHeight - utilitiesHeight - 7)}>{compactAmountLabel(total)}</text>
              </>
            )}
            {hasNegativeSegment && activeCorrection === point.period && (
              <g
                id={`correction-${index}`}
                className="chart-tooltip"
                role="tooltip"
                transform={`translate(${Math.min(Math.max(x + barWidth / 2, 105), width - 105)} ${baseline - 22})`}
              >
                <rect x="-100" y="-58" width="200" height="54" rx="6" />
                <text textAnchor="middle" x="0" y="-42">Оренда: {formatUah(point.rent)}</text>
                <text textAnchor="middle" x="0" y="-27">Комунальні: {formatUah(point.utilities)}</text>
                <text textAnchor="middle" x="0" y="-12">Разом: {formatUah(point.total)}</text>
              </g>
            )}
            <text className="chart-label month-label" textAnchor="middle" x={x + barWidth / 2} y={height - 11}>{monthLabel(point.period)}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function Stats() {
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [apartmentId, setApartmentId] = useState<number | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [scope, setScope] = useState<"portfolio" | "apartment">("portfolio");
  const [consumption, setConsumption] = useState<ConsumptionSeries[] | null>(null);
  const [consumptionLoading, setConsumptionLoading] = useState(false);
  const [consumptionError, setConsumptionError] = useState("");
  const [income, setIncome] = useState<IncomeStats | null>(null);
  const [incomeLoading, setIncomeLoading] = useState(false);
  const [incomeError, setIncomeError] = useState("");
  const [topServiceInvoice, setTopServiceInvoice] = useState<{
    id: number;
    apartmentId: number;
    peakPeriod: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [periodMode, setPeriodMode] = useState<"6" | "12" | "24" | "all" | "custom">("12");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const customRangeInvalid = periodMode === "custom" && dateFrom !== "" && dateTo !== "" && dateFrom > dateTo;
  const statsPeriod = useMemo<StatsPeriod | null>(() => {
    if (periodMode === "all") return { all_time: true };
    if (periodMode === "custom") {
      if (!dateFrom || !dateTo || dateFrom > dateTo) return null;
      return { date_from: `${dateFrom}-01`, date_to: `${dateTo}-01` };
    }
    return { months: Number(periodMode) };
  }, [dateFrom, dateTo, periodMode]);
  const periodDescription = periodMode === "all"
    ? "Споживання та дохід за весь час"
    : periodMode === "custom" && dateFrom && dateTo && !customRangeInvalid
      ? `Споживання та дохід за ${selectedMonthLabel(dateFrom)} — ${selectedMonthLabel(dateTo)}`
      : periodMode === "custom"
        ? "Споживання та дохід за довільний період"
        : `Споживання та дохід за останні ${periodMode} місяців`;
  const selectedTenant = periodMode === "custom"
    ? tenants.find((tenant) => {
      const period = tenantPeriod(tenant);
      return period.from === dateFrom && period.to === dateTo;
    }) ?? null
    : null;
  const chartPeriods = chartMonthPeriods(statsPeriod, [
    ...(consumption?.flatMap((series) => series.values.map((point) => point.period)) ?? []),
    ...(income?.values.map((point) => point.period) ?? []),
  ]);
  const tenantStarts: TenantStartMarker[] = scope === "apartment"
    ? tenants.map((tenant) => ({
      tenantId: tenant.id,
      tenantName: tenant.full_name,
      period: tenant.contract_start.slice(0, 7),
    }))
    : [];

  useEffect(() => {
    let active = true;
    getApartments()
      .then((items) => {
        if (!active) return;
        setApartments(items);
        setApartmentId(items.find((item) => item.is_active)?.id ?? items[0]?.id ?? null);
      })
      .catch(() => active && setError("Не вдалося завантажити квартири."));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setTenants([]);
    if (apartmentId === null) return;
    let active = true;
    getTenants(apartmentId)
      .then((items) => active && setTenants(items))
      .catch(() => active && setTenants([]));
    return () => { active = false; };
  }, [apartmentId]);

  useEffect(() => {
    if (apartmentId === null) return;
    if (statsPeriod === null) {
      setConsumption(null);
      setConsumptionLoading(false);
      setConsumptionError("");
      return;
    }
    let active = true;
    setConsumption(null);
    setConsumptionLoading(true);
    setConsumptionError("");
    getConsumptionStats(apartmentId, statsPeriod)
      .then((stats) => active && setConsumption(stats.series))
      .catch(() => active && setConsumptionError("Не вдалося завантажити статистику споживання."))
      .finally(() => active && setConsumptionLoading(false));
    return () => { active = false; };
  }, [apartmentId, statsPeriod]);

  useEffect(() => {
    if (scope === "apartment" && apartmentId === null) return;
    if (statsPeriod === null) {
      setIncome(null);
      setIncomeLoading(false);
      setIncomeError("");
      return;
    }
    let active = true;
    setIncome(null);
    setIncomeLoading(true);
    setIncomeError("");
    getIncomeStats(scope === "apartment" ? apartmentId ?? undefined : undefined, statsPeriod)
      .then((stats) => active && setIncome(stats))
      .catch(() => active && setIncomeError("Не вдалося завантажити статистику доходу."))
      .finally(() => active && setIncomeLoading(false));
    return () => { active = false; };
  }, [apartmentId, scope, statsPeriod]);

  useEffect(() => {
    setTopServiceInvoice(null);
    if (
      scope !== "apartment"
      || apartmentId === null
      || income?.scope !== "apartment"
      || income.apartment_id !== apartmentId
      || !income.top_service
    ) return;

    let active = true;
    const peakMonth = income.top_service.peak_period.slice(0, 7);
    getInvoices({ apartmentId })
      .then((invoices) => {
        if (!active) return;
        const invoice = invoices.find((item) => item.period.slice(0, 7) === peakMonth);
        setTopServiceInvoice(invoice ? {
          id: invoice.id,
          apartmentId,
          peakPeriod: income.top_service!.peak_period,
        } : null);
      })
      .catch(() => active && setTopServiceInvoice(null));
    return () => { active = false; };
  }, [apartmentId, income, scope]);

  const topServiceContent = income?.top_service ? (
    <><span>Найбільша стаття</span><strong>{income.top_service.name}</strong><small>{numberLabel(Number(income.top_service.share_percent))}% · пік — {monthLabel(income.top_service.peak_period)}</small></>
  ) : (
    <><span>Найбільша стаття</span>{income ? <strong className="muted-text">Немає даних</strong> : <strong>—</strong>}</>
  );
  const topServiceInvoiceId = scope === "apartment"
    && apartmentId !== null
    && income?.scope === "apartment"
    && income.apartment_id === apartmentId
    && income.top_service
    && topServiceInvoice?.apartmentId === apartmentId
    && topServiceInvoice.peakPeriod === income.top_service.peak_period
    ? topServiceInvoice.id
    : null;
  const selectTenant = (tenantId: number) => {
    const tenant = tenants.find((item) => item.id === tenantId);
    if (!tenant) return;
    const period = tenantPeriod(tenant);
    setPeriodMode("custom");
    setDateFrom(period.from);
    setDateTo(period.to);
  };

  return (
    <>
      <header className="page-header stats-header">
        <div><h1>Статистика</h1><p>{periodDescription}</p></div>
        {apartments.length > 0 && (
          <>
            <label className="stats-apartment-select">Квартира
              <select aria-label="Квартира для статистики" value={apartmentId ?? ""} onChange={(event) => setApartmentId(Number(event.target.value))}>
                {apartments.map((apartment) => <option key={apartment.id} value={apartment.id}>{apartment.name}</option>)}
              </select>
            </label>
            {tenants.length > 0 && (
              <label className="stats-apartment-select">Орендар
                <select
                  key={apartmentId}
                  aria-label="Орендар для статистики"
                  value={selectedTenant?.id ?? ""}
                  onChange={(event) => selectTenant(Number(event.target.value))}
                >
                  <option value="">—</option>
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.full_name}{tenant.contract_end === null ? " (поточний)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}
      </header>
      {error && <p className="error-message">{error}</p>}

      <section className="stats-period-panel" aria-label="Період статистики">
        <div className="period-switch" role="group" aria-label="Оберіть період">
          {([6, 12, 24] as const).map((months) => (
            <button key={months} className={periodMode === String(months) ? "active" : ""} type="button" aria-pressed={periodMode === String(months)} onClick={() => setPeriodMode(String(months) as "6" | "12" | "24")}>{months} міс</button>
          ))}
          <button className={periodMode === "all" ? "active" : ""} type="button" aria-pressed={periodMode === "all"} onClick={() => setPeriodMode("all")}>Весь час</button>
          <button className={periodMode === "custom" ? "active" : ""} type="button" aria-pressed={periodMode === "custom"} onClick={() => setPeriodMode("custom")}>Довільний період</button>
        </div>
        {periodMode === "custom" && (
          <div className="custom-period-fields">
            <label>Від<input aria-label="Період від" type="month" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} /></label>
            <label>До<input aria-label="Період до" type="month" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} /></label>
          </div>
        )}
        {customRangeInvalid && <p className="error-message">Початок періоду не може бути пізніше завершення.</p>}
        {selectedTenant && (
          <p className="muted-text">
            Договір: {contractDateLabel(selectedTenant.contract_start)} — {selectedTenant.contract_end ? contractDateLabel(selectedTenant.contract_end) : "досі"} · {selectedTenant.contract_end ? "завершений" : "активний"}
          </p>
        )}
      </section>

      <section className="section-card stats-section">
        <div className="section-heading"><div><h2>Споживання</h2><p>Показники лічильників по вибраній квартирі</p></div></div>
        {statsPeriod === null ? (
          <p className="empty-state">Оберіть початок і завершення періоду.</p>
        ) : consumptionLoading ? (
          <p className="muted-text">Завантажуємо споживання…</p>
        ) : consumptionError ? (
          <p className="error-message">{consumptionError}</p>
        ) : consumption && consumption.length > 0 ? (
          <div className="consumption-grid">{consumption.map((series) => <MiniLineChart key={series.service_id} series={series} periods={chartPeriods} />)}</div>
        ) : (
          <p className="empty-state">Ще немає історії споживання для цієї квартири.</p>
        )}
      </section>

      <section className="stats-summary-grid" aria-label="Підсумки за період">
        <article className="stats-summary-tile"><span>Оренда за період</span><strong>{income ? formatUah(income.totals.rent) : "—"}</strong></article>
        <article className="stats-summary-tile"><span>Комунальні за період</span><strong>{income ? formatUah(income.totals.utilities) : "—"}</strong></article>
        {topServiceInvoiceId !== null && income?.top_service ? (
          <Link
            className="stats-summary-tile stats-summary-tile-link"
            to={`/invoices/${topServiceInvoiceId}`}
            title={`Відкрити рахунок ${invoiceMonthLabel(income.top_service.peak_period)}`}
          >
            {topServiceContent}
          </Link>
        ) : <article className="stats-summary-tile">{topServiceContent}</article>}
      </section>

      <section className="section-card stats-section">
        <div className="section-heading income-heading">
          <div><h2>Дохід</h2><p>Оренда та комунальні платежі помісячно</p></div>
          <div className="scope-switch" role="group" aria-label="Масштаб доходу">
            <button className={scope === "portfolio" ? "active" : ""} type="button" aria-pressed={scope === "portfolio"} onClick={() => setScope("portfolio")}>Портфель</button>
            <button className={scope === "apartment" ? "active" : ""} type="button" aria-pressed={scope === "apartment"} disabled={apartmentId === null} onClick={() => setScope("apartment")}>Квартира</button>
          </div>
        </div>
        {statsPeriod === null ? (
          <p className="empty-state">Оберіть початок і завершення періоду.</p>
        ) : incomeLoading ? (
          <p className="muted-text">Завантажуємо дохід…</p>
        ) : incomeError ? (
          <p className="error-message">{incomeError}</p>
        ) : income === null ? (
          <p className="muted-text">Завантажуємо дохід…</p>
        ) : income.values.length > 0 ? (
          <>
            <div className="chart-legend"><span><i className="rent-swatch" />Оренда</span><span><i className="utilities-swatch" />Комунальні</span><strong>Разом: {formatUah(income.totals.total)}</strong></div>
            <IncomeChart stats={income} periods={chartPeriods} tenantStarts={tenantStarts} />
          </>
        ) : (
          <p className="empty-state">Ще немає історії доходу за вибраний період.</p>
        )}
      </section>
    </>
  );
}
