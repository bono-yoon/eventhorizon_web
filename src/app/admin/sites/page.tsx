import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { readStore } from "@/lib/store";
import { AppShell } from "@/app/components/AppShell";
import { Badge, Panel } from "@/app/components/ui";
import { CreateSiteForm } from "@/app/components/CreateSiteForm";
import Link from "next/link";
import { adminNav } from "@/lib/nav";

export default async function AdminSitesPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");
  const store = await readStore();
  const company = store.companies[0];

  return (
    <AppShell user={user} title="현장관리" nav={adminNav} allowScroll>
      <div className="mb-4 flex flex-wrap gap-3 text-sm">
        <Link href="/admin/inventory" className="text-[var(--eh-signal)] hover:underline">
          재고·현장 배정 →
        </Link>
      </div>
      <div className="mb-5">
        {company && (
          <CreateSiteForm
            companyId={company.id}
            managers={store.users
              .filter((u) => u.role === "site_manager")
              .map((u) => ({ id: u.id, name: u.name }))}
          />
        )}
      </div>
      <Panel>
        <div className="eh-scroll overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="text-xs text-[var(--eh-fog)]">
              <tr className="border-b border-[var(--eh-line)]">
                <th className="py-2">현장</th>
                <th className="py-2">건설사</th>
                <th className="py-2">상태</th>
                <th className="py-2">센서 수</th>
                <th className="py-2">링크</th>
              </tr>
            </thead>
            <tbody>
              {store.sites.map((s) => {
                const companyName =
                  store.companies.find((c) => c.id === s.companyId)?.name || "-";
                const sensorCount = store.sensors.filter(
                  (x) => x.siteId === s.id
                ).length;
                return (
                  <tr key={s.id} className="border-b border-[var(--eh-line)]/50">
                    <td className="py-3">
                      <div className="text-[var(--eh-mist)]">{s.name}</div>
                      <div className="text-xs text-[var(--eh-fog)]">{s.code}</div>
                    </td>
                    <td className="py-3">{companyName}</td>
                    <td className="py-3">
                      <Badge
                        tone={
                          s.status === "active"
                            ? "ok"
                            : s.status === "paused"
                              ? "warn"
                              : "off"
                        }
                      >
                        {s.status}
                      </Badge>
                    </td>
                    <td className="py-3">{sensorCount}</td>
                    <td className="py-3">
                      <Link
                        href={`/site/${s.id}`}
                        className="text-[var(--eh-signal)] hover:underline"
                      >
                        현장 상세
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </AppShell>
  );
}
