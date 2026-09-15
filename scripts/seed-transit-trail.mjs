/**
 * 이동 경로 데모 시드 (DB + store.json)
 * 성남시청 → 현장 (약 1시간 20분), 도로 경유 실 경로 형태
 * + sensor_site_assignments (shipping) 생성
 *
 * 실행: npm run seed:trail
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const STORE_PATH = path.join(ROOT, "data", "store.json");
const ENV_PATH = path.join(ROOT, ".env.local");

const ORIGIN = { lat: 37.4199, lon: 127.1266 };
const TRAVEL_MS = 80 * 60 * 1000;
/** 약 2~3분 간격 → 줌인(5분)·줌아웃(30분) 다운샘플에서도 경유가 남음 */
const TARGET_POINTS = 40;
const EXCLUDED = "EH-7007759c5e1d64a1";

/**
 * 성남시청 → 역삼: 야탑·모란·수서·대치·선릉 경유 (분당수서로·테헤란로 대략)
 * 직선이 아니라 북→서 꺾이는 도로형 경로
 */
const ROUTE_YEOKSAM = [
  ORIGIN,
  { lat: 37.4118, lon: 127.1284 }, // 야탑
  { lat: 37.4326, lon: 127.1299 }, // 모란
  { lat: 37.4568, lon: 127.1262 }, // 복정 남
  { lat: 37.4874, lon: 127.1019 }, // 수서
  { lat: 37.4962, lon: 127.0785 }, // 일원·대치 동
  { lat: 37.4947, lon: 127.0629 }, // 대치
  { lat: 37.5045, lon: 127.049 }, // 선릉
  { lat: 37.5009, lon: 127.0365 }, // 역삼
];

/**
 * 성남시청 → 잠실: 모란·복정·가락·석촌 경유 (성남대로·송파 쪽)
 */
const ROUTE_JAMSIL = [
  ORIGIN,
  { lat: 37.4118, lon: 127.1284 }, // 야탑
  { lat: 37.4326, lon: 127.1299 }, // 모란
  { lat: 37.4705, lon: 127.1268 }, // 복정
  { lat: 37.4929, lon: 127.1182 }, // 가락시장
  { lat: 37.5055, lon: 127.1045 }, // 송파
  { lat: 37.5108, lon: 127.0862 }, // 석촌
  { lat: 37.5146, lon: 127.0732 }, // 잠실
];

const TRANSIT_SENSORS = [
  {
    deviceId: "EH-DEMO-001",
    label: "옹벽-1",
    siteName: "역삼 업무복합 신축",
    route: ROUTE_YEOKSAM,
    endJitter: { lat: 0, lon: 0 },
    battery: 78,
  },
  {
    deviceId: "EH-DEMO-002",
    label: "비계-1",
    siteName: "역삼 업무복합 신축",
    route: ROUTE_YEOKSAM,
    // 같은 축이지만 약간 옆 차선처럼 오프셋 + 끝점 미세 조정
    endJitter: { lat: 0.0004, lon: -0.0005 },
    pathOffset: { lat: 0.0012, lon: -0.0018 },
    battery: 62,
  },
  {
    deviceId: "EH-DEMO-301",
    label: "트러스-C1",
    siteName: "잠실 스포츠컴플렉스 리모델링",
    route: ROUTE_JAMSIL,
    endJitter: { lat: 0, lon: 0 },
    battery: 41,
  },
  {
    deviceId: "EH-DEMO-302",
    label: "트러스-C2",
    siteName: "잠실 스포츠컴플렉스 리모델링",
    route: ROUTE_JAMSIL,
    endJitter: { lat: -0.0003, lon: -0.0004 },
    pathOffset: { lat: -0.0009, lon: 0.0014 },
    battery: 12,
  },
];

for (const line of fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const now = Date.now();
const transitSince = new Date(now - TRAVEL_MS).toISOString();

function haversineM(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 경유 웨이포인트를 거리 비례로 샘플링 (도로형 꺾임 유지) */
function buildTrailAlongWaypoints(waypoints, opts = {}) {
  const offset = opts.pathOffset || { lat: 0, lon: 0 };
  const endJitter = opts.endJitter || { lat: 0, lon: 0 };
  const n = Math.max(3, opts.count || TARGET_POINTS);

  const route = waypoints.map((p, i) => {
    const isEnd = i === waypoints.length - 1;
    const isStart = i === 0;
    return {
      lat:
        p.lat +
        (isStart ? 0 : offset.lat) +
        (isEnd ? endJitter.lat : 0),
      lon:
        p.lon +
        (isStart ? 0 : offset.lon) +
        (isEnd ? endJitter.lon : 0),
    };
  });

  const segLens = [];
  let total = 0;
  for (let i = 0; i < route.length - 1; i++) {
    const d = haversineM(route[i], route[i + 1]);
    segLens.push(d);
    total += d;
  }
  if (total <= 0) {
    return route.map((p, i) => ({
      ...p,
      ts: Math.round(now - TRAVEL_MS + (i / Math.max(1, route.length - 1)) * TRAVEL_MS),
    }));
  }

  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n <= 1 ? 1 : i / (n - 1);
    const distTarget = t * total;
    let acc = 0;
    let lat = route[route.length - 1].lat;
    let lon = route[route.length - 1].lon;
    for (let s = 0; s < segLens.length; s++) {
      const seg = segLens[s];
      if (acc + seg >= distTarget || s === segLens.length - 1) {
        const local = seg > 0 ? (distTarget - acc) / seg : 1;
        const a = route[s];
        const b = route[s + 1];
        // 미세 흔들림(GPS 노이즈) — 시작/끝은 고정
        const wobble =
          i === 0 || i === n - 1
            ? 0
            : Math.sin(i * 1.7) * 0.00012 + Math.cos(i * 0.9) * 0.00008;
        lat = a.lat + (b.lat - a.lat) * local + wobble;
        lon = a.lon + (b.lon - a.lon) * local + wobble * 0.7;
        break;
      }
      acc += seg;
    }
    out.push({
      lat,
      lon,
      ts: Math.round(now - TRAVEL_MS + t * TRAVEL_MS),
    });
  }
  return out;
}

const siteIdByName = {};

if (process.env.DB_ENABLED === "true") {
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

  try {
    await c.query("SELECT 1 FROM sensor_site_assignments LIMIT 1");
  } catch {
    console.error(
      "sensor_site_assignments 테이블이 없습니다. DB 스키마를 확인하세요."
    );
    await c.end();
    process.exit(1);
  }

  const [sites] = await c.query(
    `SELECT id, name FROM sites WHERE name IN (?, ?)`,
    ["역삼 업무복합 신축", "잠실 스포츠컴플렉스 리모델링"]
  );
  for (const s of sites) siteIdByName[s.name] = Number(s.id);

  await c.execute(`DELETE FROM sensor_logs WHERE device_id = ?`, [EXCLUDED]);
  await c.execute(
    `INSERT INTO sensor_logs
      (device_id, x, y, z, lat, lon, ts, mode, mode_interval_sec,
       battery_percent, temperature_c, hold)
     VALUES (?, 0.12, 0.08, 0.98, 37.5007, 127.0366, ?, 'normal', 60, 91, 23, NULL)`,
    [EXCLUDED, now]
  );
  await c.execute(
    `UPDATE device_runtime SET hold_active = 0 WHERE device_id = ?`,
    [EXCLUDED]
  );

  for (const sensor of TRANSIT_SENSORS) {
    const points = buildTrailAlongWaypoints(sensor.route, {
      count: TARGET_POINTS,
      pathOffset: sensor.pathOffset,
      endJitter: sensor.endJitter,
    });
    const siteId = siteIdByName[sensor.siteName];
    await c.execute(`DELETE FROM sensor_logs WHERE device_id = ?`, [
      sensor.deviceId,
    ]);
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      await c.execute(
        `INSERT INTO sensor_logs
          (device_id, x, y, z, lat, lon, ts, mode, mode_interval_sec,
           battery_percent, temperature_c, hold)
         VALUES (?, 0.1, 0.08, 0.95, ?, ?, ?, 'HOLD', 60, ?, 24.5, 1)`,
        [
          sensor.deviceId,
          p.lat,
          p.lon,
          p.ts,
          Math.max(10, sensor.battery - Math.floor(i / 4)),
        ]
      );
    }
    await c.execute(
      `INSERT INTO device_runtime (device_id, blackbox_locked, hold_active, reported_at, last_seen_at)
       VALUES (?, 0, 1, NOW(), NOW())
       ON DUPLICATE KEY UPDATE hold_active = 1, last_seen_at = NOW()`,
      [sensor.deviceId]
    );

    if (siteId) {
      await c.execute(
        `UPDATE sensor_site_assignments SET phase='ended', ended_at=NOW()
         WHERE device_id=? AND ended_at IS NULL`,
        [sensor.deviceId]
      );
      await c.execute(
        `INSERT INTO sensor_site_assignments
          (device_id, site_id, phase, started_at, created_by_name, updated_by_name)
         VALUES (?, ?, 'shipping', ?, 'seed-transit-trail', 'seed-transit-trail')`,
        [sensor.deviceId, siteId, new Date(now - TRAVEL_MS)]
      );
    }

    console.log(
      `DB ${sensor.deviceId}: ${points.length}pts (road waypoints) + shipping @ site ${siteId}`
    );
  }

  await c.end();
} else {
  console.log("DB_ENABLED!=true — DB 스킵");
}

let store = {};
if (fs.existsSync(STORE_PATH)) {
  store = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
}

store.deviceDeployment = store.deviceDeployment || {};
store.sensorAssignments = store.sensorAssignments || [];
delete store.deviceDeployment[EXCLUDED];

const transitIds = new Set(TRANSIT_SENSORS.map((s) => s.deviceId));
store.readings = (store.readings || []).filter(
  (r) => !transitIds.has(r.deviceId) && r.deviceId !== EXCLUDED
);
store.sensorAssignments = (store.sensorAssignments || []).filter(
  (a) => !transitIds.has(a.deviceId) || a.endedAt
);

const webSiteByName = {};
for (const s of store.sites || []) {
  webSiteByName[s.name] = s.id;
}

for (const sensor of TRANSIT_SENSORS) {
  const points = buildTrailAlongWaypoints(sensor.route, {
    count: TARGET_POINTS,
    pathOffset: sensor.pathOffset,
    endJitter: sensor.endJitter,
  });
  const siteWebId =
    webSiteByName[sensor.siteName] ||
    (sensor.siteName.includes("역삼") ? "site_1" : "site_5");

  store.deviceDeployment[sensor.deviceId] = {
    deviceId: sensor.deviceId,
    phase: "in_transit",
    transitSince,
    installedAt: null,
    removalCompletedAt: null,
    updatedAt: new Date().toISOString(),
    updatedByUserId: "system",
    updatedByName: "seed-transit-trail",
  };

  store.sensorAssignments.unshift({
    id: `asg_${sensor.deviceId}_${now}`,
    deviceId: sensor.deviceId,
    siteId: siteWebId,
    phase: "shipping",
    startedAt: transitSince,
    installedAt: null,
    dismantledAt: null,
    endedAt: null,
    createdByUserId: "system",
    createdByName: "seed-transit-trail",
    updatedByUserId: "system",
    updatedByName: "seed-transit-trail",
  });

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    store.readings.push({
      id: `rd_${sensor.deviceId}_trail_${i}`,
      deviceId: sensor.deviceId,
      x: 0.2,
      y: 0.1,
      z: 0.05,
      lat: p.lat,
      lon: p.lon,
      ts: p.ts,
      mode: "HOLD",
      modeIntervalSec: 60,
      batteryPercent: Math.max(10, sensor.battery - Math.floor(i / 4)),
      temperatureC: 24.5,
      hold: true,
    });
  }
}

fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
console.log(`store.json 갱신 (${TRANSIT_SENSORS.length}대 shipping 배정)`);
console.log("완료. 서버 재시작 후 경로가 꺾여 보이는지 확인하세요.");
