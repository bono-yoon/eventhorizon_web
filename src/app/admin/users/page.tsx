import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { readStore } from "@/lib/store";
import { AppShell } from "@/app/components/AppShell";
import { Badge, Panel } from "@/app/components/ui";
import { roleLabel } from "@/lib/permissions";
import { AdminUserCreateForm } from "@/app/components/AdminUserCreateForm";
import { adminNav } from "@/lib/nav";
import { dbEnabled } from "@/lib/db";
import { listUsers } from "@/lib/users";
import Link from "next/link";

export default async function AdminUsersPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");
  const store = await readStore();
  const users = await listUsers();

  return (
    <AppShell user={user} title="유저 관리" nav={adminNav} allowScroll>
      <p className="mb-4 text-sm text-[var(--eh-fog)]">
        {dbEnabled()
          ? "계정은 MariaDB web_users 테이블에서 관리됩니다."
          : "DB 비활성 — 로컬 파일 스토어 사용자입니다."}{" "}
        <Link href="/admin/org" className="text-[var(--eh-signal)] hover:underline">
          조직도로 돌아가기
        </Link>
      </p>
      <div className="mb-5">
        <AdminUserCreateForm
          companies={store.companies.map((c) => ({ id: c.id, name: c.name }))}
          sites={store.sites.map((s) => ({
            id: s.id,
            name: s.name,
            companyId: s.companyId,
          }))}
        />
      </div>
      <Panel>
        <div className="eh-scroll overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs text-[var(--eh-fog)]">
              <tr className="border-b border-[var(--eh-line)]">
                <th className="py-2">이름</th>
                <th className="py-2">이메일</th>
                <th className="py-2">역할</th>
                <th className="py-2">건설사</th>
                <th className="py-2">현장</th>
                <th className="py-2">상태</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-[var(--eh-line)]/50">
                  <td className="py-3 text-[var(--eh-mist)]">{u.name}</td>
                  <td className="py-3">{u.email}</td>
                  <td className="py-3">{roleLabel(u.role)}</td>
                  <td className="py-3">
                    {store.companies.find((c) => c.id === u.companyId)?.name ||
                      "-"}
                  </td>
                  <td className="py-3 text-xs text-[var(--eh-fog)]">
                    {u.siteIds
                      .map(
                        (id) => store.sites.find((s) => s.id === id)?.name || id
                      )
                      .join(", ") || "-"}
                  </td>
                  <td className="py-3">
                    <Badge tone={u.active ? "ok" : "off"}>
                      {u.active ? "active" : "disabled"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </AppShell>
  );
}
