"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Route } from "lucide-react";
import { MapView } from "./MapView";
import type { MapMarker, MapPath } from "./SiteMap";

export function SensorTrackingMap({
  markers,
  trail,
  trailDays = 3,
  focusId,
  focusLabel,
  height = 480,
}: {
  markers: MapMarker[];
  /** 선택 센서의 이동 경로 (오래된 → 최신) */
  trail?: Array<{ lat: number; lon: number }>;
  trailDays?: number;
  focusId?: string;
  focusLabel?: string;
  height?: number;
}) {
  const [showTrail, setShowTrail] = useState(true);

  // 같은 좌표만 반복 수신한 장비는 그릴 선이 없으므로 '이동 없음'으로 구분한다.
  const distinctPositions = useMemo(() => {
    if (!trail?.length) return 0;
    return new Set(
      trail.map((p) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`)
    ).size;
  }, [trail]);

  const hasTrail = Boolean(focusId && trail && distinctPositions >= 2);
  const paths: MapPath[] =
    hasTrail && showTrail ? [{ id: focusId!, points: trail! }] : [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 text-sm text-[var(--eh-fog)]">
          {focusId ? (
            <>
              <span className="text-[var(--eh-mist)]">{focusLabel || focusId}</span>
              <span className="ml-1.5">
                {hasTrail
                  ? `· 최근 ${trailDays}일 이동 경로 ${trail!.length}개 지점`
                  : trail?.length
                    ? `· 최근 ${trailDays}일 위치 변화 없음 (현재 위치만 표시)`
                    : `· 최근 ${trailDays}일 위치 기록 없음`}
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

      <p className="text-[11px] leading-4 text-[var(--eh-fog)]">
        넓게 보면 현장 핀, 확대하면 센서 핀으로 바뀝니다.
        {hasTrail && showTrail
          ? ` 파란 선은 최근 ${trailDays}일 이동 경로이고, 핀은 마지막으로 수신한 현재 위치 하나만 표시합니다.`
          : ""}
      </p>
    </div>
  );
}
