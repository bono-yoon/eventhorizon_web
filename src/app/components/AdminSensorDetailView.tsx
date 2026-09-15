"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { ChevronLeft, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Badge, Panel } from "./ui";
import { SensorTrackingMap } from "./SensorTrackingMap";
import {
  SensorHistoryView,
  type HistoryPoint,
  type UnlockMarker,
} from "./SensorHistoryView";
import { SensorControlPanel } from "./SensorControlPanel";
import type { MapMarker } from "./SiteMap";
import type { SensorAssignmentPhase } from "@/lib/types";
import { ASSIGNMENT_PHASE_LABELS } from "@/lib/sensorAssignmentConstants";

type HistoryRow = HistoryPoint;

export type DeploymentView = {
  phase: "in_transit" | "installed";
  assignmentPhase?: SensorAssignmentPhase;
  assignmentPhaseLabel?: string;
  siteId?: string;
};

export function AdminSensorDetailView({
  deviceId,
  label,
  siteName,
  siteId,
  mode,
  batteryPercent,
  markers,
  trail,
  trailDays,
  focusId,
  history,
  unlockEvents,
  deployment,
  canControl,
  canDeploy,
  canDismantle,
  control,
  runtime,
  initialStatus,
}: {
  deviceId: string;
  label: string;
  siteName: string | null;
  siteId?: string | null;
  mode: string;
  batteryPercent: number | null;
  markers: MapMarker[];
  trail: Array<{ lat: number; lon: number; ts?: number }>;
  trailDays: number;
  focusId: string;
  history: HistoryRow[];
  unlockEvents: UnlockMarker[];
  deployment: DeploymentView | null;
  canControl: boolean;
  canDeploy: boolean;
  canDismantle: boolean;
  control: {
    run: boolean;
    config: boolean;
    threshold: boolean;
    origin: boolean;
  };
  runtime: {
    blackboxLocked?: boolean;
    holdActive?: boolean;
  } | null;
  initialStatus: "ok" | "warning" | "critical" | "offline" | "inactive";
}) {
  const router = useRouter();
  const [panelOpen, setPanelOpen] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [assignPhase, setAssignPhase] = useState<SensorAssignmentPhase>(
    deployment?.assignmentPhase ??
      (deployment?.phase === "installed" ? "installed" : "shipping")
  );

  async function runAction(action: string) {
    setBusy(action);
    try {
      const res = await fetch("/api/sensor-deployment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          deviceId,
          siteId: siteId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data.error || "처리에 실패했습니다.");
        return;
      }
      if (action === "install_complete") setAssignPhase("installed");
      if (action === "removal_complete") setAssignPhase("returning");
      if (action === "return_complete") setAssignPhase("ended");
      if (action === "start_shipping") setAssignPhase("shipping");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const showTrail =
    assignPhase === "shipping" || assignPhase === "returning";
  const phaseLabel =
    ASSIGNMENT_PHASE_LABELS[assignPhase] ||
    deployment?.assignmentPhaseLabel ||
    "-";

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/admin/sensors"
          className="eh-neu-raised-sm eh-neu-press inline-flex items-center gap-1.5 rounded-2xl px-3 py-2 text-sm text-[var(--eh-mist)] transition"
        >
          <ChevronLeft size={16} />
          목록으로
        </Link>
        <div className="min-w-0">
          <div className="text-lg text-[var(--eh-mist)]">{label}</div>
          <div className="text-xs text-[var(--eh-fog)]">
            {deviceId}
            {siteName ? ` · ${siteName}` : ""}
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Badge
            tone={
              assignPhase === "installed"
                ? "ok"
                : assignPhase === "ended"
                  ? "neutral"
                  : "warn"
            }
          >
            {phaseLabel}
          </Badge>
          <Badge tone="neutral">mode {mode}</Badge>
          <Badge tone="neutral">bat {batteryPercent ?? "-"}%</Badge>
        </div>
      </div>

      <div
        className={clsx(
          "flex items-stretch gap-4",
          panelOpen && canControl && "lg:flex-row",
          !panelOpen && "flex-col"
        )}
      >
        <Panel className="min-w-0 flex-1 !p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-lg text-[var(--eh-mist)]">위치 추적</div>
            <div className="flex flex-wrap items-center gap-2">
              {canDeploy && assignPhase === "shipping" && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => runAction("install_complete")}
                  className="eh-neu-raised-sm eh-neu-press rounded-xl px-3 py-1.5 text-xs text-[var(--eh-signal)] disabled:opacity-50"
                >
                  {busy === "install_complete" ? "처리 중…" : "설치 완료"}
                </button>
              )}
              {canDismantle && assignPhase === "installed" && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => runAction("removal_complete")}
                  className="eh-neu-raised-sm eh-neu-press rounded-xl px-3 py-1.5 text-xs text-[var(--eh-warn)] disabled:opacity-50"
                >
                  {busy === "removal_complete" ? "처리 중…" : "해체 완료"}
                </button>
              )}
              {canDeploy && assignPhase === "returning" && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => runAction("return_complete")}
                  className="eh-neu-raised-sm eh-neu-press rounded-xl px-3 py-1.5 text-xs text-[var(--eh-mist)] disabled:opacity-50"
                >
                  {busy === "return_complete" ? "처리 중…" : "본사 도착·배정 종료"}
                </button>
              )}
              {canDeploy &&
                (assignPhase === "ended" || !deployment) &&
                siteId && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => runAction("start_shipping")}
                    className="eh-neu-raised-sm eh-neu-press rounded-xl px-3 py-1.5 text-xs text-[var(--eh-signal)] disabled:opacity-50"
                  >
                    {busy === "start_shipping" ? "처리 중…" : "배송 시작"}
                  </button>
                )}
              {canControl && (
                <button
                  type="button"
                  onClick={() => setPanelOpen((v) => !v)}
                  className="eh-neu-raised-sm eh-neu-press inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs text-[var(--eh-fog)]"
                  aria-expanded={panelOpen}
                >
                  {panelOpen ? (
                    <>
                      <PanelLeftClose size={14} />
                      제어 접기
                    </>
                  ) : (
                    <>
                      <PanelLeftOpen size={14} />
                      제어 열기
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
          <SensorTrackingMap
            markers={markers}
            trail={showTrail ? trail : []}
            trailDays={trailDays}
            focusId={focusId}
            focusLabel={label}
            height={400}
          />
        </Panel>

        {canControl && panelOpen && (
          <div className="w-full shrink-0 lg:w-[340px]">
            <SensorControlPanel
              className="lg:sticky lg:top-3"
              deviceId={deviceId}
              sensorLabel={label}
              canRun={control.run}
              canConfig={control.config}
              canThreshold={control.threshold}
              canOrigin={control.origin}
              blackboxLocked={runtime?.blackboxLocked}
              holdActive={runtime?.holdActive}
              initialStatus={initialStatus}
              safetyLock
              compact
            />
          </div>
        )}
      </div>

      <Panel>
        <div className="mb-3 text-lg text-[var(--eh-mist)]">센서 데이터</div>
        <div className="mb-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="text-xs text-[var(--eh-fog)]">Device ID</div>
            <div>{deviceId}</div>
          </div>
          <div>
            <div className="text-xs text-[var(--eh-fog)]">배터리</div>
            <div>{batteryPercent != null ? `${batteryPercent}%` : "-"}</div>
          </div>
          <div>
            <div className="text-xs text-[var(--eh-fog)]">이동 추적</div>
            <div>{showTrail ? "활성" : "비활성"}</div>
          </div>
          <div>
            <div className="text-xs text-[var(--eh-fog)]">현장</div>
            <div>{siteName || "미배치"}</div>
          </div>
        </div>
        <SensorHistoryView
          history={history}
          showUnlockMarkers
          unlockEvents={unlockEvents}
        />
      </Panel>
    </>
  );
}
