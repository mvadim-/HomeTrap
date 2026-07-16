const UAH_FORMATTER = new Intl.NumberFormat("uk-UA", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatUah(value: string | number): string {
  return `${UAH_FORMATTER.format(Number(value))} ₴`;
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
