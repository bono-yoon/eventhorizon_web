import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { readStore } from "@/lib/store";
import { AppShell } from "@/app/components/AppShell";
import { Panel } from "@/app/components/ui";
import { AdminSensorDetailView } from "@/app/components/AdminSensorDetailView";
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
import { shellNav } from "@/lib/nav";
import { fetchAllSensorsFromDb, fetchDeviceRuntime } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { listSensorOps } from "@/lib/sensorOps";
import { getSensorDeployment } from "@/lib/sensorDeployment";

const TRAIL_DAYS = 14;

export default async function AdminSensorsPage({
  searchParams,
}: {
  searchParams: Promise<{ device?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  const allowed =
    user.role === "admin" ||
    user.role === "field_worker" ||
    hasPermission(user, "manage_sensor_deployment");
  if (!allowed) redirect("/");

  const { device } = await searchParams;
  const store = await readStore();
  const rows = await buildSensorRows(store.sites);
  const opsEntries = await listSensorOps();
  const repairCount = opsEntries.filter(
    (e) => e.status === "repair_request"
  ).length;
  const returnCount = opsEntries.filter(
    (e) => e.status === "return_request"
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

  const seen = new Set(adminRows.map((r) => r.sensor.deviceId));
  const allSensors = (await fetchAllSensorsFromDb()) || [];
  for (const sensor of allSensors) {
    if (seen.has(sensor.deviceId)) continue;
    const unassigned =
      sensor.status === "inventory" ||
      sensor.status === "recovered" ||
      sensor.siteId == null;
    if (!unassigned) continue;
    const site = sensor.siteId
      ? store.sites.find((s) => s.id === sensor.siteId)
      : undefined;
    const company = site
      ? store.companies.find((c) => c.id === site.companyId)
      : undefined;
    adminRows.push({
      sensor,
      site,
      status: "inactive",
      companyId: company?.id ?? site?.companyId ?? "",
      companyName: company?.name ?? "-",
    });
  }

  const focused = device
    ? rows.find((r) => r.sensor.deviceId === device)
    : null;

  if (device && !focused) redirect("/admin/sensors");

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
  const deployment = focused
    ? await getSensorDeployment(focused.sensor.deviceId)
    : null;
  const control = {
    run: hasPermission(user, "control_sensor_run"),
    config: hasPermission(user, "control_sensor_config"),
    threshold: hasPermission(user, "control_sensor_threshold"),
    origin: hasPermission(user, "control_sensor_origin"),
  };
  const canControl = Object.values(control).some(Boolean);
  const canDeploy =
    user.role === "admin" ||
    hasPermission(user, "manage_sensor_deployment");
  const canDismantle =
    user.role === "admin" || user.role === "field_worker";

  const nav = shellNav(user);

  return (
    <AppShell user={user} title="센서관리" nav={nav} allowScroll>
      <div className="space-y-5">
        {(repairCount > 0 || returnCount > 0) &&
          !focused &&
          user.role === "admin" && (
          <Panel className="!border-l-2 !border-l-[var(--eh-alert)] !p-3.5">
            <div className="text-sm text-[var(--eh-mist)]">
              {repairCount > 0 ? `수리요청 ${repairCount}건` : ""}
              {repairCount > 0 && returnCount > 0 ? " · " : ""}
              {returnCount > 0 ? `반납요청 ${returnCount}건` : ""}
            </div>
            <p className="mt-0.5 text-xs text-[var(--eh-fog)]">
              건설사·현장에서 요청한 건입니다. 수리진행 또는 반납완료(재고)로
              처리하세요.
            </p>
          </Panel>
        )}

        {!focused ? (
          <AdminAllSensorsBoard
            rows={adminRows}
            companies={store.companies.map((c) => ({ id: c.id, name: c.name }))}
            sites={store.sites.map((s) => ({
              id: s.id,
              name: s.name,
              companyId: s.companyId,
            }))}
          />
        ) : (
          <AdminSensorDetailView
            deviceId={focused.sensor.deviceId}
            label={focused.sensor.label}
            siteName={focused.site?.name ?? null}
            siteId={focused.site?.id ?? focused.sensor.siteId ?? null}
            mode={focused.sensor.mode}
            batteryPercent={focused.latest?.batteryPercent ?? null}
            markers={[
              ...(focused.site
                ? [siteToMapMarker(focused.site, `/site/${focused.site.id}`)]
                : []),
              ...(() => {
                const m = sensorRowToMapMarker(focused, {
                  sub: `${focused.sensor.deviceId} · 배터리 ${focused.latest?.batteryPercent ?? "-"}%`,
                });
                return m ? [m] : [];
              })(),
            ]}
            trail={trail.map((p) => ({
              lat: p.lat,
              lon: p.lon,
              ts: p.ts,
            }))}
            trailDays={TRAIL_DAYS}
            focusId={focused.sensor.deviceId}
            history={history.map((h) => ({
              id: h.id,
              ts: h.ts,
              x: h.x,
              y: h.y,
              z: h.z,
              batteryPercent: h.batteryPercent,
              temperatureC: h.temperatureC,
            }))}
            unlockEvents={unlockEvents}
            deployment={
              deployment
                ? {
                    phase: deployment.phase,
                    assignmentPhase: deployment.assignmentPhase,
                    assignmentPhaseLabel: deployment.assignmentPhaseLabel,
                    siteId: deployment.siteId,
                  }
                : null
            }
            canControl={canControl}
            canDeploy={canDeploy}
            canDismantle={canDismantle}
            control={control}
            runtime={runtime}
            initialStatus={focused.status}
          />
        )}
      </div>
    </AppShell>
  );
}
