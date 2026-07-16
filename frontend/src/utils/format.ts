const UAH_FORMATTER = new Intl.NumberFormat("uk-UA", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const TARIFF_FORMATTER = new Intl.NumberFormat("uk-UA", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 20,
});

const READING_FORMATTER = new Intl.NumberFormat("uk-UA", {
  maximumFractionDigits: 20,
});

const RATE_FORMATTER = new Intl.NumberFormat("uk-UA", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
  useGrouping: false,
});

const RATE_SUMMARY_FORMATTER = new Intl.NumberFormat("uk-UA", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: false,
});

export function formatUah(value: string | number): string {
  return `${UAH_FORMATTER.format(Number(value))} ₴`;
}

export function formatTariff(value: string | number): string {
  return TARIFF_FORMATTER.format(Number(value));
}

export function formatReading(value: string | number): string {
  return READING_FORMATTER.format(Number(value));
}

export function formatRate(value: string | number): string {
  return RATE_FORMATTER.format(Number(value));
}

export function formatRateSummary(value: string | number): string {
  return RATE_SUMMARY_FORMATTER.format(Number(value));
}

export function formatTenantRent(
  tenantName: string | null,
  rentAmount: string,
  rentCurrency: string,
): string {
  if (!tenantName) return "Квартира вільна";

  const nameParts = tenantName.trim().split(/\s+/);
  const shortName = nameParts.length > 1
    ? `${nameParts[0]} ${nameParts.at(-1)?.charAt(0)}.`
    : tenantName;
  const amount = Number(rentAmount).toLocaleString("uk-UA", { maximumFractionDigits: 2 });
  const currency = rentCurrency === "USD" ? "$" : rentCurrency;
  return `${shortName} · оренда ${amount} ${currency}`;
}
