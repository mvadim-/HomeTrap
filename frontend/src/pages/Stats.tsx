import { useEffect, useState } from "react";

import {
  Apartment,
  ConsumptionSeries,
  IncomeStats,
  getApartments,
  getConsumptionStats,
  getIncomeStats,
} from "../api/client";
import { formatUah } from "../utils/format";
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

function seriesColor(name: string): string {
  const normalized = name.toLocaleLowerCase("uk-UA");
  if (normalized.includes("газ")) return "#c88761";
  if (normalized.includes("світ") || normalized.includes("елект")) return "#d5aa3f";
  if (normalized.includes("вод")) return "#6798ad";
  return "#71836b";
}

function MiniLineChart({ series }: { series: ConsumptionSeries }) {
  const values = series.values.map((point) => Number(point.consumed));
  const maxValue = Math.max(...values, 1);
  const plotWidth = CHART_WIDTH - PADDING.left - PADDING.right;
  const plotHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  const x = (index: number) => PADDING.left + (values.length === 1 ? plotWidth / 2 : (index / (values.length - 1)) * plotWidth);
  const y = (value: number) => PADDING.top + plotHeight - (value / maxValue) * plotHeight;
  const path = values.map((value, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(value)}`).join(" ");
  const color = seriesColor(series.service_name);

  return (
    <article className="consumption-card">
      <div className="chart-card-heading">
        <div><h3>{series.service_name}</h3><span>{series.unit ?? "од."}</span></div>
        <strong>{numberLabel(values.at(-1) ?? 0)}</strong>
      </div>
      <svg className="mini-chart" role="img" aria-label={`Графік споживання: ${series.service_name}`} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}>
        <line className="chart-axis" x1={PADDING.left} x2={CHART_WIDTH - PADDING.right} y1={PADDING.top + plotHeight} y2={PADDING.top + plotHeight} />
        <text className="chart-label" x="4" y={PADDING.top + 5}>{numberLabel(maxValue)}</text>
        <text className="chart-label" x="25" y={PADDING.top + plotHeight + 4}>0</text>
        {path && <path d={path} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />}
        {series.values.map((point, index) => (
          <g key={point.period}>
            <circle className="chart-point" cx={x(index)} cy={y(values[index])} fill={color} r="5" tabIndex={0} aria-label={`${monthLabel(point.period)}: ${numberLabel(values[index])} ${series.unit ?? "од."}`}>
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
  const width = 760;
  const height = 270;
  const padding = { top: 18, right: 18, bottom: 38, left: 56 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(...stats.values.map((point) => Number(point.total)), 1);
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
        const rentHeight = barHeight(Number(point.rent));
        const utilitiesHeight = barHeight(Number(point.utilities));
        const baseline = padding.top + plotHeight;
        return (
          <g key={point.period}>
            <rect className="income-rent" x={x} y={baseline - rentHeight} width={barWidth} height={rentHeight} tabIndex={0} aria-label={`${monthLabel(point.period)}, оренда: ${formatUah(point.rent)}`}>
              <title>{monthLabel(point.period)} · Оренда: {formatUah(point.rent)}</title>
            </rect>
            <rect className="income-utilities" x={x} y={baseline - rentHeight - utilitiesHeight} width={barWidth} height={utilitiesHeight} tabIndex={0} aria-label={`${monthLabel(point.period)}, комунальні: ${formatUah(point.utilities)}`}>
              <title>{monthLabel(point.period)} · Комунальні: {formatUah(point.utilities)} · Разом: {formatUah(point.total)}</title>
            </rect>
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
  const [income, setIncome] = useState<IncomeStats | null>(null);
  const [error, setError] = useState("");

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
    let active = true;
    setConsumption(null);
    getConsumptionStats(apartmentId)
      .then((stats) => active && setConsumption(stats.series))
      .catch(() => active && setError("Не вдалося завантажити статистику споживання."));
    return () => { active = false; };
  }, [apartmentId]);

  useEffect(() => {
    if (scope === "apartment" && apartmentId === null) return;
    let active = true;
    setIncome(null);
    getIncomeStats(scope === "apartment" ? apartmentId ?? undefined : undefined)
      .then((stats) => active && setIncome(stats))
      .catch(() => active && setError("Не вдалося завантажити статистику доходу."));
    return () => { active = false; };
  }, [apartmentId, scope]);

  return (
    <>
      <header className="page-header stats-header">
        <div><h1>Статистика</h1><p>Споживання та дохід за останні 12 місяців</p></div>
        {apartments.length > 0 && (
          <label className="stats-apartment-select">Квартира
            <select aria-label="Квартира для статистики" value={apartmentId ?? ""} onChange={(event) => setApartmentId(Number(event.target.value))}>
              {apartments.map((apartment) => <option key={apartment.id} value={apartment.id}>{apartment.name}</option>)}
            </select>
          </label>
        )}
      </header>
      {error && <p className="error-message">{error}</p>}

      <section className="section-card stats-section">
        <div className="section-heading"><div><h2>Споживання</h2><p>Показники лічильників по вибраній квартирі</p></div></div>
        {consumption === null && apartmentId !== null ? (
          <p className="muted-text">Завантажуємо споживання…</p>
        ) : consumption && consumption.length > 0 ? (
          <div className="consumption-grid">{consumption.map((series) => <MiniLineChart key={series.service_id} series={series} />)}</div>
        ) : (
          <p className="empty-state">Ще немає історії споживання для цієї квартири.</p>
        )}
      </section>

      <section className="section-card stats-section">
        <div className="section-heading income-heading">
          <div><h2>Дохід</h2><p>Оренда та комунальні платежі помісячно</p></div>
          <div className="scope-switch" role="group" aria-label="Масштаб доходу">
            <button className={scope === "portfolio" ? "active" : ""} type="button" aria-pressed={scope === "portfolio"} onClick={() => setScope("portfolio")}>Портфель</button>
            <button className={scope === "apartment" ? "active" : ""} type="button" aria-pressed={scope === "apartment"} disabled={apartmentId === null} onClick={() => setScope("apartment")}>Квартира</button>
          </div>
        </div>
        {income === null ? (
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
