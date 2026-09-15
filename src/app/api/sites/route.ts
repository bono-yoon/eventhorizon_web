import { getSession } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/api";
import { readStore, appendUsageLog, invalidateStoreCache } from "@/lib/store";
import {
  canAccessCompany,
  canAccessSite,
  canManageSites,
} from "@/lib/permissions";
import {
  fromWebSiteId,
  insertSiteToDb,
  toWebSiteId,
  updateSiteInDb,
} from "@/lib/db";
import { syncIngestIntoStore } from "@/lib/ingest";
import { addUserSiteLink } from "@/lib/webStoreDb";

export async function GET(req: Request) {
  const user = await getSession();
  if (!user) return jsonError("로그인이 필요합니다.", 401);
  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("companyId");
  await syncIngestIntoStore();
  const store = await readStore();

  let sites = store.sites;
  if (companyId) {
    if (!canAccessCompany(user, companyId)) return jsonError("권한 없음", 403);
    sites = sites.filter((s) => s.companyId === companyId);
  } else if (user.role !== "admin") {
    sites = sites.filter((s) => canAccessSite(user, s));
  }

  return jsonOk({ sites });
}

export async function POST(req: Request) {
  const user = await getSession();
  if (!user) return jsonError("로그인이 필요합니다.", 401);
  if (
    user.role !== "admin" &&
    user.role !== "company" &&
    !canManageSites(user)
  ) {
    return jsonError("현장 개설 권한 없음", 403);
  }

  const body = await req.json();
  const companyId = String(body.companyId || user.companyId || "");
  if (!companyId) return jsonError("companyId 필요");
  if (!canAccessCompany(user, companyId)) return jsonError("권한 없음", 403);

  const name = String(body.name || "새 현장");
  const address = String(body.address || "");
  const lat = Number(body.lat ?? 37.5665);
  const lon = Number(body.lon ?? 126.978);
  const status = "active" as const;

  let dbId: number | null = null;
  try {
    dbId = await insertSiteToDb({
      name,
      address,
      lat,
      lon,
      status,
      companyId,
    });
  } catch (err) {
    return jsonError(`DB 현장 생성 실패: ${(err as Error).message}`, 500);
  }
  if (!dbId) return jsonError("DB 현장 생성 실패", 500);

  const siteId = toWebSiteId(dbId);
  try {
    if (user.role === "company" || user.role === "site_manager") {
      await addUserSiteLink(user.id, siteId);
    }
    if (body.managerUserId) {
      await addUserSiteLink(String(body.managerUserId), siteId);
    }
  } catch (err) {
    console.warn("[sites] user-site link failed:", (err as Error).message);
  }

  invalidateStoreCache();
  await syncIngestIntoStore(undefined, true);

  await appendUsageLog({
    actorUserId: user.id,
    actorName: user.name,
    action: "site.create",
    detail: `현장 개설: ${name}`,
  });

  return jsonOk({
    site: {
      id: siteId,
      companyId,
      name,
      code: String(body.code || `S-${Date.now().toString(36).toUpperCase()}`),
      address,
      lat,
      lon,
      status,
      managerUserId: body.managerUserId ? String(body.managerUserId) : null,
      createdAt: new Date().toISOString(),
    },
  });
}

export async function PATCH(req: Request) {
  const user = await getSession();
  if (!user) return jsonError("로그인이 필요합니다.", 401);
  const body = await req.json();
  const siteId = String(body.id || "");
  await syncIngestIntoStore();
  const store = await readStore();
  const site = store.sites.find((s) => s.id === siteId);
  if (!site) return jsonError("현장 없음", 404);
  if (!canAccessSite(user, site)) return jsonError("권한 없음", 403);
  if (!canManageSites(user)) {
    return jsonError("현장 관리 권한 없음", 403);
  }

  const patch = {
    name: body.name != null ? String(body.name) : undefined,
    address: body.address != null ? String(body.address) : undefined,
    status: body.status != null ? String(body.status) : undefined,
    lat: body.lat != null ? Number(body.lat) : undefined,
    lon: body.lon != null ? Number(body.lon) : undefined,
  };

  const dbId = fromWebSiteId(siteId);
  if (dbId == null) return jsonError("현장 ID가 올바르지 않습니다.", 400);
  try {
    await updateSiteInDb(dbId, patch);
    if (body.managerUserId) {
      await addUserSiteLink(String(body.managerUserId), siteId);
    }
  } catch (err) {
    return jsonError(`DB 현장 수정 실패: ${(err as Error).message}`, 500);
  }

  const wasClosed = site.status === "closed";
  if (!wasClosed && patch.status === "closed") {
    const { endOpenAssignmentsForSite } = await import(
      "@/lib/sensorAssignment"
    );
    await endOpenAssignmentsForSite(siteId, user);
  }

  invalidateStoreCache();
  await syncIngestIntoStore(undefined, true);
  return jsonOk({ ok: true });
}
