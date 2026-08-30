import { getSession } from "@/lib/auth";
import { jsonError, jsonOk, uid } from "@/lib/api";
import { readStore, appendUsageLog } from "@/lib/store";
import { dbEnabled } from "@/lib/db";
import {
  createUserInDb,
  findUserByEmail,
  listUsersFromDb,
  updateUserInDb,
} from "@/lib/users";
import { updateStore } from "@/lib/store";
import bcrypt from "bcryptjs";
import type { GlobalRole, Permission } from "@/lib/types";

export async function GET() {
  const user = await getSession();
  if (!user) return jsonError("로그인이 필요합니다.", 401);
  if (user.role !== "admin") return jsonError("관리자만 접근 가능", 403);

  const store = await readStore();
  const users = dbEnabled()
    ? await listUsersFromDb()
    : store.users;

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
  const email = String(body.email || "").trim().toLowerCase();
  const name = String(body.name || "").trim();
  const password = String(body.password || "changeme123");
  const role = String(body.role || "employee") as GlobalRole;
  if (!email || !name) return jsonError("email/name 필요");

  const existing = await findUserByEmail(email);
  if (existing) return jsonError("이미 존재하는 이메일");

  const id = uid("u");
  const companyId = body.companyId ? String(body.companyId) : null;
  const siteIds = Array.isArray(body.siteIds) ? (body.siteIds as string[]) : [];
  const permissions = Array.isArray(body.permissions)
    ? (body.permissions as Permission[])
    : [];

  if (dbEnabled()) {
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
    } catch (err) {
      return jsonError((err as Error).message || "생성 실패", 500);
    }
  } else {
    await updateStore((s) => {
      if (s.users.some((u) => u.email.toLowerCase() === email)) return;
      s.users.push({
        id,
        email,
        passwordHash: bcrypt.hashSync(password, 8),
        name,
        role,
        companyId,
        siteIds,
        permissions,
        orgNodeId: null,
        active: true,
        createdAt: new Date().toISOString(),
      });
    });
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

  if (dbEnabled()) {
    try {
      await updateUserInDb(id, {
        name: body.name != null ? String(body.name) : undefined,
        role: body.role != null ? (body.role as GlobalRole) : undefined,
        companyId:
          body.companyId !== undefined
            ? body.companyId
              ? String(body.companyId)
              : null
            : undefined,
        siteIds: Array.isArray(body.siteIds) ? body.siteIds : undefined,
        active: typeof body.active === "boolean" ? body.active : undefined,
        password: body.password ? String(body.password) : undefined,
        permissions: Array.isArray(body.permissions)
          ? body.permissions
          : undefined,
      });
    } catch (err) {
      return jsonError((err as Error).message || "수정 실패", 500);
    }
  } else {
    await updateStore((s) => {
      const t = s.users.find((u) => u.id === id);
      if (!t) return;
      if (body.name != null) t.name = String(body.name);
      if (body.role != null) t.role = body.role;
      if (body.companyId !== undefined)
        t.companyId = body.companyId ? String(body.companyId) : null;
      if (Array.isArray(body.siteIds)) t.siteIds = body.siteIds;
      if (typeof body.active === "boolean") t.active = body.active;
      if (body.password)
        t.passwordHash = bcrypt.hashSync(String(body.password), 8);
    });
  }

  return jsonOk({ ok: true });
}
