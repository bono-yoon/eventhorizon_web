import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { readStore } from "@/lib/store";
import {
  accessibleSites,
  canAccessCompany,
  canManageSites,
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
  // 서비스 본사 현장작업자: 현장 운영(일시중지/종료) 대상 아님
  if (user.role === "field_worker") redirect("/admin/sensors");

  const store = await readStore();
  const company = store.companies.find((c) => c.id === companyId);
  if (!company) notFound();
  const users = await listUsers();

  const sites = accessibleSites(
    user,
    store.sites.filter((s) => s.companyId === companyId)
  );
  const canManage = canManageSites(user);

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
        canCreate={canManage}
        canManageStatus={canManage}
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
