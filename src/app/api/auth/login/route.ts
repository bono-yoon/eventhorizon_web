import { NextRequest } from "next/server";
import { login } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/api";
import { homePathFor } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim();
  const password = String(body.password || "");
  if (!email || !password) return jsonError("이메일과 비밀번호를 입력하세요.");

  const result = await login(email, password);
  if ("error" in result) {
    const status = result.code === "ACCOUNT_SUSPENDED" ? 403 : 401;
    return jsonError(result.error, status, result.code ? { code: result.code } : undefined);
  }

  return jsonOk({
    user: result.user,
    redirect: homePathFor(result.user),
  });
}
