"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Panel, StatusDot } from "./ui";
import { MapView } from "./MapView";
import type { MapEventState, MapMarker } from "./SiteMap";
import type { AlertEvent, Site } from "@/lib/types";
import {
  currentReadingEvent,
  siteToMapMarker,
  sensorRowToMapMarker,
  type DashboardSensorRow,
} from "@/lib/mapMarkers";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import {
  SimulateAlertForm,
  type SimulationDevice,
} from "./SimulateAlertForm";
import { SensorControlPanel } from "./SensorControlPanel";
import clsx from "clsx";
import { LineChart } from "lucide-react";

/** 현장 상세: 센서 현황 + 제어 (센서 데이터 페이지는 이력·차트) */
export function SiteOverview({
  site,
  sensors,
  alerts,
  alertKinds = {},
  simulationDevices = [],
  control,
}: {
  site: Site;
  sensors: DashboardSensorRow[];
  alerts: AlertEvent[];
  alertKinds?: Record<string, MapEventState>;
  simulationDevices?: SimulationDevice[];
  control?: {
    run: boolean;
    config: boolean;
    threshold: boolean;
    origin: boolean;
  };
}) {
  const canControl = Boolean(
    control &&
      (control.run || control.config || control.threshold || control.origin)
  );

  const [selectedId, setSelectedId] = useState<string | null>(
    sensors[0]?.sensor.deviceId ?? null
  );

  const selected =
    sensors.find((s) => s.sensor.deviceId === selectedId) || sensors[0] || null;

  const counts = {
    ok: sensors.filter((s) => s.status === "ok").length,
    warn: sensors.filter((s) => s.status === "warning").length,
    crit: sensors.filter((s) => s.status === "critical").length,
    off: sensors.filter(
      (s) => s.status === "offline" || s.status === "inactive"
    ).length,
  };

  const markers: MapMarker[] = useMemo(
    () => [
      siteToMapMarker(site),
      ...sensors
        .map((row) => {
          const disconnected =
            row.status === "offline" || row.status === "inactive";
          const event = disconnected
            ? undefined
            : (currentReadingEvent(row) ?? alertKinds[row.sensor.deviceId]);
          return sensorRowToMapMarker(row, {
            event,
            sub: `${row.sensor.deviceId} · ${
              event
                ? event.kind === "tilt"
                  ? "각도 초과"
                  : event.kind === "battery"
                    ? "배터리"
                    : "온도"
                : statusLabel(row.status)
            }`,
          });
        })
        .filter((m): m is MapMarker => m != null),
    ],
    [site, sensors, alertKinds]
  );

  const mapPanel = (
    <Panel className="flex h-full min-h-0 flex-col !p-4">
      <div className="mb-3 shrink-0 text-lg text-[var(--eh-mist)]">현장 센서 위치</div>
      <MapView
        markers={markers}
        fill
        preferSensorLayer
        focusId={selected?.sensor.deviceId}
        className="min-h-0 flex-1 rounded-[18px]"
      />
    </Panel>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-visible">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3 px-0.5">
        <div>
          <p className="text-sm text-[var(--eh-fog)]">
            {site.code} · {site.address}
          </p>
          <p className="mt-1 text-xs text-[var(--eh-fog)]">
            {canControl
              ? "센서를 선택하면 오른쪽에서 바로 제어할 수 있습니다."
              : "센서 상태를 확인하고, 이력·차트는 센서 데이터에서 볼 수 있습니다."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge tone="ok">정상 {counts.ok}</Badge>
          <Badge tone="warn">주의 {counts.warn}</Badge>
          <Badge tone="crit">경고 {counts.crit}</Badge>
          <Badge tone="off">오프/비활성 {counts.off}</Badge>
          <Link
            href={`/site/${site.id}/sensors`}
            className="eh-neu-raised-sm eh-neu-press inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[var(--eh-mist)] hover:text-[var(--eh-mist)]"
          >
            <LineChart size={13} />
            센서 데이터
          </Link>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[1.35fr_0.95fr] lg:items-stretch">
        <div className="flex min-h-0 flex-col gap-4 overflow-visible p-0.5">
          <div className="min-h-0 flex-1">
            {simulationDevices.length > 0 ? (
              <SimulateAlertForm devices={simulationDevices}>
                {mapPanel}
              </SimulateAlertForm>
            ) : (
              mapPanel
            )}
          </div>

          <Panel className="flex max-h-[34%] min-h-[160px] shrink-0 flex-col !p-4">
            <div className="mb-3 shrink-0 text-lg text-[var(--eh-mist)]">센서 상세</div>
            <div className="eh-scroll min-h-0 flex-1 overflow-auto overscroll-contain">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-xs text-[var(--eh-fog)]">
                  <tr className="border-b border-[var(--eh-line)]">
                    <th className="py-2 font-medium">상태</th>
                    <th className="py-2 font-medium">센서</th>
                    <th className="py-2 font-medium">배터리</th>
                    <th className="py-2 font-medium">온도</th>
                    <th className="py-2 font-medium">기울기</th>
                    <th className="py-2 font-medium">모드</th>
                    <th className="py-2 font-medium">수신</th>
                  </tr>
                </thead>
                <tbody>
                  {sensors.map((row) => {
                    const magnitude = row.latest
                      ? Math.sqrt(
                          row.latest.x ** 2 +
                            row.latest.y ** 2 +
                            row.latest.z ** 2
                        )
                      : null;
                    const active =
                      selected?.sensor.deviceId === row.sensor.deviceId;
                    return (
                      <tr
                        key={row.sensor.id}
                        className={clsx(
                          "cursor-pointer border-b border-[var(--eh-line)]/60 transition",
                          active && "bg-[var(--eh-surface-2)]"
                        )}
                        onClick={() => setSelectedId(row.sensor.deviceId)}
                      >
                        <td className="py-2.5">
                          <span className="inline-flex items-center gap-2">
                            <StatusDot status={row.status} />
                            <span className="text-xs">
                              {statusLabel(row.status)}
                            </span>
                          </span>
                        </td>
                        <td className="py-2.5">
                          <div className="text-[var(--eh-mist)]">{row.sensor.label}</div>
                          <div className="text-xs text-[var(--eh-fog)]">
                            {row.sensor.deviceId}
                          </div>
                        </td>
                        <td className="py-2.5">
                          {row.latest ? `${row.latest.batteryPercent}%` : "-"}
                        </td>
                        <td className="py-2.5">
                          {row.latest?.temperatureC != null
                            ? `${row.latest.temperatureC.toFixed(1)}°C`
                            : "-"}
                        </td>
                        <td className="py-2.5">
                          {magnitude != null ? magnitude.toFixed(3) : "-"}
                        </td>
                        <td className="py-2.5">
                          {row.latest?.mode || row.sensor.mode}
                        </td>
                        <td className="py-2.5 text-[var(--eh-fog)]">
                          {row.latest?.ts
                            ? formatDistanceToNow(row.latest.ts, {
                                addSuffix: true,
                                locale: ko,
                              })
                            : "-"}
                        </td>
                      </tr>
                    );
                  })}
                  {!sensors.length && (
                    <tr>
                      <td
                        colSpan={7}
                        className="py-8 text-center text-[var(--eh-fog)]"
                      >
                        등록된 센서가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <div className="flex min-h-0 flex-col gap-3 overflow-visible p-0.5 lg:h-full">
          <Panel className="flex min-h-0 flex-[0.7] flex-col !p-4">
            <div className="mb-3 shrink-0 text-lg text-[var(--eh-mist)]">센서 목록</div>
            <div className="eh-scroll min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1">
              {sensors.map((row) => {
                const active = selected?.sensor.deviceId === row.sensor.deviceId;
                return (
                  <button
                    key={row.sensor.id}
                    type="button"
                    onClick={() => setSelectedId(row.sensor.deviceId)}
                    className={clsx(
                      "eh-neu-press flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-left transition",
                      active
                        ? "eh-neu-active text-[var(--eh-signal)]"
                        : "eh-neu-raised-sm hover:text-[var(--eh-mist)]"
                    )}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <StatusDot status={row.status} />
                        <span className="truncate text-sm text-[var(--eh-mist)]">
                          {row.sensor.label}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-[var(--eh-fog)]">
                        {row.sensor.deviceId}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-[var(--eh-fog)]">
                      {statusLabel(row.status)}
                    </span>
                  </button>
                );
              })}
              {!sensors.length && (
                <div className="py-6 text-center text-sm text-[var(--eh-fog)]">
                  등록된 센서가 없습니다.
                </div>
              )}
            </div>
          </Panel>

          {canControl && selected && control && (
            <SensorControlPanel
              compact
              className="shrink-0"
              deviceId={selected.sensor.deviceId}
              sensorLabel={selected.sensor.label}
              canRun={control.run}
              canConfig={control.config}
              canThreshold={control.threshold}
              canOrigin={control.origin}
              initialStatus={selected.status}
            />
          )}

          <Panel className="flex min-h-0 flex-1 flex-col !p-4">
            <div className="mb-3 shrink-0 text-lg text-[var(--eh-mist)]">현장 알림</div>
            <div className="eh-scroll min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1">
              {alerts.slice(0, 8).map((a) => (
                <div key={a.id} className="eh-neu-inset rounded-2xl p-3">
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
        </div>
      </div>
    </div>
  );
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
