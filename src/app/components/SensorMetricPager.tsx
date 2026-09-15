"use client";

import { useRef, useState } from "react";
import clsx from "clsx";
import {
  BatteryFull,
  Gauge,
  RotateCw,
  SlidersHorizontal,
  Thermometer,
  type LucideIcon,
} from "lucide-react";
import {
  formatTiltAxes,
  formatTiltDeg,
  tiltMagnitude,
  TILT_UI,
} from "@/lib/tilt";

export type SensorMetricSource = {
  mode: string;
  modeIntervalSec: number;
  thresholdTiltDeg: number;
  thresholdTempC: number;
  thresholdBattery: number;
  latest?: {
    batteryPercent: number;
    temperatureC: number | null;
    x: number;
    y: number;
    z: number;
    ts: number;
    mode: string;
  } | null;
};

type MetricCell = {
  label: string;
  value: string;
  Icon: LucideIcon;
};

function formatReceivedAt(ts?: number) {
  if (!ts || !Number.isFinite(ts) || ts <= 0) return "-";
  try {
    return new Date(ts).toLocaleString("ko-KR", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "-";
  }
}

function modeLabel(source: SensorMetricSource) {
  const mode = source.latest?.mode || source.mode || "-";
  return `${mode}/${source.modeIntervalSec}s`;
}

function tiltMag(source: SensorMetricSource) {
  const r = source.latest;
  if (!r) return null;
  const mag = tiltMagnitude(r.x, r.y, r.z);
  return Number.isFinite(mag) ? mag : null;
}

function MetricTile({ label, value, Icon }: MetricCell) {
  const [showLabel, setShowLabel] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setShowLabel((v) => !v)}
      className="eh-neu-inset flex min-w-0 flex-1 flex-col items-center rounded-xl px-2 py-2 text-center"
      title={label}
    >
      <div className="flex h-4 items-start justify-center">
        {showLabel ? (
          <span className="truncate text-[10px] leading-3 text-[var(--eh-fog)]">
            {label}
          </span>
        ) : (
          <Icon size={16} className="text-[var(--eh-fog)]" aria-hidden />
        )}
      </div>
      <div className="mt-0.5 truncate text-xs font-medium text-[var(--eh-mist)]">
        {value}
      </div>
    </button>
  );
}

function buildPages(source: SensorMetricSource): Array<{
  title: string;
  cells: MetricCell[];
}> {
  const mode = modeLabel(source);
  const mag = tiltMag(source);
  return [
    {
      title: "현재 상태",
      cells: [
        {
          label: "배터리",
          value:
            source.latest?.batteryPercent != null &&
            source.latest.batteryPercent >= 0
              ? `${Math.round(source.latest.batteryPercent)}%`
              : "-",
          Icon: BatteryFull,
        },
        {
          label: "온도",
          value:
            source.latest?.temperatureC != null
              ? `${source.latest.temperatureC.toFixed(1)}°C`
              : "-",
          Icon: Thermometer,
        },
        {
          label: TILT_UI.axes,
          value: source.latest
            ? formatTiltAxes(source.latest.x, source.latest.y, source.latest.z)
            : "-",
          Icon: RotateCw,
        },
        {
          label: TILT_UI.combined,
          value: mag != null ? formatTiltDeg(mag) : "-",
          Icon: RotateCw,
        },
      ],
    },
    {
      title: "수신 · 임계",
      cells: [
        { label: "모드 / 간격", value: mode, Icon: SlidersHorizontal },
        {
          label: TILT_UI.threshold,
          value: formatTiltDeg(source.thresholdTiltDeg),
          Icon: Gauge,
        },
        {
          label: "온도 임계",
          value: `${source.thresholdTempC}°C`,
          Icon: Thermometer,
        },
        {
          label: "배터리 임계",
          value: `${Math.round(source.thresholdBattery)}%`,
          Icon: BatteryFull,
        },
      ],
    },
  ];
}

/**
 * 한 장만 렌더하는 캐러셀.
 * (이전 w-[200%] 트랙 방식은 레이아웃이 깨지면 두 장이 세로로 쌓여 보였음)
 */
export function SensorMetricPager({
  source,
  className,
}: {
  source: SensorMetricSource;
  className?: string;
}) {
  const [page, setPage] = useState(0);
  const pressed = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const axis = useRef<"h" | "v" | null>(null);
  const dxRef = useRef(0);

  const pages = buildPages(source);
  const safePage = page <= 0 ? 0 : page >= pages.length ? pages.length - 1 : page;
  const current = pages[safePage];
  const receivedAt = formatReceivedAt(source.latest?.ts);

  function endSwipe() {
    if (!pressed.current) return;
    pressed.current = false;
    const dx = dxRef.current;
    dxRef.current = 0;
    axis.current = null;
    if (dx <= -48 && safePage < pages.length - 1) setPage(safePage + 1);
    else if (dx >= 48 && safePage > 0) setPage(safePage - 1);
  }

  return (
    <div className={clsx("space-y-2", className)}>
      <div
        className="eh-neu-inset cursor-grab select-none rounded-2xl p-3.5 active:cursor-grabbing"
        style={{ touchAction: "pan-y" }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          pressed.current = true;
          startX.current = e.clientX;
          startY.current = e.clientY;
          axis.current = null;
          dxRef.current = 0;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!pressed.current) return;
          const dx = e.clientX - startX.current;
          const dy = e.clientY - startY.current;
          if (!axis.current) {
            if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
            axis.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
            if (axis.current === "v") {
              pressed.current = false;
              dxRef.current = 0;
              return;
            }
          }
          if (axis.current === "h") dxRef.current = dx;
        }}
        onPointerUp={endSwipe}
        onPointerCancel={endSwipe}
      >
        <div className="mb-2.5 flex items-center gap-2">
          <div className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--eh-mist)]">
            {current.title}
          </div>
          <div className="shrink-0 text-xs text-[var(--eh-fog)]">{receivedAt}</div>
        </div>
        <div className="flex gap-1.5">
          {current.cells.map((c) => (
            <MetricTile key={`${safePage}-${c.label}`} {...c} />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center gap-1.5">
        {pages.map((p, i) => (
          <button
            key={p.title}
            type="button"
            aria-label={p.title}
            aria-current={i === safePage}
            onClick={() => setPage(i)}
            className={clsx(
              "h-1.5 w-1.5 rounded-full transition",
              i === safePage
                ? "bg-[var(--eh-mist)] opacity-70"
                : "bg-[var(--eh-fog)] opacity-30"
            )}
          />
        ))}
      </div>
    </div>
  );
}
