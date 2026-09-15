import { getSession } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/api";
import { readStore } from "@/lib/store";
import { hasPermission } from "@/lib/permissions";
import {
  completeSensorInstall,
  completeSensorRemoval,
  completeAssignmentReturn,
  getSensorDeployment,
  startShippingAssignment,
} from "@/lib/sensorDeployment";
import { listAssignmentsForDevice } from "@/lib/sensorAssignment";

function canManageDeployment(user: Awaited<ReturnType<typeof getSession>>) {
  if (!user) return false;
  return (
    user.role === "admin" ||
    user.role === "field_worker" ||
    hasPermission(user, "manage_sensor_deployment")
  );
}

export async function GET(req: Request) {
  const user = await getSession();
  if (!user) return jsonError("로그인이 필요합니다.", 401);

  const url = new URL(req.url);
  const deviceId = url.searchParams.get("deviceId");
  if (!deviceId) return jsonError("deviceId 필요");

  const deployment = await getSensorDeployment(deviceId);
  const assignments = await listAssignmentsForDevice(deviceId);
  return jsonOk({ deployment, assignments });
}

export async function POST(req: Request) {
  const user = await getSession();
  if (!user) return jsonError("로그인이 필요합니다.", 401);
  if (!canManageDeployment(user)) {
    return jsonError("설치·해체 권한이 없습니다.", 403);
  }

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");
  const deviceId = String(body.deviceId || "");
  if (!deviceId) return jsonError("deviceId 필요");

  const store = await readStore();
  const sensor = store.sensors.find((s) => s.deviceId === deviceId);
  const sensorLabel = sensor?.label ?? deviceId;
  const siteWebId =
    body.siteId != null && body.siteId !== ""
      ? String(body.siteId)
      : (sensor?.siteId ?? null);

  try {
    if (action === "start_shipping") {
      if (!siteWebId) return jsonError("siteId가 필요합니다.");
      const assignment = await startShippingAssignment({
        user,
        deviceId,
        siteWebId,
      });
      return jsonOk({ ok: true, assignment });
    }

    if (action === "install_complete") {
      await completeSensorInstall({
        user,
        deviceId,
        sensorLabel,
        siteWebId,
      });
      return jsonOk({ ok: true });
    }

    if (action === "removal_complete") {
      // 해체: 서비스 본사 현장작업자 또는 admin
      if (user.role !== "admin" && user.role !== "field_worker") {
        return jsonError("해체 완료는 본사 현장작업자만 처리할 수 있습니다.", 403);
      }
      await completeSensorRemoval({
        user,
        deviceId,
        sensorLabel,
      });
      return jsonOk({ ok: true });
    }

    if (action === "return_complete" || action === "end_assignment") {
      await completeAssignmentReturn({ user, deviceId });
      return jsonOk({ ok: true });
    }

    return jsonError(
      "action 필요 (start_shipping | install_complete | removal_complete | return_complete)"
    );
  } catch (err) {
    return jsonError((err as Error).message, 400);
  }
}
