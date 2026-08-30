import { getSession } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/api";
import { readStore } from "@/lib/store";
import {
  canAccessSite,
  canControlCommand,
  hasPermission,
} from "@/lib/permissions";
import {
  dbEnabled,
  DEVICE_COMMANDS,
  enqueueDeviceCommand,
  fetchDeviceCommandLog,
  fetchDeviceHold,
  fetchDeviceLogState,
  fetchDeviceRuntime,
  type DeviceCommand,
  type DeviceCommandLogRow,
  type DeviceLogState,
  type DeviceRuntimeState,
} from "@/lib/db";
import { appendUsageLog } from "@/lib/store";
import { OFFLINE_AFTER_MS } from "@/lib/sensors";
import { coalesceCommands } from "@/lib/deviceCommands";
import type { SessionUser } from "@/lib/types";

async function resolveDevice(deviceId: string, user: SessionUser) {
  const store = await readStore();
  const sensor = store.sensors.find((s) => s.deviceId === deviceId);
  if (!sensor || !sensor.siteId) {
    return { error: jsonError("배정된 센서를 찾을 수 없습니다.", 404) };
  }
  const site = store.sites.find((s) => s.id === sensor.siteId);
  if (!site || !canAccessSite(user, site)) {
    return { error: jsonError("현장 접근 권한 없음", 403) };
  }
  return { sensor, site };
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ deviceId: string }> }
) {
  const user = await getSession();
  if (!user) return jsonError("로그인이 필요합니다.", 401);
  if (!dbEnabled()) return jsonError("DB 연동이 꺼져 있습니다.", 503);
  if (!hasPermission(user, "view_sensors")) {
    return jsonError("센서 조회 권한이 없습니다.", 403);
  }

  const { deviceId: rawId } = await ctx.params;
  const deviceId = decodeURIComponent(rawId || "").trim();
  if (!deviceId) return jsonError("deviceId 필요");

  const resolved = await resolveDevice(deviceId, user);
  if ("error" in resolved) return resolved.error;

  const [runtime, logState, hold, commands] = await Promise.all([
    fetchDeviceRuntime(deviceId),
    fetchDeviceLogState(deviceId),
    fetchDeviceHold(deviceId),
    fetchDeviceCommandLog(deviceId, 10),
  ]);

  const activePending = coalesceCommands(
    commands.filter(
      (c) => c.status === "pending" || c.status === "delivered"
    )
  );

  return jsonOk({
    ok: true,
    deviceId,
    state: deriveState({
      runtime,
      logState,
      hold,
      commands: activePending,
      isActive: resolved.sensor.isActive !== false,
    }),
    pending: activePending.map((c) => ({
      id: c.id,
      command: c.command,
      status: c.status,
      createdAt: c.createdAt,
    })),
    recent: commands.slice(0, 5).map((c) => ({
      id: c.id,
      command: c.command,
      status: c.status,
      createdAt: c.createdAt,
      ackedAt: c.ackedAt,
    })),
  });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ deviceId: string }> }
) {
  const user = await getSession();
  if (!user) return jsonError("로그인이 필요합니다.", 401);
  if (!dbEnabled()) return jsonError("DB 연동이 꺼져 있습니다.", 503);

  const { deviceId: rawId } = await ctx.params;
  const deviceId = decodeURIComponent(rawId || "").trim();
  if (!deviceId) return jsonError("deviceId 필요");

  const body = await req.json().catch(() => ({}));
  const command = String(body.command || "").trim() as DeviceCommand;
  if (!DEVICE_COMMANDS.includes(command)) {
    return jsonError(`지원하지 않는 명령: ${command}`);
  }
  if (!canControlCommand(user, command)) {
    return jsonError("이 명령을 실행할 권한이 없습니다.", 403);
  }

  const resolved = await resolveDevice(deviceId, user);
  if ("error" in resolved) return resolved.error;

  const payload =
    body.payload && typeof body.payload === "object" ? body.payload : null;

  try {
    const result = await enqueueDeviceCommand({
      deviceId,
      command,
      payload,
      requestedBy: user.id,
    });
    await appendUsageLog({
      actorUserId: user.id,
      actorName: user.name,
      action: "device.command",
      detail: `${deviceId} ← ${command}`,
      meta: { payload },
    });
    return jsonOk({ ok: true, ...result });
  } catch (err) {
    return jsonError((err as Error).message || "명령 등록 실패", 500);
  }
}


/**
 * 센서 제어 화면에 뿌릴 "마지막 상태".
 * 우선순위는 앱이 보고한 런타임 → 실제 수집 로그 → 웹에서 보낸 요청값 순.
 */
function deriveState({
  runtime,
  logState,
  hold,
  commands,
  isActive,
}: {
  runtime: DeviceRuntimeState | null;
  logState: DeviceLogState | null;
  hold: { holdActive: boolean; releaseRequested: boolean } | null;
  commands: DeviceCommandLogRow[];
  isActive: boolean;
}) {
  const latestPayload = (command: string) =>
    commands.find((c) => c.command === command)?.payload ?? null;

  const latestHoldCmd = commands.find(
    (c) => c.command === "hold_on" || c.command === "hold_off"
  );

  const num = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const pickDevice = <T>(reported: T | null) => ({
    value: reported,
    source: reported != null ? ("device" as const) : null,
  });

  const modePayload = latestPayload("set_mode");
  const intervalPayload = latestPayload("set_interval");
  const tiltPayload = latestPayload("set_tilt_threshold");

  const requestedMode =
    typeof modePayload?.mode === "string" ? modePayload.mode : null;

  const lastSeenAt = newerOf(runtime?.lastSeenAt, logState?.lastReceivedAt);
  const online =
    lastSeenAt != null &&
    Date.now() - new Date(lastSeenAt).getTime() <= OFFLINE_AFTER_MS;

  const actualStopped =
    runtime?.holdActive ?? logState?.hold ?? false;

  const desiredRunning =
    latestHoldCmd?.command === "hold_off"
      ? true
      : latestHoldCmd?.command === "hold_on"
        ? false
        : null;

  const actualMode = runtime?.operationMode ?? logState?.operationMode ?? null;
  const actualTilt = runtime?.tiltThresholdDeg ?? null;
  const actualRealtime =
    runtime?.realtimeIntervalSec ?? logState?.alwaysOnIntervalSec ?? null;
  const actualUpload =
    runtime?.uploadIntervalMin ?? logState?.ultraSaverUploadMin ?? null;

  return {
    status: !isActive
      ? ("inactive" as const)
      : !online
        ? ("offline" as const)
        : actualStopped
          ? ("stopped" as const)
          : ("running" as const),
    running: !actualStopped,
    desiredRunning,
    holdReleasePending: hold?.releaseRequested ?? false,
    blackboxLocked: runtime?.blackboxLocked ?? false,
    mode: pickDevice(actualMode),
    tiltDeg: pickDevice(actualTilt),
    realtimeSec: pickDevice(actualRealtime),
    uploadMin: pickDevice(actualUpload),
    desiredMode: requestedMode
      ? { value: requestedMode, source: "requested" as const }
      : { value: null, source: null },
    desiredTiltDeg: num(
      tiltPayload?.degrees ?? tiltPayload?.tilt_threshold_deg
    )
      ? {
          value: num(tiltPayload?.degrees ?? tiltPayload?.tilt_threshold_deg)!,
          source: "requested" as const,
        }
      : { value: null, source: null },
    desiredRealtimeSec: num(intervalPayload?.realtime_interval_sec)
      ? {
          value: num(intervalPayload?.realtime_interval_sec)!,
          source: "requested" as const,
        }
      : { value: null, source: null },
    desiredUploadMin: num(intervalPayload?.upload_interval_min)
      ? {
          value: num(intervalPayload?.upload_interval_min)!,
          source: "requested" as const,
        }
      : { value: null, source: null },
    lastSeenAt,
    lastMeasuredAt: logState?.lastMeasuredAt ?? null,
    reportedAt: runtime?.reportedAt ?? null,
    known: Boolean(runtime || logState),
  };
}

function newerOf(a?: string | null, b?: string | null) {
  if (!a) return b ?? null;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}
