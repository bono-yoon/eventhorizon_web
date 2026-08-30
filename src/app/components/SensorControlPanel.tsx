"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { format, formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import {
  AlertTriangle,
  BatteryLow,
  Check,
  Clock3,
  Crosshair,
  Gauge,
  Info,
  Lock,
  Play,
  Radio,
  RefreshCw,
  Square,
  Unlock,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Button, Panel } from "./ui";

gsap.registerPlugin(useGSAP);

type RemotePad = "tilt" | "interval" | "origin" | null;

type ValueSource = "device" | "requested" | null;

type Tracked<T> = { value: T | null; source: ValueSource };

type DeviceStatus = "running" | "stopped" | "offline" | "inactive";

type ControlState = {
  status: DeviceStatus;
  running: boolean;
  desiredRunning: boolean | null;
  holdReleasePending: boolean;
  blackboxLocked: boolean;
  mode: Tracked<string>;
  tiltDeg: Tracked<number>;
  realtimeSec: Tracked<number>;
  uploadMin: Tracked<number>;
  desiredMode: Tracked<string>;
  desiredTiltDeg: Tracked<number>;
  desiredRealtimeSec: Tracked<number>;
  desiredUploadMin: Tracked<number>;
  lastSeenAt: string | null;
  lastMeasuredAt: string | null;
  reportedAt: string | null;
  known: boolean;
};

type PendingCommand = {
  id: number;
  command: string;
  status: "pending" | "delivered";
  createdAt: string;
};

/** 되돌리기 어려운 요청은 누른 자리에서 한 번 더 물어본다. */
type ConfirmRequest = {
  row: "run" | "origin";
  message: string;
  action: string;
  run: () => void;
};

export function SensorControlPanel({
  deviceId,
  sensorLabel,
  canRun,
  canConfig,
  canThreshold,
  canOrigin,
  blackboxLocked,
  holdActive,
  initialStatus,
  safetyLock = false,
  compact = false,
  className,
}: {
  deviceId: string;
  sensorLabel?: string;
  canRun: boolean;
  canConfig: boolean;
  canThreshold: boolean;
  canOrigin: boolean;
  blackboxLocked?: boolean;
  holdActive?: boolean;
  /** 대시보드와 같은 기준으로 서버에서 계산한 초기 상태 */
  initialStatus?: "ok" | "warning" | "critical" | "offline" | "inactive";
  /** 클릭 실수 방지: 기본 잠금이고 해제해야 조작할 수 있다 */
  safetyLock?: boolean;
  /** 현장 대시보드용 — 아이콘 리모컨 UI */
  compact?: boolean;
  className?: string;
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  const [remotePad, setRemotePad] = useState<RemotePad>(null);
  /** 열기 애니메이션 중에만 쓰는 미리보기 (레이아웃은 아직 닫힌 상태) */
  const [padPreview, setPadPreview] = useState<RemotePad>(null);
  /** 닫기 애니메이션 중 — 닫힌 레이아웃 + 패드 오버레이 유지 */
  const [closingFrom, setClosingFrom] = useState<RemotePad>(null);
  const settingsRowRef = useRef<HTMLDivElement>(null);
  const settingsAnimLock = useRef(false);
  /** 열기 때 버튼이 왼쪽으로 이동한 거리 — 닫을 때 동일 값으로 우측 복귀 */
  const slideDxRef = useRef(0);
  const [state, setState] = useState<ControlState>({
    status:
      initialStatus === "inactive"
        ? "inactive"
        : initialStatus === "offline"
          ? "offline"
          : holdActive === true
            ? "stopped"
            : "running",
    running: holdActive !== true,
    desiredRunning: null,
    holdReleasePending: false,
    blackboxLocked: Boolean(blackboxLocked),
    mode: { value: null, source: null },
    tiltDeg: { value: null, source: null },
    realtimeSec: { value: null, source: null },
    uploadMin: { value: null, source: null },
    desiredMode: { value: null, source: null },
    desiredTiltDeg: { value: null, source: null },
    desiredRealtimeSec: { value: null, source: null },
    desiredUploadMin: { value: null, source: null },
    lastSeenAt: null,
    lastMeasuredAt: null,
    reportedAt: null,
    known: false,
  });
  const [pending, setPending] = useState<PendingCommand[]>([]);
  const [sending, setSending] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<ConfirmRequest | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [result, setResult] = useState<{
    tone: "ok" | "error";
    text: string;
  } | null>(null);
  const [tiltDeg, setTiltDeg] = useState("");
  const [realtimeSec, setRealtimeSec] = useState("");
  const [uploadMin, setUploadMin] = useState("");
  const touched = useRef({ tilt: false, realtime: false, upload: false });

  const resultTimer = useRef<number | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/devices/${encodeURIComponent(deviceId)}/commands`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const data = await res.json();
      if (!data?.state) return;
      setState(data.state as ControlState);
      setPending((data.pending || []) as PendingCommand[]);

      // 사용자가 직접 고친 값은 덮어쓰지 않는다.
      const next = data.state as ControlState;
      if (!touched.current.tilt && next.tiltDeg.value != null) {
        setTiltDeg(String(next.tiltDeg.value));
      }
      if (!touched.current.realtime && next.realtimeSec.value != null) {
        setRealtimeSec(String(next.realtimeSec.value));
      }
      if (!touched.current.upload && next.uploadMin.value != null) {
        setUploadMin(String(next.uploadMin.value));
      }
    } catch {
      // 조회 실패는 조용히 무시하고 다음 주기에 재시도
    }
  }, [deviceId]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  // 다른 장비로 옮기면 다시 잠근다.
  useEffect(() => {
    setUnlocked(false);
    setConfirming(null);
  }, [deviceId]);

  useEffect(() => () => window.clearTimeout(resultTimer.current), []);

  const displayPad = remotePad ?? padPreview ?? closingFrom;

  useGSAP(
    () => {
      const root = settingsRowRef.current;
      if (!root || !padPreview || remotePad || closingFrom) return;

      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const finish = () => {
        const target = padPreview;
        settingsAnimLock.current = false;
        setPadPreview(null);
        setRemotePad(target);
      };

      if (reduced) {
        finish();
        return;
      }

      const target = padPreview;
      const btn = root.querySelector(
        `[data-flip-id="${target}"]`
      ) as HTMLElement | null;
      const padInner = root.querySelector(
        "[data-pad-inner]"
      ) as HTMLElement | null;

      if (target === "tilt") {
        const others = root.querySelectorAll<HTMLElement>(
          "[data-flip-id]:not([data-flip-id='tilt']):not([data-flip-id='settings-pad'])"
        );
        if (padInner) gsap.set(padInner, { autoAlpha: 0 });
        const tl = gsap.timeline({
          defaults: { ease: "power2.out" },
          onComplete: finish,
        });
        tl.to(others, { autoAlpha: 0, duration: 0.22 }, 0);
        if (padInner) {
          tl.to(padInner, { autoAlpha: 1, duration: 0.35 }, 0);
        }
        return;
      }

      // 주기 / 원점: 버튼이 컨텐츠 영역을 비운 뒤에 아래에서 올라옴 (종료 시점 동일)
      const actionBtns = Array.from(
        root.querySelectorAll<HTMLElement>(
          "[data-flip-id='tilt'], [data-flip-id='interval'], [data-flip-id='origin']"
        )
      );
      const leftBtn = actionBtns[0];
      const padHost = root.querySelector(
        "[data-flip-id='settings-pad']"
      ) as HTMLElement | null;
      if (!btn || !leftBtn || !padInner || !padHost) {
        finish();
        return;
      }

      const btnRect = btn.getBoundingClientRect();
      const dx = leftBtn.getBoundingClientRect().left - btnRect.left;
      const others = actionBtns.filter((el) => el !== btn);
      const travel = Math.abs(dx);
      const padLeft = padHost.getBoundingClientRect().left;
      const clearProgress =
        travel > 1
          ? Math.min(
              0.92,
              Math.max(0.2, (btnRect.right - padLeft) / travel)
            )
          : 0.45;
      const btnDur = 0.42;
      const contentDelay = btnDur * clearProgress;
      const contentDur = Math.max(0.12, btnDur - contentDelay);

      gsap.set(btn, { zIndex: 2 });
      gsap.set(padInner, { yPercent: 100, autoAlpha: 0 });
      slideDxRef.current = dx;

      const tl = gsap.timeline({
        defaults: { ease: "power2.out" },
        onComplete: finish,
      });
      tl.to(others, { autoAlpha: 0, duration: 0.2 }, 0);
      tl.to(btn, { x: dx, duration: btnDur }, 0);
      tl.to(
        padInner,
        { yPercent: 0, autoAlpha: 1, duration: contentDur },
        contentDelay
      );
    },
    { dependencies: [padPreview, remotePad, closingFrom], scope: settingsRowRef }
  );

  // 닫기: 열기 애니메이션의 역재생
  useGSAP(
    () => {
      const root = settingsRowRef.current;
      if (!root || !closingFrom || remotePad || padPreview) return;

      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const finish = () => {
        const btn = root.querySelector(
          `[data-flip-id="${closingFrom}"]`
        ) as HTMLElement | null;
        const others = root.querySelectorAll<HTMLElement>(
          "[data-flip-id]:not([data-flip-id='settings-pad'])"
        );
        const padInner = root.querySelector(
          "[data-pad-inner]"
        ) as HTMLElement | null;
        if (btn) gsap.set(btn, { clearProps: "transform,opacity,zIndex" });
        gsap.set(others, { clearProps: "opacity" });
        if (padInner) gsap.set(padInner, { clearProps: "all" });
        settingsAnimLock.current = false;
        setClosingFrom(null);
      };

      if (reduced) {
        finish();
        return;
      }

      const target = closingFrom;
      const padInner = root.querySelector(
        "[data-pad-inner]"
      ) as HTMLElement | null;

      if (target === "tilt") {
        const others = root.querySelectorAll<HTMLElement>(
          "[data-flip-id]:not([data-flip-id='tilt']):not([data-flip-id='settings-pad'])"
        );
        gsap.set(others, { autoAlpha: 0 });
        if (padInner) gsap.set(padInner, { autoAlpha: 1 });
        const tl = gsap.timeline({
          defaults: { ease: "power2.in" },
          onComplete: finish,
        });
        if (padInner) {
          tl.to(padInner, { autoAlpha: 0, duration: 0.28 }, 0);
        }
        tl.to(others, { autoAlpha: 1, duration: 0.28 }, 0.05);
        return;
      }

      const actionBtns = Array.from(
        root.querySelectorAll<HTMLElement>(
          "[data-flip-id='tilt'], [data-flip-id='interval'], [data-flip-id='origin']"
        )
      );
      const leftBtn = actionBtns[0];
      const btn = root.querySelector(
        `[data-flip-id="${target}"]`
      ) as HTMLElement | null;
      if (!btn || !leftBtn || !padInner) {
        finish();
        return;
      }

      const naturalLeft = btn.getBoundingClientRect().left;
      const dx =
        slideDxRef.current ||
        leftBtn.getBoundingClientRect().left - naturalLeft;
      const others = actionBtns.filter((el) => el !== btn);
      const btnDur = 0.42;

      // 첫 페인트부터 왼쪽(열린 위치)에 두고, 제자리(x:0)로 우측 이동
      gsap.set(btn, { x: dx, zIndex: 2 });
      gsap.set(others, { autoAlpha: 0 });
      gsap.set(padInner, { yPercent: 0, autoAlpha: 1 });

      const tl = gsap.timeline({
        defaults: { ease: "power2.out" },
        onComplete: finish,
      });
      tl.fromTo(btn, { x: dx }, { x: 0, duration: btnDur }, 0);
      tl.to(padInner, { yPercent: 100, autoAlpha: 0, duration: btnDur }, 0);
      tl.to(others, { autoAlpha: 1, duration: 0.22 }, btnDur - 0.22);
    },
    { dependencies: [closingFrom, remotePad, padPreview], scope: settingsRowRef }
  );

  // 열린 레이아웃으로 바뀐 뒤에도 잔여 인라인 스타일 제거
  useGSAP(
    () => {
      if (!remotePad || padPreview || closingFrom) return;
      const root = settingsRowRef.current;
      if (!root) return;
      const btn = root.querySelector(
        `[data-flip-id="${remotePad}"]`
      ) as HTMLElement | null;
      const padInner = root.querySelector(
        "[data-pad-inner]"
      ) as HTMLElement | null;
      if (btn) gsap.set(btn, { clearProps: "transform,opacity,zIndex" });
      if (padInner) gsap.set(padInner, { clearProps: "all" });
    },
    { dependencies: [remotePad, padPreview, closingFrom], scope: settingsRowRef }
  );

  if (!canRun && !canConfig && !canThreshold && !canOrigin) {
    return null;
  }

  const locked = safetyLock && !unlocked;

  function ask(request: ConfirmRequest) {
    if (locked) return;
    setConfirming(request);
  }

  async function send(command: string, payload?: Record<string, unknown>) {
    if (locked) return;
    setConfirming(null);
    setSending(command);
    setResult(null);
    window.clearTimeout(resultTimer.current);
    try {
      const res = await fetch(
        `/api/devices/${encodeURIComponent(deviceId)}/commands`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command, payload }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({
          tone: "error",
          text: data.error || "요청을 보내지 못했습니다.",
        });
        return;
      }
      setResult({ tone: "ok", text: requestMessage(command) });
      resultTimer.current = window.setTimeout(() => setResult(null), 8000);
      touched.current = { tilt: false, realtime: false, upload: false };
      await load();
    } catch {
      setResult({
        tone: "error",
        text: "네트워크 문제로 요청을 보내지 못했습니다.",
      });
    } finally {
      setSending(null);
    }
  }

  const busy = sending !== null;
  const controlsDisabled =
    busy || locked || padPreview !== null || closingFrom !== null;

  function setSettingsPad(next: RemotePad) {
    if (settingsAnimLock.current) return;

    // 닫기: 열기 애니메이션 역재생
    if (next === null) {
      const from = remotePad;
      if (!from) {
        setPadPreview(null);
        setClosingFrom(null);
        setRemotePad(null);
        return;
      }
      settingsAnimLock.current = true;
      setClosingFrom(from);
      setRemotePad(null);
      setPadPreview(null);
      return;
    }

    // 이미 열린 상태에서 다른 패드로 전환
    if (remotePad && remotePad !== next) {
      setRemotePad(next);
      if (next !== "origin") setConfirming(null);
      return;
    }

    // 열기: 닫힌 레이아웃 유지한 채 애니메이션 → 완료 후 확정
    if (remotePad === null && !closingFrom) {
      settingsAnimLock.current = true;
      setPadPreview(next);
      if (next !== "origin") setConfirming(null);
    }
  }

  /** 해당 명령이 지금 어디까지 갔는지 한 마디로 */
  function noteFor(...commands: string[]) {
    if (commands.some((c) => sending === c)) return "보내는 중";
    for (const c of commands) {
      const item = pending.find((p) => p.command === c);
      if (item) return item.status === "pending" ? "적용 대기" : "센서 수신";
    }
    return null;
  }

  const runNote =
    noteFor("hold_off", "hold_on") ??
    (state.holdReleasePending ? "적용 대기" : null);
  const runCurrent = state.running ? "가동" : "중지";
  const runDesired = pendingIfChanged(
    runCurrent,
    state.desiredRunning != null
      ? state.desiredRunning
        ? "가동"
        : "중지"
      : state.holdReleasePending
        ? "가동"
        : null
  );
  const runTarget = state.desiredRunning ?? state.running;
  const modeCurrent = modeLabel(state.mode.value);
  const modeDesired = pendingIfChanged(
    modeCurrent,
    state.desiredMode.value != null
      ? (modeLabel(state.desiredMode.value) ?? state.desiredMode.value)
      : null
  );
  const tiltCurrent =
    state.tiltDeg.value != null ? `${state.tiltDeg.value.toFixed(1)}°` : null;
  const tiltDesired = pendingIfChanged(
    tiltCurrent,
    state.desiredTiltDeg.value != null
      ? `${state.desiredTiltDeg.value.toFixed(1)}°`
      : null
  );

  const tiltValue = Number(tiltDeg);
  const tiltDirty =
    tiltDeg.trim() !== "" && tiltValue > 0 && tiltValue !== state.tiltDeg.value;

  const realtimeValue = Number(realtimeSec);
  const uploadValue = Number(uploadMin);
  const intervalDirty =
    realtimeValue > 0 &&
    uploadValue > 0 &&
    (realtimeValue !== state.realtimeSec.value ||
      uploadValue !== state.uploadMin.value);

  const desiredInterval =
    state.desiredRealtimeSec.value != null ||
    state.desiredUploadMin.value != null
      ? intervalText(
          state.desiredRealtimeSec.value ?? state.realtimeSec.value,
          state.desiredUploadMin.value ?? state.uploadMin.value
        )
      : null;

  const modeTarget = state.desiredMode.value ?? state.mode.value;
  const header = (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <div
            className={clsx(
              "leading-tight text-[var(--eh-mist)]",
              compact ? "text-sm font-medium" : "text-lg"
            )}
          >
            센서 제어
          </div>
          <button
            type="button"
            onClick={() => setInfoOpen(true)}
            title="제어 패널 설명"
            aria-label="제어 패널 설명"
            className="eh-neu-press eh-neu-raised-sm rounded-full p-1 text-[var(--eh-fog)] transition hover:text-[var(--eh-mist)]"
          >
            <Info size={12} />
          </button>
        </div>
        <div className="mt-0.5 truncate text-[11px] text-[var(--eh-fog)]">
          {sensorLabel ? `${sensorLabel} · ` : ""}
          {deviceId}
        </div>
        {!compact && (
          <div className="mt-0.5 truncate text-xs text-[var(--eh-fog)]">
            마지막 연결{" "}
            {state.lastSeenAt
              ? `${absolute(state.lastSeenAt)} (${relative(state.lastSeenAt)})`
              : "기록 없음"}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <StatusChip status={state.status} compact={compact} />
        <button
          type="button"
          onClick={() => load()}
          title="상태 새로고침"
          aria-label="상태 새로고침"
          className="rounded-lg p-1.5 text-[var(--eh-fog)] transition hover:bg-white/10 hover:text-[var(--eh-mist)]"
        >
          <RefreshCw size={13} />
        </button>
      </div>
    </div>
  );

  const infoModal =
    infoOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
            onClick={() => setInfoOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="sensor-control-info-title"
              className="eh-panel eh-fixed w-full max-w-md space-y-3 !p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div
                    id="sensor-control-info-title"
                    className="text-base text-[var(--eh-mist)]"
                  >
                    센서 제어 안내
                  </div>
                  <p className="mt-1 text-xs leading-5 text-[var(--eh-fog)]">
                    센서는 배터리를 아끼려고 정해진 주기에만 서버에 연결합니다.
                    요청은 보통 1분 안에, 절전 모드에서는 전송 주기만큼 늦게
                    적용됩니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setInfoOpen(false)}
                  className="rounded-lg p-1.5 text-[var(--eh-fog)] hover:bg-white/10 hover:text-[var(--eh-mist)]"
                  aria-label="닫기"
                >
                  <X size={16} />
                </button>
              </div>
              <ul className="space-y-2.5 text-xs leading-5 text-[var(--eh-mist)]">
                <li>
                  <span className="text-[var(--eh-mist)]">가동 / 중지</span> — 측정을
                  시작하거나 멈춥니다. 중지는 한 번 더 확인합니다.
                </li>
                <li>
                  <span className="text-[var(--eh-mist)]">상시 / 절전</span> — 상시는 기록
                  주기마다 측정하고, 절전은 전송 주기마다 모아 보냅니다.
                </li>
                <li>
                  <span className="text-[var(--eh-mist)]">임계각</span> — 이 각도를 넘으면
                  경보가 발생합니다.
                </li>
                <li>
                  <span className="text-[var(--eh-mist)]">기록 · 전송 주기</span> — 상시는
                  기록(초), 절전은 전송(분) 기준입니다.
                </li>
                <li>
                  <span className="text-[var(--eh-mist)]">원점</span> — 지금 기울기를 0으로
                  삼습니다.
                </li>
                {safetyLock && (
                  <li>
                    <span className="text-[var(--eh-mist)]">잠금</span> — 실수 방지를 위해
                    기본 잠금이며, 해제해야 조작할 수 있습니다.
                  </li>
                )}
              </ul>
            </div>
          </div>,
          document.body
        )
      : null;

  if (compact) {
    const settingKeys = (
      [
        canThreshold
          ? {
              id: "tilt" as const,
              label: "임계각",
              title: tiltCurrent ? `임계각 ${tiltCurrent}` : "임계각",
              icon: <Gauge size={15} />,
              note: noteFor("set_tilt_threshold"),
            }
          : null,
        canConfig
          ? {
              id: "interval" as const,
              label: "주기",
              title: (() => {
                const v = intervalText(
                  state.realtimeSec.value,
                  state.uploadMin.value
                );
                return v ? `주기 ${v}` : "주기";
              })(),
              icon: <Clock3 size={15} />,
              note: noteFor("set_interval"),
            }
          : null,
        canOrigin
          ? {
              id: "origin" as const,
              label: "원점",
              title: "원점",
              icon: <Crosshair size={15} />,
              note: noteFor("reset_origin"),
            }
          : null,
        safetyLock
          ? {
              id: "lock" as const,
              label: locked ? "잠김" : "해제",
              title: locked ? "제어 잠김" : "제어 해제",
              icon: locked ? <Lock size={15} /> : <Unlock size={15} />,
              note: null as string | null,
            }
          : null,
      ] as const
    ).filter((k): k is NonNullable<typeof k> => k != null);

    const actionKeyCount = settingKeys.filter((k) => k.id !== "lock").length;
    const visibleSettingKeys = remotePad
      ? settingKeys.filter((k) => k.id === remotePad)
      : settingKeys;
    const activePad = displayPad;
    const padOverlayLeft =
      settingKeys.length > 1
        ? `calc((100% - ${(settingKeys.length - 1) * 6}px) / ${settingKeys.length} + 6px)`
        : "0px";

    const padBody = activePad ? (
        <div
          data-pad-inner
          className="flex h-full min-h-0 w-full items-center gap-2"
        >
          {activePad === "tilt" && (
            <>
              <NumberField
                value={tiltDeg}
                unit="도"
                step="0.1"
                min="0.1"
                placeholder="5"
                disabled={locked}
                ariaLabel="임계각"
                compact
                className="min-w-0 flex-1"
                onChange={(v) => {
                  touched.current.tilt = true;
                  setTiltDeg(v);
                }}
              />
              <Button
                type="button"
                variant="ghost"
                className="!h-8 !px-3 !py-0 shrink-0 text-[11px]"
                disabled={controlsDisabled || !tiltDirty}
                onClick={() =>
                  send("set_tilt_threshold", {
                    degrees: tiltValue,
                    tilt_threshold_deg: tiltValue,
                  })
                }
              >
                적용
              </Button>
            </>
          )}
          {activePad === "interval" && (
            <>
              <NumberField
                value={realtimeSec}
                unit="초"
                min="1"
                placeholder="5"
                disabled={locked}
                ariaLabel="기록 주기"
                compact
                className="min-w-0 flex-1"
                onChange={(v) => {
                  touched.current.realtime = true;
                  setRealtimeSec(v);
                }}
              />
              <NumberField
                value={uploadMin}
                unit="분"
                min="1"
                placeholder="60"
                disabled={locked}
                ariaLabel="전송 주기"
                compact
                className="min-w-0 flex-1"
                onChange={(v) => {
                  touched.current.upload = true;
                  setUploadMin(v);
                }}
              />
              <Button
                type="button"
                variant="ghost"
                className="!h-8 !px-3 !py-0 shrink-0 text-[11px]"
                disabled={controlsDisabled || !intervalDirty}
                onClick={() =>
                  send("set_interval", {
                    realtime_interval_sec: realtimeValue,
                    upload_interval_min: uploadValue,
                  })
                }
              >
                적용
              </Button>
            </>
          )}
          {activePad === "origin" && (
            <>
              <p className="min-w-0 flex-1 truncate text-[11px] leading-none text-[var(--eh-mist)]">
                현재 각을 0°로
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  className="eh-neu-press eh-neu-raised-sm h-8 rounded-lg px-3 text-[11px] text-[var(--eh-mist)]"
                  onClick={() => setSettingsPad(null)}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="eh-neu-press eh-neu-raised-sm h-8 rounded-lg px-3 text-[11px] text-[var(--eh-danger)]"
                  disabled={controlsDisabled}
                  onClick={() => {
                    setSettingsPad(null);
                    void send("reset_origin");
                  }}
                >
                  세팅
                </button>
              </div>
            </>
          )}
        </div>
      ) : null;

    return (
      <Panel
        className={clsx(
          "space-y-2 overflow-hidden !p-2.5",
          className
        )}
      >
        {header}
        {infoModal}

        {state.blackboxLocked && (
          <Notice tone="warn">
            임계각 초과로 기록 보존 중 — 요청이 늦게 적용될 수 있습니다.
          </Notice>
        )}

        <div className="space-y-1.5">
          {canRun && (
            <RemoteRow ariaLabel="가동 상태">
              <RemoteKey
                label="가동"
                icon={<Play size={14} />}
                active={runTarget}
                note={runNote}
                disabled={controlsDisabled}
                onClick={() => {
                  setRemotePad(null);
                  if (confirming?.row === "run") {
                    setConfirming(null);
                    return;
                  }
                  send("hold_off");
                }}
              />
              <RemoteKey
                label="중지"
                icon={<Square size={12} />}
                active={!runTarget}
                note={runNote}
                disabled={controlsDisabled}
                danger
                onClick={() => {
                  setRemotePad(null);
                  if (confirming?.row === "run") {
                    confirming.run();
                    return;
                  }
                  ask({
                    row: "run",
                    message: "센서 측정을 멈춥니다.",
                    action: "중지",
                    run: () => send("hold_on"),
                  });
                }}
              />
            </RemoteRow>
          )}

          {canConfig && (
            <RemoteRow ariaLabel="운영 모드">
              <RemoteKey
                label="상시"
                icon={<Radio size={14} />}
                active={modeTarget === "ALWAYS_ON"}
                note={noteFor("set_mode")}
                disabled={controlsDisabled}
                onClick={() => {
                  setRemotePad(null);
                  send("set_mode", { mode: "ALWAYS_ON" });
                }}
              />
              <RemoteKey
                label="절전"
                icon={<BatteryLow size={14} />}
                active={modeTarget === "ULTRA_SAVER"}
                note={noteFor("set_mode")}
                disabled={controlsDisabled}
                onClick={() => {
                  setRemotePad(null);
                  send("set_mode", { mode: "ULTRA_SAVER" });
                }}
              />
            </RemoteRow>
          )}

          {settingKeys.length > 0 && (
            <div
              ref={settingsRowRef}
              role="group"
              aria-label="설정"
              className="eh-neu-inset relative box-border h-16 min-h-16 max-h-16 overflow-hidden rounded-2xl p-1.5"
            >
              <div
                className="grid h-full items-stretch gap-1.5"
                style={{
                  gridTemplateColumns: remotePad
                    ? `minmax(0,1fr) minmax(0,${Math.max(actionKeyCount - 1, 1)}fr)`
                    : `repeat(${settingKeys.length}, minmax(0, 1fr))`,
                }}
              >
                {visibleSettingKeys.map((key) => {
                  if (key.id === "lock") {
                    return (
                      <RemoteKey
                        key={key.id}
                        flipId={key.id}
                        className="!h-full !min-h-0 !w-full"
                        label={key.label}
                        title={key.title}
                        icon={key.icon}
                        active={!locked}
                        disabled={false}
                        onClick={() => {
                          if (!locked) {
                            setConfirming(null);
                            if (remotePad || padPreview) setSettingsPad(null);
                          }
                          setUnlocked((v) => !v);
                        }}
                      />
                    );
                  }
                  return (
                    <RemoteKey
                      key={remotePad ? `${key.id}-open` : key.id}
                      flipId={key.id}
                      className="!h-full !min-h-0 !w-full"
                      label={key.label}
                      title={key.title}
                      icon={key.icon}
                      active={
                        remotePad === key.id ||
                        padPreview === key.id ||
                        closingFrom === key.id
                      }
                      note={key.note}
                      disabled={controlsDisabled}
                      style={
                        closingFrom === key.id && slideDxRef.current
                          ? {
                              transform: `translate3d(${slideDxRef.current}px, 0, 0)`,
                            }
                          : closingFrom && closingFrom !== key.id
                            ? { opacity: 0 }
                            : undefined
                      }
                      onClick={() =>
                        setSettingsPad(
                          remotePad === key.id ||
                            padPreview === key.id ||
                            closingFrom === key.id
                            ? null
                            : key.id
                        )
                      }
                    />
                  );
                })}

                {remotePad && padBody && (
                  <div
                    data-flip-id="settings-pad"
                    className="relative flex h-full min-h-0 min-w-0 items-center overflow-hidden"
                  >
                    {padBody}
                  </div>
                )}
              </div>

              {((padPreview || closingFrom) && !remotePad && padBody) && (
                <div
                  data-flip-id="settings-pad"
                  className="absolute bottom-1.5 right-1.5 top-1.5 z-10 overflow-hidden"
                  style={{ left: padOverlayLeft }}
                >
                  {padBody}
                </div>
              )}
            </div>
          )}
        </div>

        {confirming && confirming.row === "run" && (
          <div className="eh-neu-inset space-y-2 rounded-xl px-2.5 py-2">
            <p className="text-[11px] leading-4 text-[var(--eh-mist)]">
              {confirming.message}
            </p>
            <div className="flex gap-1.5">
              <button
                type="button"
                className="eh-neu-press eh-neu-raised-sm flex-1 rounded-lg py-1.5 text-[11px] text-[var(--eh-mist)]"
                onClick={() => setConfirming(null)}
              >
                취소
              </button>
              <button
                type="button"
                className="eh-neu-press eh-neu-raised-sm flex-1 rounded-lg py-1.5 text-[11px] text-[var(--eh-danger)]"
                onClick={() => confirming.run()}
              >
                {confirming.action}
              </button>
            </div>
          </div>
        )}

        {result && (
          <Notice tone={result.tone === "ok" ? "ok" : "danger"}>
            {result.text}
          </Notice>
        )}
      </Panel>
    );
  }

  return (
    <Panel className={clsx("space-y-3", className)}>
      {header}
      {infoModal}

      {safetyLock && (
        <button
          type="button"
          role="switch"
          aria-checked={!locked}
          aria-label="센서 제어 잠금"
          onClick={() =>
            setUnlocked((v) => {
              if (v) setConfirming(null);
              return !v;
            })
          }
          className={clsx(
            "eh-neu-press flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left transition",
            locked ? "eh-neu-raised-sm" : "eh-neu-active text-[var(--eh-signal)]"
          )}
        >
          {locked ? (
            <Lock size={14} className="shrink-0 text-[var(--eh-fog)]" />
          ) : (
            <Unlock size={14} className="shrink-0 text-[var(--eh-signal)]" />
          )}
          <span className="min-w-0 flex-1 text-xs">
            <span className={locked ? "text-[var(--eh-mist)]" : "text-[var(--eh-mist)]"}>
              {locked ? "제어 잠김" : "제어 해제"}
            </span>
            <span className="ml-1.5 text-[var(--eh-fog)]">
              {locked ? "· 눌러서 해제" : "· 끝나면 다시 잠가 주세요"}
            </span>
          </span>
          <span
            aria-hidden
            className={clsx(
              "relative h-5 w-9 shrink-0 rounded-full transition",
              locked ? "eh-neu-inset" : "bg-[var(--eh-signal)]"
            )}
          >
            <span
              className={clsx(
                "absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all",
                locked
                  ? "left-0.5 bg-[var(--eh-fog)]"
                  : "left-[18px] bg-[var(--eh-ink)]"
              )}
            />
          </span>
        </button>
      )}

      {state.blackboxLocked && (
        <Notice tone="warn">
          임계각 초과가 오래 이어져 기록을 보존하는 중입니다. 새 측정과 자동
          삭제가 멈춰 있어 요청이 늦게 적용될 수 있습니다.
        </Notice>
      )}

      <div
        className={clsx(
          "eh-neu-inset divide-y divide-[var(--eh-line)] overflow-hidden rounded-2xl transition",
          locked && "pointer-events-none opacity-40"
        )}
      >
        {canRun && (
          <SettingRow
            label="가동 상태"
            current={runCurrent}
            desired={runDesired}
            note={runNote}
          >
            {confirming?.row === "run" ? (
              <Confirm
                request={confirming}
                onCancel={() => setConfirming(null)}
              />
            ) : (
              <Segmented
                ariaLabel="가동 상태"
                disabled={controlsDisabled}
                options={[
                  {
                    value: "run",
                    label: "가동",
                    icon: <Play size={12} />,
                    active: runTarget,
                  },
                  {
                    value: "stop",
                    label: "중지",
                    icon: <Square size={10} />,
                    active: !runTarget,
                  },
                ]}
                onSelect={(value) => {
                  if (value === "run") {
                    send("hold_off");
                    return;
                  }
                  ask({
                    row: "run",
                    message: "센서 측정을 멈춥니다.",
                    action: "중지",
                    run: () => send("hold_on"),
                  });
                }}
              />
            )}
          </SettingRow>
        )}

        {canConfig && (
          <SettingRow
            label="운영 모드"
            current={modeCurrent}
            desired={modeDesired}
            note={noteFor("set_mode")}
          >
            <Segmented
              ariaLabel="운영 모드"
              disabled={controlsDisabled}
              options={[
                {
                  value: "ALWAYS_ON",
                  label: "상시",
                  hint: "기록 주기마다 측정",
                  active: modeTarget === "ALWAYS_ON",
                },
                {
                  value: "ULTRA_SAVER",
                  label: "절전",
                  hint: "전송 주기마다 모아 보냄",
                  active: modeTarget === "ULTRA_SAVER",
                },
              ]}
              onSelect={(mode) => send("set_mode", { mode })}
            />
          </SettingRow>
        )}

        {canThreshold && (
          <SettingRow
            label="임계각"
            hint="이 각도를 넘으면 경보"
            current={tiltCurrent}
            desired={tiltDesired}
            note={noteFor("set_tilt_threshold")}
          >
            <div className="flex max-w-sm items-center gap-2">
              <NumberField
                value={tiltDeg}
                unit="도"
                step="0.1"
                min="0.1"
                placeholder="5"
                disabled={locked}
                ariaLabel="임계각"
                onChange={(v) => {
                  touched.current.tilt = true;
                  setTiltDeg(v);
                }}
              />
              <Button
                type="button"
                variant="ghost"
                className="!px-3 !py-1.5 shrink-0 text-xs"
                disabled={controlsDisabled || !tiltDirty}
                onClick={() =>
                  send("set_tilt_threshold", {
                    degrees: tiltValue,
                    tilt_threshold_deg: tiltValue,
                  })
                }
              >
                적용
              </Button>
            </div>
          </SettingRow>
        )}

        {canConfig && (
          <SettingRow
            label="기록 · 전송 주기"
            hint="상시는 기록, 절전은 전송 기준"
            current={intervalText(
              state.realtimeSec.value,
              state.uploadMin.value
            )}
            desired={pendingIfChanged(
              intervalText(state.realtimeSec.value, state.uploadMin.value),
              desiredInterval
            )}
            note={noteFor("set_interval")}
          >
            <div className="flex max-w-sm items-center gap-2">
              <NumberField
                value={realtimeSec}
                unit="초"
                min="1"
                placeholder="5"
                disabled={locked}
                ariaLabel="기록 주기"
                onChange={(v) => {
                  touched.current.realtime = true;
                  setRealtimeSec(v);
                }}
              />
              <NumberField
                value={uploadMin}
                unit="분"
                min="1"
                placeholder="60"
                disabled={locked}
                ariaLabel="전송 주기"
                onChange={(v) => {
                  touched.current.upload = true;
                  setUploadMin(v);
                }}
              />
              <Button
                type="button"
                variant="ghost"
                className="!px-3 !py-1.5 shrink-0 text-xs"
                disabled={controlsDisabled || !intervalDirty}
                onClick={() =>
                  send("set_interval", {
                    realtime_interval_sec: realtimeValue,
                    upload_interval_min: uploadValue,
                  })
                }
              >
                적용
              </Button>
            </div>
          </SettingRow>
        )}

        {canOrigin && (
          <SettingRow
            label="원점"
            hint="지금 기울기를 0으로 삼습니다"
            note={noteFor("reset_origin")}
          >
            {confirming?.row === "origin" ? (
              <Confirm
                request={confirming}
                onCancel={() => setConfirming(null)}
              />
            ) : (
              <Button
                type="button"
                variant="ghost"
                className="w-full max-w-sm !py-2 text-xs"
                disabled={controlsDisabled}
                onClick={() =>
                  ask({
                    row: "origin",
                    message: "지금 기울기를 0으로 삼습니다.",
                    action: "원점 세팅",
                    run: () => send("reset_origin"),
                  })
                }
              >
                <Crosshair size={13} />
                원점 세팅
              </Button>
            )}
          </SettingRow>
        )}
      </div>

      {result && (
        <Notice tone={result.tone === "ok" ? "ok" : "danger"}>
          {result.text}
        </Notice>
      )}
    </Panel>
  );
}

function RemoteRow({
  ariaLabel,
  children,
}: {
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="eh-neu-inset flex gap-1 rounded-2xl p-1"
    >
      {children}
    </div>
  );
}


function RemoteKey({
  label,
  title,
  icon,
  active,
  note,
  disabled,
  danger,
  flipId,
  className,
  style,
  onClick,
}: {
  label: string;
  title?: string;
  icon: React.ReactNode;
  active?: boolean;
  note?: string | null;
  disabled?: boolean;
  danger?: boolean;
  flipId?: string;
  className?: string;
  style?: React.CSSProperties;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={note ? `${title ?? label} · ${note}` : (title ?? label)}
      aria-pressed={active === true}
      data-flip-id={flipId}
      style={style}
      className={clsx(
        "eh-remote-key eh-neu-press relative flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl px-2 py-2",
        active
          ? clsx(
              "eh-neu-active",
              danger ? "text-[var(--eh-danger)]" : "text-[var(--eh-signal)]"
            )
          : "eh-neu-raised-sm text-[var(--eh-mist)] hover:text-white",
        disabled && "cursor-not-allowed opacity-45",
        className
      )}
    >
      {icon && (
        <span className="relative z-[2] flex shrink-0 items-center justify-center">
          {icon}
        </span>
      )}
      <span className="relative z-[2] whitespace-nowrap text-[11px] leading-none tracking-tight">
        {label}
      </span>
    </button>
  );
}

function StatusChip({
  status,
  compact,
}: {
  status: DeviceStatus;
  compact?: boolean;
}) {
  const map = {
    running: {
      text: "가동 중",
      chip: "bg-[rgba(47,158,107,0.16)] text-[#7ddeb3]",
      dot: "bg-[var(--eh-ok)]",
    },
    stopped: {
      text: "중지됨",
      chip: "bg-[rgba(232,160,74,0.16)] text-[#f0c48a]",
      dot: "bg-[var(--eh-warn)]",
    },
    offline: {
      text: "통신두절",
      chip: "bg-[rgba(220,80,80,0.16)] text-[#f0a0a0]",
      dot: "bg-[var(--eh-danger)]",
    },
    inactive: {
      text: "비활성",
      chip: "bg-white/8 text-[var(--eh-fog)]",
      dot: "bg-[var(--eh-fog)]",
    },
  } as const;
  const s = map[status];
  if (compact) {
    return (
      <span
        title={s.text}
        className={clsx(
          "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px]",
          s.chip
        )}
      >
        <span className={clsx("h-1.5 w-1.5 rounded-full", s.dot)} />
      </span>
    );
  }
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px]",
        s.chip
      )}
    >
      <span className={clsx("h-1.5 w-1.5 rounded-full", s.dot)} />
      {s.text}
    </span>
  );
}

/**
 * 설정 한 줄 — 이름·현재값·요청값을 한자리에서 보여주고 바로 아래에서 바꾼다.
 * current 가 null 이면 센서가 아직 보고하지 않은 값이다.
 */
function SettingRow({
  label,
  hint,
  current,
  desired,
  note,
  children,
}: {
  label: string;
  hint?: string;
  current?: string | null;
  desired?: string | null;
  note?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="px-3 py-3 [.eh-control-compact_&]:px-2.5 [.eh-control-compact_&]:py-2">
      <div className="mb-2 flex items-baseline justify-between gap-3 [.eh-control-compact_&]:mb-1.5">
        <div className="min-w-0">
          <div className="text-xs text-[var(--eh-mist)]">{label}</div>
          {hint && (
            <div className="mt-0.5 text-[10px] leading-3 text-[var(--eh-fog)]">
              {hint}
            </div>
          )}
        </div>
        <div className="min-w-0 shrink-0 text-right text-xs">
          {current !== undefined &&
            (current != null ? (
              <span className="text-[var(--eh-mist)]">{current}</span>
            ) : (
              <span
                className="text-[var(--eh-fog)]"
                title="센서가 아직 이 값을 보고하지 않았습니다."
              >
                미보고
              </span>
            ))}
          {desired != null && (
            <>
              <span className="mx-1 text-[var(--eh-fog)]">→</span>
              <span className="text-[var(--eh-warn)]">{desired}</span>
            </>
          )}
          {note && (
            <div className="mt-0.5 text-[10px] text-[var(--eh-warn)]">{note}</div>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

function Confirm({
  request,
  onCancel,
}: {
  request: ConfirmRequest;
  onCancel: () => void;
}) {
  return (
    <div className="flex max-w-sm flex-wrap items-center gap-2 rounded-xl border border-[rgba(224,82,82,0.45)] bg-[rgba(224,82,82,0.1)] px-2.5 py-2">
      <AlertTriangle size={13} className="shrink-0 text-[#f0a0a0]" />
      <span className="min-w-0 flex-1 text-xs leading-4 text-[#f0a0a0]">
        {request.message} 진행할까요?
      </span>
      <div className="flex shrink-0 gap-1.5">
        <Button
          type="button"
          variant="ghost"
          className="!px-2.5 !py-1 text-xs"
          onClick={onCancel}
        >
          취소
        </Button>
        <Button
          type="button"
          variant="danger"
          className="!px-2.5 !py-1 text-xs"
          onClick={request.run}
        >
          {request.action}
        </Button>
      </div>
    </div>
  );
}

function Segmented<T extends string>({
  options,
  onSelect,
  disabled,
  ariaLabel,
}: {
  options: Array<{
    value: T;
    label: string;
    hint?: string;
    icon?: React.ReactNode;
    active: boolean;
  }>;
  onSelect: (value: T) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="eh-neu-inset flex max-w-sm gap-1 rounded-2xl p-1"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          aria-pressed={option.active}
          onClick={() => onSelect(option.value)}
          className={clsx(
            "flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-50",
            option.active
              ? "eh-neu-raised-sm text-[var(--eh-mist)]"
              : "text-[var(--eh-fog)] hover:text-[var(--eh-mist)]"
          )}
        >
          <span className="flex items-center gap-1.5">
            {option.icon}
            {option.label}
          </span>
          {option.hint && (
            <span className="w-full truncate text-[10px] text-[var(--eh-fog)]">
              {option.hint}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function NumberField({
  value,
  unit,
  onChange,
  ariaLabel,
  disabled,
  min,
  step,
  placeholder,
  compact,
  className,
}: {
  value: string;
  unit: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  min?: string;
  step?: string;
  placeholder?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <label
      className={clsx(
        "flex min-w-0 items-center gap-1.5",
        className ?? "flex-1"
      )}
    >
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        disabled={disabled}
        min={min}
        step={step}
        placeholder={placeholder}
        className={clsx(
          "eh-neu-inset w-full min-w-0 rounded-xl text-[var(--eh-mist)] outline-none transition placeholder:text-[var(--eh-fog)] eh-focus-signal disabled:opacity-50",
          compact
            ? "h-8 px-2.5 text-xs leading-none"
            : "px-2.5 py-1.5 text-sm"
        )}
      />
      <span className="shrink-0 text-xs text-[var(--eh-fog)]">{unit}</span>
    </label>
  );
}

function Notice({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "danger";
  children: React.ReactNode;
}) {
  const style = {
    ok: "eh-neu-inset text-[var(--eh-ok)]",
    warn: "eh-neu-inset text-[var(--eh-warn)]",
    danger: "eh-neu-inset text-[var(--eh-alert)]",
  }[tone];

  return (
    <div
      className={clsx(
        "flex items-start gap-2 rounded-2xl px-3 py-2 text-xs leading-5",
        style
      )}
    >
      {tone === "ok" ? (
        <Check size={14} className="mt-0.5 shrink-0" />
      ) : (
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
      )}
      <span className="min-w-0">{children}</span>
    </div>
  );
}

function pendingIfChanged(
  current: string | null | undefined,
  desired: string | null | undefined
) {
  if (desired == null) return null;
  if (current != null && desired === current) return null;
  return desired;
}

function intervalText(sec: number | null, min: number | null) {
  const parts: string[] = [];
  if (sec != null) parts.push(`${sec}초`);
  if (min != null) parts.push(`${min}분`);
  return parts.length ? parts.join(" · ") : null;
}

function modeLabel(mode: string | null) {
  if (mode === "ALWAYS_ON") return "상시";
  if (mode === "ULTRA_SAVER") return "절전";
  return null;
}

function requestMessage(command: string) {
  switch (command) {
    case "hold_off":
      return "가동 요청을 보냈습니다. 센서가 연결되면 측정을 다시 시작합니다.";
    case "hold_on":
      return "중지 요청을 보냈습니다. 센서가 연결되면 측정을 멈춥니다.";
    case "reset_origin":
      return "원점 세팅을 요청했습니다. 지금 기울기를 0으로 삼습니다.";
    case "set_tilt_threshold":
      return "임계각 변경을 요청했습니다.";
    case "set_mode":
      return "운영 모드 변경을 요청했습니다.";
    case "set_interval":
      return "주기 변경을 요청했습니다.";
    default:
      return "요청을 보냈습니다.";
  }
}

function relative(iso: string) {
  try {
    return formatDistanceToNow(new Date(iso), {
      addSuffix: true,
      locale: ko,
    });
  } catch {
    return iso;
  }
}

function absolute(iso: string) {
  try {
    return format(new Date(iso), "M월 d일 HH:mm", { locale: ko });
  } catch {
    return iso;
  }
}
