"use client";

import { useEffect, useRef, useState } from "react";
import {
  getKakaoMapLoadErrorMessage,
  loadKakaoMapSdk,
  type KakaoCustomOverlay,
  type KakaoMap,
  type KakaoNamespace,
  type KakaoPolyline,
} from "@/lib/kakaoMapSdk";
import { useEhTokens } from "@/app/components/ThemeProvider";
import { EH_DARK } from "@/lib/ehTokens";

export type MapEventKind = "tilt" | "battery" | "temp" | "other";
export type MapEventLevel = "warning" | "critical";
export type MapEventState = {
  kind: MapEventKind;
  level: MapEventLevel;
};

/** 회사 지도용 현장 핀 건강 상태 */
export type SitePinHealth =
  | "ok"
  | "warning"
  | "critical"
  | "inactive"
  | "comm_loss";

export type MapMarker = {
  id: string;
  lat: number;
  lon: number;
  label: string;
  sub?: string;
  href?: string;
  tone?: "ok" | "warning" | "critical" | "offline" | "inactive" | "site";
  event?: MapEventState;
  sensor?: boolean;
  kind?: "site" | "sensor";
  siteId?: string;
  /** 운영 상태(메타). 핀 색은 siteHealth 가 있으면 그쪽을 우선한다. */
  siteStatus?: "active" | "paused" | "closed";
  /** 회사 대시보드 현장 핀 색·스타일 */
  siteHealth?: SitePinHealth;
};

/** 센서 이동 경로. points 는 오래된 → 최신 순. */
export type MapPath = {
  id: string;
  points: Array<{ lat: number; lon: number; ts?: number }>;
  color?: string;
  /** 줌에 따라 5분/30분 간격으로 다운샘플 (기본 true) */
  adaptiveDownsample?: boolean;
};

const SITE_ZOOM_THRESHOLD = 7;
let activeSignalColor: string = EH_DARK.signal;

const siteHealthColor: Record<SitePinHealth, string> = {
  ok: "#34d399",
  warning: "#fbbf24",
  critical: "#f87171",
  inactive: "#8b95a8",
  comm_loss: "#64748b",
};

const siteHealthLabel: Record<SitePinHealth, string> = {
  ok: "정상 운영",
  warning: "주의",
  critical: "위험",
  inactive: "미운영",
  comm_loss: "통신 두절",
};

const toneColor: Record<NonNullable<MapMarker["tone"]>, string> = {
  ok: "#34d399",
  warning: "#fbbf24",
  critical: "#f87171",
  offline: "#8b95a8",
  inactive: "#5a6a7a",
  site: "#d7e0ea",
};

/** 이 화면 거리 안에 있으면 핀이 서로를 가린다고 본다. */
const OVERLAP_PX = 20;
/** 겹친 핀을 카드처럼 쌓을 때 한 장씩 밀어내는 픽셀 */
const STACK_STEP_PX = 5;
/** 쌓아서 그릴 최대 장수 — 나머지는 목록에서만 보여준다. */
const STACK_MAX = 4;
const METERS_PER_DEG_LAT = 111_320;

/** 카카오 지도 level 3 이 약 1m/px 인 것을 기준으로 한 근사값 */
function metersPerPixel(level: number) {
  return Math.pow(2, level - 3);
}

function isSiteMarker(m: MapMarker) {
  return m.kind === "site" || (!m.sensor && !m.event && m.tone === "site");
}

function distanceMeters(a: MapMarker, b: MapMarker) {
  const lonScale = Math.max(Math.cos((a.lat * Math.PI) / 180), 0.1);
  const dLat = (a.lat - b.lat) * METERS_PER_DEG_LAT;
  const dLon = (a.lon - b.lon) * METERS_PER_DEG_LAT * lonScale;
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

/**
 * 서로를 가릴 만큼 가까운 핀들을 한 묶음으로 만든다.
 * 좌표는 손대지 않는다 — 겹침은 화면에서 살짝 쌓아 보여주고,
 * 어느 센서인지는 클릭했을 때 목록으로 고르게 한다.
 */
function groupOverlaps(markers: MapMarker[], level: number): MapMarker[][] {
  const mpp = metersPerPixel(level);
  const groups: MapMarker[][] = [];

  for (const m of markers) {
    const hit = groups.find(
      (g) => distanceMeters(g[0], m) <= OVERLAP_PX * mpp
    );
    if (hit) hit.push(m);
    else groups.push([m]);
  }

  // 다시 그려도 쌓이는 순서가 바뀌지 않도록 id 순으로 고정한다.
  return groups.map((g) => [...g].sort((a, b) => a.id.localeCompare(b.id)));
}

/**
 * 핀 래퍼는 지도 앵커 기준을 잡기 위해 눈에 보이는 머리보다 넓다.
 * 래퍼가 클릭을 받으면 투명한 여백이 옆 핀의 클릭을 가로채므로,
 * 클릭 대상은 실제로 보이는 머리 버튼 하나로 한정한다.
 */
function createPinWrapper(size: number) {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = `position:relative;width:${size}px;height:${size}px;pointer-events:none;`;
  return wrapper;
}

function createPinHead(opts: {
  size: number;
  left: number;
  top: number;
  color: string;
  shadow: string;
  ariaLabel: string;
  title: string;
}) {
  const head = document.createElement("button");
  head.type = "button";
  head.dataset.pinHead = "1";
  head.title = opts.title;
  head.setAttribute("aria-label", opts.ariaLabel);
  head.style.cssText = `position:absolute;left:${opts.left}px;top:${opts.top}px;width:${opts.size}px;height:${opts.size}px;padding:0;border:2px solid #fff;border-radius:50% 50% 50% 0;background:${opts.color};transform:rotate(-45deg);box-shadow:${opts.shadow};pointer-events:auto;cursor:pointer;`;
  return head;
}

function pinHeadOf(wrapper: HTMLElement) {
  return wrapper.querySelector<HTMLElement>("[data-pin-head]");
}

/** 쌓인 핀 맨 앞장의 머리 오른쪽 위에 붙는 겹침 개수 */
function attachStackCount(wrapper: HTMLElement, count: number) {
  const head = pinHeadOf(wrapper);
  const left = head ? parseFloat(head.style.left) : 0;
  const top = head ? parseFloat(head.style.top) : 0;
  const size = head ? parseFloat(head.style.width) : 20;

  const chip = document.createElement("span");
  chip.style.cssText = `position:absolute;left:${left + size - 7}px;top:${top - 6}px;min-width:16px;height:16px;padding:0 3px;box-sizing:border-box;border-radius:8px;border:1.5px solid #fff;background:#111b26;color:#fff;font-size:10px;font-weight:700;line-height:13px;text-align:center;pointer-events:none;`;
  chip.textContent = String(count);
  wrapper.appendChild(chip);
}

/**
 * 카카오가 오버레이 content 를 감싸는 컨테이너도 핀 머리보다 넓다.
 * 그 여백이 옆 핀의 클릭을 가로채지 않게 비활성화한다.
 * 자손인 핀 머리는 pointer-events:auto 라 그대로 클릭된다.
 */
function releaseWrapperClicks(content: HTMLElement) {
  let node = content.parentElement;
  for (let depth = 0; node && depth < 2; depth++) {
    node.style.pointerEvents = "none";
    node = node.parentElement;
  }
}

/** 선택된 핀임을 알리는 시그널 링 */
function markFocused(pin: HTMLElement) {
  pin.style.boxShadow =
    `0 0 0 3px ${activeSignalColor}, 0 4px 16px rgba(0,0,0,.45)`;
}

function resolveSiteHealth(
  status: MapMarker["siteStatus"],
  health?: SitePinHealth
): SitePinHealth {
  if (health) return health;
  if (status === "paused" || status === "closed") return "inactive";
  return "ok";
}

function createSitePin(
  label: string,
  status: MapMarker["siteStatus"],
  health?: SitePinHealth
) {
  const resolved = resolveSiteHealth(status, health);
  const color = siteHealthColor[resolved];
  const stateText = siteHealthLabel[resolved];
  const critical = resolved === "critical";
  const commLoss = resolved === "comm_loss";

  const wrapper = createPinWrapper(critical || commLoss ? 44 : 36);

  if (critical) {
    const wave = document.createElement("span");
    wave.className = "site-pin-wave";
    wave.style.cssText =
      "position:absolute;left:8px;top:4px;width:28px;height:28px;border-radius:50%;border:2px solid rgba(248,113,113,.85);pointer-events:none;";
    wrapper.appendChild(wave);
  }

  if (commLoss) {
    const ring = document.createElement("span");
    ring.style.cssText =
      "position:absolute;left:8px;top:4px;width:28px;height:28px;border-radius:50%;border:1.5px solid rgba(148,163,184,.55);pointer-events:none;";
    ring.animate(
      [
        { transform: "scale(.7)", opacity: 0.75 },
        { transform: "scale(1.25)", opacity: 0 },
      ],
      { duration: 1600, iterations: Infinity, easing: "ease-out" }
    );
    wrapper.appendChild(ring);
  }

  const head = createPinHead({
    size: 20,
    left: critical || commLoss ? 12 : 8,
    top: critical || commLoss ? 8 : 4,
    color,
    shadow: critical
      ? "0 0 0 2px rgba(248,113,113,.35), 0 3px 10px rgba(0,0,0,.35)"
      : "0 3px 10px rgba(0,0,0,.35)",
    ariaLabel: `${label} ${stateText} 현장`,
    title: `${label} · ${stateText}`,
  });

  if (commLoss) {
    const glyph = document.createElement("span");
    glyph.style.cssText =
      "position:absolute;left:0;top:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;transform:rotate(45deg);pointer-events:none;";
    glyph.innerHTML = `
      <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 12.5c2.5-2.4 5.7-3.6 7-3.6s4.5 1.2 7 3.6" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".9"/>
        <path d="M8.2 15.6c1.4-1.3 2.9-1.9 3.8-1.9s2.4.6 3.8 1.9" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".7"/>
        <circle cx="12" cy="19" r="1.5" fill="#fff"/>
        <path d="M4 20 20 4" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>
      </svg>
    `;
    head.appendChild(glyph);
  }

  wrapper.appendChild(head);
  return wrapper;
}
function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const PIN_BASE_Z = 30;
/** 말풍선을 연 핀은 같은 자리의 다른 핀 위로 */
const PIN_ACTIVE_Z = 120;
/** 말풍선은 어떤 핀보다도 위 */
const BUBBLE_Z = 200;
/** 핀 머리를 가리지 않도록 말풍선을 띄우는 높이 */
const BUBBLE_LIFT_PX = 46;

function toneDot(tone: MapMarker["tone"]) {
  return `<span style="width:8px;height:8px;border-radius:50%;flex:none;background:${
    toneColor[tone || "site"]
  };display:inline-block;"></span>`;
}

/**
 * 말풍선 껍데기. 래퍼의 아래 여백으로 핀 머리를 피하고
 * zIndex 로 모든 핀보다 위에 그려진다.
 */
function createBubbleShell() {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = `padding-bottom:${BUBBLE_LIFT_PX}px;pointer-events:none;`;

  const bubble = document.createElement("div");
  bubble.style.cssText =
    "position:relative;padding:8px 10px;min-width:140px;max-width:250px;border-radius:10px;background:#fff;color:#111;font-size:12px;line-height:1.4;box-shadow:0 8px 20px rgba(0,0,0,.28);pointer-events:auto;";

  const tail = document.createElement("span");
  tail.style.cssText =
    "position:absolute;left:50%;bottom:-6px;width:12px;height:12px;margin-left:-6px;background:#fff;transform:rotate(45deg);box-shadow:2px 2px 4px rgba(0,0,0,.12);";
  bubble.appendChild(tail);

  wrapper.appendChild(bubble);
  return { wrapper, bubble };
}

/** 목록/상세 공통 — 센서 한 줄 */
function createPickRow(m: MapMarker, onPick: () => void) {
  const row = document.createElement("button");
  row.type = "button";
  row.style.cssText =
    "display:flex;align-items:center;gap:6px;width:100%;padding:4px 2px;border:0;background:transparent;font:inherit;color:#111;text-align:left;cursor:pointer;";
  row.innerHTML = `${toneDot(m.tone)}<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(m.label)}</span><span style="opacity:.45;">›</span>`;
  row.addEventListener("mouseenter", () => {
    row.style.background = "rgba(0,0,0,.05)";
  });
  row.addEventListener("mouseleave", () => {
    row.style.background = "transparent";
  });
  row.addEventListener("click", onPick);
  return row;
}

/** 겹친 핀을 눌렀을 때 먼저 뜨는 선택 목록 */
function createListBubble(
  members: MapMarker[],
  onPick: (m: MapMarker) => void
) {
  const { wrapper, bubble } = createBubbleShell();

  const head = document.createElement("div");
  head.style.cssText = "margin-bottom:4px;opacity:.6;";
  head.textContent = `이 위치에 센서 ${members.length}대`;
  bubble.insertBefore(head, bubble.firstChild);

  const list = document.createElement("div");
  list.style.cssText = "max-height:168px;overflow-y:auto;";
  for (const m of members) {
    list.appendChild(createPickRow(m, () => onPick(m)));
  }
  bubble.insertBefore(list, bubble.lastChild);

  return wrapper;
}

/** 센서 하나의 정보 뱃지 */
function createDetailBubble(m: MapMarker, onBack?: () => void) {
  const { wrapper, bubble } = createBubbleShell();

  const body = document.createElement("div");
  body.innerHTML = `
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
      ${toneDot(m.tone)}
      <strong>${escapeHtml(m.label)}</strong>
    </div>
    ${m.sub ? `<div style="opacity:.7;">${escapeHtml(m.sub)}</div>` : ""}
    ${
      m.href
        ? `<a href="${escapeHtml(m.href)}" style="display:inline-block;margin-top:6px;color:#b45309;text-decoration:underline;">상세 보기</a>`
        : ""
    }
  `;
  bubble.insertBefore(body, bubble.firstChild);

  if (onBack) {
    const back = document.createElement("button");
    back.type = "button";
    back.style.cssText =
      "display:block;margin-top:7px;padding-top:6px;border:0;border-top:1px solid rgba(0,0,0,.12);width:100%;background:transparent;font:inherit;color:#b45309;text-align:left;cursor:pointer;";
    back.textContent = "‹ 같은 위치 센서 목록";
    back.addEventListener("click", onBack);
    bubble.insertBefore(back, bubble.lastChild);
  }

  return wrapper;
}

function markerKey(markers: MapMarker[]) {
  return markers
    .map(
      (m) =>
        `${m.id}:${m.lat}:${m.lon}:${m.tone || ""}:` +
        `${m.kind || ""}:${m.siteStatus || ""}:${m.siteHealth || ""}:` +
        `${m.event?.kind || ""}:${m.event?.level || ""}:${m.sensor ? 1 : 0}`
    )
    .join("|");
}

function pathKey(paths: MapPath[]) {
  return paths
    .map((p) => {
      const first = p.points[0];
      const last = p.points[p.points.length - 1];
      return `${p.id}:${p.points.length}:${p.color || ""}:${first?.ts || ""}:${last?.ts || ""}:${first?.lat || ""}:${last?.lon || ""}`;
    })
    .join("|");
}

/** 줌인(level 작음) → 5분, 줌아웃 → 30분 간격 */
function trailGapMsForZoom(level: number) {
  return level <= 6 ? 5 * 60_000 : 30 * 60_000;
}

function downsamplePathByZoom(
  points: Array<{ lat: number; lon: number; ts?: number }>,
  level: number
): Array<{ lat: number; lon: number; ts?: number }> {
  if (points.length <= 2) return points;
  const gap = trailGapMsForZoom(level);
  const kept = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = kept[kept.length - 1];
    const cur = points[i];
    const prevTs = prev.ts ?? 0;
    const curTs = cur.ts ?? prevTs;
    const moved =
      Math.abs(cur.lat - prev.lat) > 0.00001 ||
      Math.abs(cur.lon - prev.lon) > 0.00001;
    if (curTs - prevTs >= gap && moved) kept.push(cur);
  }
  kept.push(points[points.length - 1]);
  return kept;
}

function formatTrailTime(ts?: number) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString("ko-KR", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function createTrailTimeTip(): HTMLDivElement {
  const tip = document.createElement("div");
  tip.style.cssText =
    "pointer-events:none;" +
    "background:rgba(20,24,32,.96);color:#e8eef5;font-size:11px;" +
    "line-height:1.3;padding:5px 8px;border-radius:8px;white-space:nowrap;" +
    "box-shadow:0 2px 8px rgba(0,0,0,.45);";
  return tip;
}

function createTrailPointDot(
  label: string,
  onShow: () => void,
  onHide: () => void
): HTMLDivElement {
  // 핀과 동일: 래퍼 none / 히트 auto — 카카오 오버레이 이벤트 통과용
  const wrap = document.createElement("div");
  wrap.style.cssText =
    "position:relative;width:28px;height:28px;pointer-events:none;";
  wrap.setAttribute("aria-label", label);

  const hit = document.createElement("div");
  hit.dataset.trailHit = "1";
  hit.title = label; // 네이티브 툴팁 폴백
  hit.style.cssText =
    "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;" +
    "pointer-events:auto;cursor:pointer;";

  const dot = document.createElement("div");
  dot.dataset.trailDot = "1";
  dot.style.cssText =
    "width:10px;height:10px;border-radius:50%;" +
    "background:var(--eh-signal,#2d6a4f);border:2px solid #fff;" +
    "box-shadow:0 1px 4px rgba(0,0,0,.35);pointer-events:none;";
  hit.appendChild(dot);
  wrap.appendChild(hit);

  hit.addEventListener("mouseover", (e) => {
    e.stopPropagation();
    onShow();
  });
  hit.addEventListener("mouseout", (e) => {
    e.stopPropagation();
    onHide();
  });
  hit.addEventListener("click", (e) => {
    e.stopPropagation();
    onShow();
  });

  return wrap;
}

function nearestTrailIndex(
  lat: number,
  lon: number,
  pts: Array<{ lat: number; lon: number }>
) {
  let best = 0;
  let bestD = Number.POSITIVE_INFINITY;
  for (let i = 0; i < pts.length; i++) {
    const dLat = pts[i].lat - lat;
    const dLon = pts[i].lon - lon;
    const d = dLat * dLat + dLon * dLon;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function trailPointLabel(
  pts: Array<{ lat: number; lon: number; ts?: number }>,
  idx: number
) {
  const when = formatTrailTime(pts[idx]?.ts);
  if (!when) return `지점 ${idx + 1}`;
  const kind =
    idx === 0 ? "출발" : idx === pts.length - 1 ? "도착" : "경유";
  return `${kind} ${when}`;
}

function isPlottable(m: MapMarker) {
  return (
    Number.isFinite(m.lat) &&
    Number.isFinite(m.lon) &&
    Math.abs(m.lat) > 0.01 &&
    Math.abs(m.lon) > 0.01 &&
    Math.abs(m.lat) <= 90 &&
    Math.abs(m.lon) <= 180
  );
}

const eventPinStyle: Record<
  MapEventKind,
  { text: string }
> = {
  tilt: { text: "기울기 임계 초과" },
  battery: { text: "배터리 부족" },
  temp: { text: "온도 임계 초과" },
  other: { text: "임계값 초과" },
};

const levelStyle: Record<
  MapEventLevel,
  { color: string; shadow: string; label: string }
> = {
  warning: {
    color: "#fbbf24",
    shadow: "rgba(251,191,36,.6)",
    label: "주의",
  },
  critical: {
    color: "#f87171",
    shadow: "rgba(248,113,113,.65)",
    label: "경고",
  },
};

function createEventPin(event: MapEventState, label: string) {
  const style = eventPinStyle[event.kind];
  const level = levelStyle[event.level];
  const wrapper = createPinWrapper(48);

  // 기울기 경고만 빨간 원형 박동 (아이콘 핀은 배터리·온도와 동일 구조)
  if (event.kind === "tilt" && event.level === "critical") {
    const pulse = document.createElement("span");
    pulse.style.cssText =
      "position:absolute;left:6px;top:6px;width:36px;height:36px;border-radius:50%;background:rgba(227,63,59,.42);pointer-events:none;";
    pulse.animate(
      [
        { transform: "scale(.55)", opacity: 0.9 },
        { transform: "scale(1.35)", opacity: 0 },
      ],
      { duration: 1250, iterations: Infinity, easing: "ease-out" }
    );
    wrapper.appendChild(pulse);
  }

  const pin = createPinHead({
    size: 22,
    left: 13,
    top: 8,
    color: level.color,
    shadow: `0 4px 14px ${level.shadow}`,
    ariaLabel: `${label} ${style.text} ${level.label} 위치`,
    title: `${label} · ${style.text} · ${level.label}`,
  });

  const glyph = document.createElement("span");
  glyph.style.cssText =
    "position:absolute;left:0;top:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;transform:rotate(45deg);pointer-events:none;";

  if (event.kind === "tilt") {
    // 경광등 — 기울기 초과·붕괴 위험
    glyph.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
        <path d="M8 11V8a4 4 0 0 1 8 0v3H8Z"/>
        <path d="M5 12h14l-1.6 8H6.6L5 12Z"/>
        <path d="M12 1.5v2M3.8 5.2l1.4 1.4M20.2 5.2l-1.4 1.4" stroke="#fff" stroke-width="2" stroke-linecap="round" fill="none"/>
      </svg>
    `;
  } else if (event.kind === "battery") {
    glyph.innerHTML = `
      <svg width="11" height="11" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
        <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
      </svg>
    `;
  } else if (event.kind === "temp") {
    glyph.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" aria-hidden="true">
        <path d="M9 4a3 3 0 0 1 6 0v10a6 6 0 1 1-6 0V4Z" />
        <path d="M12 8v9" />
        <circle cx="12" cy="17" r="2.5" fill="#fff" stroke="none" />
      </svg>
    `;
  } else {
    glyph.innerHTML = `
      <svg width="11" height="11" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
        <path d="M12 2 2 20h20L12 2Zm0 6v5M12 16h.01" stroke="#fff" stroke-width="2.5" stroke-linecap="round" fill="none"/>
      </svg>
    `;
  }

  pin.appendChild(glyph);
  wrapper.appendChild(pin);
  return wrapper;
}

function createBaseSensorPin(
  label: string,
  tone: NonNullable<MapMarker["tone"]>
) {
  const disconnected = tone === "offline" || tone === "inactive";
  const color = toneColor[tone];
  const stateText = disconnected
    ? tone === "offline"
      ? "오프라인"
      : "비활성"
    : "정상";

  const wrapper = createPinWrapper(40);

  const pin = createPinHead({
    size: 20,
    left: 10,
    top: 5,
    color,
    shadow: "0 3px 10px rgba(0,0,0,.35)",
    ariaLabel: `${label} ${stateText} 위치`,
    title: `${label} · ${stateText}`,
  });

  const glyph = document.createElement("span");
  if (disconnected) {
    // 노시그널 — 신호 막대 + 사선
    glyph.style.cssText =
      "position:absolute;left:0;top:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;transform:rotate(45deg);pointer-events:none;";
    glyph.innerHTML = `
      <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="15" width="3.4" height="6" rx="1" fill="#fff" opacity=".85" />
        <rect x="9" y="11" width="3.4" height="10" rx="1" fill="#fff" opacity=".6" />
        <rect x="15" y="6" width="3.4" height="15" rx="1" fill="#fff" opacity=".4" />
        <path d="M3 21 21 3" stroke="#fff" stroke-width="2.6" stroke-linecap="round" />
      </svg>
    `;
  } else {
    glyph.style.cssText =
      "position:absolute;left:5px;top:5px;width:6px;height:6px;border-radius:50%;background:#fff;pointer-events:none;";
  }

  pin.appendChild(glyph);
  wrapper.appendChild(pin);
  return wrapper;
}

export function SiteMap({
  markers,
  height = 420,
  fill = false,
  className,
  enableZoomLayers = true,
  preferSensorLayer = false,
  paths = [],
  focusId,
}: {
  markers: MapMarker[];
  height?: number;
  /** 부모 flex 높이에 맞춰 지도를 채운다 */
  fill?: boolean;
  className?: string;
  enableZoomLayers?: boolean;
  /** 현장 상세처럼 처음부터 센서 핀이 보이는 줌으로 연다 */
  preferSensorLayer?: boolean;
  /** 센서 이동 경로 폴리라인 */
  paths?: MapPath[];
  /** 이 id 의 핀을 강조하고 지도를 그 위치로 이동 */
  focusId?: string;
}) {
  const { signal: signalColor } = useEhTokens();
  activeSignalColor = signalColor;

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const kakaoRef = useRef<KakaoNamespace | null>(null);
  const overlaysRef = useRef<KakaoCustomOverlay[]>([]);
  const infoOverlaysRef = useRef<KakaoCustomOverlay[]>([]);
  const polylinesRef = useRef<KakaoPolyline[]>([]);
  const pinLayersRef = useRef<
    Array<{ overlay: KakaoCustomOverlay; baseZ: number }>
  >([]);
  const markersRef = useRef(markers);
  markersRef.current = markers;
  const preferSensorRef = useRef(preferSensorLayer);
  preferSensorRef.current = preferSensorLayer;
  const initialFitDone = useRef(false);
  const focusedOnce = useRef<string | null>(null);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [zoomLevel, setZoomLevel] = useState(
    preferSensorLayer ? SITE_ZOOM_THRESHOLD : 8
  );
  const markersSig = markerKey(markers);
  const pathsSig = pathKey(paths);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | undefined;
    let resizeObserver: ResizeObserver | undefined;

    loadKakaoMapSdk()
      .then((kakao) => {
        if (cancelled || !containerRef.current) return;
        kakaoRef.current = kakao;

        const list = markersRef.current.filter(isPlottable);
        const center = list.length
          ? new kakao.maps.LatLng(list[0].lat, list[0].lon)
          : new kakao.maps.LatLng(37.5665, 126.978);

        // calbridge KakaoMapPreview 와 동일한 생성 옵션
        mapRef.current = new kakao.maps.Map(containerRef.current, {
          center,
          level: preferSensorRef.current ? SITE_ZOOM_THRESHOLD : 8,
          draggable: true,
          scrollwheel: true,
        });

        setReady(true);
        setError("");
        setZoomLevel(mapRef.current.getLevel());

        const onZoom = () => {
          if (mapRef.current) setZoomLevel(mapRef.current.getLevel());
        };
        kakao.maps.event.addListener(mapRef.current, "zoom_changed", onZoom);

        // 빈 곳을 누르면 열린 뱃지를 닫는다.
        kakao.maps.event.addListener(mapRef.current, "click", () => {
          infoOverlaysRef.current.forEach((item) => item.setMap(null));
          pinLayersRef.current.forEach((item) =>
            item.overlay.setZIndex(item.baseZ)
          );
        });

        const relayout = () => mapRef.current?.relayout();
        retryTimer = window.setTimeout(relayout, 0);
        window.setTimeout(relayout, 100);
        window.setTimeout(relayout, 400);

        const shell = containerRef.current.parentElement;
        if (shell && typeof ResizeObserver !== "undefined") {
          resizeObserver = new ResizeObserver(() => relayout());
          resizeObserver.observe(shell);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("[kakao map]", err);
          setError(getKakaoMapLoadErrorMessage(err));
        }
      });

    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      resizeObserver?.disconnect();
      overlaysRef.current.forEach((item) => item.setMap(null));
      infoOverlaysRef.current.forEach((item) => item.setMap(null));
      polylinesRef.current.forEach((item) => item.setMap(null));
      overlaysRef.current = [];
      infoOverlaysRef.current = [];
      polylinesRef.current = [];
      pinLayersRef.current = [];
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current || !kakaoRef.current) return;

    const kakao = kakaoRef.current;
    const map = mapRef.current;

    overlaysRef.current.forEach((item) => item.setMap(null));
    infoOverlaysRef.current.forEach((item) => item.setMap(null));
    polylinesRef.current.forEach((item) => item.setMap(null));
    overlaysRef.current = [];
    infoOverlaysRef.current = [];
    polylinesRef.current = [];
    pinLayersRef.current = [];
    map.relayout();

    const trailPoints: Array<{ lat: number; lon: number; ts?: number }> = [];
    for (const path of paths) {
      const rawValid = path.points.filter((pt) =>
        isPlottable({ id: path.id, lat: pt.lat, lon: pt.lon, label: "" })
      );
      const valid =
        path.adaptiveDownsample === false
          ? rawValid
          : downsamplePathByZoom(rawValid, zoomLevel);
      if (valid.length < 2) continue;
      trailPoints.push(...valid);
      const polyline = new kakao.maps.Polyline({
        path: valid.map((pt) => new kakao.maps.LatLng(pt.lat, pt.lon)),
        map,
        strokeWeight: 5,
        strokeColor: path.color || activeSignalColor,
        strokeOpacity: 0.85,
        strokeStyle: "solid",
        zIndex: 15,
      });
      polylinesRef.current.push(polyline);

      const tipEl = createTrailTimeTip();
      const tipOverlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(valid[0].lat, valid[0].lon),
        content: tipEl,
        xAnchor: 0.5,
        yAnchor: 1.35,
        zIndex: 60,
        clickable: false,
      });
      infoOverlaysRef.current.push(tipOverlay);

      let tipIdx = -1;
      const showTipAt = (idx: number) => {
        if (idx < 0 || idx >= valid.length) return;
        tipIdx = idx;
        tipEl.textContent = trailPointLabel(valid, idx);
        tipOverlay.setPosition(
          new kakao.maps.LatLng(valid[idx].lat, valid[idx].lon)
        );
        tipOverlay.setMap(map);
      };
      const hideTip = () => {
        tipIdx = -1;
        tipOverlay.setMap(null);
      };

      // 선 위 호버: 가장 가까운 포인트 시각 표시 (도트 히트가 막혀도 동작)
      kakao.maps.event.addListener(polyline, "mousemove", (...args: unknown[]) => {
        const e = args[0] as { latLng?: { getLat: () => number; getLng: () => number } };
        const ll = e?.latLng;
        if (!ll) return;
        showTipAt(nearestTrailIndex(ll.getLat(), ll.getLng(), valid));
      });
      kakao.maps.event.addListener(polyline, "mouseout", () => {
        hideTip();
      });

      // 경로 포인트(시간 확인용). 시작/끝은 조금 더 크게.
      valid.forEach((pt, idx) => {
        const isEnd = idx === 0 || idx === valid.length - 1;
        const label = trailPointLabel(valid, idx);
        const position = new kakao.maps.LatLng(pt.lat, pt.lon);
        const wrap = createTrailPointDot(
          label,
          () => showTipAt(idx),
          () => {
            if (tipIdx === idx) hideTip();
          }
        );
        const visibleDot = wrap.querySelector<HTMLDivElement>("[data-trail-dot]");
        if (isEnd && visibleDot) {
          visibleDot.style.width = "12px";
          visibleDot.style.height = "12px";
        }
        const overlay = new kakao.maps.CustomOverlay({
          position,
          content: wrap,
          xAnchor: 0.5,
          yAnchor: 0.5,
          zIndex: 40,
          clickable: true,
        });
        overlay.setMap(map);
        overlaysRef.current.push(overlay);
        requestAnimationFrame(() => releaseWrapperClicks(wrap));
      });
    }

    const plottable = markers.filter(isPlottable);
    if (!plottable.length && !trailPoints.length) {
      map.setCenter(new kakao.maps.LatLng(37.5665, 126.978));
      map.setLevel(8);
      return;
    }

    // 줌아웃하면 현장 핀, 확대하면 센서 핀으로 레이어를 바꾼다.
    const showSensors =
      !enableZoomLayers || zoomLevel <= SITE_ZOOM_THRESHOLD;
    const showSites =
      !enableZoomLayers || zoomLevel > SITE_ZOOM_THRESHOLD;

    const visible = plottable.filter((m) => {
      if (isSiteMarker(m)) return showSites;
      const isSensor = m.kind === "sensor" || m.sensor || Boolean(m.event);
      if (isSensor) return showSensors;
      return true;
    });

    const closeBubbles = () => {
      infoOverlaysRef.current.forEach((item) => item.setMap(null));
      pinLayersRef.current.forEach((item) => item.overlay.setZIndex(item.baseZ));
    };

    for (const group of groupOverlaps(visible, zoomLevel)) {
      const anchor = new kakao.maps.LatLng(group[0].lat, group[0].lon);
      const stacked = group.length > 1;

      // 그룹 안의 센서별 상세 뱃지. 겹친 경우엔 목록으로 되돌아갈 수 있게 한다.
      const detailOverlays = new Map<string, KakaoCustomOverlay>();
      let openList = () => {};

      for (const m of group) {
        const overlay = new kakao.maps.CustomOverlay({
          position: new kakao.maps.LatLng(m.lat, m.lon),
          content: createDetailBubble(m, stacked ? () => openList() : undefined),
          xAnchor: 0.5,
          yAnchor: 1,
          zIndex: BUBBLE_Z,
          clickable: true,
        });
        infoOverlaysRef.current.push(overlay);
        detailOverlays.set(m.id, overlay);
      }

      const showDetail = (m: MapMarker) => {
        closeBubbles();
        detailOverlays.get(m.id)?.setMap(map);
      };

      if (stacked) {
        const listOverlay = new kakao.maps.CustomOverlay({
          position: anchor,
          content: createListBubble(group, showDetail),
          xAnchor: 0.5,
          yAnchor: 1,
          zIndex: BUBBLE_Z,
          clickable: true,
        });
        infoOverlaysRef.current.push(listOverlay);
        openList = () => {
          closeBubbles();
          listOverlay.setMap(map);
        };
      }

      // 겹친 핀은 좌표를 그대로 두고 카드처럼 살짝 밀어 쌓는다.
      const drawn = group.slice(0, STACK_MAX);
      drawn.forEach((m, i) => {
        const position = new kakao.maps.LatLng(m.lat, m.lon);

        let pin: HTMLElement;
        if (isSiteMarker(m)) {
          pin = createSitePin(m.label, m.siteStatus, m.siteHealth);
        } else {
          pin = m.event
            ? createEventPin(m.event, m.label)
            : createBaseSensorPin(m.label, m.tone || "ok");
        }

        if (stacked) {
          pin.style.transform = `translate(${i * STACK_STEP_PX}px, ${-i * STACK_STEP_PX}px)`;
          if (i === drawn.length - 1) attachStackCount(pin, group.length);
        }

        const focused = Boolean(focusId && m.id === focusId);
        if (focused) {
          const head = pinHeadOf(pin);
          if (head) markFocused(head);
        }

        // 선택된 센서는 쌓인 순서와 무관하게 맨 앞으로
        const baseZ = PIN_BASE_Z + i + (focused ? STACK_MAX + 1 : 0);
        const pinOverlay = new kakao.maps.CustomOverlay({
          position,
          content: pin,
          map,
          xAnchor: 0.5,
          yAnchor: 0.88,
          zIndex: baseZ,
          clickable: true,
        });
        overlaysRef.current.push(pinOverlay);
        pinLayersRef.current.push({ overlay: pinOverlay, baseZ });
        releaseWrapperClicks(pin);

        pinHeadOf(pin)?.addEventListener("click", () => {
          // 겹쳐 있으면 어느 핀을 눌렀든 먼저 목록을 보여준다.
          if (stacked) openList();
          else showDetail(m);
          pinOverlay.setZIndex(PIN_ACTIVE_Z);
        });
      });
    }

    if (!initialFitDone.current) {
      initialFitDone.current = true;
      const fitPoints = [
        ...visible.map((m) => ({ lat: m.lat, lon: m.lon })),
        ...trailPoints,
      ];
      if (fitPoints.length === 1) {
        map.setCenter(
          new kakao.maps.LatLng(fitPoints[0].lat, fitPoints[0].lon)
        );
        map.setLevel(5);
      } else if (fitPoints.length > 1) {
        const fitBounds = new kakao.maps.LatLngBounds();
        for (const pt of fitPoints) {
          fitBounds.extend(new kakao.maps.LatLng(pt.lat, pt.lon));
        }
        map.setBounds(fitBounds, 64, 64, 64, 64);
        if (preferSensorRef.current && map.getLevel() > SITE_ZOOM_THRESHOLD) {
          map.setLevel(SITE_ZOOM_THRESHOLD);
        }
      }
    }
  }, [
    ready,
    markersSig,
    markers,
    zoomLevel,
    enableZoomLayers,
    preferSensorLayer,
    pathsSig,
    paths,
    focusId,
    signalColor,
  ]);

  // 선택된 센서로 한 번만 이동 — 이후 사용자의 팬/줌은 건드리지 않는다.
  useEffect(() => {
    if (!ready || !focusId || !mapRef.current || !kakaoRef.current) return;
    if (focusedOnce.current === focusId) return;

    const target = markers.find((m) => m.id === focusId && isPlottable(m));
    if (!target) return;

    const kakao = kakaoRef.current;
    const map = mapRef.current;
    map.setCenter(new kakao.maps.LatLng(target.lat, target.lon));
    if (map.getLevel() > 5) map.setLevel(4);
    focusedOnce.current = focusId;
  }, [ready, focusId, markersSig, markers]);

  return (
    <div
      className={[
        "eh-neu-inset relative overflow-hidden rounded-[18px]",
        fill ? "h-full min-h-[420px]" : "",
        className || "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        height: fill ? undefined : height,
        isolation: "isolate",
      }}
    >
      {/* 명시적 크기 — 부모 filter/blur 영향 차단용 단독 레이어 */}
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
          minHeight: fill ? undefined : height,
          position: "relative",
          zIndex: 0,
        }}
      />
      {!ready && !error && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[rgba(14,20,27,0.55)] text-sm text-[var(--eh-fog)]">
          카카오 지도 로딩…
        </div>
      )}
      {error && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[rgba(14,20,27,0.88)] px-6 text-center text-sm text-[var(--eh-signal)]">
          {error}
        </div>
      )}
    </div>
  );
}
