import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { readStore } from "@/lib/store";
import { canAccessSite, hasPermission } from "@/lib/permissions";
import { AppShell } from "@/app/components/AppShell";
import { SiteOverview } from "@/app/components/SiteOverview";
import {
  buildSensorRows,
  webAlertsToDashboardEvents,
} from "@/lib/dashboard";
import { shellNav } from "@/lib/nav";
import { listActiveMapAlerts, listInboxForUser } from "@/lib/alertEngine";

export default async function SiteDashboardPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  const user = await getSession();
  if (!user) redirect("/login");

  const store = await readStore();
  const site = store.sites.find((s) => s.id === siteId);
  if (!site) notFound();
  if (!canAccessSite(user, site)) {
    if (user.companyId) redirect(`/company/${user.companyId}`);
    redirect("/");
  }

  const sensorRows = await buildSensorRows([site]);
  const alertKinds = await listActiveMapAlerts(user, [siteId]);
  const alerts = webAlertsToDashboardEvents(await listInboxForUser(user), [
    siteId,
  ]);

  const canSimulate =
    user.role === "site_manager" ||
    user.role === "company" ||
    user.role === "admin";

  const simulationDevices = canSimulate
    ? store.sensors
        .filter((s) => s.siteId === siteId)
        .map((s) => ({
          deviceId: s.deviceId,
          label: s.label,
          thresholdTiltDeg: s.thresholdTiltDeg,
          thresholdTempC: s.thresholdTempC,
          thresholdBattery: s.thresholdBattery,
        }))
    : [];

  const control = {
    run: hasPermission(user, "control_sensor_run"),
    config: hasPermission(user, "control_sensor_config"),
    threshold: hasPermission(user, "control_sensor_threshold"),
    origin: hasPermission(user, "control_sensor_origin"),
  };

  return (
    <AppShell
      user={user}
      title={site.name}
      nav={shellNav(user, site.companyId)}
      breadcrumbs={[
        {
          href: `/company/${site.companyId}`,
          label:
            store.companies.find((c) => c.id === site.companyId)?.name ||
            "건설사",
        },
        { label: site.name },
      ]}
    >
      <SiteOverview
        site={site}
        sensors={sensorRows}
        alerts={alerts}
        alertKinds={alertKinds}
        simulationDevices={simulationDevices}
        control={control}
      />
    </AppShell>
  );
}
