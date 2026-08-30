import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { readStore } from "@/lib/store";
import { canAccessCompany, hasPermission } from "@/lib/permissions";
import { AppShell } from "@/app/components/AppShell";
import { OrgChartEditor } from "@/app/components/OrgChartEditor";
import { shellNav } from "@/lib/nav";
import { listUsers } from "@/lib/users";
import Link from "next/link";

export default async function CompanyOrgPage({
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

  const canEdit =
    user.role === "admin" ||
    user.role === "company" ||
    hasPermission(user, "manage_org");
  const canManagePermissions =
    user.role === "admin" ||
    user.role === "company" ||
    hasPermission(user, "manage_permissions");

  return (
    <AppShell
      user={user}
      title="조직도"
      nav={shellNav(user, companyId)}
      breadcrumbs={[
        { href: `/company/${companyId}`, label: company.name },
        { label: "조직도" },
      ]}
     allowScroll>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--eh-fog)]">
        <span>
          {canEdit
            ? "조직을 수정할 수 있습니다."
            : "조회만 가능합니다. 수정은 조직도 권한이 있는 계정만 할 수 있습니다."}
        </span>
        {canManagePermissions && (
          <Link
            href={`/company/${companyId}/permissions`}
            className="text-[var(--eh-signal)] hover:underline"
          >
            권한 관리 →
          </Link>
        )}
      </div>
      <OrgChartEditor
        companyId={companyId}
        initialNodes={store.orgNodes.filter((n) => n.companyId === companyId)}
        users={users
          .filter((u) => u.companyId === companyId)
          .map((u) => {
            const { passwordHash, ...rest } = u;
            void passwordHash;
            return rest;
          })}
        canEdit={canEdit}
      />
    </AppShell>
  );
}
