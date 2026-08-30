import { redirect } from "next/navigation";
import clsx from "clsx";
import { getSession } from "@/lib/auth";
import { readStore } from "@/lib/store";
import { AppShell } from "@/app/components/AppShell";
import { Badge, Panel, StatusDot } from "@/app/components/ui";
import { SensorTrackingMap } from "@/app/components/SensorTrackingMap";
import { SensorHistoryView } from "@/app/components/SensorHistoryView";
import {
  AdminAllSensorsBoard,
  type AdminSensorRow,
} from "@/app/components/CompanySensorsBoard";
import {
  buildSensorRows,
  sensorRowToMapMarker,
  siteToMapMarker,
} from "@/lib/dashboard";
import {
  getDeviceLocationTrail,
  getReadingsForDevices,
  getUnlockEvents,
} from "@/lib/ingest";
import { adminNav } from "@/lib/nav";
import { SensorControlPanel } from "@/app/components/SensorControlPanel";
import { fetchDeviceRuntime } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { listSensorOps } from "@/lib/sensorOps";

const TRAIL_DAYS = 3;

export default async function AdminSensorsPage({
  searchParams,
}: {
  searchParams: Promise<{ device?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");

  const { device } = await searchParams;
  const store = await readStore();
  const rows = await buildSensorRows(store.sites);
  const opsEntries = await listSensorOps();
  const repairCount = opsEntries.filter(
    (e) => e.status === "repair_request"
  ).length;

  const adminRows: AdminSensorRow[] = rows.map((row) => {
    const site = row.site;
    const company = site
      ? store.companies.find((c) => c.id === site.companyId)
      : null;
    return {
      ...row,
      companyId: company?.id ?? site?.companyId ?? "",
      companyName: company?.name ?? "-",
    };
  });

  const focused = device
    ? rows.find((r) => r.sensor.deviceId === device)
    : null;
  const history = focused
    ? (
        await getReadingsForDevices([focused.sensor.deviceId], 80)
      ).history.slice(0, 80)
    : [];
  const trail = focused
    ? await getDeviceLocationTrail(focused.sensor.deviceId, TRAIL_DAYS)
    : [];
  const unlockEvents = focused
    ? await getUnlockEvents(focused.sensor.deviceId, 100)
    : [];
  const runtime = focused
    ? await fetchDeviceRuntime(focused.sensor.deviceId)
    : null;
  const control = {
    run: hasPermission(user, "control_sensor_run"),
    config: hasPermission(user, "control_sensor_config"),
    threshold: hasPermission(user, "control_sensor_threshold"),
    origin: hasPermission(user, "control_sensor_origin"),
  };
  const canControl = Object.values(control).some(Boolean);

  return (
    <AppShell user={user} title="센서관리" nav={adminNav} allowScroll>
      <div className="space-y-5">
        {repairCount > 0 && (
          <Panel className="!border-l-2 !border-l-[var(--eh-alert)] !p-3.5">
            <div className="text-sm text-[var(--eh-mist)]">
              수리요청 {repairCount}건
            </div>
            <p className="mt-0.5 text-xs text-[var(--eh-fog)]">
              건설사에서 요청한 장비가 있습니다. 아래 목록에서 확인하거나 알림
              벨을 확인하세요.
            </p>
          </Panel>
        )}

        <AdminAllSensorsBoard rows={adminRows} />

        <Panel>
          <div className="mb-3 text-lg text-[var(--eh-mist)]">위치 추적</div>
          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            <SensorTrackingMap
              markers={[
                ...store.sites.map((s) => siteToMapMarker(s, `/site/${s.id}`)),
                ...rows
                  .map((r) =>
                    sensorRowToMapMarker(r, {
                      href: `/admin/sensors?device=${r.sensor.deviceId}`,
                      sub: `${r.sensor.deviceId} · 배터리 ${r.latest?.batteryPercent ?? "-"}%`,
                    })
                  )
                  .filter((m): m is NonNullable<typeof m> => m != null),
              ]}
              trail={trail.map((p) => ({ lat: p.lat, lon: p.lon }))}
              trailDays={TRAIL_DAYS}
              focusId={focused?.sensor.deviceId}
              focusLabel={focused?.sensor.label}
              height={420}
            />
            <div>
              <div className="mb-2 text-sm text-[var(--eh-fog)]">
                장비를 선택하면 추적·상세가 아래에 표시됩니다.
              </div>
              <div className="eh-scroll mt-2 max-h-[420px] space-y-2 overflow-y-auto overscroll-contain pr-0.5">
                {rows.map((r) => (
                  <a
                    key={r.sensor.id}
                    href={`/admin/sensors?device=${r.sensor.deviceId}`}
                    className={clsx(
                      "eh-neu-raised-sm block rounded-2xl px-3 py-2.5 transition",
                      focused?.sensor.deviceId === r.sensor.deviceId &&
                        "eh-neu-active"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <StatusDot status={r.status} />
                      <span className="text-sm text-[var(--eh-mist)]">
                        {r.sensor.label}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-[var(--eh-fog)]">
                      {r.sensor.deviceId} · {r.site?.name}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge tone="neutral">mode {r.sensor.mode}</Badge>
                      <Badge tone="neutral">
                        bat {r.latest?.batteryPercent ?? "-"}%
                      </Badge>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </Panel>

        {focused && (
          <div
            className={clsx(
              "grid gap-5",
              canControl && "xl:grid-cols-[minmax(0,1fr)_340px]"
            )}
          >
            <Panel>
              <div className="mb-3 text-lg text-[var(--eh-mist)]">
                {focused.sensor.label} 상세
              </div>
              <div className="mb-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <div className="text-xs text-[var(--eh-fog)]">Device ID</div>
                  <div>{focused.sensor.deviceId}</div>
                </div>
                <div>
                  <div className="text-xs text-[var(--eh-fog)]">설정 간격</div>
                  <div>{focused.sensor.modeIntervalSec}s</div>
                </div>
                <div>
                  <div className="text-xs text-[var(--eh-fog)]">임계값</div>
                  <div>
                    accel {focused.sensor.thresholdAccel} / temp{" "}
                    {focused.sensor.thresholdTempC}°C / bat{" "}
                    {focused.sensor.thresholdBattery}%
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[var(--eh-fog)]">위치</div>
                  <div>
                    {focused.latest
                      ? `${focused.latest.lat.toFixed(5)}, ${focused.latest.lon.toFixed(5)}`
                      : "-"}
                  </div>
                </div>
              </div>
              <SensorHistoryView
                history={history.map((h) => ({
                  id: h.id,
                  ts: h.ts,
                  x: h.x,
                  y: h.y,
                  z: h.z,
                  batteryPercent: h.batteryPercent,
                  temperatureC: h.temperatureC,
                }))}
                showUnlockMarkers
                unlockEvents={unlockEvents}
              />
            </Panel>

            {canControl && (
              <SensorControlPanel
                className="xl:sticky xl:top-3 xl:self-start"
                deviceId={focused.sensor.deviceId}
                sensorLabel={focused.sensor.label}
                canRun={control.run}
                canConfig={control.config}
                canThreshold={control.threshold}
                canOrigin={control.origin}
                blackboxLocked={runtime?.blackboxLocked}
                holdActive={runtime?.holdActive}
                initialStatus={focused.status}
                safetyLock
              />
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
