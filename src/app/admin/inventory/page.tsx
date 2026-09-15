import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/app/components/AppShell";
import { InventoryBoard } from "@/app/components/InventoryBoard";
import { adminNav } from "@/lib/nav";
import { dbEnabled, fetchAllSensorsFromDb } from "@/lib/db";
import { readStore } from "@/lib/store";
import { Panel } from "@/app/components/ui";
import Link from "next/link";

export default async function AdminInventoryPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");

  const store = await readStore();
  if (!dbEnabled()) {
    return (
      <AppShell user={user} title="재고 · 현장 배정" nav={adminNav} allowScroll>
        <Panel>
          <p className="text-sm text-[var(--eh-fog)]">
            DB 연동(DB_ENABLED)이 꺼져 있으면 재고 관리를 사용할 수 없습니다.
          </p>
        </Panel>
      </AppShell>
    );
  }

  const sensors = (await fetchAllSensorsFromDb()) || [];

  return (
    <AppShell user={user} title="재고 · 현장 배정" nav={adminNav} allowScroll>
      <p className="mb-5 max-w-2xl text-sm text-[var(--eh-fog)]">
        <Link href="/admin/sites" className="text-[var(--eh-signal)] hover:underline">
          현장관리로 돌아가기
        </Link>
        <span className="mx-2">·</span>
        폰에 APK를 설치·실행하면 센서가 자동으로 재고(미배정)에 등록됩니다.
        관리자는 여기서 건설사·현장을 골라 남는 센서를 배정하거나
        회수/수리/폐기로 바꿀 수 있습니다.
        배정된 센서만 모니터링에 표시됩니다.
      </p>
      <InventoryBoard
        initialSensors={sensors}
        companies={store.companies.map((c) => ({
          id: c.id,
          name: c.name,
        }))}
        sites={store.sites.map((s) => ({
          id: s.id,
          name: s.name,
          companyId: s.companyId,
        }))}
      />
    </AppShell>
  );
}
