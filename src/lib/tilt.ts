export const DEFAULT_TILT_THRESHOLD_DEG = 5;

export const TILT_UI = {
  combined: "기울기",
  axes: "X / Y / Z",
  threshold: "임계각",
  chartTitle: "기울기 (X / Y / Z / 합성)",
  magName: "합성",
  mapExceed: "기울기 임계 초과",
  simKind: "기울기",
} as const;

export function tiltMagnitude(x: number, y: number, z: number): number {
  const mag = Math.sqrt(x * x + y * y + z * z);
  return Number.isFinite(mag) ? mag : 0;
}

export function formatTiltDeg(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${value.toFixed(digits)}°`;
}

export function formatTiltAxes(
  x: number,
  y: number,
  z: number,
  digits = 1
): string {
  return `${x.toFixed(digits)} / ${y.toFixed(digits)} / ${z.toFixed(digits)}°`;
}

export function defaultTiltThresholdDeg(raw?: string | number | null): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TILT_THRESHOLD_DEG;
}

export function tiltExceedMessage(mag: number): string {
  return `기울기 임계값 초과 (${mag.toFixed(1)}°)`;
}
