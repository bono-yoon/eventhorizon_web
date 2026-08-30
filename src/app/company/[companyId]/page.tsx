import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { readStore } from "@/lib/store";
import { accessibleSites, canAccessCompany } from "@/lib/permissions";
import { AppShell } from "@/app/components/AppShell";
import { CompanyOverview } from "@/app/components/CompanyOverview";
import { buildSensorRows } from "@/lib/dashboard";
import { shellNav } from "@/lib/nav";
import { listActiveMapAlerts } from "@/lib/alertEngine";
import Link from "next/link";

export default async function CompanyDashboardPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const user = await getSession();
  if (!user) redirect("/login");
  if (!canAccessCompany(user, companyId)) redirect("/");

  const store = await readStore();
  const company = store.companies.find((c) => c.id === companyId);
  if (!company) notFound();

  const sites = accessibleSites(
    user,
    store.sites.filter((s) => s.companyId === companyId)
  );

  const sensorRows = await buildSensorRows(sites);
  const alertKinds = await listActiveMapAlerts(
    user,
    sites.map((site) => site.id)
  );

  const canSimulate =
    user.role === "company" ||
    user.role === "admin" ||
    user.role === "site_manager";

  const simulationDevices = canSimulate
    ? store.sensors
        .filter((s) => sites.some((site) => site.id === s.siteId))
        .map((s) => ({
          deviceId: s.deviceId,
          label: s.label,
          thresholdAccel: s.thresholdAccel,
          thresholdTempC: s.thresholdTempC,
          thresholdBattery: s.thresholdBattery,
        }))
    : [];

  return (
    <AppShell
      user={user}
      title={company.name}
      nav={shellNav(user, companyId)}
    >
      <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="min-h-0 flex-1">
          <CompanyOverview
            scopeLabel={company.name}
            sites={sites}
            sensors={sensorRows}
            alertKinds={alertKinds}
            simulationDevices={simulationDevices}
          />
        </div>
        {user.role === "admin" && (
          <p className="shrink-0 text-xs text-[var(--eh-fog)]">
            <Link
              href="/admin/logs"
              className="text-[var(--eh-signal)] hover:underline"
            >
              사용 로그
            </Link>
            {" · "}
            <Link
              href="/admin/inventory"
              className="text-[var(--eh-signal)] hover:underline"
            >
              재고·배정
            </Link>
          </p>
        )}
      </div>
    </AppShell>
  );
}
