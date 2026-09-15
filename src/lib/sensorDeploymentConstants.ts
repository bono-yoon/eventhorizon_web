import type { SensorDeploymentPhase } from "./types";

export const DEPLOYMENT_PHASE_LABELS: Record<SensorDeploymentPhase, string> = {
  in_transit: "운반·이동 중",
  installed: "현장 설치됨",
};
