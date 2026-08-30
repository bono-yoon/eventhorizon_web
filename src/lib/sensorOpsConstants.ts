import type { SensorOpsStatus } from "./types";

export type { SensorOpsStatus };

export const OPS_STATUS_LABELS: Record<SensorOpsStatus, string> = {
  normal: "정상",
  repair_request: "수리요청",
  return_request: "반납요청",
  inspect: "점검중",
};

export const OPS_ALL: SensorOpsStatus[] = [
  "normal",
  "repair_request",
  "return_request",
  "inspect",
];

export const OPS_NOTIFY_STATUSES: SensorOpsStatus[] = [
  "repair_request",
  "return_request",
];
