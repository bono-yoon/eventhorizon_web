/**
 * 데모 현장·센서·최신 로그 시드
 * 실행: node scripts/seed-demo-sites.mjs
 *
 * - 기존 데모 현장 A/B 이름을 현실적인 명칭으로 변경
 * - 다양한 상태(정상/주의/위험/통신두절/미운영) 현장 추가
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const COMPANY_ID = "co_hanbit";
const now = Date.now();
const HOUR = 3_600_000;

if (!process.env.DB_USER || process.env.DB_PASSWORD === undefined || !process.env.DB_NAME) {
  throw new Error("DB_USER, DB_PASSWORD, DB_NAME 환경변수가 필요합니다.");
}

const c = await mysql.createConnection({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

async function ensureSite(row) {
  const [found] = await c.query(
    "SELECT id FROM sites WHERE name = ? AND company_id = ? LIMIT 1",
    [row.name, COMPANY_ID]
  );
  if (found.length) {
    await c.execute(
      `UPDATE sites
       SET address = ?, lat = ?, lon = ?, status = ?, memo = ?
       WHERE id = ?`,
      [row.address, row.lat, row.lon, row.status, row.memo, found[0].id]
    );
    return Number(found[0].id);
  }
  const [result] = await c.execute(
    `INSERT INTO sites (company_id, name, address, lat, lon, memo, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      COMPANY_ID,
      row.name,
      row.address,
      row.lat,
      row.lon,
      row.memo,
      row.status,
    ]
  );
  return Number(result.insertId);
}

async function ensureSensor({ deviceId, label, siteId, isActive = 1 }) {
  await c.execute(
    `INSERT INTO sensors (device_id, label, site_id, status, memo, is_active, installed_at)
     VALUES (?, ?, ?, 'assigned', 'demo_seed', ?, NOW())
     ON DUPLICATE KEY UPDATE
       label = VALUES(label),
       site_id = VALUES(site_id),
       status = 'assigned',
       is_active = VALUES(is_active),
       memo = 'demo_seed'`,
    [deviceId, label, siteId, isActive]
  );
  await c.execute(
    `INSERT INTO site_sensor_mapping (site_id, device_id, label, installed_at, is_active)
     VALUES (?, ?, ?, NOW(), ?)
     ON DUPLICATE KEY UPDATE
       site_id = VALUES(site_id),
       label = VALUES(label),
       is_active = VALUES(is_active)`,
    [siteId, deviceId, label, isActive]
  );
}

async function insertReading({
  deviceId,
  lat,
  lon,
  x = 0.2,
  y = 0.1,
  z = 0,
  battery = 86,
  temp = 24.5,
  ts = now,
  hold = null,
}) {
  await c.execute(
    `INSERT INTO sensor_logs
      (device_id, x, y, z, lat, lon, ts, mode, mode_interval_sec,
       battery_percent, temperature_c, hold)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'normal', 60, ?, ?, ?)`,
    [deviceId, x, y, z, lat, lon, ts, battery, temp, hold]
  );
}

async function insertTrail(
  deviceId,
  start,
  end,
  points = 27,
  totalMs = 80 * 60 * 1000
) {
  await c.execute(`DELETE FROM sensor_logs WHERE device_id = ?`, [deviceId]);
  const gap = points <= 1 ? 0 : totalMs / (points - 1);
  for (let i = 0; i < points; i++) {
    const t = points <= 1 ? 1 : i / (points - 1);
    const ts = Math.round(now - totalMs + i * gap);
    await insertReading({
      deviceId,
      lat: start.lat + (end.lat - start.lat) * t,
      lon: start.lon + (end.lon - start.lon) * t,
      battery: 91 - Math.floor(i / 4),
      temp: 24.5,
      ts,
      hold: 1,
    });
  }
  console.log(
    `trail ${deviceId}: ${points}pts / ${Math.round(totalMs / 60000)}분`
  );
}

async function ensureHoldRuntime(deviceId) {
  await c.execute(
    `INSERT INTO device_runtime (device_id, blackbox_locked, hold_active, reported_at, last_seen_at)
     VALUES (?, 0, 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE hold_active = 1, last_seen_at = NOW()`,
    [deviceId]
  );
}

async function linkCompanyUser(siteId) {
  await c.execute(
    `INSERT IGNORE INTO web_user_sites (user_id, site_id) VALUES ('u_company', ?)`,
    [siteId]
  );
}

// ── 기존 A/B 이름 변경 ──────────────────────────────────────────
await c.execute(
  `UPDATE sites
   SET name = ?, address = ?, lat = ?, lon = ?, memo = ?, status = 'active', company_id = ?
   WHERE id = 1`,
  [
    "역삼 업무복합 신축",
    "서울 강남구 역삼동 736-9",
    37.5008,
    127.0364,
    "demo_seed",
    COMPANY_ID,
  ]
);
await c.execute(
  `UPDATE sites
   SET name = ?, address = ?, lat = ?, lon = ?, memo = ?, status = 'active', company_id = ?
   WHERE id = 2`,
  [
    "판교 알파돔시티 3구역",
    "경기 성남시 분당구 판교역로 235",
    37.3947,
    127.1112,
    "demo_seed",
    COMPANY_ID,
  ]
);

const sites = {
  yeoksam: 1,
  pangyo: 2,
  magok: await ensureSite({
    name: "마곡 중앙공원 인근 오피스",
    address: "서울 강서구 마곡동 797",
    lat: 37.5663,
    lon: 126.827,
    status: "active",
    memo: "demo_seed · 정상",
  }),
  yeouido: await ensureSite({
    name: "여의도 지하차도 보수",
    address: "서울 영등포구 여의도동 3",
    lat: 37.5219,
    lon: 126.9245,
    status: "active",
    memo: "demo_seed · 주의",
  }),
  jamsil: await ensureSite({
    name: "잠실 스포츠컴플렉스 리모델링",
    address: "서울 송파구 올림픽로 25",
    lat: 37.5145,
    lon: 127.073,
    status: "active",
    memo: "demo_seed · 위험",
  }),
  icn: await ensureSite({
    name: "인천공항 T2 계류장 확장",
    address: "인천 중구 공항로 272",
    lat: 37.449,
    lon: 126.452,
    status: "active",
    memo: "demo_seed · 통신두절",
  }),
  gwanggyo: await ensureSite({
    name: "광교 호수공원 주상복합",
    address: "경기 수원시 영통구 광교호수공원로 300",
    lat: 37.2836,
    lon: 127.066,
    status: "paused",
    memo: "demo_seed · 미운영",
  }),
  haeundae: await ensureSite({
    name: "해운대 센텀2지구 오피스",
    address: "부산 해운대구 센텀중앙로 78",
    lat: 35.1699,
    lon: 129.131,
    status: "closed",
    memo: "demo_seed · 종료",
  }),
};

console.log("sites", sites);

// ── 센서 배정 ───────────────────────────────────────────────────
// 역삼: 기존 장비 유지 + 상태 로그 갱신
await ensureSensor({
  deviceId: "EH-DEMO-001",
  label: "옹벽-1",
  siteId: sites.yeoksam,
});
await ensureSensor({
  deviceId: "EH-DEMO-002",
  label: "비계-1",
  siteId: sites.yeoksam,
});
await ensureSensor({
  deviceId: "EH-7007759c5e1d64a1",
  label: "에뮬레이터-테스트",
  siteId: sites.yeoksam,
});

// 판교
await ensureSensor({
  deviceId: "EH-DEMO-003",
  label: "가설지지대-1",
  siteId: sites.pangyo,
});
await ensureSensor({
  deviceId: "EH-DEMO-004",
  label: "슬라브-2",
  siteId: sites.pangyo,
});

// 마곡 · 정상
await ensureSensor({
  deviceId: "EH-DEMO-101",
  label: "흙막이-A1",
  siteId: sites.magok,
});
await ensureSensor({
  deviceId: "EH-DEMO-102",
  label: "흙막이-A2",
  siteId: sites.magok,
});

// 여의도 · 주의(기울기)
await ensureSensor({
  deviceId: "EH-DEMO-201",
  label: "벽체-B1",
  siteId: sites.yeouido,
});
await ensureSensor({
  deviceId: "EH-DEMO-202",
  label: "벽체-B2",
  siteId: sites.yeouido,
});

// 잠실 · 위험
await ensureSensor({
  deviceId: "EH-DEMO-301",
  label: "트러스-C1",
  siteId: sites.jamsil,
});
await ensureSensor({
  deviceId: "EH-DEMO-302",
  label: "트러스-C2",
  siteId: sites.jamsil,
});

// 인천 · 통신두절 (>50% 오프라인)
await ensureSensor({
  deviceId: "EH-DEMO-401",
  label: "계류장-D1",
  siteId: sites.icn,
});
await ensureSensor({
  deviceId: "EH-DEMO-402",
  label: "계류장-D2",
  siteId: sites.icn,
});
await ensureSensor({
  deviceId: "EH-DEMO-403",
  label: "계류장-D3",
  siteId: sites.icn,
});

// 광교 · 미운영 (현장 paused + 센서 비활성)
await ensureSensor({
  deviceId: "EH-DEMO-501",
  label: "타워크레인-E1",
  siteId: sites.gwanggyo,
  isActive: 0,
});

// 해운대 · 종료
await ensureSensor({
  deviceId: "EH-DEMO-601",
  label: "커튼월-F1",
  siteId: sites.haeundae,
  isActive: 0,
});

// ── 최신 로그 (상태 연출) ───────────────────────────────────────
// 성남시청 → 현장 운반 경로 (약 1시간 20분, hold)
const SEONGNAM_CITY_HALL = { lat: 37.4199, lon: 127.1266 };

await insertTrail("EH-DEMO-001", SEONGNAM_CITY_HALL, {
  lat: 37.5009,
  lon: 127.0365,
});
await insertTrail("EH-DEMO-002", SEONGNAM_CITY_HALL, {
  lat: 37.501,
  lon: 127.0362,
});
await ensureHoldRuntime("EH-DEMO-001");
await ensureHoldRuntime("EH-DEMO-002");

// 에뮬레이터: 이동 더미 없음 (현장 고정 위치만)
await insertReading({
  deviceId: "EH-7007759c5e1d64a1",
  lat: 37.5007,
  lon: 127.0366,
  battery: 91,
  temp: 23,
});

// 판교: 전부 정상
await insertReading({
  deviceId: "EH-DEMO-003",
  lat: 37.3948,
  lon: 127.111,
  battery: 88,
  temp: 22,
});
await insertReading({
  deviceId: "EH-DEMO-004",
  lat: 37.3945,
  lon: 127.1114,
  battery: 74,
  temp: 25,
});

// 마곡: 정상
await insertReading({
  deviceId: "EH-DEMO-101",
  lat: 37.5664,
  lon: 126.8272,
});
await insertReading({
  deviceId: "EH-DEMO-102",
  lat: 37.5661,
  lon: 126.8268,
});

// 여의도: 주의(기울기 ≥ 임계각) + 정상
await insertReading({
  deviceId: "EH-DEMO-201",
  lat: 37.522,
  lon: 126.9246,
  x: 5.6,
  y: 1.2,
  z: 0.4,
  battery: 55,
  temp: 31,
});
await insertReading({
  deviceId: "EH-DEMO-202",
  lat: 37.5217,
  lon: 126.9243,
});

// 잠실: 성남시청 → 현장 운반 + 위험(배터리)
await insertTrail("EH-DEMO-301", SEONGNAM_CITY_HALL, {
  lat: 37.5146,
  lon: 127.0732,
});
await insertTrail("EH-DEMO-302", SEONGNAM_CITY_HALL, {
  lat: 37.5143,
  lon: 127.0728,
});
await ensureHoldRuntime("EH-DEMO-301");
await ensureHoldRuntime("EH-DEMO-302");

// 인천: 1대만 최근, 2대는 오래된 타임스탬프 → 통신두절
await insertReading({
  deviceId: "EH-DEMO-401",
  lat: 37.4491,
  lon: 126.4522,
  battery: 67,
});
await insertReading({
  deviceId: "EH-DEMO-402",
  lat: 37.4488,
  lon: 126.4518,
  ts: now - 8 * HOUR,
  battery: 40,
});
await insertReading({
  deviceId: "EH-DEMO-403",
  lat: 37.4493,
  lon: 126.4525,
  ts: now - 12 * HOUR,
  battery: 33,
});

// 광교/해운대: 비활성 — 오래된 로그만
await insertReading({
  deviceId: "EH-DEMO-501",
  lat: 37.2837,
  lon: 127.0662,
  ts: now - 72 * HOUR,
});
await insertReading({
  deviceId: "EH-DEMO-601",
  lat: 35.17,
  lon: 129.1312,
  ts: now - 120 * HOUR,
});

for (const id of Object.values(sites)) {
  await linkCompanyUser(id);
}

// store.json 배포 단계 (운반 중) — 역삼·잠실 4대, 에뮬레이터 제외
const storePath = path.join(ROOT, "data", "store.json");
const TRANSIT_SEED_DEVICES = [
  { id: "EH-DEMO-001", end: { lat: 37.5009, lon: 127.0365 }, bat: 78 },
  { id: "EH-DEMO-002", end: { lat: 37.501, lon: 127.0362 }, bat: 62 },
  { id: "EH-DEMO-301", end: { lat: 37.5146, lon: 127.0732 }, bat: 41 },
  { id: "EH-DEMO-302", end: { lat: 37.5143, lon: 127.0728 }, bat: 12 },
];
const TRAVEL_MS = 80 * 60 * 1000;
const TRAIL_PTS = 27;
try {
  const raw = fs.readFileSync(storePath, "utf8");
  const store = JSON.parse(raw);
  store.deviceDeployment = store.deviceDeployment || {};
  delete store.deviceDeployment["EH-7007759c5e1d64a1"];
  const ids = new Set(TRANSIT_SEED_DEVICES.map((d) => d.id));
  store.readings = (store.readings || []).filter(
    (r) => !ids.has(r.deviceId) && r.deviceId !== "EH-7007759c5e1d64a1"
  );
  const transitSince = new Date(now - TRAVEL_MS).toISOString();
  const gap = TRAVEL_MS / (TRAIL_PTS - 1);
  for (const d of TRANSIT_SEED_DEVICES) {
    store.deviceDeployment[d.id] = {
      deviceId: d.id,
      phase: "in_transit",
      transitSince,
      installedAt: null,
      removalCompletedAt: null,
      updatedAt: new Date().toISOString(),
      updatedByUserId: "system",
      updatedByName: "demo_seed",
    };
    for (let i = 0; i < TRAIL_PTS; i++) {
      const t = i / (TRAIL_PTS - 1);
      store.readings.push({
        id: `rd_${d.id}_trail_${i}`,
        deviceId: d.id,
        x: 0.2,
        y: 0.1,
        z: 0.05,
        lat: SEONGNAM_CITY_HALL.lat + (d.end.lat - SEONGNAM_CITY_HALL.lat) * t,
        lon: SEONGNAM_CITY_HALL.lon + (d.end.lon - SEONGNAM_CITY_HALL.lon) * t,
        ts: Math.round(now - TRAVEL_MS + i * gap),
        mode: "HOLD",
        modeIntervalSec: 60,
        batteryPercent: Math.max(10, d.bat - Math.floor(i / 4)),
        temperatureC: 24.5,
        hold: true,
      });
    }
  }
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2), "utf8");
  console.log("store.json deviceDeployment + trail (4대) 갱신");
} catch {
  console.log("store.json 없음 — npm run seed:trail 또는 seed.ts 사용");
}

const [summary] = await c.query(
  `SELECT id, name, status, lat, lon FROM sites WHERE company_id = ? ORDER BY id`,
  [COMPANY_ID]
);
console.log("\n현장 목록:");
for (const s of summary) {
  console.log(`  #${s.id} [${s.status}] ${s.name}`);
}

await c.end();
console.log("\n완료. 회사 대시보드를 새로고침하세요.");
