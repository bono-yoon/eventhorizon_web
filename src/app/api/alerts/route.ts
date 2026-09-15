import { getSession } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/api";
import { readStore } from "@/lib/store";
import { canAccessCompany, canAccessSite, hasPermission } from "@/lib/permissions";
import { acknowledgeWebAlert } from "@/lib/alertEngine";

export async function GET(req: Request) {
  const user = await getSession();
  if (!user) return jsonError("로그인이 필요합니다.", 401);

  const companyId = new URL(req.url).searchParams.get("companyId");
  const siteId = new URL(req.url).searchParams.get("siteId");
  const store = await readStore();

  let alerts = store.alerts;
  if (siteId) {
    const site = store.sites.find((s) => s.id === siteId);
    if (!site || !canAccessSite(user, site)) return jsonError("권한 없음", 403);
    alerts = alerts.filter((a) => a.siteId === siteId);
  } else if (companyId) {
    if (!canAccessCompany(user, companyId)) return jsonError("권한 없음", 403);
    alerts = alerts.filter((a) => a.companyId === companyId);
    if (user.role === "site_manager" || user.role === "employee") {
      const allowed = new Set(user.siteIds);
      alerts = alerts.filter(
        (a) => a.siteId != null && allowed.has(a.siteId)
      );
    }
  } else if (user.role !== "admin") {
    if (user.companyId) {
      alerts = alerts.filter((a) => a.companyId === user.companyId);
      if (user.role !== "company") {
        const allowed = new Set(user.siteIds);
        alerts = alerts.filter(
          (a) => a.siteId != null && allowed.has(a.siteId)
        );
      }
    } else {
      alerts = [];
    }
  }

  if (!hasPermission(user, "receive_alerts") && user.role === "employee") {
    // still allow view if they have view_logs/dashboard — keep list but mark
  }

  return jsonOk({ alerts: alerts.slice(0, 100) });
}

export async function POST(req: Request) {
  const user = await getSession();
  if (!user) return jsonError("로그인이 필요합니다.", 401);
  const body = await req.json();
  const id = String(body.id || "");
  if (!id) return jsonError("id 필요");
  await acknowledgeWebAlert(id);
  return jsonOk({ ok: true });
}
