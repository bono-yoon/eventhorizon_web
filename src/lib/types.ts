export type GlobalRole = "admin" | "company" | "site_manager" | "employee";

/** 직원 세분 권한 */
export type Permission =
  | "view_company_dashboard"
  | "view_site_dashboard"
  | "view_sensors"
  | "manage_sensors"
  | "manage_sites"
  | "manage_org"
  | "manage_permissions"
  | "view_logs"
  | "receive_alerts"
  | "control_sensor_run"
  | "control_sensor_config"
  | "control_sensor_threshold"
  | "control_sensor_origin";

export const ALL_PERMISSIONS: Permission[] = [
  "view_company_dashboard",
  "view_site_dashboard",
  "view_sensors",
  "manage_sensors",
  "manage_sites",
  "manage_org",
  "manage_permissions",
  "view_logs",
  "receive_alerts",
  "control_sensor_run",
  "control_sensor_config",
  "control_sensor_threshold",
  "control_sensor_origin",
];

/** 건설사·모니터링용 (원격 제어 제외) */
export const COMPANY_PERMISSIONS: Permission[] = [
  "view_company_dashboard",
  "view_site_dashboard",
  "view_sensors",
  "manage_sensors",
  "manage_sites",
  "manage_org",
  "manage_permissions",
  "view_logs",
  "receive_alerts",
];

export const PERMISSION_LABELS: Record<Permission, string> = {
  view_company_dashboard: "건설사 대시보드",
  view_site_dashboard: "현장 대시보드",
  view_sensors: "센서 조회",
  manage_sensors: "센서 관리",
  manage_sites: "현장 관리",
  manage_org: "조직도 수정",
  manage_permissions: "권한 관리",
  view_logs: "사용 로그",
  receive_alerts: "알림 수신",
  control_sensor_run: "센서 가동/중지",
  control_sensor_config: "모드·주기 설정",
  control_sensor_threshold: "임계각 설정",
  control_sensor_origin: "원점 세팅",
};


export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: GlobalRole;
  companyId: string | null;
  siteIds: string[];
  permissions: Permission[];
  orgNodeId: string | null;
  active: boolean;
  createdAt: string;
}

export interface Company {
  id: string;
  name: string;
  code: string;
  address: string;
  lat: number;
  lon: number;
  createdAt: string;
}

export interface Site {
  id: string;
  companyId: string;
  name: string;
  code: string;
  address: string;
  lat: number;
  lon: number;
  status: "active" | "paused" | "closed";
  managerUserId: string | null;
  createdAt: string;
}

export interface OrgNode {
  id: string;
  companyId: string;
  parentId: string | null;
  title: string;
  userId: string | null;
  order: number;
}

export interface SensorDevice {
  id: string;
  deviceId: string;
  /** 미배정(재고)이면 null */
  siteId: string | null;
  label: string;
  isActive: boolean;
  installedAt: string;
  status: SensorStatus;
  memo: string | null;
  /** 설정값 */
  mode: string;
  modeIntervalSec: number;
  thresholdAccel: number;
  thresholdTempC: number;
  thresholdBattery: number;
}

export type SensorStatus =
  | "inventory"
  | "assigned"
  | "recovered"
  | "repair"
  | "disposed";

export const SENSOR_STATUS_LABELS: Record<SensorStatus, string> = {
  inventory: "재고",
  assigned: "현장배정",
  recovered: "회수",
  repair: "수리",
  disposed: "폐기",
};

export const ALL_SENSOR_STATUSES: SensorStatus[] = [
  "inventory",
  "assigned",
  "recovered",
  "repair",
  "disposed",
];

export interface SensorReading {
  id: string;
  deviceId: string;
  x: number;
  y: number;
  z: number;
  lat: number;
  lon: number;
  ts: number;
  mode: string;
  modeIntervalSec: number;
  batteryPercent: number;
  temperatureC: number | null;
  hold: boolean;
}

export interface UsageLog {
  id: string;
  at: string;
  actorUserId: string | null;
  actorName: string;
  action: string;
  detail: string;
  meta?: Record<string, unknown>;
}

export interface AlertEvent {
  id: string;
  at: string;
  deviceId: string;
  siteId: string | null;
  companyId: string;
  type: "accel" | "temp" | "battery" | "hold" | "offline";
  severity: "warning" | "critical";
  message: string;
  value: number;
  threshold: number;
  acknowledged: boolean;
}

/** 건설사·현장에서 설정하는 장비 운영 상태 */
export type SensorOpsStatus =
  | "normal"
  | "repair_request"
  | "return_request"
  | "inspect";

export interface SensorOpsEntry {
  deviceId: string;
  status: SensorOpsStatus;
  companyId: string;
  companyName: string;
  siteId: string | null;
  siteName: string | null;
  sensorLabel: string;
  updatedAt: string;
  updatedByUserId: string;
  updatedByName: string;
}

/** admin 수리·반납 알림 (store 기반 — DB 없을 때도 동작) */
export interface SensorOpsAlert {
  id: string;
  at: string;
  deviceId: string;
  companyId: string;
  status: SensorOpsStatus;
  message: string;
}

export interface AppStore {
  users: User[];
  companies: Company[];
  sites: Site[];
  orgNodes: OrgNode[];
  sensors: SensorDevice[];
  readings: SensorReading[];
  usageLogs: UsageLog[];
  alerts: AlertEvent[];
  sensorOps?: Record<string, SensorOpsEntry>;
  sensorOpsAlerts?: SensorOpsAlert[];
  sensorOpsAlertReads?: Record<string, string[]>;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: GlobalRole;
  companyId: string | null;
  siteIds: string[];
  permissions: Permission[];
}
