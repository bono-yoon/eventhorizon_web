import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { readStore } from "@/lib/store";
import { accessibleSites, canAccessCompany } from "@/lib/permissions";
import { AppShell } from "@/app/components/AppShell";
import { CompanySensorsBoard } from "@/app/components/CompanySensorsBoard";
import { buildSensorRows } from "@/lib/dashboard";
import { shellNav } from "@/lib/nav";

export default async function CompanySensorsPage({
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
  const canEditOps =
    user.role === "site_manager" ||
    user.role === "employee" ||
    user.role === "admin";

  return (
    <AppShell
      user={user}
      title="센서관리"
      nav={shellNav(user, companyId)}
      breadcrumbs={[
        { href: `/company/${companyId}`, label: company.name },
        { label: "센서관리" },
      ]}
    >
      <CompanySensorsBoard
        companyId={companyId}
        companyName={company.name}
        sensors={sensorRows}
        canEditOps={canEditOps}
      />
    </AppShell>
  );
}
