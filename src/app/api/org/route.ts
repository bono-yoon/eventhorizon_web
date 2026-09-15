import { getSession } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/api";
import { readStore, appendUsageLog, invalidateStoreCache } from "@/lib/store";
import { canAccessCompany, hasPermission } from "@/lib/permissions";
import { uid } from "@/lib/api";
import type { OrgNode } from "@/lib/types";
import { replaceOrgNodesInDb } from "@/lib/webStoreDb";

export async function GET(req: Request) {
  const user = await getSession();
  if (!user) return jsonError("로그인이 필요합니다.", 401);
  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) return jsonError("companyId 필요");
  if (!canAccessCompany(user, companyId)) return jsonError("권한 없음", 403);

  const store = await readStore();
  const nodes = store.orgNodes
    .filter((n) => n.companyId === companyId)
    .sort((a, b) => a.order - b.order);
  const users = store.users
    .filter((u) => u.companyId === companyId)
    .map(({ passwordHash: _, ...rest }) => rest);

  return jsonOk({ nodes, users });
}

export async function PUT(req: Request) {
  const user = await getSession();
  if (!user) return jsonError("로그인이 필요합니다.", 401);
  if (!hasPermission(user, "manage_org")) return jsonError("조직도 수정 권한 없음", 403);

  const body = await req.json();
  const companyId = String(body.companyId || "");
  const nodes = body.nodes as OrgNode[];
  if (!companyId || !Array.isArray(nodes)) return jsonError("잘못된 요청");
  if (!canAccessCompany(user, companyId)) return jsonError("권한 없음", 403);

  const next = nodes.map((n, i) => ({
    ...n,
    id: n.id || uid("org"),
    companyId,
    order: n.order ?? i,
  }));

  try {
    await replaceOrgNodesInDb(companyId, next);
    invalidateStoreCache();
  } catch (err) {
    return jsonError(`조직도 저장 실패: ${(err as Error).message}`, 500);
  }

  await appendUsageLog({
    actorUserId: user.id,
    actorName: user.name,
    action: "org.update",
    detail: `조직도 저장 (${companyId})`,
  });

  return jsonOk({ ok: true });
}
