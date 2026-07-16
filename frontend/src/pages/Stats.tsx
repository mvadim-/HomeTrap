import { useEffect, useMemo, useState } from "react";

import {
  Apartment,
  ConsumptionSeries,
  IncomeStats,
  StatsPeriod,
  getApartments,
  getConsumptionStats,
  getIncomeStats,
} from "../api/client";
import { formatUah } from "../utils/format";
import { utilityKind } from "../utils/utility";
import "./portal.css";

const CHART_WIDTH = 360;
const CHART_HEIGHT = 150;
const PADDING = { top: 16, right: 14, bottom: 30, left: 38 };

function monthLabel(period: string): string {
  return new Intl.DateTimeFormat("uk-UA", { month: "short", timeZone: "UTC" })
    .format(new Date(`${period}T00:00:00Z`))
    .replace(".", "");
}

function numberLabel(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat("uk-UA", { maximumFractionDigits }).format(value);
}

function compactAmountLabel(value: number): string {
  return numberLabel(Math.abs(value) >= 1000 ? value / 1000 : value, Math.abs(value) >= 1000 ? 1 : 0);
}

function selectedMonthLabel(month: string): string {
  return new Intl.DateTimeFormat("uk-UA", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${month}-01T00:00:00Z`));
}

function seriesColor(name: string): string {
  const kind = utilityKind(name);
  return kind === "other" ? "var(--color-primary)" : `var(--chart-${kind})`;
}

function MiniLineChart({ series }: { series: ConsumptionSeries }) {
  const values = series.values.map((point) => Number(point.consumed));
  const maxValue = Math.max(...values, 1);
  const plotWidth = CHART_WIDTH - PADDING.left - PADDING.right;
  const plotHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  const x = (index: number) => PADDING.left + (values.length === 1 ? plotWidth / 2 : (index / (values.length - 1)) * plotWidth);
  const y = (value: number) => PADDING.top + plotHeight - (value / maxValue) * plotHeight;
  const path = values.map((value, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(value)}`).join(" ");
  const baseline = PADDING.top + plotHeight;
  const areaPath = path ? `${path} L ${x(values.length - 1)} ${baseline} L ${x(0)} ${baseline} Z` : "";
  const color = seriesColor(series.service_name);

  return (
    <article className="consumption-card">
      <div className="chart-card-heading">
        <div><h3>{series.service_name}</h3><span>{series.unit ?? "од."}</span></div>
        <strong>{numberLabel(values.at(-1) ?? 0)}</strong>
      </div>
      <svg className="mini-chart" role="img" aria-label={`Графік споживання: ${series.service_name}`} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}>
        <line className="chart-axis" x1={PADDING.left} x2={CHART_WIDTH - PADDING.right} y1={baseline} y2={baseline} />
        <text className="chart-label" x="4" y={PADDING.top + 5}>{numberLabel(maxValue)}</text>
        <text className="chart-label" x="25" y={baseline + 4}>0</text>
        {areaPath && <path className="chart-area" d={areaPath} fill={color} fillOpacity="0.13" />}
        {path && <path className="chart-line" d={path} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />}
        {series.values.map((point, index) => (
          <g key={point.period}>
            <circle
              className="chart-point"
              cx={x(index)}
              cy={y(values[index])}
              fill={color}
              r={index === series.values.length - 1 ? 5 : 3}
              stroke={index === series.values.length - 1 ? "var(--color-surface)" : undefined}
              strokeWidth={index === series.values.length - 1 ? 2 : undefined}
              tabIndex={0}
              aria-label={`${monthLabel(point.period)}: ${numberLabel(values[index])} ${series.unit ?? "од."}`}
            >
              <title>{monthLabel(point.period)}: {numberLabel(values[index])} {series.unit ?? "од."}</title>
            </circle>
            <text className="chart-label month-label" textAnchor="middle" x={x(index)} y={CHART_HEIGHT - 8}>{monthLabel(point.period)}</text>
          </g>
        ))}
      </svg>
    </article>
  );
}

function IncomeChart({ stats }: { stats: IncomeStats }) {
  const [activeCorrection, setActiveCorrection] = useState<string | null>(null);
  const width = 760;
  const height = 270;
  const padding = { top: 28, right: 18, bottom: 38, left: 56 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(...stats.values.map((point) => Math.max(Number(point.total), 0)), 1);
  const slotWidth = plotWidth / Math.max(stats.values.length, 1);
  const barWidth = Math.min(42, slotWidth * 0.62);
  const barHeight = (value: number) => (value / maxValue) * plotHeight;

  return (
    <svg className="income-chart" role="img" aria-label="Стековий графік доходу" viewBox={`0 0 ${width} ${height}`}>
      <line className="chart-axis" x1={padding.left} x2={width - padding.right} y1={padding.top + plotHeight} y2={padding.top + plotHeight} />
      <text className="chart-label" x="4" y={padding.top + 5}>{numberLabel(maxValue, 0)} ₴</text>
      <text className="chart-label" x="37" y={padding.top + plotHeight + 4}>0</text>
      {stats.values.map((point, index) => {
        const x = padding.left + slotWidth * index + (slotWidth - barWidth) / 2;
        const rent = Number(point.rent);
        const utilities = Number(point.utilities);
        const total = Number(point.total);
        const hasNegativeSegment = rent < 0 || utilities < 0 || total < 0;
        const rentHeight = barHeight(rent);
        const utilitiesHeight = barHeight(utilities);
        const baseline = padding.top + plotHeight;
        return (
          <g key={point.period}>
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
  const [scope, setScope] = useState<"portfolio" | "apartment">("portfolio");
  const [consumption, setConsumption] = useState<ConsumptionSeries[] | null>(null);
  const [consumptionLoading, setConsumptionLoading] = useState(false);
  const [consumptionError, setConsumptionError] = useState("");
  const [income, setIncome] = useState<IncomeStats | null>(null);
  const [incomeLoading, setIncomeLoading] = useState(false);
  const [incomeError, setIncomeError] = useState("");
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

  return (
    <>
      <header className="page-header stats-header">
        <div><h1>Статистика</h1><p>{periodDescription}</p></div>
        {apartments.length > 0 && (
          <label className="stats-apartment-select">Квартира
            <select aria-label="Квартира для статистики" value={apartmentId ?? ""} onChange={(event) => setApartmentId(Number(event.target.value))}>
              {apartments.map((apartment) => <option key={apartment.id} value={apartment.id}>{apartment.name}</option>)}
            </select>
          </label>
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
          <div className="consumption-grid">{consumption.map((series) => <MiniLineChart key={series.service_id} series={series} />)}</div>
        ) : (
          <p className="empty-state">Ще немає історії споживання для цієї квартири.</p>
        )}
      </section>

      <section className="stats-summary-grid" aria-label="Підсумки за період">
        <article className="stats-summary-tile"><span>Оренда за період</span><strong>{income ? formatUah(income.totals.rent) : "—"}</strong></article>
        <article className="stats-summary-tile"><span>Комунальні за період</span><strong>{income ? formatUah(income.totals.utilities) : "—"}</strong></article>
        <article className="stats-summary-tile">
          <span>Найбільша стаття</span>
          {income?.top_service ? (
            <><strong>{income.top_service.name}</strong><small>{numberLabel(Number(income.top_service.share_percent))}% · пік — {monthLabel(income.top_service.peak_period)}</small></>
          ) : income ? <strong className="muted-text">Немає даних</strong> : <strong>—</strong>}
        </article>
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
            <IncomeChart stats={income} />
          </>
        ) : (
          <p className="empty-state">Ще немає історії доходу за вибраний період.</p>
        )}
      </section>
    </>
  );
}
