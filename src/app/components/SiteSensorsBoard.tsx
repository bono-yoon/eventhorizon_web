"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Badge, Panel, StatusDot } from "./ui";
import { MapView } from "./MapView";
import {
  SensorHistoryView,
  type HistoryPoint,
  type UnlockMarker,
} from "./SensorHistoryView";
import {
  sensorRowToMapMarker,
  siteToMapMarker,
  type DashboardSensorRow,
} from "@/lib/mapMarkers";
import type { Site } from "@/lib/types";
import { SensorMetricPager } from "./SensorMetricPager";

function sensorsPath(siteId: string, deviceId: string) {
  return `/site/${siteId}/sensors?device=${encodeURIComponent(deviceId)}`;
}

export function SiteSensorsBoard({
  siteId,
  site,
  rows,
  initialDeviceId,
  isAdmin,
  initialHistory,
  initialUnlockEvents,
}: {
  siteId: string;
  site: Site;
  rows: DashboardSensorRow[];
  initialDeviceId: string | null;
  isAdmin: boolean;
  initialHistory: HistoryPoint[];
  initialUnlockEvents: UnlockMarker[];
}) {
  const [deviceId, setDeviceId] = useState(
    initialDeviceId || rows[0]?.sensor.deviceId || ""
  );
  const [history, setHistory] = useState(initialHistory);
  const [unlockEvents, setUnlockEvents] = useState(initialUnlockEvents);
  const [detailLoading, setDetailLoading] = useState(false);
  const skipInitialFetch = useRef(true);

  const focused = useMemo(
    () =>
      rows.find((r) => r.sensor.deviceId === deviceId) || rows[0] || null,
    [rows, deviceId]
  );

  const selectDevice = useCallback(
    (nextId: string) => {
      if (!nextId || nextId === deviceId) return;
      setDeviceId(nextId);
      History.prototype.replaceState.call(
        window.history,
        window.history.state,
        "",
        sensorsPath(siteId, nextId)
      );
    },
    [deviceId, siteId]
  );

  useEffect(() => {
    const syncFromUrl = () => {
      const fromUrl = new URLSearchParams(window.location.search).get("device");
      if (!fromUrl) return;
      if (!rows.some((r) => r.sensor.deviceId === fromUrl)) return;
      setDeviceId((prev) => (prev === fromUrl ? prev : fromUrl));
    };
    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, [rows]);



  useEffect(() => {
    if (skipInitialFetch.current) {
      skipInitialFetch.current = false;
      return;
    }
    if (!deviceId) return;

    let cancelled = false;
    async function loadDetail() {
      setDetailLoading(true);
      try {
        const res = await fetch(
          `/api/sensors?siteId=${encodeURIComponent(siteId)}&deviceId=${encodeURIComponent(deviceId)}`,
          { cache: "no-store" }
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const item = data.items?.[0];
        const readings = (item?.readings || []) as Array<{
          id: string;
          ts: number;
          x: number;
          y: number;
          z: number;
          batteryPercent: number;
          temperatureC: number | null;
        }>;
        if (!cancelled) {
          setHistory(
            readings.map((h) => ({
              id: h.id,
              ts: h.ts,
              x: h.x,
              y: h.y,
              z: h.z,
              batteryPercent: h.batteryPercent,
              temperatureC: h.temperatureC,
            }))
          );
          setUnlockEvents(
            isAdmin ? ((data.unlockEvents || []) as UnlockMarker[]) : []
          );
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    }

    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [deviceId, siteId, isAdmin]);

  const markers = useMemo(
    () => [
      siteToMapMarker(site),
      ...rows
        .map((r) =>
          sensorRowToMapMarker(r, {
            sub: `배터리 ${r.latest?.batteryPercent ?? "-"}% · ${r.sensor.mode}`,
          })
        )
        .filter((m): m is NonNullable<typeof m> => m != null),
    ],
    [site, rows]
  );

  return (
    <div className="flex flex-col gap-5 p-0.5">
      <p className="text-sm text-[var(--eh-fog)]">
        센서별 이력·차트 조회입니다. 가동·임계 제어는{" "}
        <Link
          href={`/site/${siteId}`}
          className="text-[var(--eh-signal)] hover:underline"
        >
          현장 대시보드
        </Link>
        에서 할 수 있습니다.
      </p>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <Panel>
          <div className="mb-3 text-lg text-[var(--eh-mist)]">현장 센서 위치</div>
          <MapView
            markers={markers}
            preferSensorLayer
            focusId={focused?.sensor.deviceId}
          />
        </Panel>

        <Panel className="flex min-h-0 flex-col">
          <div className="mb-3 shrink-0 text-lg text-[var(--eh-mist)]">센서 목록</div>
          <div className="eh-scroll max-h-[min(420px,50vh)] space-y-2 overflow-y-auto overscroll-contain pr-0.5">
            {rows.map((r) => {
              const active = focused?.sensor.deviceId === r.sensor.deviceId;
              return (
                <button
                  key={r.sensor.id}
                  type="button"
                  onClick={() => selectDevice(r.sensor.deviceId)}
                  className={clsx(
                    "eh-neu-press block w-full rounded-2xl px-3 py-2.5 text-left transition",
                    active
                      ? "eh-neu-active text-[var(--eh-signal)]"
                      : "eh-neu-raised-sm hover:text-[var(--eh-mist)]"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <StatusDot status={r.status} />
                    <span className="text-sm text-[var(--eh-mist)]">{r.sensor.label}</span>
                  </div>
                  <div className="mt-1 text-xs text-[var(--eh-fog)]">
                    {r.sensor.deviceId}
                  </div>
                </button>
              );
            })}
            {!rows.length && (
              <div className="py-8 text-center text-sm text-[var(--eh-fog)]">
                배정된 센서가 없습니다.
              </div>
            )}
          </div>
        </Panel>
      </div>

      {focused && (
        <Panel
          className={clsx(
            "transition-opacity duration-200",
            detailLoading && "opacity-70"
          )}
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-lg text-[var(--eh-mist)]">{focused.sensor.label}</div>
              <div className="text-xs text-[var(--eh-fog)]">
                {focused.sensor.deviceId}
              </div>
            </div>
            <Badge
              tone={
                focused.status === "ok"
                  ? "ok"
                  : focused.status === "warning"
                    ? "warn"
                    : focused.status === "critical"
                      ? "crit"
                      : "off"
              }
            >
              {focused.status}
            </Badge>
          </div>

          <SensorMetricPager
            key={`metric-${focused.sensor.deviceId}`}
            className="mb-5"
            source={{
              mode: focused.sensor.mode,
              modeIntervalSec: focused.sensor.modeIntervalSec,
              thresholdTiltDeg: focused.sensor.thresholdTiltDeg,
              thresholdTempC: focused.sensor.thresholdTempC,
              thresholdBattery: focused.sensor.thresholdBattery,
              latest: focused.latest,
            }}
          />

          <SensorHistoryView
            key={`history-${focused.sensor.deviceId}`}
            history={history}
            showUnlockMarkers={isAdmin}
            unlockEvents={unlockEvents}
          />
        </Panel>
      )}
    </div>
  );
}
