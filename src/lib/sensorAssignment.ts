import { uid } from "./api";
import {
  fromWebSiteId,
  toWebSiteId,
  getPool,
} from "./db";
import { appendUsageLog } from "./store";
import type {
  SensorAssignmentPhase,
  SensorSiteAssignment,
  SessionUser,
} from "./types";
import { TRAIL_ACTIVE_PHASES } from "./sensorAssignmentConstants";
import type { RowDataPacket, ResultSetHeader } from "mysql2";

export type { SensorAssignmentPhase, SensorSiteAssignment };
export {
  ASSIGNMENT_PHASE_LABELS,
  TRAIL_ACTIVE_PHASES,
} from "./sensorAssignmentConstants";

function rowToAssignment(r: Record<string, unknown>): SensorSiteAssignment {
  const siteRaw = r.site_id ?? r.siteId;
  const siteId =
    typeof siteRaw === "number"
      ? toWebSiteId(siteRaw)
      : String(siteRaw || "");
  return {
    id: String(r.id),
    deviceId: String(r.device_id ?? r.deviceId),
    siteId,
    phase: String(r.phase) as SensorAssignmentPhase,
    startedAt: toIso(r.started_at ?? r.startedAt),
    installedAt: toIsoOrNull(r.installed_at ?? r.installedAt),
    dismantledAt: toIsoOrNull(r.dismantled_at ?? r.dismantledAt),
    endedAt: toIsoOrNull(r.ended_at ?? r.endedAt),
    createdByUserId: r.created_by_user_id
      ? String(r.created_by_user_id)
      : r.createdByUserId
        ? String(r.createdByUserId)
        : null,
    createdByName: r.created_by_name
      ? String(r.created_by_name)
      : r.createdByName
        ? String(r.createdByName)
        : null,
    updatedByUserId: r.updated_by_user_id
      ? String(r.updated_by_user_id)
      : r.updatedByUserId
        ? String(r.updatedByUserId)
        : null,
    updatedByName: r.updated_by_name
      ? String(r.updated_by_name)
      : r.updatedByName
        ? String(r.updatedByName)
        : null,
  };
}

function toIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") return new Date(v).toISOString();
  return new Date().toISOString();
}

function toIsoOrNull(v: unknown): string | null {
  if (v == null || v === "") return null;
  return toIso(v);
}

export async function listAssignmentsForDevice(
  deviceId: string
): Promise<SensorSiteAssignment[]> {
  const p = getPool();
  if (!p) throw new Error("DB unavailable");
  const [rows] = await p.query<RowDataPacket[]>(
    `SELECT * FROM sensor_site_assignments
     WHERE device_id = ?
     ORDER BY started_at DESC, id DESC`,
    [deviceId]
  );
  return (rows as Record<string, unknown>[]).map(rowToAssignment);
}

export async function getOpenAssignment(
  deviceId: string
): Promise<SensorSiteAssignment | null> {
  const list = await listAssignmentsForDevice(deviceId);
  return list.find((a) => a.endedAt == null && a.phase !== "ended") ?? null;
}

/** 현재 배정에서 경로를 그릴 시간 구간 */
export async function getAssignmentTrailWindow(deviceId: string): Promise<{
  showTrail: boolean;
  sinceTs: number | null;
  untilTs: number | null;
  assignment: SensorSiteAssignment | null;
}> {
  const open = await getOpenAssignment(deviceId);
  if (!open) {
    return {
      showTrail: true,
      sinceTs: null,
      untilTs: null,
      assignment: null,
    };
  }
  if (!TRAIL_ACTIVE_PHASES.includes(open.phase)) {
    return {
      showTrail: false,
      sinceTs: null,
      untilTs: null,
      assignment: open,
    };
  }
  if (open.phase === "returning" && open.dismantledAt) {
    return {
      showTrail: true,
      sinceTs: new Date(open.dismantledAt).getTime(),
      untilTs: null,
      assignment: open,
    };
  }
  // shipping: 출고~설치(또는 현재)
  const until = open.installedAt
    ? new Date(open.installedAt).getTime()
    : null;
  return {
    showTrail: true,
    sinceTs: new Date(open.startedAt).getTime(),
    untilTs: until,
    assignment: open,
  };
}

/** 선택 배정의 운반 구간(설치 전) — 설치 후에도 이력 조회용 */
export function outboundTrailWindow(a: SensorSiteAssignment): {
  sinceTs: number;
  untilTs: number | null;
} {
  return {
    sinceTs: new Date(a.startedAt).getTime(),
    untilTs: a.installedAt
      ? new Date(a.installedAt).getTime()
      : a.endedAt
        ? new Date(a.endedAt).getTime()
        : null,
  };
}

export async function startShippingAssignment(params: {
  user: SessionUser;
  deviceId: string;
  siteWebId: string;
}): Promise<SensorSiteAssignment> {
  const existing = await getOpenAssignment(params.deviceId);
  if (existing) {
    throw new Error("이미 진행 중인 배정이 있습니다. 먼저 종료하세요.");
  }
  const now = new Date().toISOString();
  const id = uid("asg");

  const p = getPool();
  const siteDbId = fromWebSiteId(params.siteWebId);
  if (!p || siteDbId == null) {
    throw new Error("현장 ID가 올바르지 않거나 DB를 사용할 수 없습니다.");
  }
  const [result] = await p.execute<ResultSetHeader>(
    `INSERT INTO sensor_site_assignments
      (device_id, site_id, phase, started_at,
       created_by_user_id, created_by_name, updated_by_user_id, updated_by_name)
     VALUES (?, ?, 'shipping', ?, ?, ?, ?, ?)`,
    [
      params.deviceId,
      siteDbId,
      new Date(now),
      params.user.id,
      params.user.name,
      params.user.id,
      params.user.name,
    ]
  );
  const insertId = Number(result.insertId || 0);
  return {
    id: String(insertId || id),
    deviceId: params.deviceId,
    siteId: params.siteWebId,
    phase: "shipping",
    startedAt: now,
    installedAt: null,
    dismantledAt: null,
    endedAt: null,
    createdByUserId: params.user.id,
    createdByName: params.user.name,
    updatedByUserId: params.user.id,
    updatedByName: params.user.name,
  };
}

async function patchOpenAssignment(
  deviceId: string,
  patch: Partial<SensorSiteAssignment>,
  user: SessionUser
): Promise<SensorSiteAssignment> {
  const open = await getOpenAssignment(deviceId);
  if (!open) throw new Error("진행 중인 배정이 없습니다.");

  const next: SensorSiteAssignment = {
    ...open,
    ...patch,
    updatedByUserId: user.id,
    updatedByName: user.name,
  };

  const p = getPool();
  if (!p) throw new Error("DB unavailable");
  await p.execute(
    `UPDATE sensor_site_assignments SET
       phase = ?,
       installed_at = ?,
       dismantled_at = ?,
       ended_at = ?,
       updated_by_user_id = ?,
       updated_by_name = ?
     WHERE id = ?`,
    [
      next.phase,
      next.installedAt ? new Date(next.installedAt) : null,
      next.dismantledAt ? new Date(next.dismantledAt) : null,
      next.endedAt ? new Date(next.endedAt) : null,
      user.id,
      user.name,
      Number(open.id) || open.id,
    ]
  );
  return next;
}

export async function markAssignmentInstalled(
  deviceId: string,
  user: SessionUser
) {
  const now = new Date().toISOString();
  const open = await getOpenAssignment(deviceId);
  if (!open) throw new Error("진행 중인 배정이 없습니다.");
  if (open.phase !== "shipping") {
    throw new Error("배송 중 상태에서만 설치 완료할 수 있습니다.");
  }
  const next = await patchOpenAssignment(
    deviceId,
    { phase: "installed", installedAt: now },
    user
  );
  await appendUsageLog({
    actorUserId: user.id,
    actorName: user.name,
    action: "assignment_install",
    detail: `${deviceId} 설치 완료`,
    meta: { deviceId, assignmentId: next.id, siteId: next.siteId },
  });
  return next;
}

export async function markAssignmentDismantled(
  deviceId: string,
  user: SessionUser
) {
  const now = new Date().toISOString();
  const open = await getOpenAssignment(deviceId);
  if (!open) throw new Error("진행 중인 배정이 없습니다.");
  if (open.phase !== "installed") {
    throw new Error("설치됨 상태에서만 해체 완료할 수 있습니다.");
  }
  const next = await patchOpenAssignment(
    deviceId,
    { phase: "returning", dismantledAt: now },
    user
  );
  await appendUsageLog({
    actorUserId: user.id,
    actorName: user.name,
    action: "assignment_dismantle",
    detail: `${deviceId} 해체 완료 (회수 이동 시작)`,
    meta: { deviceId, assignmentId: next.id, siteId: next.siteId },
  });
  return next;
}

export async function endAssignment(deviceId: string, user: SessionUser) {
  const now = new Date().toISOString();
  const open = await getOpenAssignment(deviceId);
  if (!open) throw new Error("진행 중인 배정이 없습니다.");
  const next = await patchOpenAssignment(
    deviceId,
    { phase: "ended", endedAt: now },
    user
  );
  await appendUsageLog({
    actorUserId: user.id,
    actorName: user.name,
    action: "assignment_end",
    detail: `${deviceId} 배정 종료`,
    meta: { deviceId, assignmentId: next.id, siteId: next.siteId },
  });
  return next;
}

/** 현장 종료 시 해당 현장의 열린 배정 일괄 종료 */
export async function endOpenAssignmentsForSite(
  siteWebId: string,
  user: SessionUser
) {
  const now = new Date().toISOString();
  const p = getPool();
  const siteDbId = fromWebSiteId(siteWebId);
  if (!p || siteDbId == null) {
    throw new Error("현장 ID가 올바르지 않거나 DB를 사용할 수 없습니다.");
  }
  await p.execute(
    `UPDATE sensor_site_assignments
     SET phase = 'ended', ended_at = ?, updated_by_user_id = ?, updated_by_name = ?
     WHERE site_id = ? AND ended_at IS NULL`,
    [new Date(now), user.id, user.name, siteDbId]
  );
}
