const UAH_FORMATTER = new Intl.NumberFormat("uk-UA", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatUah(value: string | number): string {
  return `${UAH_FORMATTER.format(Number(value))} ₴`;
}
