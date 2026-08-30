"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CloudRain,
  CloudSun,
  Droplets,
  Wind,
} from "lucide-react";
import clsx from "clsx";
import { Badge, Panel, StatusDot } from "./ui";
import { MapView } from "./MapView";
import type { MapEventState, MapMarker, SitePinHealth } from "./SiteMap";
import type { Site } from "@/lib/types";
import {
  currentReadingEvent,
  siteToMapMarker,
  sensorRowToMapMarker,
  type DashboardSensorRow,
} from "@/lib/mapMarkers";
import {
  SimulateAlertForm,
  type SimulationDevice,
} from "./SimulateAlertForm";
import { CompanyStatsPanel } from "./CompanyStatsPanel";

type SiteSummary = {
  site: Site;
  sensorCount: number;
  issueCount: number;
  thresholdCritical: number;
  thresholdWarning: number;
  offline: number;
  health: SitePinHealth;
  topIssues: DashboardSensorRow[];
};

/** 회사 최상위: 현장 목록·이슈 핀·날씨 요약. */
export function CompanyOverview({
  scopeLabel,
  sites,
  sensors,
  alertKinds = {},
  simulationDevices = [],
}: {
  scopeLabel: string;
  sites: Site[];
  sensors: DashboardSensorRow[];
  alertKinds?: Record<string, MapEventState>;
  simulationDevices?: SimulationDevice[];
}) {
  const siteSummaries: SiteSummary[] = sites.map((site) => {
    const siteSensors = sensors.filter((row) => row.sensor.siteId === site.id);
    const issues = siteSensors.filter((row) => isIssueSensor(row, alertKinds));
    const thresholdCritical = siteSensors.filter((row) =>
      isCriticalIssue(row, alertKinds)
    ).length;
    const thresholdWarning = siteSensors.filter((row) =>
      isWarningIssue(row, alertKinds)
    ).length;
    const offline = siteSensors.filter(
      (row) => row.status === "offline" || row.status === "inactive"
    ).length;
    const health = resolveSitePinHealth({
      site,
      sensorCount: siteSensors.length,
      thresholdCritical,
      thresholdWarning,
      offline,
    });
    return {
      site,
      sensorCount: siteSensors.length,
      issueCount: issues.length,
      thresholdCritical,
      thresholdWarning,
      offline,
      health,
      topIssues: issues.slice(0, 3),
    };
  });

  const sortedSites = [...siteSummaries].sort((a, b) => {
    const rank = (h: SitePinHealth) =>
      ({ critical: 0, warning: 1, comm_loss: 2, inactive: 3, ok: 4 })[h];
    if (rank(a.health) !== rank(b.health)) {
      return rank(a.health) - rank(b.health);
    }
    if (b.issueCount !== a.issueCount) return b.issueCount - a.issueCount;
    return a.site.name.localeCompare(b.site.name, "ko");
  });

  const issueSensors = sensors.filter((row) => isIssueSensor(row, alertKinds));
  const siteMarkers: MapMarker[] = siteSummaries.map(({ site, health }) =>
    siteToMapMarker(site, `/site/${site.id}`, { siteHealth: health })
  );
  const sensorMarkers: MapMarker[] = issueSensors
    .map((row) => {
      const disconnected = row.status === "offline" || row.status === "inactive";
      const event = disconnected
        ? undefined
        : (currentReadingEvent(row) ?? alertKinds[row.sensor.deviceId]);
      return sensorRowToMapMarker(row, {
        event,
        href: row.sensor.siteId ? `/site/${row.sensor.siteId}` : undefined,
        sub: `${row.site?.name || ""} · ${issueLabel(row, event)}`,
      });
    })
    .filter((m): m is MapMarker => m != null);

  const issueSiteCount = sortedSites.filter((s) => s.health !== "ok").length;
  const weather = dummyWeatherFor(scopeLabel);
  const [asidePage, setAsidePage] = useState(0);

  const mapPanel = (
    <Panel className="flex h-full min-h-0 flex-col !p-4">
      <div className="mb-3 flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div className="text-lg text-[var(--eh-mist)]">현장 위치</div>
        <PinLegend />
      </div>
      <MapView
        markers={[...siteMarkers, ...sensorMarkers]}
        fill
        className="min-h-0 flex-1 rounded-[18px]"
      />
    </Panel>
  );

  return (
    <div className="grid h-full min-h-0 gap-5 lg:grid-cols-[1.35fr_0.95fr] lg:items-stretch">
      <div className="h-full min-h-0 overflow-visible p-0.5">
        {simulationDevices.length > 0 ? (
          <SimulateAlertForm devices={simulationDevices}>
            {mapPanel}
          </SimulateAlertForm>
        ) : (
          mapPanel
        )}
      </div>

      <div className="flex min-h-0 flex-col gap-3 lg:h-full">
        <div className="flex shrink-0 items-center justify-between gap-2">
          <div className="flex gap-1.5">
            {(
              [
                { id: 0, label: "현황" },
                { id: 1, label: "통계" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setAsidePage(tab.id)}
                className={clsx(
                  "eh-neu-press rounded-xl px-3 py-1.5 text-xs transition",
                  asidePage === tab.id
                    ? "eh-neu-active text-[var(--eh-mist)]"
                    : "text-[var(--eh-fog)] hover:text-[var(--eh-mist)]"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="이전 패널"
              onClick={() => setAsidePage((p) => (p === 0 ? 1 : 0))}
              className="eh-neu-raised-sm eh-neu-press rounded-xl p-1.5 text-[var(--eh-fog)] hover:text-[var(--eh-mist)]"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              aria-label="다음 패널"
              onClick={() => setAsidePage((p) => (p === 0 ? 1 : 0))}
              className="eh-neu-raised-sm eh-neu-press rounded-xl p-1.5 text-[var(--eh-fog)] hover:text-[var(--eh-mist)]"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1">
          <div
            key={asidePage === 0 ? "overview-in" : "overview-out"}
            className={clsx(
              "absolute inset-0 flex flex-col gap-3 transition-[opacity,transform] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
              asidePage === 0
                ? "z-10 translate-x-0 opacity-100"
                : "pointer-events-none z-0 -translate-x-2 opacity-0"
            )}
          >
            <div className="eh-stagger grid shrink-0 grid-cols-2 gap-3">
              <StatCard label="보유 현장" value={sites.length} />
              <StatCard label="이슈 현장" value={issueSiteCount} tone="warn" />
              <StatCard
                label="임계 초과 센서"
                value={
                  issueSensors.filter(
                    (r) => r.status === "warning" || r.status === "critical"
                  ).length
                }
                tone="crit"
              />
              <StatCard
                label="오프/비활성"
                value={
                  issueSensors.filter(
                    (r) => r.status === "offline" || r.status === "inactive"
                  ).length
                }
                tone="off"
              />
            </div>

            <div
              className="animate-rise shrink-0"
              style={{ animationDelay: "180ms" }}
            >
              <WeatherCard weather={weather} />
            </div>

            <div
              className="animate-rise flex min-h-0 flex-1 flex-col"
              style={{ animationDelay: "260ms" }}
            >
              <Panel className="flex min-h-0 flex-1 flex-col !p-4">
                <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
                  <div className="text-lg text-[var(--eh-mist)]">현장 목록</div>
                  <span className="text-xs text-[var(--eh-fog)]">
                    선택 시 현장 상세
                  </span>
                </div>
                <div className="eh-scroll min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain py-0.5 pr-1">
                  {sortedSites.map(
                    ({
                      site,
                      sensorCount,
                      thresholdCritical,
                      thresholdWarning,
                      offline,
                      health,
                      topIssues,
                    }) => (
                      <Link
                        key={site.id}
                        href={`/site/${site.id}`}
                        className="eh-neu-raised-sm block rounded-2xl px-3.5 py-3 transition hover:text-[var(--eh-mist)]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                                style={commLossDotStyle(health)}
                              />
                              <div className="truncate text-sm text-[var(--eh-mist)]">
                                {site.name}
                              </div>
                            </div>
                            <div className="mt-0.5 text-xs text-[var(--eh-fog)]">
                              {site.code} · 센서 {sensorCount}대
                            </div>
                            {topIssues.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {topIssues.map((row) => (
                                  <span
                                    key={row.sensor.deviceId}
                                    className="eh-neu-inset inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] text-[var(--eh-mist)]"
                                  >
                                    <StatusDot status={row.status} />
                                    {row.sensor.label}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="shrink-0 text-right">
                            <Badge tone={healthBadgeTone(health)}>
                              {healthLabel(health)}
                            </Badge>
                            {(thresholdCritical > 0 ||
                              thresholdWarning > 0 ||
                              offline > 0) && (
                              <div className="mt-1 text-[11px] text-[var(--eh-fog)]">
                                {[
                                  thresholdCritical > 0
                                    ? `위험 ${thresholdCritical}`
                                    : null,
                                  thresholdWarning > 0
                                    ? `주의 ${thresholdWarning}`
                                    : null,
                                  offline > 0 ? `오프 ${offline}` : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </div>
                            )}
                          </div>
                        </div>
                      </Link>
                    )
                  )}
                  {!sortedSites.length && (
                    <div className="py-8 text-center text-sm text-[var(--eh-fog)]">
                      표시할 현장이 없습니다.
                    </div>
                  )}
                </div>
              </Panel>
            </div>
          </div>

          <div
            className={clsx(
              "absolute inset-0 transition-[opacity,transform] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
              asidePage === 1
                ? "z-10 translate-x-0 opacity-100"
                : "pointer-events-none z-0 translate-x-2 opacity-0"
            )}
          >
            <CompanyStatsPanel
              scopeLabel={scopeLabel}
              animateKey={asidePage === 1 ? "in" : "out"}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function WeatherCard({
  weather,
}: {
  weather: {
    condition: string;
    tempC: number;
    humidity: number;
    windMs: number;
    precipChance: number;
    forecast: Array<{
      label: string;
      condition: string;
      highC: number;
      lowC: number;
    }>;
  };
}) {
  return (
    <Panel className="shrink-0 !p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-lg text-[var(--eh-mist)]">날씨</div>
        <span className="text-[11px] text-[var(--eh-fog)]">더미 데이터</span>
      </div>
      <div className="grid grid-cols-3 items-center gap-3">
        <div className="flex justify-center">
          <div className="eh-neu-raised-sm flex h-28 w-28 items-center justify-center rounded-[28px] text-[var(--eh-signal)]">
            <CloudSun size={64} strokeWidth={1.45} />
          </div>
        </div>
        <div className="min-w-0 text-center">
          <div className="eh-display text-4xl font-semibold leading-none text-[var(--eh-mist)]">
            {weather.tempC}
            <span className="ml-1 text-xl font-medium text-[var(--eh-fog)]">
              °C
            </span>
          </div>
          <div className="mt-2 text-base text-[var(--eh-mist)]">
            오늘 · {weather.condition}
          </div>
        </div>
        <div className="grid min-w-0 gap-1.5 text-xs text-[var(--eh-fog)]">
          <div className="eh-neu-inset flex w-full items-center gap-2 rounded-2xl px-3 py-2">
            <CloudRain size={14} className="shrink-0" />
            <span className="truncate">강수 {weather.precipChance}%</span>
          </div>
          <div className="eh-neu-inset flex w-full items-center gap-2 rounded-2xl px-3 py-2">
            <Droplets size={14} className="shrink-0" />
            <span className="truncate">습도 {weather.humidity}%</span>
          </div>
          <div className="eh-neu-inset flex w-full items-center gap-2 rounded-2xl px-3 py-2">
            <Wind size={14} className="shrink-0" />
            <span className="truncate">풍속 {weather.windMs} m/s</span>
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-[var(--eh-line)] pt-3">
        {weather.forecast.map((day) => (
          <div
            key={day.label}
            className="eh-neu-inset rounded-2xl px-2 py-2 text-center"
          >
            <div className="text-[11px] text-[var(--eh-fog)]">{day.label}</div>
            <div className="mt-1 text-xs text-[var(--eh-mist)]">
              {day.condition}
            </div>
            <div className="mt-1 text-xs text-[var(--eh-mist)]">
              {day.highC}°
              <span className="text-[var(--eh-fog)]"> / {day.lowC}°</span>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function PinLegend() {
  const items: Array<{ health: SitePinHealth; label: string }> = [
    { health: "ok", label: "정상" },
    { health: "warning", label: "주의" },
    { health: "critical", label: "위험" },
    { health: "inactive", label: "미운영" },
    { health: "comm_loss", label: "통신두절" },
  ];
  return (
    <div className="flex flex-wrap gap-2 text-[11px] text-[var(--eh-fog)]">
      {items.map((item) => (
        <span key={item.health} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={commLossDotStyle(item.health)}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "warn" | "crit" | "off";
}) {
  const valueClass =
    tone === "crit"
      ? "text-[var(--eh-alert)]"
      : tone === "warn"
        ? "text-[var(--eh-warn)]"
        : tone === "off"
          ? "text-[var(--eh-fog)]"
          : "text-[var(--eh-mist)]";
  return (
    <Panel className="!p-3.5">
      <div className="text-xs text-[var(--eh-fog)]">{label}</div>
      <div className={`eh-display mt-1 text-2xl ${valueClass}`}>{value}</div>
    </Panel>
  );
}

export function resolveSitePinHealth({
  site,
  sensorCount,
  thresholdCritical,
  thresholdWarning,
  offline,
}: {
  site: Site;
  sensorCount: number;
  thresholdCritical: number;
  thresholdWarning: number;
  offline: number;
}): SitePinHealth {
  if (site.status === "paused" || site.status === "closed") return "inactive";
  if (thresholdCritical > 0) return "critical";
  if (sensorCount > 0 && offline / sensorCount > 0.5) return "comm_loss";
  if (thresholdWarning > 0 || offline > 0) return "warning";
  return "ok";
}

function isIssueSensor(
  row: DashboardSensorRow,
  alertKinds: Record<string, MapEventState>
) {
  if (
    row.status === "warning" ||
    row.status === "critical" ||
    row.status === "offline" ||
    row.status === "inactive"
  ) {
    return true;
  }
  return Boolean(currentReadingEvent(row) || alertKinds[row.sensor.deviceId]);
}

function isCriticalIssue(
  row: DashboardSensorRow,
  alertKinds: Record<string, MapEventState>
) {
  if (row.status === "critical") return true;
  const event = currentReadingEvent(row) ?? alertKinds[row.sensor.deviceId];
  return event?.level === "critical";
}

function isWarningIssue(
  row: DashboardSensorRow,
  alertKinds: Record<string, MapEventState>
) {
  if (isCriticalIssue(row, alertKinds)) return false;
  if (row.status === "warning") return true;
  const event = currentReadingEvent(row) ?? alertKinds[row.sensor.deviceId];
  return event?.level === "warning";
}

function issueLabel(row: DashboardSensorRow, event?: MapEventState) {
  if (row.status === "offline") return "오프라인";
  if (row.status === "inactive") return "비활성";
  if (event?.kind === "tilt") return "각도 초과";
  if (event?.kind === "battery") return "배터리";
  if (event?.kind === "temp") return "온도";
  if (row.status === "critical") return "경고";
  if (row.status === "warning") return "주의";
  return "이슈";
}

function healthColor(health: SitePinHealth) {
  switch (health) {
    case "ok":
      return "#34d399";
    case "warning":
      return "#fbbf24";
    case "critical":
      return "#f87171";
    case "inactive":
      return "#8b95a8";
    case "comm_loss":
      return "#64748b";
    default:
      return "#8b95a8";
  }
}

function healthLabel(health: SitePinHealth) {
  switch (health) {
    case "ok":
      return "정상";
    case "warning":
      return "주의";
    case "critical":
      return "위험";
    case "inactive":
      return "미운영";
    case "comm_loss":
      return "통신 두절";
  }
}

function healthBadgeTone(
  health: SitePinHealth
): "ok" | "warn" | "crit" | "off" | "neutral" {
  switch (health) {
    case "ok":
      return "ok";
    case "warning":
      return "warn";
    case "critical":
      return "crit";
    case "inactive":
    case "comm_loss":
      return "off";
  }
}

function dummyWeatherFor(scopeLabel: string) {
  // 지역/회사명에 따라 안정적으로 같은 더미값을 보여 준다.
  let hash = 0;
  for (let i = 0; i < scopeLabel.length; i++) {
    hash = (hash * 31 + scopeLabel.charCodeAt(i)) % 997;
  }
  const conditions = ["맑음", "구름 조금", "흐림", "약한 비"] as const;
  const condition = conditions[hash % conditions.length];
  const tempC = 18 + (hash % 12);
  const humidity = 42 + (hash % 35);
  const windMs = 1 + (hash % 6);
  const precipChance = 5 + (hash % 55);
  const forecast = [
    {
      label: "내일",
      condition: conditions[(hash + 1) % conditions.length],
      highC: tempC + 1,
      lowC: tempC - 4,
    },
    {
      label: "모레",
      condition: conditions[(hash + 2) % conditions.length],
      highC: tempC - 1,
      lowC: tempC - 5,
    },
    {
      label: "3일 후",
      condition: conditions[(hash + 3) % conditions.length],
      highC: tempC + 2,
      lowC: tempC - 3,
    },
  ];
  return {
    condition,
    tempC,
    humidity,
    windMs,
    precipChance,
    forecast,
  };
}

function commLossDotStyle(health: SitePinHealth): CSSProperties {
  if (health === "comm_loss") {
    return {
      background: "#64748b",
      boxShadow: "0 0 0 2px rgba(148,163,184,.45)",
    };
  }
  return {
    background: healthColor(health),
    boxShadow:
      health === "critical" ? "0 0 0 3px rgba(248,113,113,.35)" : undefined,
  };
}
