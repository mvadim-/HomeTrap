import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import {
  Apartment,
  ConsumptionSeries,
  EXPENSE_CATEGORY_LABELS,
  ExpenseCategory,
  IncomeStats,
  PnlStats,
  StatsPeriod,
  Tenant,
  getApartments,
  getConsumptionStats,
  getIncomeStats,
  getInvoices,
  getPnlStats,
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
const KYIV_MONTH_FORMATTER = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "2-digit",
  timeZone: "Europe/Kyiv",
});
const NUMBER_FORMATTERS = [0, 1, 2].map((maximumFractionDigits) => (
  new Intl.NumberFormat("uk-UA", { maximumFractionDigits })
));
const PERIOD_MODES = ["6", "12", "24", "all", "custom"] as const;
type PeriodMode = typeof PERIOD_MODES[number];
type StatsFilters = {
  apartmentId: number | null;
  scope: "portfolio" | "apartment";
  periodMode: PeriodMode;
  dateFrom: string;
  dateTo: string;
};

function initialStatsFilters(searchParams: URLSearchParams): StatsFilters {
  const apartmentParam = searchParams.get("apartment") ?? "";
  const parsedApartmentId = /^\d+$/.test(apartmentParam) ? Number(apartmentParam) : null;
  const scopeParam = searchParams.get("scope");
  const periodParam = searchParams.get("period");
  const periodMode = PERIOD_MODES.includes(periodParam as PeriodMode) ? periodParam as PeriodMode : "12";
  const fromParam = searchParams.get("from") ?? "";
  const toParam = searchParams.get("to") ?? "";
  const hasCustomRange = periodMode === "custom"
    && /^\d{4}-(0[1-9]|1[0-2])$/.test(fromParam)
    && /^\d{4}-(0[1-9]|1[0-2])$/.test(toParam);

  return {
    apartmentId: parsedApartmentId !== null && parsedApartmentId > 0 ? parsedApartmentId : null,
    scope: scopeParam === "apartment" ? "apartment" : "portfolio",
    periodMode,
    dateFrom: hasCustomRange ? fromParam : "",
    dateTo: hasCustomRange ? toParam : "",
  };
}

function statsFiltersSearchParams(filters: StatsFilters): URLSearchParams {
  const result = new URLSearchParams();
  if (filters.apartmentId !== null) result.set("apartment", String(filters.apartmentId));
  result.set("scope", filters.scope);
  result.set("period", filters.periodMode);
  if (filters.periodMode === "custom") {
    if (filters.dateFrom) result.set("from", filters.dateFrom);
    if (filters.dateTo) result.set("to", filters.dateTo);
  }
  return result;
}

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

function currentKyivMonth(): string {
  const parts = KYIV_MONTH_FORMATTER.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")!.value;
  const month = parts.find((part) => part.type === "month")!.value;
  return `${year}-${month}`;
}

function tenantPeriod(tenant: Tenant, currentMonth: string): { from: string; to: string } {
  const from = tenant.contract_start.slice(0, 7);
  return {
    from,
    to: tenant.contract_end?.slice(0, 7) ?? (from > currentMonth ? from : currentMonth),
  };
}

function resolveApartmentId(apartments: Apartment[], requestedId: number | null): number | null {
  return apartments.find((item) => item.id === requestedId)?.id
    ?? apartments.find((item) => item.is_active)?.id
    ?? apartments[0]?.id
    ?? null;
}

function useStatsFilters(apartments: Apartment[], apartmentsLoaded: boolean) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [initialFilters] = useState(() => initialStatsFilters(searchParams));
  const pendingUrlFilters = useRef<string | null>(null);
  const lastWrittenSearch = useRef<string | null>(null);
  const [apartmentId, setApartmentId] = useState<number | null>(null);
  const [scope, setScope] = useState<"portfolio" | "apartment">(initialFilters.scope);
  const [periodMode, setPeriodMode] = useState<PeriodMode>(initialFilters.periodMode);
  const [dateFrom, setDateFrom] = useState(initialFilters.dateFrom);
  const [dateTo, setDateTo] = useState(initialFilters.dateTo);

  useEffect(() => {
    if (!apartmentsLoaded) return;
    if (searchParams.toString() === lastWrittenSearch.current) {
      lastWrittenSearch.current = null;
      return;
    }
    const parsed = initialStatsFilters(searchParams);
    const filters: StatsFilters = {
      ...parsed,
      apartmentId: resolveApartmentId(apartments, parsed.apartmentId),
    };
    pendingUrlFilters.current = statsFiltersSearchParams(filters).toString();
    setApartmentId(filters.apartmentId);
    setScope(filters.scope);
    setPeriodMode(filters.periodMode);
    setDateFrom(filters.dateFrom);
    setDateTo(filters.dateTo);
  }, [apartments, apartmentsLoaded, searchParams]);

  useEffect(() => {
    if (!apartmentsLoaded) return;
    const nextSearchParams = statsFiltersSearchParams({ apartmentId, scope, periodMode, dateFrom, dateTo });
    const nextSearch = nextSearchParams.toString();
    if (pendingUrlFilters.current !== null) {
      if (pendingUrlFilters.current !== nextSearch) return;
      pendingUrlFilters.current = null;
    }
    if (searchParams.toString() !== nextSearch) {
      lastWrittenSearch.current = nextSearch;
      setSearchParams(nextSearchParams, { replace: true });
    }
  }, [apartmentId, apartmentsLoaded, dateFrom, dateTo, periodMode, scope, searchParams, setSearchParams]);

  return {
    requestedApartmentId: initialFilters.apartmentId,
    apartmentId,
    setApartmentId,
    scope,
    setScope,
    periodMode,
    setPeriodMode,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
  };
}

type TenantsStatus = "idle" | "loading" | "success" | "error";
type ApartmentTenantsState = {
  apartmentId: number | null;
  status: TenantsStatus;
  items: Tenant[];
};

function useApartmentTenants(apartmentId: number | null): ApartmentTenantsState {
  const [state, setState] = useState<ApartmentTenantsState>({
    apartmentId: null,
    status: "idle",
    items: [],
  });

  useEffect(() => {
    if (apartmentId === null) {
      setState({ apartmentId: null, status: "idle", items: [] });
      return;
    }
    let active = true;
    setState({ apartmentId, status: "loading", items: [] });
    getTenants(apartmentId)
      .then((items) => {
        if (active) setState({ apartmentId, status: "success", items });
      })
      .catch(() => {
        if (active) setState({ apartmentId, status: "error", items: [] });
      });
    return () => { active = false; };
  }, [apartmentId]);

  if (state.apartmentId !== apartmentId) {
    return {
      apartmentId,
      status: apartmentId === null ? "idle" : "loading",
      items: [],
    };
  }
  return state;
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

function vacancyMonthCount(periods: string[], tenants: Tenant[]): number {
  return periods.filter((period) => {
    const [year, month] = period.slice(0, 7).split("-").map(Number);
    const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
    const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    return !tenants.some((tenant) => (
      tenant.contract_start <= monthEnd
      && (tenant.contract_end === null || tenant.contract_end >= monthStart)
    ));
  }).length;
}

function scaleTicks(max: number, step: number): number[] {
  return Array.from({ length: Math.round(max / step) + 1 }, (_, index) => index * step);
}

function shiftMonthKey(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  const total = year * 12 + (month - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

type ConsumptionMode = "units" | "cost";
type ConsumptionDelta = { percent: number; direction: "up" | "down" };

function ConsumptionDeltaBadge({ delta, label }: { delta: ConsumptionDelta; label: string }) {
  const magnitude = numberLabel(Math.abs(delta.percent), 1);
  const arrow = delta.direction === "up" ? "▲" : "▼";
  const sign = delta.direction === "up" ? "+" : "−";
  const trend = delta.direction === "up" ? "зростання" : "зниження";
  return (
    <span
      className={`consumption-delta consumption-delta-${delta.direction}`}
      aria-label={`${label}: ${trend} на ${magnitude}%`}
    >
      <span aria-hidden="true">{arrow} {sign}{magnitude}%</span>
    </span>
  );
}

function MiniLineChart({ series, periods, mode }: { series: ConsumptionSeries; periods: string[]; mode: ConsumptionMode }) {
  const metricOf = (point: ConsumptionSeries["values"][number]) => (
    mode === "units" ? Number(point.consumed) : Number(point.cost)
  );
  const displayUnit = mode === "units" ? (series.unit ?? "од.") : "₴";
  const formatValue = (value: number) => `${numberLabel(value)} ${displayUnit}`;
  const pointsByPeriod = new Map(series.values.map((point) => [point.period.slice(0, 7), point]));
  const periodKeys = periods.map((period) => period.slice(0, 7));
  const periodKeySet = new Set(periodKeys);
  const showYoy = periodKeys.some((key) => periodKeySet.has(shiftMonthKey(key, -12)));
  const slots = periods.map((period) => pointsByPeriod.get(period.slice(0, 7)) ?? null);
  const values = series.values.map(metricOf);
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
    return `${command} ${x(index)} ${y(metricOf(point))}`;
  }).filter(Boolean).join(" ");
  const yoyValues = showYoy
    ? periodKeys.map((key) => {
      const priorPoint = pointsByPeriod.get(shiftMonthKey(key, -12));
      return priorPoint ? metricOf(priorPoint) : null;
    })
    : periodKeys.map(() => null);
  let previousYoy = false;
  const yoyPath = yoyValues.map((value, index) => {
    if (value === null) {
      previousYoy = false;
      return "";
    }
    const command = previousYoy ? "L" : "M";
    previousYoy = true;
    return `${command} ${x(index)} ${y(value)}`;
  }).filter(Boolean).join(" ");
  const baseline = PADDING.top + plotHeight;
  const areaPaths: string[] = [];
  let areaPoints: string[] = [];
  let areaStart = 0;
  slots.forEach((point, index) => {
    if (point) {
      if (areaPoints.length === 0) areaStart = index;
      areaPoints.push(`${areaPoints.length === 0 ? "M" : "L"} ${x(index)} ${y(metricOf(point))}`);
    }
    if ((!point || index === slots.length - 1) && areaPoints.length > 0) {
      const areaEnd = point && index === slots.length - 1 ? index : index - 1;
      areaPaths.push(`${areaPoints.join(" ")} L ${x(areaEnd)} ${baseline} L ${x(areaStart)} ${baseline} Z`);
      areaPoints = [];
    }
  });
  const color = seriesColor(series.service_name);
  const currentPoint = series.values.at(-1) ?? null;
  const currentValue = currentPoint ? metricOf(currentPoint) : 0;
  const currentKey = currentPoint ? currentPoint.period.slice(0, 7) : null;
  const deltaFor = (offset: number): ConsumptionDelta | null => {
    if (!currentPoint || !currentKey) return null;
    const comparePoint = pointsByPeriod.get(shiftMonthKey(currentKey, offset));
    if (!comparePoint) return null;
    const compareValue = metricOf(comparePoint);
    if (compareValue === 0) return null;
    const percent = ((metricOf(currentPoint) - compareValue) / compareValue) * 100;
    return { percent, direction: percent >= 0 ? "up" : "down" };
  };
  const monthDelta = deltaFor(-1);
  const yearDelta = deltaFor(-12);
  const summary = mode === "units"
    ? {
      avg: Number(series.summary.avg),
      min: Number(series.summary.min),
      max: Number(series.summary.max),
    }
    : {
      avg: values.reduce((total, value) => total + value, 0) / (values.length || 1),
      min: Math.min(...values),
      max: Math.max(...values),
    };

  return (
    <article className="consumption-card">
      <div className="chart-card-heading">
        <div><h3>{series.service_name}</h3><span>{displayUnit}</span></div>
        <strong>{numberLabel(currentValue)}</strong>
      </div>
      {(monthDelta || yearDelta) && (
        <div className="consumption-deltas">
          {monthDelta && <ConsumptionDeltaBadge delta={monthDelta} label="До попереднього місяця" />}
          {yearDelta && <ConsumptionDeltaBadge delta={yearDelta} label="Рік до року" />}
        </div>
      )}
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
        {yoyPath && (
          <path
            className="chart-yoy-line"
            d={yoyPath}
            fill="none"
            stroke="var(--chart-yoy)"
            strokeDasharray="4 4"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            aria-label="Той самий місяць торік"
          >
            <title>Той самий місяць торік</title>
          </path>
        )}
        {path && <path className="chart-line" d={path} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />}
        {showYoy && yoyValues.map((value, index) => (value === null ? null : (
          <circle
            key={`yoy-${periods[index]}`}
            className="chart-yoy-point"
            cx={x(index)}
            cy={y(value)}
            r="2.5"
            fill="var(--chart-yoy)"
          />
        )))}
        {slots.map((point, index) => (
          <g key={periods[index]} className={point ? "chart-month-slot" : "chart-month-slot chart-month-slot-empty"} data-period={periods[index]}>
            {point && (
            <circle
              className="chart-point"
              cx={x(index)}
              cy={y(metricOf(point))}
              fill={color}
              r={point === currentPoint ? 5 : 3}
              stroke={point === currentPoint ? "var(--color-surface)" : undefined}
              strokeWidth={point === currentPoint ? 2 : undefined}
              tabIndex={0}
              aria-label={`${monthLabel(point.period)}: ${numberLabel(metricOf(point))} ${displayUnit}`}
            >
              <title>{monthLabel(point.period)}: {numberLabel(metricOf(point))} {displayUnit}</title>
            </circle>
            )}
            <text className="chart-label month-label" textAnchor="middle" x={x(index)} y={CHART_HEIGHT - 8}>{monthLabel(periods[index])}</text>
          </g>
        ))}
      </svg>
      <dl className="consumption-summary" aria-label={`Зведення споживання: ${series.service_name}`}>
        <div><dt>Сер.</dt><dd>{formatValue(summary.avg)}</dd></div>
        <div><dt>Мін</dt><dd>{formatValue(summary.min)}</dd></div>
        <div><dt>Макс</dt><dd>{formatValue(summary.max)}</dd></div>
      </dl>
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

function PnlChart({ stats, periods }: { stats: PnlStats; periods: string[] }) {
  const width = 760;
  const height = 270;
  const padding = { top: 28, right: 18, bottom: 38, left: 56 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const pointsByPeriod = new Map(stats.values.map((point) => [point.period.slice(0, 7), point]));
  const numbers = stats.values.flatMap((point) => [Number(point.income), Number(point.expenses), Number(point.net)]);
  const posMax = Math.max(...numbers, 1);
  const negMin = Math.min(...numbers, 0);
  const topScale = niceScale(posMax);
  const bottomScale = negMin < 0 ? niceScale(-negMin) : { max: 0, step: topScale.step };
  const totalMax = topScale.max + bottomScale.max;
  const zeroY = padding.top + (topScale.max / totalMax) * plotHeight;
  const y = (value: number) => zeroY - (value / totalMax) * plotHeight;
  const slotWidth = plotWidth / Math.max(periods.length, 1);
  const barWidth = Math.min(20, slotWidth * 0.32);
  const gap = 3;
  const topTicks = scaleTicks(topScale.max, topScale.step);
  const bottomTicks = bottomScale.max > 0
    ? scaleTicks(bottomScale.max, bottomScale.step).slice(1).map((tick) => -tick)
    : [];
  const netPath = periods.map((period, index) => {
    const point = pointsByPeriod.get(period.slice(0, 7));
    if (!point) return null;
    const cx = padding.left + slotWidth * index + slotWidth / 2;
    return { cx, cy: y(Number(point.net)), point };
  });
  const linePath = netPath
    .map((entry, index) => (entry ? `${index === 0 || !netPath[index - 1] ? "M" : "L"} ${entry.cx} ${entry.cy}` : ""))
    .filter(Boolean)
    .join(" ");

  return (
    <svg className="income-chart pnl-chart" role="img" aria-label="Графік P&L: дохід, витрати, чистий" viewBox={`0 0 ${width} ${height}`}>
      {[...topTicks, ...bottomTicks].map((tick) => (
        <g key={tick}>
          <line className="chart-gridline" x1={padding.left} x2={width - padding.right} y1={y(tick)} y2={y(tick)} />
          <text className="chart-label chart-tick-label" x="4" y={y(tick) + 4}>{numberLabel(tick, 0)} ₴</text>
        </g>
      ))}
      <line className="chart-axis" x1={padding.left} x2={width - padding.right} y1={zeroY} y2={zeroY} />
      {periods.map((period, index) => {
        const center = padding.left + slotWidth * index + slotWidth / 2;
        const point = pointsByPeriod.get(period.slice(0, 7));
        if (!point) {
          return (
            <g key={period} className="chart-month-slot chart-month-slot-empty" data-period={period}>
              <text className="chart-label month-label" textAnchor="middle" x={center} y={height - 11}>{monthLabel(period)}</text>
            </g>
          );
        }
        const income = Number(point.income);
        const expenses = Number(point.expenses);
        const incomeX = center - gap / 2 - barWidth;
        const expenseX = center + gap / 2;
        return (
          <g key={point.period} className="chart-month-slot" data-period={point.period}>
            <rect className="pnl-income" fill="var(--chart-rent)" stroke="var(--color-surface)" strokeWidth="1.5" x={incomeX} y={y(income)} width={barWidth} height={Math.abs(zeroY - y(income))} tabIndex={0} aria-label={`${monthLabel(point.period)}, дохід: ${formatUah(point.income)}`}>
              <title>{monthLabel(point.period)} · Дохід: {formatUah(point.income)}</title>
            </rect>
            <rect className="pnl-expense" fill="var(--chart-expense)" stroke="var(--color-surface)" strokeWidth="1.5" x={expenseX} y={y(expenses)} width={barWidth} height={Math.abs(zeroY - y(expenses))} tabIndex={0} aria-label={`${monthLabel(point.period)}, витрати: ${formatUah(point.expenses)}`}>
              <title>{monthLabel(point.period)} · Витрати: {formatUah(point.expenses)}</title>
            </rect>
            <text className="chart-label month-label" textAnchor="middle" x={center} y={height - 11}>{monthLabel(period)}</text>
          </g>
        );
      })}
      {linePath && <path className="pnl-net-line" d={linePath} fill="none" stroke="var(--chart-net)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />}
      {netPath.map((entry) => (entry ? (
        <circle
          key={entry.point.period}
          className="pnl-net-point"
          cx={entry.cx}
          cy={entry.cy}
          r="3.5"
          fill="var(--chart-net)"
          stroke="var(--color-surface)"
          strokeWidth="1.5"
          tabIndex={0}
          aria-label={`${monthLabel(entry.point.period)}, чистий: ${formatUah(entry.point.net)}`}
        >
          <title>{monthLabel(entry.point.period)} · Чистий: {formatUah(entry.point.net)}</title>
        </circle>
      ) : null))}
    </svg>
  );
}

export function Stats() {
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [apartmentsLoaded, setApartmentsLoaded] = useState(false);
  const {
    requestedApartmentId,
    apartmentId,
    setApartmentId,
    scope,
    setScope,
    periodMode,
    setPeriodMode,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
  } = useStatsFilters(apartments, apartmentsLoaded);
  const tenantState = useApartmentTenants(apartmentId);
  const tenants = tenantState.items;
  const tenantsStatus = tenantState.status;
  const [consumption, setConsumption] = useState<ConsumptionSeries[] | null>(null);
  const [consumptionLoading, setConsumptionLoading] = useState(false);
  const [consumptionError, setConsumptionError] = useState("");
  const [consumptionMode, setConsumptionMode] = useState<ConsumptionMode>("units");
  const [income, setIncome] = useState<IncomeStats | null>(null);
  const [incomeLoading, setIncomeLoading] = useState(false);
  const [incomeError, setIncomeError] = useState("");
  const [pnl, setPnl] = useState<PnlStats | null>(null);
  const [pnlLoading, setPnlLoading] = useState(false);
  const [pnlError, setPnlError] = useState("");
  const [topServiceInvoice, setTopServiceInvoice] = useState<{
    id: number;
    apartmentId: number;
    peakPeriod: string;
  } | null>(null);
  const [error, setError] = useState("");

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
  const kyivMonth = currentKyivMonth();
  const selectedTenant = periodMode === "custom"
    ? tenants.find((tenant) => {
      const period = tenantPeriod(tenant, kyivMonth);
      return period.from === dateFrom && period.to === dateTo;
    }) ?? null
    : null;
  const chartPeriods = chartMonthPeriods(statsPeriod, [
    ...(consumption?.flatMap((series) => series.values.map((point) => point.period)) ?? []),
    ...(income?.values.map((point) => point.period) ?? []),
    ...(pnl?.values.map((point) => point.period) ?? []),
  ]);
  const tenantStarts: TenantStartMarker[] = scope === "apartment"
    ? tenants.map((tenant) => ({
      tenantId: tenant.id,
      tenantName: tenant.full_name,
      period: tenant.contract_start.slice(0, 7),
    }))
    : [];
  const vacancyMonths = vacancyMonthCount(chartPeriods, tenants);
  const allTimeStatsFailed = periodMode === "all" && Boolean(consumptionError || incomeError);
  const allTimeStatsPending = periodMode === "all"
    && !allTimeStatsFailed
    && (consumptionLoading || incomeLoading || consumption === null || income === null);
  const vacancyAvailable = tenantsStatus === "success"
    && statsPeriod !== null
    && !allTimeStatsFailed
    && !allTimeStatsPending;
  const vacancyStatusText = tenantsStatus === "error"
    ? "дані орендарів недоступні"
    : tenantsStatus !== "success"
      ? "завантажуємо дані орендарів"
      : statsPeriod === null
        ? "оберіть коректний період"
        : allTimeStatsFailed
          ? "статистика за весь час недоступна"
          : allTimeStatsPending
            ? "завантажуємо статистику за весь час"
            : "без орендаря за період";

  useEffect(() => {
    let active = true;
    getApartments()
      .then((items) => {
        if (!active) return;
        setApartments(items);
        setApartmentId(resolveApartmentId(items, requestedApartmentId));
        setApartmentsLoaded(true);
      })
      .catch(() => {
        if (!active) return;
        setError("Не вдалося завантажити квартири.");
        setApartmentsLoaded(true);
    });
    return () => { active = false; };
  }, [requestedApartmentId, setApartmentId]);

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
    if (scope === "apartment" && apartmentId === null) return;
    if (statsPeriod === null) {
      setPnl(null);
      setPnlLoading(false);
      setPnlError("");
      return;
    }
    let active = true;
    setPnl(null);
    setPnlLoading(true);
    setPnlError("");
    getPnlStats(scope === "apartment" ? apartmentId ?? undefined : undefined, statsPeriod)
      .then((stats) => active && setPnl(stats))
      .catch(() => active && setPnlError("Не вдалося завантажити P&L."))
      .finally(() => active && setPnlLoading(false));
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
    const period = tenantPeriod(tenant, kyivMonth);
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
                  aria-label="Орендар для статистики"
                  value={selectedTenant?.id ?? ""}
                  onChange={(event) => selectTenant(Number(event.target.value))}
                >
                  <option value="" disabled>—</option>
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
        <div className="section-heading">
          <div><h2>Споживання</h2><p>Показники лічильників по вибраній квартирі</p></div>
          {consumption && consumption.length > 0 && (
            <div className="scope-switch consumption-unit-switch" role="group" aria-label="Одиниці споживання">
              <button className={consumptionMode === "units" ? "active" : ""} type="button" aria-pressed={consumptionMode === "units"} onClick={() => setConsumptionMode("units")}>Одиниці</button>
              <button className={consumptionMode === "cost" ? "active" : ""} type="button" aria-pressed={consumptionMode === "cost"} onClick={() => setConsumptionMode("cost")}>₴</button>
            </div>
          )}
        </div>
        {statsPeriod === null ? (
          <p className="empty-state">Оберіть початок і завершення періоду.</p>
        ) : consumptionLoading ? (
          <p className="muted-text">Завантажуємо споживання…</p>
        ) : consumptionError ? (
          <p className="error-message">{consumptionError}</p>
        ) : consumption && consumption.length > 0 ? (
          <div className="consumption-grid">{consumption.map((series) => <MiniLineChart key={series.service_id} series={series} periods={chartPeriods} mode={consumptionMode} />)}</div>
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
        {scope === "apartment" && (
          <article className="stats-summary-tile">
            <span>Простій</span>
            <strong>{vacancyAvailable ? `${vacancyMonths} міс` : "—"}</strong>
            <small>{vacancyStatusText}</small>
          </article>
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

      <section className="section-card stats-section" aria-label="P&L">
        <div className="section-heading"><div><h2>P&amp;L</h2><p>Дохід, витрати та чистий результат помісячно</p></div></div>
        {statsPeriod === null ? (
          <p className="empty-state">Оберіть початок і завершення періоду.</p>
        ) : pnlLoading ? (
          <p className="muted-text">Завантажуємо P&amp;L…</p>
        ) : pnlError ? (
          <p className="error-message">{pnlError}</p>
        ) : pnl === null ? (
          <p className="muted-text">Завантажуємо P&amp;L…</p>
        ) : pnl.values.length > 0 ? (
          <>
            <div className="stats-summary-grid pnl-summary-grid" aria-label="Підсумки P&L">
              <article className="stats-summary-tile"><span>Дохід</span><strong>{formatUah(pnl.totals.income)}</strong></article>
              <article className="stats-summary-tile"><span>Витрати</span><strong>{formatUah(pnl.totals.expenses_total)}</strong></article>
              <article className="stats-summary-tile">
                <span>Чистий</span>
                <strong>{formatUah(pnl.totals.net)}{pnl.unconverted.count > 0 ? "*" : ""}</strong>
                {pnl.unconverted.count > 0 && <small className="pnl-incomplete-note">неповний показник</small>}
              </article>
              <article className="stats-summary-tile">
                <span>Маржа</span>
                <strong>{pnl.totals.margin_percent === null ? "—" : `${numberLabel(Number(pnl.totals.margin_percent))}%${pnl.unconverted.count > 0 ? "*" : ""}`}</strong>
                {pnl.unconverted.count > 0 && pnl.totals.margin_percent !== null && <small className="pnl-incomplete-note">неповний показник</small>}
              </article>
            </div>
            {pnl.unconverted.count > 0 && (
              <p className="pnl-unconverted-note" role="note">
                {`${pnl.unconverted.count} витрат неконвертовано (немає збереженого курсу): `}
                {Object.entries(pnl.unconverted.by_currency)
                  .map(([currency, amount]) => `${numberLabel(Number(amount))} ${currency}`)
                  .join(", ")}
                {" — їх виключено з витрат, тож чистий і маржа неповні (оптимістичні)."}
              </p>
            )}
            <div className="chart-legend pnl-legend">
              <span><i className="pnl-income-swatch" />Дохід</span>
              <span><i className="pnl-expense-swatch" />Витрати</span>
              <span><i className="pnl-net-swatch" />Чистий</span>
            </div>
            <PnlChart stats={pnl} periods={chartPeriods} />
            {Object.keys(pnl.totals.expenses_by_category).length > 0 && (
              <div className="pnl-breakdown">
                <h3>Витрати за категоріями</h3>
                <ul className="pnl-category-breakdown">
                  {(Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[])
                    .filter((category) => Number(pnl.totals.expenses_by_category[category] ?? 0) > 0)
                    .map((category) => {
                      const amount = Number(pnl.totals.expenses_by_category[category]);
                      const total = Number(pnl.totals.expenses_total);
                      const percent = total > 0 ? (amount / total) * 100 : 0;
                      return (
                        <li key={category}>
                          <span className="pnl-category-label">{EXPENSE_CATEGORY_LABELS[category]}</span>
                          <span className="pnl-category-bar" aria-hidden="true"><i style={{ width: `${percent}%` }} /></span>
                          <strong>{formatUah(amount)}</strong>
                        </li>
                      );
                    })}
                </ul>
              </div>
            )}
          </>
        ) : (
          <p className="empty-state">Ще немає даних P&amp;L за вибраний період.</p>
        )}
      </section>
    </>
  );
}
