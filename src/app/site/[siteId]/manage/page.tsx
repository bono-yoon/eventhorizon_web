import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { readStore } from "@/lib/store";
import { canAccessSite, hasPermission } from "@/lib/permissions";
import { AppShell } from "@/app/components/AppShell";
import { Panel } from "@/app/components/ui";
import { shellNav } from "@/lib/nav";
import { SiteManageForm } from "@/app/components/SiteManageForm";
import { RegisterSensorForm } from "@/app/components/RegisterSensorForm";

export default async function SiteManagePage({
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
  if (!canAccessSite(user, site)) redirect(`/company/${site.companyId}/sites`);

  const canManage =
    user.role === "admin" ||
    user.role === "company" ||
    user.role === "site_manager" ||
    hasPermission(user, "manage_sites");

  if (!canManage) redirect(`/site/${siteId}`);

  return (
    <AppShell
      user={user}
      title="현장 관리"
      nav={shellNav(user, site.companyId)}
      breadcrumbs={[
        { href: `/company/${site.companyId}`, label: "건설사" },
        { href: `/site/${siteId}`, label: site.name },
        { label: "관리" },
      ]}
     allowScroll>
      <div className="grid gap-5 lg:grid-cols-2">
        <SiteManageForm site={site} />
        <RegisterSensorForm siteId={siteId} />
      </div>
      <Panel className="mt-5">
        <div className="mb-2 text-lg text-[var(--eh-mist)]">기본 업무</div>
        <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--eh-fog)]">
          <li>현장 상태(진행/일시중지/종료) 변경</li>
          <li>센서 등록 및 임계값/모드 설정</li>
          <li>건설사 대시보드로 복귀 후 권한에 따라 다른 현장 이동</li>
          <li>임계값 초과 알림은 건설사·현장소장에게 MQTT 전달</li>
        </ul>
      </Panel>
    </AppShell>
  );
}
