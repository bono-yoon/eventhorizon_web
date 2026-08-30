import { getSession } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/api";
import { canAccessCompany } from "@/lib/permissions";
import { readStore } from "@/lib/store";
import {
  getSensorOpsMap,
  listSensorOps,
  migrateLocalSensorOps,
  setSensorOpsStatus,
} from "@/lib/sensorOps";
import type { SensorOpsStatus } from "@/lib/types";

const OPS_STATUSES = new Set<SensorOpsStatus>([
  "normal",
  "repair_request",
  "return_request",
  "inspect",
]);

export async function GET(req: Request) {
  const user = await getSession();
  if (!user) return jsonError("로그인이 필요합니다.", 401);

  const url = new URL(req.url);
  const companyId = url.searchParams.get("companyId");

  if (user.role === "admin") {
    const entries = await listSensorOps(companyId || undefined);
    return jsonOk({ ops: entries, map: Object.fromEntries(entries.map((e) => [e.deviceId, e.status])) });
  }

  const cid = companyId || user.companyId;
  if (!cid || !canAccessCompany(user, cid)) {
    return jsonError("권한이 없습니다.", 403);
  }

  const map = await getSensorOpsMap(cid);
  return jsonOk({ map, ops: await listSensorOps(cid) });
}

export async function POST(req: Request) {
  const user = await getSession();
  if (!user) return jsonError("로그인이 필요합니다.", 401);

  const body = await req.json().catch(() => ({}));

  if (body.action === "migrate_local") {
    const companyId = String(body.companyId || "");
    if (!companyId || !canAccessCompany(user, companyId)) {
      return jsonError("권한이 없습니다.", 403);
    }
    const store = await readStore();
    const company = store.companies.find((c) => c.id === companyId);
    if (!company) return jsonError("건설사를 찾을 수 없습니다.", 404);

    const rows = Array.isArray(body.rows) ? body.rows : [];
    type MigrateRow = {
      deviceId: string;
      sensorLabel: string;
      siteId: string | null;
      siteName: string | null;
      status: SensorOpsStatus;
    };
    const parsed: MigrateRow[] = rows
      .map((r: Record<string, unknown>): MigrateRow => ({
        deviceId: String(r.deviceId || ""),
        sensorLabel: String(r.sensorLabel || r.deviceId || ""),
        siteId: r.siteId ? String(r.siteId) : null,
        siteName: r.siteName ? String(r.siteName) : null,
        status: String(r.status || "normal") as SensorOpsStatus,
      }))
      .filter((r: MigrateRow) => r.deviceId && OPS_STATUSES.has(r.status));
    await migrateLocalSensorOps({
      user,
      companyId,
      companyName: company.name,
      rows: parsed,
    });
    return jsonOk({ ok: true });
  }

  const deviceId = String(body.deviceId || "");
  const status = String(body.status || "") as SensorOpsStatus;
  const companyId = String(body.companyId || user.companyId || "");

  if (!deviceId || !OPS_STATUSES.has(status)) {
    return jsonError("deviceId와 status가 필요합니다.");
  }
  if (!canAccessCompany(user, companyId) && user.role !== "admin") {
    return jsonError("권한이 없습니다.", 403);
  }

  const store = await readStore();
  const company = store.companies.find((c) => c.id === companyId);
  if (!company) return jsonError("건설사를 찾을 수 없습니다.", 404);

  const sensor = store.sensors.find((s) => s.deviceId === deviceId);
  const site = sensor?.siteId
    ? store.sites.find((s) => s.id === sensor.siteId)
    : null;

  if (
    user.role !== "admin" &&
    site &&
    site.companyId !== companyId
  ) {
    return jsonError("해당 건설사 센서가 아닙니다.", 403);
  }

  await setSensorOpsStatus({
    user,
    deviceId,
    status,
    companyId,
    companyName: company.name,
    siteId: site?.id ?? null,
    siteName: site?.name ?? null,
    sensorLabel: sensor?.label ?? deviceId,
  });

  return jsonOk({ ok: true });
}
