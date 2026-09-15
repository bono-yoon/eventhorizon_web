import type { SensorAssignmentPhase } from "./types";

export const ASSIGNMENT_PHASE_LABELS: Record<SensorAssignmentPhase, string> = {
  shipping: "배송 중",
  installed: "현장 설치됨",
  returning: "회수 이동 중",
  ended: "배정 종료",
};

/** 경로(폴리라인)를 기본 표시하는 단계 */
export const TRAIL_ACTIVE_PHASES: SensorAssignmentPhase[] = [
  "shipping",
  "returning",
];
