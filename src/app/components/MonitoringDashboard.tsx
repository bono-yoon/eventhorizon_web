import Link from "next/link";
import { Badge, Panel, StatusDot } from "./ui";
import { MapView } from "./MapView";
import type { MapEventKind, MapEventState, MapMarker } from "./SiteMap";
import type { AlertEvent, Site } from "@/lib/types";
import {
  currentReadingEvent,
  siteToMapMarker,
  sensorRowToMapMarker,
  type DashboardSensorRow,
} from "@/lib/mapMarkers";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";

export type { DashboardSensorRow };
export { currentReadingEvent };

export function MonitoringDashboard({
  scopeLabel,
  sites,
  sensors,
  alerts,
  alertKinds = {},
  siteHref,
  sensorHref,
  preferSensorLayer = false,
}: {
  scopeLabel: string;
  sites: Site[];
  sensors: DashboardSensorRow[];
  alerts: AlertEvent[];
  /** 현재 역할의 알림 단계까지 도달한 활성 임계 이벤트 장비 → 이벤트 종류 */
  alertKinds?: Record<string, MapEventState>;
  siteHref?: (siteId: string) => string;
  sensorHref?: (deviceId: string, siteId: string) => string;
  preferSensorLayer?: boolean;
}) {
  const resolveSensorHref = (deviceId: string, siteId: string | null) =>
    siteId && sensorHref ? sensorHref(deviceId, siteId) : undefined;
  const siteMarkers: MapMarker[] = sites.map((s) =>
    siteToMapMarker(s, siteHref?.(s.id))
  );

  const sensorMarkers: MapMarker[] = sensors
    .map((s) => {
      const disconnected = s.status === "offline" || s.status === "inactive";
      const event = disconnected
        ? undefined
        : (currentReadingEvent(s) ?? alertKinds[s.sensor.deviceId]);
      return sensorRowToMapMarker(s, {
        event,
        href: resolveSensorHref(s.sensor.deviceId, s.sensor.siteId),
        sub: `${s.sensor.deviceId} · ${
          event ? eventLabel(event.kind) : statusLabel(s.status)
        }`,
      });
    })
    .filter((m): m is MapMarker => m != null);

  const markers = [...siteMarkers, ...sensorMarkers];
  const counts = {
    ok: sensors.filter((s) => s.status === "ok").length,
    warn: sensors.filter((s) => s.status === "warning").length,
    crit: sensors.filter((s) => s.status === "critical").length,
    off: sensors.filter(
      (s) => s.status === "offline" || s.status === "inactive"
    ).length,
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1.4fr_0.9fr]">
      <div className="space-y-5">
        <Panel>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-[var(--eh-fog)]">
                Live map · {scopeLabel}
              </div>
              <div className="mt-1 text-lg text-[var(--eh-mist)]">현장 · 센서 위치</div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge tone="ok">정상 {counts.ok}</Badge>
              <Badge tone="warn">주의 {counts.warn}</Badge>
              <Badge tone="crit">경고 {counts.crit}</Badge>
              <Badge tone="off">오프/비활성 {counts.off}</Badge>
            </div>
          </div>
          <MapView
            markers={markers}
            height={440}
            preferSensorLayer={preferSensorLayer}
          />
        </Panel>

        <Panel>
          <div className="mb-3 text-lg text-[var(--eh-mist)]">센서 현황</div>
          <div className="eh-scroll overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs text-[var(--eh-fog)]">
                <tr className="border-b border-[var(--eh-line)]">
                  <th className="py-2 font-medium">상태</th>
                  <th className="py-2 font-medium">센서</th>
                  <th className="py-2 font-medium">현장</th>
                  <th className="py-2 font-medium">배터리</th>
                  <th className="py-2 font-medium">온도</th>
                  <th className="py-2 font-medium">모드</th>
                  <th className="py-2 font-medium">수신</th>
                </tr>
              </thead>
              <tbody>
                {sensors.map((row) => (
                  <tr
                    key={row.sensor.id}
                    className="border-b border-[var(--eh-line)]/60"
                  >
                    <td className="py-3">
                      <span className="inline-flex items-center gap-2">
                        <StatusDot status={row.status} />
                        <span className="text-xs">{statusLabel(row.status)}</span>
                      </span>
                    </td>
                    <td className="py-3">
                      {resolveSensorHref(
                        row.sensor.deviceId,
                        row.sensor.siteId
                      ) ? (
                        <Link
                          href={resolveSensorHref(
                            row.sensor.deviceId,
                            row.sensor.siteId
                          )!}
                          className="text-[var(--eh-mist)] hover:underline"
                        >
                          {row.sensor.label}
                        </Link>
                      ) : (
                        <span className="text-[var(--eh-mist)]">{row.sensor.label}</span>
                      )}
                      <div className="text-xs text-[var(--eh-fog)]">
                        {row.sensor.deviceId}
                      </div>
                    </td>
                    <td className="py-3 text-[var(--eh-fog)]">
                      {row.site?.name || "-"}
                    </td>
                    <td className="py-3">
                      {row.latest ? `${row.latest.batteryPercent}%` : "-"}
                    </td>
                    <td className="py-3">
                      {row.latest?.temperatureC != null
                        ? `${row.latest.temperatureC.toFixed(1)}°C`
                        : "-"}
                    </td>
                    <td className="py-3">{row.latest?.mode || row.sensor.mode}</td>
                    <td className="py-3 text-[var(--eh-fog)]">
                      {row.latest
                        ? formatDistanceToNow(row.latest.ts, {
                            addSuffix: true,
                            locale: ko,
                          })
                        : "-"}
                    </td>
                  </tr>
                ))}
                {!sensors.length && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-[var(--eh-fog)]">
                      등록된 센서가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <div className="space-y-5">
        <Panel>
          <div className="mb-3 text-lg text-[var(--eh-mist)]">임계값 알림</div>
          <div className="space-y-3">
            {alerts.slice(0, 8).map((a) => (
              <div
                key={a.id}
                className="eh-neu-inset rounded-2xl p-3"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <Badge tone={a.severity === "critical" ? "crit" : "warn"}>
                    {a.type}
                  </Badge>
                  <span className="text-[11px] text-[var(--eh-fog)]">
                    {formatDistanceToNow(new Date(a.at), {
                      addSuffix: true,
                      locale: ko,
                    })}
                  </span>
                </div>
                <div className="text-sm text-[var(--eh-mist)]">{a.message}</div>
                <div className="mt-1 text-xs text-[var(--eh-fog)]">
                  {a.deviceId}
                  {a.acknowledged ? " · 확인됨" : ""}
                </div>
              </div>
            ))}
            {!alerts.length && (
              <div className="py-6 text-center text-sm text-[var(--eh-fog)]">
                현재 활성 알림이 없습니다.
              </div>
            )}
          </div>
        </Panel>

        <Panel>
          <div className="mb-3 text-lg text-[var(--eh-mist)]">현장 목록</div>
          <div className="space-y-2">
            {sites.map((s) => (
              <div
                key={s.id}
                className="eh-neu-raised-sm flex items-center justify-between rounded-2xl px-3 py-2.5"
              >
                <div>
                  {siteHref ? (
                    <Link
                      href={siteHref(s.id)}
                      className="text-sm text-[var(--eh-mist)] hover:underline"
                    >
                      {s.name}
                    </Link>
                  ) : (
                    <div className="text-sm text-[var(--eh-mist)]">{s.name}</div>
                  )}
                  <div className="text-xs text-[var(--eh-fog)]">{s.code}</div>
                </div>
                <Badge
                  tone={
                    s.status === "active"
                      ? "ok"
                      : s.status === "paused"
                        ? "warn"
                        : "off"
                  }
                >
                  {s.status === "paused"
                    ? "멈춤"
                    : s.status === "closed"
                      ? "종료"
                      : "운영 중"}
                </Badge>
              </div>
            ))}
            {!sites.length && (
              <div className="py-6 text-center text-sm text-[var(--eh-fog)]">
                표시할 현장이 없습니다.
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function eventLabel(kind: MapEventKind) {
  switch (kind) {
    case "tilt":
      return "각도 임계값 초과";
    case "battery":
      return "배터리 부족";
    case "temp":
      return "온도 임계 초과";
    case "other":
      return "임계값 초과";
  }
}

function statusLabel(s: DashboardSensorRow["status"]) {
  switch (s) {
    case "ok":
      return "정상";
    case "warning":
      return "주의";
    case "critical":
      return "경고";
    case "offline":
      return "오프라인";
    case "inactive":
      return "비활성";
  }
}
