import bcrypt from "bcryptjs";
import type { AppStore } from "./types";

const hash = (pw: string) => bcrypt.hashSync(pw, 8);

export function createSeedStore(): AppStore {
  const now = new Date().toISOString();

  const companyId = "co_hanbit";
  const siteA = "site_gangnam";
  const siteB = "site_songdo";
  const siteC = "site_busan";

  const adminId = "u_admin";
  const companyUserId = "u_company";
  const managerAId = "u_mgr_a";
  const managerBId = "u_mgr_b";
  const emp1Id = "u_emp_1";
  const emp2Id = "u_emp_2";
  const emp3Id = "u_emp_3";

  const orgRoot = "org_root";
  const orgOps = "org_ops";
  const orgSiteA = "org_site_a";
  const orgSiteB = "org_site_b";
  const orgEmp = "org_emp";

  return {
    companies: [
      {
        id: companyId,
        name: "한빛건설",
        code: "HANBIT",
        address: "서울특별시 강남구 테헤란로 152",
        lat: 37.5012,
        lon: 127.0396,
        createdAt: now,
      },
    ],
    sites: [
      {
        id: siteA,
        companyId,
        name: "역삼 업무복합 신축",
        code: "GN-01",
        address: "서울 강남구 역삼동 736-9",
        lat: 37.5008,
        lon: 127.0364,
        status: "active",
        managerUserId: managerAId,
        createdAt: now,
      },
      {
        id: siteB,
        companyId,
        name: "판교 알파돔시티 3구역",
        code: "SD-02",
        address: "경기 성남시 분당구 판교역로 235",
        lat: 37.3947,
        lon: 127.1112,
        status: "active",
        managerUserId: managerBId,
        createdAt: now,
      },
      {
        id: siteC,
        companyId,
        name: "마곡 중앙공원 인근 오피스",
        code: "BS-03",
        address: "서울 강서구 마곡동 797",
        lat: 37.5663,
        lon: 126.827,
        status: "paused",
        managerUserId: null,
        createdAt: now,
      },
    ],
    users: [
      {
        id: adminId,
        email: "admin@eventhorizon.local",
        passwordHash: hash("admin123"),
        name: "시스템 관리자",
        role: "admin",
        companyId: null,
        siteIds: [],
        permissions: [],
        orgNodeId: null,
        active: true,
        createdAt: now,
      },
      {
        id: companyUserId,
        email: "company@hanbit.local",
        passwordHash: hash("company123"),
        name: "한빛 본사",
        role: "company",
        companyId,
        siteIds: [siteA, siteB, siteC],
        permissions: [],
        orgNodeId: orgRoot,
        active: true,
        createdAt: now,
      },
      {
        id: managerAId,
        email: "manager@hanbit.local",
        passwordHash: hash("manager123"),
        name: "김현수 소장",
        role: "site_manager",
        companyId,
        siteIds: [siteA],
        permissions: [],
        orgNodeId: orgSiteA,
        active: true,
        createdAt: now,
      },
      {
        id: managerBId,
        email: "manager2@hanbit.local",
        passwordHash: hash("manager123"),
        name: "박지윤 소장",
        role: "site_manager",
        companyId,
        siteIds: [siteB],
        permissions: [],
        orgNodeId: orgSiteB,
        active: true,
        createdAt: now,
      },
      {
        id: emp1Id,
        email: "employee@hanbit.local",
        passwordHash: hash("employee123"),
        name: "이서준",
        role: "employee",
        companyId,
        siteIds: [siteA],
        permissions: [
          "view_company_dashboard",
          "view_site_dashboard",
          "view_sensors",
          "view_logs",
        ],
        orgNodeId: orgEmp,
        active: true,
        createdAt: now,
      },
      {
        id: emp2Id,
        email: "safety@hanbit.local",
        passwordHash: hash("employee123"),
        name: "최안전",
        role: "employee",
        companyId,
        siteIds: [siteA, siteB],
        permissions: [
          "view_company_dashboard",
          "view_site_dashboard",
          "view_sensors",
          "manage_org",
          "receive_alerts",
        ],
        orgNodeId: orgOps,
        active: true,
        createdAt: now,
      },
      {
        id: emp3Id,
        email: "field@hanbit.local",
        passwordHash: hash("employee123"),
        name: "정현장",
        role: "employee",
        companyId,
        siteIds: [siteB],
        permissions: ["view_site_dashboard", "view_sensors"],
        orgNodeId: null,
        active: true,
        createdAt: now,
      },
    ],
    orgNodes: [
      {
        id: orgRoot,
        companyId,
        parentId: null,
        title: "대표이사 / 본사",
        userId: companyUserId,
        order: 0,
      },
      {
        id: orgOps,
        companyId,
        parentId: orgRoot,
        title: "안전관리팀",
        userId: emp2Id,
        order: 0,
      },
      {
        id: orgSiteA,
        companyId,
        parentId: orgRoot,
        title: "역삼 업무복합 신축",
        userId: managerAId,
        order: 1,
      },
      {
        id: orgSiteB,
        companyId,
        parentId: orgRoot,
        title: "판교 알파돔시티 3구역",
        userId: managerBId,
        order: 2,
      },
      {
        id: orgEmp,
        companyId,
        parentId: orgSiteA,
        title: "계측 담당",
        userId: emp1Id,
        order: 0,
      },
    ],
    sensors: [
      {
        id: "sen_1",
        deviceId: "EH-7007759c5e1d64a1",
        siteId: siteA,
        label: "A동 지하 1층",
        isActive: true,
        installedAt: now,
        status: "assigned",
        memo: null,
        mode: "ALWAYS_ON",
        modeIntervalSec: 10,
        thresholdAccel: 2.5,
        thresholdTempC: 45,
        thresholdBattery: 15,
      },
      {
        id: "sen_2",
        deviceId: "EH-A2B3C4D5E6F7",
        siteId: siteA,
        label: "크레인 지지대",
        isActive: true,
        installedAt: now,
        status: "assigned",
        memo: null,
        mode: "ALWAYS_ON",
        modeIntervalSec: 10,
        thresholdAccel: 2.5,
        thresholdTempC: 45,
        thresholdBattery: 15,
      },
      {
        id: "sen_3",
        deviceId: "EH-SONGDO-001",
        siteId: siteB,
        label: "기초 슬라브 #3",
        isActive: true,
        installedAt: now,
        status: "assigned",
        memo: null,
        mode: "INTERVAL",
        modeIntervalSec: 30,
        thresholdAccel: 2.2,
        thresholdTempC: 42,
        thresholdBattery: 20,
      },
      {
        id: "sen_4",
        deviceId: "EH-SONGDO-002",
        siteId: siteB,
        label: "가시설 가드",
        isActive: true,
        installedAt: now,
        status: "assigned",
        memo: null,
        mode: "ALWAYS_ON",
        modeIntervalSec: 10,
        thresholdAccel: 2.5,
        thresholdTempC: 45,
        thresholdBattery: 15,
      },
      {
        id: "sen_5",
        deviceId: "EH-BUSAN-001",
        siteId: siteC,
        label: "항만 펜스",
        isActive: false,
        installedAt: now,
        status: "assigned",
        memo: null,
        mode: "HOLD",
        modeIntervalSec: 60,
        thresholdAccel: 3.0,
        thresholdTempC: 50,
        thresholdBattery: 10,
      },
    ],
    readings: buildReadings([
      { deviceId: "EH-7007759c5e1d64a1", lat: 37.5009, lon: 127.0365, bat: 78 },
      { deviceId: "EH-A2B3C4D5E6F7", lat: 37.5011, lon: 127.0368, bat: 42 },
      { deviceId: "EH-SONGDO-001", lat: 37.3826, lon: 126.6574, bat: 91 },
      { deviceId: "EH-SONGDO-002", lat: 37.3822, lon: 126.6569, bat: 12 },
      { deviceId: "EH-BUSAN-001", lat: 35.0834, lon: 128.8783, bat: 55 },
    ]),
    usageLogs: [
      {
        id: "log_1",
        at: now,
        actorUserId: adminId,
        actorName: "시스템 관리자",
        action: "seed",
        detail: "초기 시드 데이터 적재",
      },
      {
        id: "log_2",
        at: new Date(Date.now() - 3600_000).toISOString(),
        actorUserId: managerAId,
        actorName: "김현수 소장",
        action: "sensor.view",
        detail: "역삼 업무복합 센서 상태 조회",
      },
      {
        id: "log_3",
        at: new Date(Date.now() - 7200_000).toISOString(),
        actorUserId: emp1Id,
        actorName: "이서준",
        action: "login",
        detail: "웹 로그인",
      },
    ],
    alerts: [
      {
        id: "al_1",
        at: new Date(Date.now() - 900_000).toISOString(),
        deviceId: "EH-SONGDO-002",
        siteId: siteB,
        companyId,
        type: "battery",
        severity: "warning",
        message: "배터리 임계값 미만 (12%)",
        value: 12,
        threshold: 15,
        acknowledged: false,
      },
    ],
    sensorOps: {},
    sensorOpsAlerts: [],
    sensorOpsAlertReads: {},
  };
}

function buildReadings(
  devices: { deviceId: string; lat: number; lon: number; bat: number }[]
) {
  const readings = [];
  const now = Date.now();
  for (const d of devices) {
    for (let i = 0; i < 24; i++) {
      const ts = now - i * 5 * 60_000;
      const accel =
        d.deviceId === "EH-A2B3C4D5E6F7" && i === 0
          ? 3.1
          : 0.2 + Math.random() * 0.8;
      readings.push({
        id: `rd_${d.deviceId}_${i}`,
        deviceId: d.deviceId,
        x: accel * (0.4 + Math.random() * 0.2),
        y: accel * (0.3 + Math.random() * 0.2),
        z: accel * (0.5 + Math.random() * 0.3),
        lat: d.lat + (Math.random() - 0.5) * 0.0002,
        lon: d.lon + (Math.random() - 0.5) * 0.0002,
        ts,
        mode: "ALWAYS_ON",
        modeIntervalSec: 10,
        batteryPercent: Math.max(5, d.bat - i),
        temperatureC: 28 + Math.random() * 8,
        hold: false,
      });
    }
  }
  return readings;
}
