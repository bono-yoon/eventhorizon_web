"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Route } from "lucide-react";
import { MapView } from "./MapView";
import type { MapMarker, MapPath } from "./SiteMap";

export type TrailPointView = { lat: number; lon: number; ts?: number };

export function SensorTrackingMap({
  markers,
  trail,
  trailDays = 3,
  focusId,
  focusLabel,
  height = 480,
}: {
  markers: MapMarker[];
  /** 선택 센서의 이동 경로 (오래된 → 최신, ts 포함 권장) */
  trail?: TrailPointView[];
  trailDays?: number;
  focusId?: string;
  focusLabel?: string;
  height?: number;
}) {
  const [showTrail, setShowTrail] = useState(true);

  const distinctPositions = useMemo(() => {
    if (!trail?.length) return 0;
    return new Set(
      trail.map((p) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`)
    ).size;
  }, [trail]);

  const hasTrail = Boolean(focusId && trail && distinctPositions >= 2);
  const paths: MapPath[] =
    hasTrail && showTrail
      ? [
          {
            id: focusId!,
            points: trail!.map((p) => ({
              lat: p.lat,
              lon: p.lon,
              ts: p.ts,
            })),
            adaptiveDownsample: true,
          },
        ]
      : [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 text-sm text-[var(--eh-fog)]">
          {focusId ? (
            <>
              <span className="text-[var(--eh-mist)]">
                {focusLabel || focusId}
              </span>
              <span className="ml-1.5">
                {hasTrail
                  ? `· 배정 구간 이동 경로 ${trail!.length}개 로그 (지도 확대 시 5분·축소 시 30분 간격)`
                  : trail?.length
                    ? `· 최근 ${trailDays}일 위치 변화 없음 (현재 위치만 표시)`
                    : `· 표시할 이동 경로 없음`}
              </span>
            </>
          ) : (
            "장비를 선택하면 최근 이동 경로를 볼 수 있습니다"
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowTrail((v) => !v)}
          disabled={!hasTrail}
          aria-pressed={showTrail && hasTrail}
          className={clsx(
            "eh-neu-press inline-flex items-center gap-2 rounded-2xl px-3 py-1.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-40",
            showTrail && hasTrail
              ? "eh-neu-active text-[var(--eh-signal)]"
              : "eh-neu-raised-sm text-[var(--eh-fog)] hover:text-[var(--eh-mist)]"
          )}
        >
          <Route size={14} />
          이동 경로 {showTrail && hasTrail ? "켜짐" : "꺼짐"}
        </button>
      </div>

      <MapView
        markers={markers}
        height={height}
        paths={paths}
        focusId={focusId}
      />
    </div>
  );
}
