import { getSession } from "@/lib/auth";
import { jsonError, jsonOk, uid } from "@/lib/api";
import { readStore, appendUsageLog, invalidateStoreCache } from "@/lib/store";
import {
  createUserInDb,
  findUserByEmail,
  listUsersFromDb,
  updateUserInDb,
} from "@/lib/users";
import { defaultPermissionsForRole } from "@/lib/permissions";
import { insertCompanyToDb } from "@/lib/webStoreDb";
import type { GlobalRole, Permission } from "@/lib/types";

export async function GET() {
  const user = await getSession();
  if (!user) return jsonError("로그인이 필요합니다.", 401);
  if (user.role !== "admin") return jsonError("관리자만 접근 가능", 403);

  const store = await readStore();
  const users = await listUsersFromDb();

  return jsonOk({
    users: users.map(({ passwordHash: _, ...rest }) => rest),
    companies: store.companies,
    sites: store.sites,
    sensors: store.sensors,
    usageLogs: store.usageLogs.slice(0, 200),
    alerts: store.alerts.slice(0, 100),
  });
}

export async function POST(req: Request) {
  const user = await getSession();
  if (!user) return jsonError("로그인이 필요합니다.", 401);
  if (user.role !== "admin") return jsonError("관리자만 접근 가능", 403);

  const body = await req.json();
  if (body.action === "create_company") {
    const name = String(body.name || "").trim();
    const codeRaw = String(body.code || "").trim().toUpperCase();
    const address = String(body.address || "").trim();
    const adminName = String(body.adminName || "").trim();
    const adminEmail = String(body.adminEmail || "").trim().toLowerCase();
    const adminPassword = String(body.adminPassword || "");
    if (!name) return jsonError("건설사 이름이 필요합니다.");
    if (!adminName || !adminEmail || !adminPassword) {
      return jsonError("건설사 계정(이름/이메일/비밀번호)이 필요합니다.");
    }
    const existing = await findUserByEmail(adminEmail);
    if (existing) return jsonError("이미 존재하는 이메일");
    const companyId = uid("co");
    const code = codeRaw || companyId.replace(/^co_/, "C").slice(0, 16).toUpperCase();
    try {
      await insertCompanyToDb({ id: companyId, name, code, address });
      await createUserInDb({
        id: uid("u"),
        email: adminEmail,
        password: adminPassword,
        name: adminName,
        role: "company",
        companyId,
        siteIds: [],
        permissions: defaultPermissionsForRole("company"),
      });
      invalidateStoreCache();
    } catch (err) {
      return jsonError((err as Error).message || "건설사 생성 실패", 500);
    }
    await appendUsageLog({
      actorUserId: user.id,
      actorName: user.name,
      action: "company.create",
      detail: `${name} (${code}) / ${adminEmail}`,
    });
    return jsonOk({ company: { id: companyId, name, code }, email: adminEmail });
  }

  const email = String(body.email || "").trim().toLowerCase();
  const name = String(body.name || "").trim();
  const password = String(body.password || "");
  const role = String(body.role || "employee") as GlobalRole;
  if (!email || !name) return jsonError("email/name 필요");
  if (!password) return jsonError("비밀번호가 필요합니다.");

  const existing = await findUserByEmail(email);
  if (existing) return jsonError("이미 존재하는 이메일");

  const id = uid("u");
  const serviceSide = role === "admin" || role === "field_worker";
  const companyId = serviceSide
    ? null
    : body.companyId
      ? String(body.companyId)
      : null;
  const siteIds = serviceSide
    ? []
    : Array.isArray(body.siteIds)
      ? (body.siteIds as string[])
      : [];
  const permissions = Array.isArray(body.permissions)
    ? (body.permissions as Permission[])
    : defaultPermissionsForRole(role);

  if (!serviceSide && !companyId) {
    return jsonError("건설사 소속 계정은 companyId가 필요합니다.");
  }

  try {
    await createUserInDb({
      id,
      email,
      password,
      name,
      role,
      companyId,
      siteIds,
      permissions,
    });
    invalidateStoreCache();
  } catch (err) {
    return jsonError((err as Error).message || "생성 실패", 500);
  }

  await appendUsageLog({
    actorUserId: user.id,
    actorName: user.name,
    action: "user.create",
    detail: `${email} (${role}) 생성`,
  });

  return jsonOk({
    user: {
      id,
      email,
      name,
      role,
      companyId,
      siteIds,
      permissions,
      active: true,
    },
  });
}

export async function PATCH(req: Request) {
  const user = await getSession();
  if (!user) return jsonError("로그인이 필요합니다.", 401);
  if (user.role !== "admin") return jsonError("관리자만 접근 가능", 403);

  const body = await req.json();
  const id = String(body.id || "");
  if (!id) return jsonError("id 필요");
  if (id === user.id && body.active === false) {
    return jsonError("본인 계정은 정지할 수 없습니다.");
  }

  const nextRole = body.role != null ? (body.role as GlobalRole) : undefined;
  const serviceSide = nextRole === "admin" || nextRole === "field_worker";

  try {
    await updateUserInDb(id, {
      name: body.name != null ? String(body.name) : undefined,
      role: nextRole,
      companyId: serviceSide
        ? null
        : body.companyId !== undefined
          ? body.companyId
            ? String(body.companyId)
            : null
          : undefined,
      siteIds: serviceSide
        ? []
        : Array.isArray(body.siteIds)
          ? body.siteIds
          : undefined,
      active: typeof body.active === "boolean" ? body.active : undefined,
      password: body.password ? String(body.password) : undefined,
      permissions: Array.isArray(body.permissions)
        ? body.permissions
        : undefined,
    });
    invalidateStoreCache();
  } catch (err) {
    return jsonError((err as Error).message || "수정 실패", 500);
  }

  return jsonOk({ ok: true });
}
