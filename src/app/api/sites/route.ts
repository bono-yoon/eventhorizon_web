import { getSession } from "@/lib/auth";
import { jsonError, jsonOk, uid } from "@/lib/api";
import { readStore, updateStore, appendUsageLog } from "@/lib/store";
import {
  canAccessCompany,
  canAccessSite,
  hasPermission,
} from "@/lib/permissions";
import {
  dbEnabled,
  fromWebSiteId,
  insertSiteToDb,
  toWebSiteId,
  updateSiteInDb,
} from "@/lib/db";
import { syncIngestIntoStore } from "@/lib/ingest";

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
    !hasPermission(user, "manage_sites")
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

  let siteId = uid("site");
  if (dbEnabled()) {
    try {
      const dbId = await insertSiteToDb({ name, address, lat, lon, status });
      if (dbId) siteId = toWebSiteId(dbId);
    } catch (err) {
      return jsonError(`DB 현장 생성 실패: ${(err as Error).message}`, 500);
    }
  }

  const site = {
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
  };

  await updateStore((store) => {
    store.sites.push(site);
    if (user.role === "company") {
      const u = store.users.find((x) => x.id === user.id);
      if (u && !u.siteIds.includes(site.id)) u.siteIds.push(site.id);
    }
    if (site.managerUserId) {
      const mgr = store.users.find((x) => x.id === site.managerUserId);
      if (mgr && !mgr.siteIds.includes(site.id)) mgr.siteIds.push(site.id);
    }
  });

  await syncIngestIntoStore(companyId, true);

  await appendUsageLog({
    actorUserId: user.id,
    actorName: user.name,
    action: "site.create",
    detail: `현장 개설: ${site.name}${dbEnabled() ? " (ingest DB)" : ""}`,
  });

  return jsonOk({ site });
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
  if (user.role === "employee" && !hasPermission(user, "manage_sites")) {
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
  if (dbEnabled() && dbId != null) {
    try {
      await updateSiteInDb(dbId, patch);
    } catch (err) {
      return jsonError(`DB 현장 수정 실패: ${(err as Error).message}`, 500);
    }
  }

  await updateStore((s) => {
    const t = s.sites.find((x) => x.id === siteId);
    if (!t) return;
    if (patch.name != null) t.name = patch.name;
    if (patch.address != null) t.address = patch.address;
    if (patch.status != null) t.status = patch.status as typeof t.status;
    if (patch.lat != null) t.lat = patch.lat;
    if (patch.lon != null) t.lon = patch.lon;
    if (body.managerUserId !== undefined) {
      t.managerUserId = body.managerUserId ? String(body.managerUserId) : null;
    }
  });

  await syncIngestIntoStore(undefined, true);
  return jsonOk({ ok: true });
}
