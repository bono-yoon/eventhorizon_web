/**
 * 설치/해체 오케스트레이션 — 배정 이력 + inventory 동기화
 */
import {
  fetchAllSensorsFromDb,
  fromSensorWebId,
  fromWebSiteId,
  upsertInventorySensor,
  updateSensorInventory,
} from "./db";
import { syncIngestIntoStore } from "./ingest";
import {
  getOpenAssignment,
  getAssignmentTrailWindow,
  markAssignmentInstalled,
  markAssignmentDismantled,
  endAssignment,
  startShippingAssignment,
} from "./sensorAssignment";
import type { SessionUser } from "./types";
import {
  ASSIGNMENT_PHASE_LABELS,
} from "./sensorAssignmentConstants";

export {
  getOpenAssignment,
  getAssignmentTrailWindow,
  startShippingAssignment,
  endAssignment,
} from "./sensorAssignment";

/** 레거시 UI 호환 — deployment 형태로 변환 */
export async function getSensorDeployment(deviceId: string) {
  const open = await getOpenAssignment(deviceId);
  if (!open) return null;
  const phase =
    open.phase === "installed"
      ? ("installed" as const)
      : ("in_transit" as const);
  return {
    deviceId,
    phase,
    transitSince:
      open.phase === "returning" && open.dismantledAt
        ? open.dismantledAt
        : open.startedAt,
    installedAt: open.installedAt,
    removalCompletedAt: open.dismantledAt,
    updatedAt: open.installedAt || open.dismantledAt || open.startedAt,
    updatedByUserId: open.updatedByUserId || "",
    updatedByName: open.updatedByName || "",
    assignmentPhase: open.phase,
    assignmentPhaseLabel: ASSIGNMENT_PHASE_LABELS[open.phase],
    assignmentId: open.id,
    siteId: open.siteId,
  };
}

export async function getDeploymentTrailPolicy(deviceId: string) {
  const w = await getAssignmentTrailWindow(deviceId);
  return {
    showTrail: w.showTrail,
    sinceTs: w.sinceTs,
    untilTs: w.untilTs,
  };
}

async function syncInventoryOnInstall(params: {
  deviceId: string;
  label: string;
  siteWebId: string | null;
}) {
  const siteDbId = params.siteWebId
    ? fromWebSiteId(params.siteWebId)
    : null;
  if (siteDbId == null) {
    throw new Error("현장이 배정되지 않은 센서는 설치 완료할 수 없습니다.");
  }
  await upsertInventorySensor({
    deviceId: params.deviceId,
    label: params.label,
    status: "assigned",
    siteId: siteDbId,
    memo: "install_complete",
  });
  await syncIngestIntoStore(undefined, true);
}

async function syncInventoryOnRemoval(params: {
  deviceId: string;
  label: string;
}) {
  const all = (await fetchAllSensorsFromDb()) || [];
  const row = all.find((s) => s.deviceId === params.deviceId);
  const dbId =
    row?.id != null ? fromSensorWebId(String(row.id)) : null;
  if (dbId != null) {
    await updateSensorInventory(dbId, {
      status: "recovered",
      siteId: null,
      memo: "removal_complete",
    });
  } else {
    await upsertInventorySensor({
      deviceId: params.deviceId,
      label: params.label,
      status: "recovered",
      siteId: null,
      memo: "removal_complete",
    });
  }
  await syncIngestIntoStore(undefined, true);
}

export async function completeSensorInstall(params: {
  user: SessionUser;
  deviceId: string;
  sensorLabel: string;
  siteWebId: string | null;
}) {
  let open = await getOpenAssignment(params.deviceId);
  if (!open) {
    if (!params.siteWebId) {
      throw new Error("현장이 없어 배정을 시작할 수 없습니다.");
    }
    open = await startShippingAssignment({
      user: params.user,
      deviceId: params.deviceId,
      siteWebId: params.siteWebId,
    });
  }
  await markAssignmentInstalled(params.deviceId, params.user);
  await syncInventoryOnInstall({
    deviceId: params.deviceId,
    label: params.sensorLabel,
    siteWebId: open.siteId || params.siteWebId,
  });
  return { ok: true as const };
}

export async function completeSensorRemoval(params: {
  user: SessionUser;
  deviceId: string;
  sensorLabel: string;
}) {
  await markAssignmentDismantled(params.deviceId, params.user);
  await syncInventoryOnRemoval({
    deviceId: params.deviceId,
    label: params.sensorLabel,
  });
  return { ok: true as const };
}

export async function completeAssignmentReturn(params: {
  user: SessionUser;
  deviceId: string;
}) {
  await endAssignment(params.deviceId, params.user);
  return { ok: true as const };
}

/** 레거시 시드 호환 — 열린 배정이 없으면 shipping 생성은 별도 API */
export async function ensureDemoTransitDeployment(_deviceId: string) {
  return;
}
