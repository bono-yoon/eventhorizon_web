import { getSession } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/api";
import {
  listInboxForUser,
  markAlertRead,
  markAllAlertsRead,
  acknowledgeThresholdIncident,
  listIncidentAcknowledgements,
  type IncidentDisposition,
} from "@/lib/alertEngine";
import {
  listSensorOpsInboxForAdmin,
  markAllSensorOpsAlertsRead,
  markSensorOpsAlertRead,
} from "@/lib/sensorOps";
import { syncIngestIntoStore } from "@/lib/ingest";

export async function GET() {
  const user = await getSession();
  if (!user) return jsonError("로그인이 필요합니다.", 401);

  // 가벼운 동기화로 알림 평가 트리거
  await syncIngestIntoStore(undefined, false);

  const dbAlerts = await listInboxForUser(user);
  const opsAlerts =
    user.role === "admin" ? await listSensorOpsInboxForAdmin(user.id) : [];
  const alerts = [...opsAlerts, ...dbAlerts].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const unread = alerts.filter((a) => !a.read).length;
  return jsonOk({ alerts, unread });
}

export async function POST(req: Request) {
  const user = await getSession();
  if (!user) return jsonError("로그인이 필요합니다.", 401);
  const body = await req.json().catch(() => ({}));

  if (body.action === "ack_incident") {
    const incidentId = Number(body.incidentId);
    const disposition = String(body.disposition || "") as IncidentDisposition;
    const allowed = new Set([
      "confirmed_real",
      "false_positive",
      "misoperation",
      "maintenance",
      "other",
    ]);
    if (!incidentId || !allowed.has(disposition)) {
      return jsonError("incidentId와 disposition이 필요합니다.");
    }
    try {
      await acknowledgeThresholdIncident({
        user,
        incidentId,
        disposition,
        reason: body.reason ? String(body.reason) : undefined,
      });
      return jsonOk({ ok: true });
    } catch (err) {
      return jsonError((err as Error).message, 403);
    }
  }

  if (body.action === "incident_history") {
    if (user.role !== "admin") {
      return jsonError("관리자만 조회할 수 있습니다.", 403);
    }
    const incidentId = Number(body.incidentId);
    if (!incidentId) return jsonError("incidentId 필요");
    const history = await listIncidentAcknowledgements(incidentId);
    return jsonOk({ history });
  }

  if (body.all === true) {
    const dbAlerts = await listInboxForUser(user);
    const opsAlerts =
      user.role === "admin"
        ? await listSensorOpsInboxForAdmin(user.id)
        : [];
    await markAllAlertsRead(
      user.id,
      dbAlerts.filter((a) => !a.read).map((a) => a.id)
    );
    if (opsAlerts.length) {
      await markAllSensorOpsAlertsRead(
        user.id,
        opsAlerts.filter((a) => !a.read).map((a) => a.id)
      );
    }
    return jsonOk({ ok: true });
  }

  const id = String(body.id || "");
  if (!id) return jsonError("id 필요");
  if (id.startsWith("ops_")) {
    await markSensorOpsAlertRead(user.id, id);
  } else {
    await markAlertRead(user.id, id);
  }
  return jsonOk({ ok: true });
}
