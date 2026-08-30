import { getSession } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/api";
import {
  fetchAllSensorsFromDb,
  fromSensorWebId,
  fromWebSiteId,
  toWebSiteId,
  updateSensorInventory,
  upsertInventorySensor,
  dbEnabled,
} from "@/lib/db";
import { syncIngestIntoStore } from "@/lib/ingest";
import { appendUsageLog } from "@/lib/store";
import type { SensorStatus } from "@/lib/types";
import { ALL_SENSOR_STATUSES } from "@/lib/types";

export async function GET() {
  const user = await getSession();
  if (!user) return jsonError("로그인이 필요합니다.", 401);
  if (user.role !== "admin") return jsonError("관리자만 접근 가능", 403);
  if (!dbEnabled()) return jsonError("DB 연동이 꺼져 있습니다.", 503);

  const sensors = (await fetchAllSensorsFromDb()) || [];
  return jsonOk({ sensors, statuses: ALL_SENSOR_STATUSES });
}

/** 수동 재고 등록 */
export async function POST(req: Request) {
  const user = await getSession();
  if (!user) return jsonError("로그인이 필요합니다.", 401);
  if (user.role !== "admin") return jsonError("관리자만 접근 가능", 403);
  if (!dbEnabled()) return jsonError("DB 연동이 꺼져 있습니다.", 503);

  const body = await req.json();
  const deviceId = String(body.deviceId || "").trim();
  if (!deviceId) return jsonError("deviceId 필요");

  const status = (body.status || "inventory") as SensorStatus;
  const siteDbId =
    body.siteId != null && body.siteId !== ""
      ? fromWebSiteId(String(body.siteId))
      : null;

  if (status === "assigned" && siteDbId == null) {
    return jsonError("현장 배정 시 siteId 필요");
  }

  await upsertInventorySensor({
    deviceId,
    label: body.label ? String(body.label) : deviceId,
    status: status === "assigned" ? "assigned" : status,
    siteId: status === "assigned" ? siteDbId : null,
    memo: body.memo != null ? String(body.memo) : null,
  });

  await syncIngestIntoStore(undefined, true);
  await appendUsageLog({
    actorUserId: user.id,
    actorName: user.name,
    action: "inventory.create",
    detail: `${deviceId} 재고 등록 (${status})`,
  });

  return jsonOk({ ok: true, deviceId });
}

/** 상태/현장/비고 변경 */
export async function PATCH(req: Request) {
  const user = await getSession();
  if (!user) return jsonError("로그인이 필요합니다.", 401);
  if (user.role !== "admin") return jsonError("관리자만 접근 가능", 403);
  if (!dbEnabled()) return jsonError("DB 연동이 꺼져 있습니다.", 503);

  const body = await req.json();
  const id =
    typeof body.id === "number"
      ? body.id
      : fromSensorWebId(String(body.id || ""));
  if (id == null) return jsonError("센서 id 필요");

  const status = body.status as SensorStatus | undefined;
  let siteId: number | null | undefined = undefined;
  if (body.siteId !== undefined) {
    if (body.siteId === null || body.siteId === "") siteId = null;
    else siteId = fromWebSiteId(String(body.siteId));
  }

  if (status === "assigned") {
    const assignSite =
      siteId !== undefined
        ? siteId
        : body.assignSiteId
          ? fromWebSiteId(String(body.assignSiteId))
          : null;
    if (assignSite == null) return jsonError("현장 배정 시 현장 선택 필요");
    siteId = assignSite;
  }

  if (
    status === "inventory" ||
    status === "recovered" ||
    status === "disposed"
  ) {
    if (siteId === undefined) siteId = null;
  }

  try {
    await updateSensorInventory(id, {
      label: body.label != null ? String(body.label) : undefined,
      status,
      siteId,
      memo:
        body.memo !== undefined
          ? body.memo
            ? String(body.memo)
            : null
          : undefined,
      isActive:
        typeof body.isActive === "boolean" ? body.isActive : undefined,
    });
  } catch (err) {
    return jsonError((err as Error).message, 400);
  }

  await syncIngestIntoStore(undefined, true);
  await appendUsageLog({
    actorUserId: user.id,
    actorName: user.name,
    action: "inventory.update",
    detail: `센서 #${id} 변경${status ? ` → ${status}` : ""}${
      siteId != null ? ` @ ${toWebSiteId(siteId)}` : ""
    }`,
  });

  return jsonOk({ ok: true });
}
