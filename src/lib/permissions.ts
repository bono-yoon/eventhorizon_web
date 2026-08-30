import type { GlobalRole, Permission, SessionUser, Site } from "./types";
import { ALL_PERMISSIONS, COMPANY_PERMISSIONS } from "./types";

const ROLE_DEFAULTS: Record<GlobalRole, Permission[]> = {
  admin: [...ALL_PERMISSIONS],
  company: [...COMPANY_PERMISSIONS],
  site_manager: [
    "view_company_dashboard",
    "view_site_dashboard",
    "view_sensors",
    "manage_sensors",
    "view_logs",
    "receive_alerts",
    "control_sensor_run",
    "control_sensor_config",
    "control_sensor_threshold",
    "control_sensor_origin",
  ],
  employee: [
    "view_site_dashboard",
    "view_sensors",
    "receive_alerts",
  ],
};

export function effectivePermissions(user: SessionUser): Permission[] {
  if (user.role === "admin") {
    return [...ALL_PERMISSIONS];
  }
  if (user.role === "company") {
    return [...COMPANY_PERMISSIONS];
  }
  if (user.role === "site_manager") {
    const set = new Set([...ROLE_DEFAULTS.site_manager, ...user.permissions]);
    return [...set];
  }
  return user.permissions.length
    ? user.permissions
    : [...ROLE_DEFAULTS.employee];
}

export function hasPermission(user: SessionUser, perm: Permission): boolean {
  return effectivePermissions(user).includes(perm);
}

export function canAccessCompany(
  user: SessionUser,
  companyId: string
): boolean {
  if (user.role === "admin") return true;
  return user.companyId === companyId;
}

export function canAccessSite(user: SessionUser, site: Site): boolean {
  if (user.role === "admin") return true;
  if (user.companyId !== site.companyId) return false;
  if (user.role === "company") return true;
  return user.siteIds.includes(site.id);
}

export function accessibleSites(user: SessionUser, sites: Site[]): Site[] {
  return sites.filter((site) => canAccessSite(user, site));
}

export function canControlCommand(
  user: SessionUser,
  command: string
): boolean {
  switch (command) {
    case "hold_on":
    case "hold_off":
      return hasPermission(user, "control_sensor_run");
    case "set_mode":
    case "set_interval":
      return hasPermission(user, "control_sensor_config");
    case "set_tilt_threshold":
      return hasPermission(user, "control_sensor_threshold");
    case "reset_origin":
      return hasPermission(user, "control_sensor_origin");
    default:
      return false;
  }
}

export function roleLabel(role: GlobalRole): string {
  switch (role) {
    case "admin":
      return "시스템 관리자";
    case "company":
      return "건설사";
    case "site_manager":
      return "현장 소장";
    case "employee":
      return "직원";
  }
}

export const ALERT_ROLE_PRIORITY: Record<GlobalRole, number> = {
  site_manager: 1,
  employee: 2,
  company: 3,
  admin: 4,
};
