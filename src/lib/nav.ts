import type { SessionUser } from "./types";

export type NavItem = { href: string; label: string };

export const adminNav: NavItem[] = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/sensors", label: "센서관리" },
  { href: "/admin/sites", label: "현장관리" },
  { href: "/admin/users", label: "유저관리" },
];

export function companyNav(companyId: string): NavItem[] {
  return [
    { href: `/company/${companyId}`, label: "대시보드" },
    { href: `/company/${companyId}/sensors`, label: "센서관리" },
    { href: `/company/${companyId}/sites`, label: "현장관리" },
    { href: `/company/${companyId}/org`, label: "조직도" },
  ];
}

/** 서비스 본사 현장작업자: 센서 최초 설치·현장 배송·현장 안내·현장 점검 (건설사 소속 아님) */
export function fieldWorkerNav(): NavItem[] {
  return [{ href: "/admin/sensors", label: "센서관리" }];
}

/** 현장 상세처럼 하위 페이지에서도 상위 4개 메뉴를 유지한다. */
export function shellNav(
  user: SessionUser,
  companyId?: string | null
): NavItem[] {
  if (user.role === "admin") return adminNav;
  if (user.role === "field_worker") return fieldWorkerNav();
  const id = companyId || user.companyId;
  return id ? companyNav(id) : [];
}

export function isNavActive(pathname: string, item: NavItem): boolean {
  if (pathname === item.href) return true;

  switch (item.label) {
    case "대시보드":
      return /^\/site\/[^/]+$/.test(pathname);
    case "센서관리":
      // 현장 /sensors(센서 데이터)와 구분 — 회사·어드민 센서관리만
      return (
        pathname.startsWith("/admin/sensors") ||
        /\/company\/[^/]+\/sensors/.test(pathname)
      );
    case "현장관리":
      return (
        pathname.includes("/sites") ||
        /\/site\/[^/]+\/manage$/.test(pathname) ||
        pathname.startsWith("/admin/inventory")
      );
    case "조직도":
      return (
        pathname.includes("/org") ||
        pathname.includes("/permissions")
      );
    case "유저관리":
      return pathname.startsWith("/admin/users");
    default:
      return pathname.startsWith(item.href + "/");
  }
}
