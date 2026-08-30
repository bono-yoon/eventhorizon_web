import { redirect, notFound } from "next/navigation";
import { Suspense } from "react";
import { getSession } from "@/lib/auth";
import { readStore } from "@/lib/store";
import { canAccessSite } from "@/lib/permissions";
import { AppShell } from "@/app/components/AppShell";
import { SiteSensorsBoard } from "@/app/components/SiteSensorsBoard";
import { buildSensorRows } from "@/lib/dashboard";
import { shellNav } from "@/lib/nav";
import { getReadingsForDevices, getUnlockEvents } from "@/lib/ingest";

export default async function SiteSensorsPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ device?: string }>;
}) {
  const { siteId } = await params;
  const { device } = await searchParams;
  const user = await getSession();
  if (!user) redirect("/login");

  const store = await readStore();
  const site = store.sites.find((s) => s.id === siteId);
  if (!site) notFound();
  if (!canAccessSite(user, site)) redirect(`/company/${site.companyId}/sites`);

  const rows = await buildSensorRows([site]);
  const focused = device
    ? rows.find((r) => r.sensor.deviceId === device)
    : rows[0];
  const isAdmin = user.role === "admin";
  const history = focused
    ? (
        await getReadingsForDevices([focused.sensor.deviceId], isAdmin ? 80 : 40)
      ).history.slice(0, isAdmin ? 80 : 40)
    : [];
  const unlockEvents =
    isAdmin && focused
      ? await getUnlockEvents(focused.sensor.deviceId, 100)
      : [];

  return (
    <AppShell
      user={user}
      title="센서 데이터"
      nav={shellNav(user, site.companyId)}
      breadcrumbs={[
        { href: `/company/${site.companyId}`, label: "건설사" },
        { href: `/site/${siteId}`, label: site.name },
        { label: "센서 데이터" },
      ]}
      allowScroll
    >
      <Suspense fallback={null}>
        <SiteSensorsBoard
          siteId={siteId}
          site={site}
          rows={rows}
          initialDeviceId={focused?.sensor.deviceId ?? null}
          isAdmin={isAdmin}
          initialHistory={history.map((h) => ({
            id: h.id,
            ts: h.ts,
            x: h.x,
            y: h.y,
            z: h.z,
            batteryPercent: h.batteryPercent,
            temperatureC: h.temperatureC,
          }))}
          initialUnlockEvents={unlockEvents}
        />
      </Suspense>
    </AppShell>
  );
}
