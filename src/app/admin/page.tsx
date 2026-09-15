import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { readStore } from "@/lib/store";
import { AppShell } from "@/app/components/AppShell";
import { Badge, Panel } from "@/app/components/ui";
import { MapView } from "@/app/components/MapView";
import { SimulateAlertForm } from "@/app/components/SimulateAlertForm";
import {
  buildSensorRows,
} from "@/lib/dashboard";
import {
  currentReadingEvent,
  sensorRowToMapMarker,
  siteToMapMarker,
} from "@/lib/mapMarkers";
import { getDbHealth } from "@/lib/ingest";
import { dbEnabled } from "@/lib/db";
import Link from "next/link";
import { adminNav } from "@/lib/nav";
import { listActiveMapAlerts } from "@/lib/alertEngine";

export default async function AdminPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");

  const store = await readStore();
  const sensorRows = await buildSensorRows(store.sites);
  const alertKinds = await listActiveMapAlerts(
    user,
    store.sites.map((site) => site.id)
  );
  const health = await getDbHealth();

  return (
    <AppShell user={user} title="시스템 관제" nav={adminNav}>
      <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-2 text-sm">
        <Badge tone={dbEnabled() && health.ok ? "ok" : "warn"}>
          ingest DB {dbEnabled() ? (health.ok ? "연결됨" : `오류: ${health.message}`) : "비활성"}
        </Badge>
        <span className="text-xs text-[var(--eh-fog)]">
          현장·센서·로그는 eventhorizon MariaDB 기준 ·{" "}
          <Link href="/admin/inventory" className="text-[var(--eh-signal)] underline">
            재고·현장 배정
          </Link>
          {" · "}
          <Link href="/admin/logs" className="text-[var(--eh-signal)] underline">
            사용 로그
          </Link>
        </span>
      </div>
      <div className="grid shrink-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "건설사", value: store.companies.length },
          { label: "현장", value: store.sites.length },
          { label: "센서", value: store.sensors.length },
          { label: "미확인 알림", value: store.alerts.filter((a) => !a.acknowledged).length },
        ].map((c) => (
          <Panel key={c.label} className="!p-3.5">
            <div className="text-xs text-[var(--eh-fog)]">{c.label}</div>
            <div className="eh-display mt-1 text-2xl text-[var(--eh-mist)]">{c.value}</div>
          </Panel>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 gap-4 overflow-hidden lg:grid-cols-[1.3fr_0.9fr]">
        <div className="min-h-0">
          <SimulateAlertForm
            devices={store.sensors.map((s) => ({
              deviceId: s.deviceId,
              label: s.label,
              thresholdTiltDeg: s.thresholdTiltDeg,
              thresholdTempC: s.thresholdTempC,
              thresholdBattery: s.thresholdBattery,
            }))}
          >
            <Panel className="flex h-full min-h-0 flex-col !p-4">
              <div className="mb-3 shrink-0 text-lg text-[var(--eh-mist)]">전체 센서 위치</div>
              <MapView
                fill
                className="min-h-0 flex-1"
                markers={[
                  ...store.sites.map((s) => siteToMapMarker(s, `/site/${s.id}`)),
                  ...sensorRows
                    .map((r) => {
                      const disconnected =
                        r.status === "offline" || r.status === "inactive";
                      const event = disconnected
                        ? undefined
                        : (currentReadingEvent(r) ?? alertKinds[r.sensor.deviceId]);
                      const eventText =
                        event?.kind === "tilt"
                          ? "기울기 임계 초과"
                          : event?.kind === "battery"
                            ? "배터리 부족"
                            : event?.kind === "temp"
                              ? "온도 임계 초과"
                              : "임계값 초과";
                      return sensorRowToMapMarker(r, {
                        event,
                        href: `/admin/sensors?device=${r.sensor.deviceId}`,
                        sub: event
                          ? `${r.site?.name || ""} · ${eventText}`
                          : r.site?.name,
                      });
                    })
                    .filter((m): m is NonNullable<typeof m> => m != null),
                ]}
              />
            </Panel>
          </SimulateAlertForm>
        </div>
        <div className="eh-scroll min-h-0 space-y-4 overflow-y-auto overscroll-contain">
          <Panel>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-lg text-[var(--eh-mist)]">건설사</div>
              <Link href="/admin/sites" className="text-xs text-[var(--eh-signal)]">
                현장 관리 →
              </Link>
            </div>
            {store.companies.map((c) => (
              <Link
                key={c.id}
                href={`/company/${c.id}`}
                className="eh-neu-raised-sm mb-2 block rounded-2xl px-3 py-2.5 hover:text-[var(--eh-mist)]"
              >
                <div className="text-sm text-[var(--eh-mist)]">{c.name}</div>
                <div className="text-xs text-[var(--eh-fog)]">{c.code}</div>
              </Link>
            ))}
          </Panel>
        </div>
      </div>
      </div>
    </AppShell>
  );
}
