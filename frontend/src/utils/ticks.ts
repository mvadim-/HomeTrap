export interface NiceScale {
  max: number;
  step: number;
}

const NICE_STEPS = [1, 2, 2.5, 4, 5, 10];

export function niceScale(maxValue: number): NiceScale {
  const safeMax = Number.isFinite(maxValue) && maxValue > 0 ? maxValue : 1;
  const roughStep = safeMax / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalizedStep = roughStep / magnitude;
  const multiplier = NICE_STEPS.find((candidate) => normalizedStep <= candidate * (1 + 1e-12)) ?? 10;
  const step = multiplier * magnitude;
  const max = Math.ceil(safeMax / step) * step;

  return { max, step };
}
