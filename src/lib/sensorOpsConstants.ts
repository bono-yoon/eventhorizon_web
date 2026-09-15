import type { SensorOpsStatus } from "./types";

export type { SensorOpsStatus };

export const OPS_STATUS_LABELS: Record<SensorOpsStatus, string> = {
  normal: "정상",
  repair_request: "수리요청",
  return_request: "반납요청",
  inspect: "점검중",
  repair_in_progress: "수리진행",
};

/** 건설사·현장 담당자가 바꿀 수 있는 상태 */
export const USER_OPS_ALL: SensorOpsStatus[] = [
  "normal",
  "repair_request",
  "return_request",
  "inspect",
];

/** 관리자 처리 상태 */
export const ADMIN_OPS_ACTIONS: SensorOpsStatus[] = [
  "repair_in_progress",
  "normal",
];

export const OPS_ALL: SensorOpsStatus[] = [
  ...USER_OPS_ALL,
  "repair_in_progress",
];

export const OPS_NOTIFY_STATUSES: SensorOpsStatus[] = [
  "repair_request",
  "return_request",
];
