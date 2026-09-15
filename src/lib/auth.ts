import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { appendUsageLog } from "./store";
import { syncIngestIntoStore } from "./ingest";
import { requireEnv } from "./env";
import {
  findUserByEmail,
  findUserById,
  toSessionUser,
  verifyPassword,
} from "./users";
import type { SessionUser } from "./types";

const COOKIE = "eh_session";
const secret = () => new TextEncoder().encode(requireEnv("JWT_SECRET"));

async function hydrateUser(base: SessionUser): Promise<SessionUser | null> {
  await syncIngestIntoStore();
  const fresh = await findUserById(base.id);
  if (!fresh || !fresh.active) return null;
  return toSessionUser(fresh);
}

export async function login(
  email: string,
  password: string
): Promise<{ user: SessionUser } | { error: string; code?: string }> {
  await syncIngestIntoStore(undefined, true);
  const found = await findUserByEmail(email);
  if (!found || !(await verifyPassword(found, password))) {
    return { error: "이메일 또는 비밀번호가 올바르지 않습니다." };
  }
  if (!found.active) {
    return {
      error: "정지된 계정입니다. 관리자에게 문의해 주세요.",
      code: "ACCOUNT_SUSPENDED",
    };
  }

  const user = toSessionUser(found);

  const token = await new SignJWT({ user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
  });

  await appendUsageLog({
    actorUserId: user.id,
    actorName: user.name,
    action: "auth.login",
    detail: `${user.email} 로그인`,
  });

  return { user };
}

export async function logout() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const user = (payload as { user: SessionUser }).user;
    return hydrateUser(user);
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

export function homePathFor(user: SessionUser): string {
  if (user.role === "admin") return "/admin";
  if (user.role === "field_worker") return "/admin/sensors";
  if (user.companyId) return `/company/${user.companyId}`;
  if (user.siteIds[0]) return `/site/${user.siteIds[0]}`;
  return "/login";
}
