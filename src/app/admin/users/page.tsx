import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { readStore } from "@/lib/store";
import { AppShell } from "@/app/components/AppShell";
import { adminNav } from "@/lib/nav";
import { listUsers } from "@/lib/users";
import { AdminUsersBoard } from "@/app/components/AdminUsersBoard";

export default async function AdminUsersPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");
  const store = await readStore();
  const users = await listUsers();

  return (
    <AppShell user={user} title="유저관리" nav={adminNav} allowScroll>
      <p className="mb-4 text-sm text-[var(--eh-fog)]">
        건설사 계정과 그 하위 사용자(현장소장·직원)를 생성하고, 전체 유저를
        조회·정지할 수 있습니다. 조직도는 각 건설사 화면에서 관리합니다.
      </p>
      <AdminUsersBoard
        currentUserId={user.id}
        companies={store.companies.map((c) => ({ id: c.id, name: c.name }))}
        sites={store.sites.map((s) => ({
          id: s.id,
          name: s.name,
          companyId: s.companyId,
        }))}
        users={users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          companyId: u.companyId,
          siteIds: u.siteIds,
          active: u.active,
        }))}
      />
    </AppShell>
  );
}
