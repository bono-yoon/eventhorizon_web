export type ThresholdLevel = "normal" | "warning" | "critical";

/** 주의 시작점 대비 경고 시작 배수 */
export const SENSOR_CRITICAL_MULTIPLIER = 1.4;
/** 온도 주의 시작점에서 경고까지의 추가 온도 */
export const TEMP_CRITICAL_DELTA_C = 10;
/** 이 값 이하이면 배터리 경고 */
export const BATTERY_CRITICAL_PERCENT = 5;

export function sensorValueLevel(
  value: number,
  threshold: number
): ThresholdLevel {
  if (value >= threshold * SENSOR_CRITICAL_MULTIPLIER) return "critical";
  if (value >= threshold) return "warning";
  return "normal";
}

export function temperatureLevel(
  value: number | null,
  threshold: number
): ThresholdLevel {
  if (value == null) return "normal";
  if (value >= threshold + TEMP_CRITICAL_DELTA_C) return "critical";
  if (value >= threshold) return "warning";
  return "normal";
}

export function batteryLevel(
  value: number,
  threshold: number
): ThresholdLevel {
  if (value < 0) return "normal";
  if (value <= BATTERY_CRITICAL_PERCENT) return "critical";
  if (value <= threshold) return "warning";
  return "normal";
}
