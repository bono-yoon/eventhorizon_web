/**
 * 모바일 Models.kt alertHeadline 과 동일한 화면용 짧은 알림 제목.
 * DB/API 원문 message 는 그대로 두고 표시만 단순화한다.
 */
export type AlertHeadlineInput = {
  message: string;
  type?: string | null;
  phase?: number | null;
  value?: number | null;
  /** web_alerts.threshold_value */
  thresholdValue?: number | null;
  /** AlertEvent.threshold */
  threshold?: number | null;
};

function formatAlertValue(value: number | null | undefined, unit: string): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (unit === "°") return `${value.toFixed(1)}°`;
  if (unit === "g") return `${value.toFixed(2)}g`;
  return `${value}${unit}`;
}

function parseAlertNumber(message: string): number | null {
  const m = /([-+]?\d+(?:\.\d+)?)/.exec(message);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function unitFromMessage(message: string, unit: string): string | null {
  const m = new RegExp(`([-+]?\\d+(?:\\.\\d+)?)\\s*${unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).exec(
    message
  );
  return m ? `${m[1]}${unit}` : null;
}

export function alertHeadline(alert: AlertHeadlineInput): string {
  const raw = String(alert.message || "");
  const type = String(alert.type || "").toLowerCase();
  const sustained =
    (alert.phase ?? 0) >= 2 ||
    raw.includes("에스컬레이션") ||
    raw.includes("지속");
  const parsed = parseAlertNumber(raw);
  const value =
    alert.value != null && Number.isFinite(alert.value) ? alert.value : parsed;
  const threshold =
    alert.thresholdValue != null && Number.isFinite(alert.thresholdValue)
      ? alert.thresholdValue
      : alert.threshold != null && Number.isFinite(alert.threshold)
        ? alert.threshold
        : null;

  switch (type) {
    case "accel": {
      const n =
        formatAlertValue(value, "°") ??
        unitFromMessage(raw, "°") ??
        unitFromMessage(raw, "g");
      const body = n ? ` ${n}` : "";
      return sustained ? `기울기 초과 지속 감지${body}` : `기울기 초과${body}`;
    }
    case "temp": {
      const n =
        value != null && Number.isFinite(value)
          ? `${value.toFixed(1)}°C`
          : unitFromMessage(raw, "°C");
      const body = n ? ` ${n}` : "";
      const cold =
        (threshold != null && value != null && value < threshold) ||
        raw.includes("미만") ||
        raw.includes("저온");
      return cold ? `저온${body}` : `고온${body}`;
    }
    case "battery": {
      const n =
        value != null && Number.isFinite(value)
          ? `${Math.round(value)}%`
          : unitFromMessage(raw, "%");
      const body = n ? ` ${n}` : "";
      return `배터리 경고${body}`;
    }
    case "hold":
      return "측정 중지";
    case "blackbox":
      return "장비 잠김";
    default:
      return raw
        .replace(/^\[[^\]]+]\s*/, "")
        .replace(/\s*[·—]\s*[^·—]+$/, "")
        .trim() || raw;
  }
}
