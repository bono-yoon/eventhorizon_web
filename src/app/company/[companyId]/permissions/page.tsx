import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { readStore } from "@/lib/store";
import { canAccessCompany, hasPermission } from "@/lib/permissions";
import { AppShell } from "@/app/components/AppShell";
import { PermissionsBoard } from "@/app/components/PermissionsBoard";
import { shellNav } from "@/lib/nav";
import { listUsers } from "@/lib/users";

export default async function CompanyPermissionsPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const user = await getSession();
  if (!user) redirect("/login");
  if (!canAccessCompany(user, companyId)) redirect("/");
  if (
    user.role !== "admin" &&
    user.role !== "company" &&
    !hasPermission(user, "manage_permissions")
  ) {
    redirect(`/company/${companyId}`);
  }

  const store = await readStore();
  const company = store.companies.find((c) => c.id === companyId);
  if (!company) notFound();
  const users = await listUsers();

  return (
    <AppShell
      user={user}
      title="직원 권한 관리"
      nav={shellNav(user, companyId)}
      breadcrumbs={[
        { href: `/company/${companyId}`, label: company.name },
        { label: "권한" },
      ]}
     allowScroll>
      <PermissionsBoard
        companyId={companyId}
        users={users
          .filter((u) => u.companyId === companyId)
          .map((u) => {
            const { passwordHash, ...rest } = u;
            void passwordHash;
            return rest;
          })}
        nodes={store.orgNodes.filter((n) => n.companyId === companyId)}
        sites={store.sites.filter((s) => s.companyId === companyId)}
      />
    </AppShell>
  );
}
