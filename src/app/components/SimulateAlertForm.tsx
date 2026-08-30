"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, FlaskConical, Info, X } from "lucide-react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import {
  BATTERY_CRITICAL_PERCENT,
  SENSOR_CRITICAL_MULTIPLIER,
  TEMP_CRITICAL_DELTA_C,
} from "@/lib/thresholdPolicy";
import { Badge, Button } from "./ui";

export type SimulationDevice = {
  deviceId: string;
  label: string;
  thresholdAccel: number;
  thresholdTempC: number;
  thresholdBattery: number;
};

type EventKind = "accel" | "battery" | "temp";
type EventLevel = "warning" | "critical";

const eventLabel: Record<EventKind, string> = {
  accel: "센서 값",
  battery: "배터리",
  temp: "온도",
};

const OPEN_KEY = "eh:simulator-open";
const PANEL_MAX = 300;
const PANEL_GAP = 8;

/**
 * 지도(children) 크기는 유지한 채, 왼쪽 테두리 탭 기준으로
 * 화면 좌측 여백으로 패널을 펼친다.
 */
export function SimulateAlertForm({
  devices,
  children,
}: {
  devices: SimulationDevice[];
  children: ReactNode;
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [deviceId, setDeviceId] = useState(devices[0]?.deviceId || "");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [box, setBox] = useState({ top: 0, left: 0, height: 0 });
  const selected =
    devices.find((device) => device.deviceId === deviceId) ?? devices[0];

  useEffect(() => {
    setMounted(true);
    setOpen(window.localStorage.getItem(OPEN_KEY) === "1");
  }, []);

  useEffect(() => {
    if (!devices.some((d) => d.deviceId === deviceId) && devices[0]) {
      setDeviceId(devices[0].deviceId);
    }
  }, [devices, deviceId]);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const update = () => {
      const r = el.getBoundingClientRect();
      setBox({ top: r.top, left: r.left, height: r.height });
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (infoOpen) setInfoOpen(false);
      else toggle(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, infoOpen]);

  function toggle(next: boolean) {
    setOpen(next);
    window.localStorage.setItem(OPEN_KEY, next ? "1" : "0");
  }

  function normalPayload() {
    return {
      deviceId,
      x: Math.max(0.1, selected.thresholdAccel * 0.3),
      y: 0,
      z: 0,
      batteryPercent: Math.min(100, selected.thresholdBattery + 20),
      temperatureC: selected.thresholdTempC - 5,
    };
  }

  async function fire(kind: EventKind | "normal", level?: EventLevel) {
    const payload = normalPayload();
    if (kind === "accel") {
      payload.x =
        selected.thresholdAccel *
        (level === "critical"
          ? SENSOR_CRITICAL_MULTIPLIER + 0.1
          : (1 + SENSOR_CRITICAL_MULTIPLIER) / 2);
    } else if (kind === "battery") {
      payload.batteryPercent =
        level === "critical"
          ? Math.min(BATTERY_CRITICAL_PERCENT, selected.thresholdBattery)
          : Math.round(
              (BATTERY_CRITICAL_PERCENT + selected.thresholdBattery) / 2
            );
    } else if (kind === "temp") {
      payload.temperatureC =
        selected.thresholdTempC +
        (level === "critical"
          ? TEMP_CRITICAL_DELTA_C + 2
          : TEMP_CRITICAL_DELTA_C / 2);
    }

    setBusy(true);
    setMsg("");
    const res = await fetch("/api/sensors", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error || "실패");
      return;
    }

    const stateLabel =
      kind === "normal"
        ? "정상 복귀"
        : `${eventLabel[kind]} ${level === "critical" ? "경고" : "주의"}`;
    setMsg(`${stateLabel} 주입 완료 · 알림 ${data.alerts?.length || 0}건`);
    router.refresh();
  }

  if (!devices.length) {
    return <div className="h-full min-h-0">{children}</div>;
  }

  const rows: Array<{ kind: EventKind; label: string }> = [
    { kind: "accel", label: "센서 값" },
    { kind: "battery", label: "배터리" },
    { kind: "temp", label: "온도" },
  ];

  const availableLeft = Math.max(0, box.left - PANEL_GAP);
  const panelWidth = Math.min(PANEL_MAX, Math.max(220, availableLeft));
  const panelLeft = Math.max(PANEL_GAP, box.left - panelWidth - PANEL_GAP);

  const panel = (
    <aside
      aria-label="임계값 알림 시뮬레이션"
      aria-hidden={!open}
      className={clsx(
        "eh-panel fixed z-50 flex flex-col overflow-hidden rounded-[22px] transition-[opacity,transform] duration-200",
        open
          ? "visible translate-x-0 opacity-100"
          : "invisible pointer-events-none -translate-x-3 opacity-0"
      )}
      style={{
        top: box.top,
        left: panelLeft,
        width: panelWidth,
        height: box.height,
      }}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--eh-line)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="truncate text-sm text-white">시뮬레이션</div>
          <button
            type="button"
            onClick={() => setInfoOpen(true)}
            className="rounded-full p-1 text-[var(--eh-fog)] transition hover:bg-white/10 hover:text-white"
            aria-label="임계값 상태 기준 보기"
          >
            <Info size={15} />
          </button>
        </div>
        <button
          type="button"
          onClick={() => toggle(false)}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-[var(--eh-fog)] transition hover:bg-white/10 hover:text-white"
          aria-label="시뮬레이션 접기"
        >
          접기
          <ChevronRight size={14} />
        </button>
      </div>

      <div className="eh-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <p className="mb-3 text-xs leading-5 text-[var(--eh-fog)]">
          선택한 센서에 이벤트·상태별 테스트 값을 주입합니다.
        </p>
        <label className="mb-1 block text-xs text-[var(--eh-fog)]">
          시뮬레이션 센서
        </label>
        <select
          className="eh-neu-inset mb-4 w-full rounded-2xl px-3 py-2 text-sm text-white outline-none eh-focus-signal"
          value={deviceId}
          onChange={(e) => setDeviceId(e.target.value)}
          aria-label="시뮬레이션 센서"
        >
          {devices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label} ({device.deviceId})
            </option>
          ))}
        </select>

        <div className="space-y-2">
          {rows.map((row) => (
            <div
              key={row.kind}
              className="grid grid-cols-[64px_1fr_1fr] items-center gap-2"
            >
              <span className="text-xs text-[var(--eh-mist)]">{row.label}</span>
              <Button
                type="button"
                variant="signal"
                className="px-2 py-2 text-xs"
                disabled={busy}
                onClick={() => fire(row.kind, "warning")}
              >
                주의
              </Button>
              <Button
                type="button"
                variant="danger"
                className="px-2 py-2 text-xs"
                disabled={busy}
                onClick={() => fire(row.kind, "critical")}
              >
                경고
              </Button>
            </div>
          ))}
          <Button
            type="button"
            disabled={busy}
            onClick={() => fire("normal")}
            className="mt-2 w-full bg-[var(--eh-ok)] text-white hover:brightness-110"
          >
            정상 상태
          </Button>
        </div>
        {msg && (
          <p className="mt-3 text-xs leading-5 text-[var(--eh-signal)]">{msg}</p>
        )}
      </div>
    </aside>
  );

  const tab = !open && (
    <button
      type="button"
      onClick={() => toggle(true)}
      className="eh-neu-raised eh-neu-press fixed z-40 flex -translate-x-full -translate-y-1/2 items-center gap-2 rounded-l-2xl rounded-r-none px-2 py-4 text-xs text-[var(--eh-mist)] transition hover:text-white"
      style={{ top: box.top + box.height / 2, left: box.left }}
      aria-label="임계값 알림 시뮬레이션 열기"
    >
      <FlaskConical size={14} />
      <span className="[writing-mode:vertical-rl]">시뮬레이션</span>
    </button>
  );

  return (
    <>
      <div ref={rootRef} className="relative h-full min-h-0">
        <div className="h-full min-h-0">{children}</div>
      </div>

      {mounted && createPortal(
        <>
          {tab}
          {panel}
        </>,
        document.body
      )}

      {infoOpen &&
        selected &&
        mounted &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
            role="presentation"
            onMouseDown={(event) => {
              if (event.currentTarget === event.target) setInfoOpen(false);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="threshold-policy-title"
              className="eh-panel w-full max-w-xl rounded-[22px] p-5"
            >
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div
                    id="threshold-policy-title"
                    className="text-lg font-medium text-white"
                  >
                    임계값 상태 기준
                  </div>
                  <div className="mt-1 text-xs text-[var(--eh-fog)]">
                    {selected.label} · {selected.deviceId}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setInfoOpen(false)}
                  className="rounded-lg p-2 text-[var(--eh-fog)] hover:bg-white/10 hover:text-white"
                  aria-label="닫기"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-3 text-sm text-[var(--eh-mist)]">
                <div className="eh-neu-inset rounded-2xl p-3">
                  <div className="mb-1 flex items-center gap-2 text-white">
                    센서 값
                    <Badge tone="neutral">accel</Badge>
                  </div>
                  <p className="text-xs leading-5 text-[var(--eh-fog)]">
                    주의 ≥ {selected.thresholdAccel.toFixed(2)} · 경고 ≥{" "}
                    {(
                      selected.thresholdAccel * SENSOR_CRITICAL_MULTIPLIER
                    ).toFixed(2)}{" "}
                    (×{SENSOR_CRITICAL_MULTIPLIER})
                  </p>
                </div>
                <div className="eh-neu-inset rounded-2xl p-3">
                  <div className="mb-1 flex items-center gap-2 text-white">
                    온도
                    <Badge tone="neutral">temp</Badge>
                  </div>
                  <p className="text-xs leading-5 text-[var(--eh-fog)]">
                    주의 ≥ {selected.thresholdTempC}°C · 경고 ≥{" "}
                    {selected.thresholdTempC + TEMP_CRITICAL_DELTA_C}°C (+
                    {TEMP_CRITICAL_DELTA_C})
                  </p>
                </div>
                <div className="eh-neu-inset rounded-2xl p-3">
                  <div className="mb-1 flex items-center gap-2 text-white">
                    배터리
                    <Badge tone="neutral">battery</Badge>
                  </div>
                  <p className="text-xs leading-5 text-[var(--eh-fog)]">
                    주의 ≤ {selected.thresholdBattery}% · 경고 ≤{" "}
                    {BATTERY_CRITICAL_PERCENT}%
                  </p>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
