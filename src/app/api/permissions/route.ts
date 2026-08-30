import { getSession } from "@/lib/auth";
import { jsonError, jsonOk, uid } from "@/lib/api";
import { readStore, updateStore, appendUsageLog } from "@/lib/store";
import {
  canAccessCompany,
  hasPermission,
} from "@/lib/permissions";
import type { Permission } from "@/lib/types";
import { ALL_PERMISSIONS } from "@/lib/types";
import { dbEnabled } from "@/lib/db";
import {
  findUserById,
  listUsersFromDb,
  updateUserInDb,
} from "@/lib/users";

export async function GET(req: Request) {
  const user = await getSession();
  if (!user) return jsonError("로그인이 필요합니다.", 401);
  const companyId = new URL(req.url).searchParams.get("companyId");
  if (!companyId) return jsonError("companyId 필요");
  if (!canAccessCompany(user, companyId)) return jsonError("권한 없음", 403);

  const store = await readStore();
  const allUsers = dbEnabled() ? await listUsersFromDb() : store.users;
  const users = allUsers
    .filter((u) => u.companyId === companyId && u.role !== "company")
    .map(({ passwordHash: _, ...rest }) => rest);
  const nodes = store.orgNodes.filter((n) => n.companyId === companyId);

  return jsonOk({ users, nodes, allPermissions: ALL_PERMISSIONS });
}

/** 다수 사용자 권한 일괄 부여/회수 */
export async function POST(req: Request) {
  const user = await getSession();
  if (!user) return jsonError("로그인이 필요합니다.", 401);
  if (!hasPermission(user, "manage_permissions")) {
    return jsonError("권한 관리 권한 없음", 403);
  }

  const body = await req.json();
  const companyId = String(body.companyId || "");
  const userIds: string[] = Array.isArray(body.userIds) ? body.userIds : [];
  const add: Permission[] = Array.isArray(body.add) ? body.add : [];
  const remove: Permission[] = Array.isArray(body.remove) ? body.remove : [];
  const siteIds: string[] | undefined = Array.isArray(body.siteIds)
    ? body.siteIds
    : undefined;

  if (!companyId || !userIds.length) return jsonError("userIds 필요");
  if (!canAccessCompany(user, companyId)) return jsonError("권한 없음", 403);

  const store = await readStore();
  const allowedSites = new Set(
    store.sites.filter((s) => s.companyId === companyId).map((s) => s.id)
  );

  if (dbEnabled()) {
    for (const id of userIds) {
      const target = await findUserById(id);
      if (
        !target ||
        target.companyId !== companyId ||
        target.role === "company" ||
        target.role === "admin"
      ) {
        continue;
      }
      const set = new Set(target.permissions);
      for (const p of add) set.add(p);
      for (const p of remove) set.delete(p);
      await updateUserInDb(id, {
        permissions: [...set],
        siteIds: siteIds
          ? siteIds.filter((s) => allowedSites.has(s))
          : undefined,
      });
    }
  } else {
    await updateStore((s) => {
      for (const id of userIds) {
        const target = s.users.find(
          (u) => u.id === id && u.companyId === companyId
        );
        if (!target || target.role === "company" || target.role === "admin") {
          continue;
        }
        const set = new Set(target.permissions);
        for (const p of add) set.add(p);
        for (const p of remove) set.delete(p);
        target.permissions = [...set];
        if (siteIds) {
          target.siteIds = siteIds.filter((s) => allowedSites.has(s));
        }
      }
    });
  }

  await appendUsageLog({
    actorUserId: user.id,
    actorName: user.name,
    action: "permissions.bulk",
    detail: `${userIds.length}명 권한 변경`,
    meta: { add, remove, userIds, siteIds },
  });

  return jsonOk({ ok: true, updated: userIds.length });
}

export async function PUT(req: Request) {
  const user = await getSession();
  if (!user) return jsonError("로그인이 필요합니다.", 401);
  if (user.role !== "admin" && !hasPermission(user, "manage_permissions")) {
    return jsonError("권한 없음", 403);
  }

  const body = await req.json();
  const targetId = String(body.userId || "");
  const target = await findUserById(targetId);
  if (!target) return jsonError("사용자 없음", 404);
  if (target.companyId && !canAccessCompany(user, target.companyId)) {
    return jsonError("권한 없음", 403);
  }

  if (dbEnabled()) {
    await updateUserInDb(targetId, {
      permissions: Array.isArray(body.permissions)
        ? body.permissions
        : undefined,
      siteIds: Array.isArray(body.siteIds) ? body.siteIds : undefined,
      active: typeof body.active === "boolean" ? body.active : undefined,
      role:
        body.role && user.role === "admin" ? body.role : undefined,
    });
  } else {
    await updateStore((s) => {
      const t = s.users.find((u) => u.id === targetId);
      if (!t) return;
      if (Array.isArray(body.permissions)) t.permissions = body.permissions;
      if (Array.isArray(body.siteIds)) t.siteIds = body.siteIds;
      if (typeof body.active === "boolean") t.active = body.active;
      if (body.role && user.role === "admin") t.role = body.role;
    });
  }

  return jsonOk({ ok: true });
}

export async function PATCH() {
  return jsonOk({ hint: uid("noop") });
}
