import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { readStore } from "@/lib/store";
import {
  accessibleSites,
  canAccessCompany,
  hasPermission,
} from "@/lib/permissions";
import { AppShell } from "@/app/components/AppShell";
import { CompanySitesBoard } from "@/app/components/CompanySitesBoard";
import { shellNav } from "@/lib/nav";
import { listUsers } from "@/lib/users";

export default async function CompanySitesPage({
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
  const users = await listUsers();

  const sites = accessibleSites(
    user,
    store.sites.filter((s) => s.companyId === companyId)
  );
  const canCreate =
    user.role === "admin" ||
    user.role === "company" ||
    hasPermission(user, "manage_sites");

  return (
    <AppShell
      user={user}
      title="현장관리"
      nav={shellNav(user, companyId)}
      breadcrumbs={[
        { href: `/company/${companyId}`, label: company.name },
        { label: "현장관리" },
      ]}
    >
      <CompanySitesBoard
        companyId={companyId}
        canCreate={canCreate}
        managers={users
          .filter((u) => u.companyId === companyId)
          .map((u) => ({ id: u.id, name: u.name }))}
        initialSites={sites.map((s) => ({
          id: s.id,
          name: s.name,
          code: s.code,
          address: s.address,
          status: s.status,
          sensorCount: store.sensors.filter((x) => x.siteId === s.id).length,
          lat: s.lat,
          lon: s.lon,
        }))}
      />
    </AppShell>
  );
}
