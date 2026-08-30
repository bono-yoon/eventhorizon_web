import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { readStore } from "@/lib/store";
import { AppShell } from "@/app/components/AppShell";
import { OrgChartEditor } from "@/app/components/OrgChartEditor";
import { Panel } from "@/app/components/ui";
import { adminNav } from "@/lib/nav";
import { listUsers } from "@/lib/users";
import Link from "next/link";
import clsx from "clsx";

export default async function AdminOrgPage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");

  const { companyId } = await searchParams;
  const store = await readStore();
  const users = await listUsers();
  const selected =
    store.companies.find((c) => c.id === companyId) ?? store.companies[0];

  return (
    <AppShell user={user} title="조직도" nav={adminNav} allowScroll>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-[var(--eh-fog)]">
          건설사를 선택한 뒤 조직도를 조회·수정합니다.
        </span>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/users"
            className="text-[var(--eh-signal)] hover:underline"
          >
            유저 관리 →
          </Link>
          {selected && (
            <Link
              href={`/company/${selected.id}/permissions`}
              className="text-[var(--eh-signal)] hover:underline"
            >
              권한 관리 →
            </Link>
          )}
        </div>
      </div>

      {store.companies.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {store.companies.map((c) => (
            <Link
              key={c.id}
              href={`/admin/org?companyId=${c.id}`}
              className={clsx(
                "eh-neu-press rounded-2xl px-3 py-1.5 text-sm transition",
                selected?.id === c.id
                  ? "eh-neu-active text-[var(--eh-signal)]"
                  : "eh-neu-raised-sm text-[var(--eh-fog)] hover:text-[var(--eh-mist)]"
              )}
            >
              {c.name}
            </Link>
          ))}
        </div>
      )}

      {selected ? (
        <OrgChartEditor
          key={selected.id}
          companyId={selected.id}
          initialNodes={store.orgNodes.filter(
            (n) => n.companyId === selected.id
          )}
          users={users
            .filter((u) => u.companyId === selected.id)
            .map((u) => {
              const { passwordHash, ...rest } = u;
              void passwordHash;
              return rest;
            })}
          canEdit
        />
      ) : (
        <Panel>
          <p className="text-sm text-[var(--eh-fog)]">
            등록된 건설사가 없습니다.
          </p>
        </Panel>
      )}
    </AppShell>
  );
}
