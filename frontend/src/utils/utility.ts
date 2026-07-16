export type UtilityKind = "gas" | "elec" | "water" | "other";

export function utilityKind(name: string): UtilityKind {
  const normalized = name.toLocaleLowerCase("uk-UA");
  if (normalized.includes("газ")) return "gas";
  if (normalized.includes("світ") || normalized.includes("електр")) return "elec";
  if (normalized.includes("вод")) return "water";
  return "other";
}
