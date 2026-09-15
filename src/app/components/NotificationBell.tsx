"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, CheckCircle2 } from "lucide-react";
import clsx from "clsx";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { alertHeadline } from "@/lib/alertHeadline";

type IncidentDisposition =
  | "confirmed_real"
  | "false_positive"
  | "misoperation"
  | "maintenance"
  | "other";

type InboxAlert = {
  id: string;
  message: string;
  severity: string;
  phase: number;
  type: string;
  createdAt: string;
  read?: boolean;
  incidentId?: number | null;
  incidentDisposition?: IncidentDisposition | null;
  canAcknowledge?: boolean;
};

const DISPOSITION_OPTIONS: Array<{
  value: IncidentDisposition;
  label: string;
}> = [
  { value: "confirmed_real", label: "실제 위험" },
  { value: "false_positive", label: "오탐" },
  { value: "misoperation", label: "오조작" },
  { value: "maintenance", label: "점검·작업" },
  { value: "other", label: "기타" },
];

const DISPOSITION_LABEL: Record<IncidentDisposition, string> = {
  confirmed_real: "실제 위험",
  false_positive: "오탐",
  misoperation: "오조작",
  maintenance: "점검·작업",
  other: "기타",
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<InboxAlert[]>([]);
  const [unread, setUnread] = useState(0);
  const [toast, setToast] = useState<InboxAlert | null>(null);
  const [ackTarget, setAckTarget] = useState<InboxAlert | null>(null);
  const [ackDisposition, setAckDisposition] =
    useState<IncidentDisposition>("confirmed_real");
  const [ackReason, setAckReason] = useState("");
  const [ackBusy, setAckBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  const seenToast = useRef<Set<string>>(new Set());
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; right: number } | null>(
    null
  );

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) {
      setPanelPos(null);
      return;
    }
    function place() {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPanelPos({
        top: rect.bottom + 8,
        right: Math.max(12, window.innerWidth - rect.right),
      });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts/inbox");
      if (!res.ok) return;
      const data = await res.json();
      const list = (data.alerts || []) as InboxAlert[];
      setAlerts(list);
      setUnread(Number(data.unread) || 0);

      const fresh = list.find(
        (a) =>
          !a.read &&
          a.phase === 1 &&
          a.type !== "blackbox" &&
          !seenToast.current.has(a.id)
      );
      if (fresh) {
        seenToast.current.add(fresh.id);
        setToast(fresh);
        window.setTimeout(
          () => setToast((t) => (t?.id === fresh.id ? null : t)),
          6000
        );
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    poll();
    const t = window.setInterval(() => poll(), 8000);
    return () => window.clearInterval(t);
  }, [poll]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      const panel = document.getElementById("eh-notification-panel");
      if (panel?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (!ackTarget) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAckTarget(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ackTarget]);

  async function markRead(id: string) {
    await fetch("/api/alerts/inbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    poll();
  }

  async function markAll() {
    await fetch("/api/alerts/inbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    poll();
  }

  async function submitAck() {
    if (!ackTarget?.incidentId) return;
    setAckBusy(true);
    try {
      const res = await fetch("/api/alerts/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ack_incident",
          incidentId: ackTarget.incidentId,
          disposition: ackDisposition,
          reason: ackReason.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.alert(data.error || "확인 처리에 실패했습니다.");
        return;
      }
      setAckTarget(null);
      setAckReason("");
      await markRead(ackTarget.id);
    } finally {
      setAckBusy(false);
    }
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        aria-label="알림"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          "eh-neu-raised-sm eh-neu-press relative rounded-2xl p-2.5 text-[var(--eh-mist)] transition",
          unread > 0 && "text-[var(--eh-signal)]"
        )}
      >
        <Bell size={16} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--eh-alert)] px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {mounted &&
        open &&
        panelPos &&
        createPortal(
          <div
            id="eh-notification-panel"
            className="eh-panel eh-fixed z-[180] w-[min(360px,calc(100vw-24px))] rounded-[22px] p-3"
            style={{ top: panelPos.top, right: panelPos.right }}
            role="dialog"
            aria-label="알림 목록"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-sm font-medium text-white">알림</div>
              {unread > 0 && (
                <button
                  type="button"
                  className="text-xs text-[var(--eh-signal)]"
                  onClick={() => markAll()}
                >
                  모두 읽음
                </button>
              )}
            </div>
            <div className="eh-scroll max-h-[360px] space-y-2 overflow-y-auto overscroll-contain pr-0.5">
              {alerts.map((a) => (
                <div
                  key={a.id}
                  className={clsx(
                    "w-full rounded-2xl px-3 py-2 text-left text-sm transition",
                    a.read
                      ? "text-[var(--eh-fog)]"
                      : "eh-neu-inset text-white"
                  )}
                >
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => markRead(a.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span>
                        {alertHeadline({
                          message: a.message,
                          type: a.type,
                          phase: a.phase,
                        })}
                      </span>
                    </div>
                    <div className="mt-1 text-[10px] text-[var(--eh-fog)]">
                      {formatDistanceToNow(new Date(a.createdAt), {
                        addSuffix: true,
                        locale: ko,
                      })}
                    </div>
                  </button>
                  {a.incidentDisposition && (
                    <div className="mt-1.5 flex items-center gap-1 text-[10px] text-[var(--eh-fog)]">
                      <CheckCircle2 size={11} />
                      확인됨 · {DISPOSITION_LABEL[a.incidentDisposition]}
                    </div>
                  )}
                  {a.canAcknowledge && a.incidentId && (
                    <button
                      type="button"
                      className="eh-neu-raised-sm eh-neu-press mt-2 w-full rounded-xl px-2 py-1.5 text-xs text-[var(--eh-signal)]"
                      onClick={() => {
                        setAckTarget(a);
                        setAckDisposition("confirmed_real");
                        setAckReason("");
                      }}
                    >
                      확인 및 분류
                    </button>
                  )}
                </div>
              ))}
              {!alerts.length && (
                <div className="py-6 text-center text-xs text-[var(--eh-fog)]">
                  새 알림이 없습니다
                </div>
              )}
            </div>
          </div>,
          document.body
        )}

      {mounted &&
        ackTarget &&
        createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:items-center"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setAckTarget(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="이벤트 확인 및 분류"
            className="eh-panel eh-scroll my-auto max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-[22px] p-5"
          >
            <div className="mb-1 text-sm font-medium text-white">
              이벤트 확인 및 분류
            </div>
            <p className="mb-4 text-xs leading-5 text-[var(--eh-fog)]">
              {alertHeadline({
                message: ackTarget.message,
                type: ackTarget.type,
                phase: ackTarget.phase,
              })}
            </p>
            <div className="mb-3 space-y-1">
              {DISPOSITION_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={clsx(
                    "flex cursor-pointer items-center gap-2 rounded-2xl px-3 py-2 text-sm",
                    ackDisposition === opt.value
                      ? "eh-neu-active text-[var(--eh-signal)]"
                      : "eh-neu-raised-sm text-[var(--eh-mist)]"
                  )}
                >
                  <input
                    type="radio"
                    name="disposition"
                    checked={ackDisposition === opt.value}
                    onChange={() => setAckDisposition(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            <textarea
              className="eh-neu-inset mb-4 w-full rounded-2xl px-3 py-2 text-sm text-white outline-none eh-focus-signal"
              rows={2}
              placeholder="사유 (선택)"
              value={ackReason}
              onChange={(e) => setAckReason(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="eh-neu-raised-sm eh-neu-press rounded-xl px-3 py-2 text-xs text-[var(--eh-fog)]"
                onClick={() => setAckTarget(null)}
              >
                취소
              </button>
              <button
                type="button"
                disabled={ackBusy}
                className="eh-neu-raised-sm eh-neu-press rounded-xl px-3 py-2 text-xs font-medium text-[var(--eh-signal)] disabled:opacity-50"
                onClick={() => submitAck()}
              >
                {ackBusy ? "처리 중…" : "확인 완료"}
              </button>
            </div>
          </div>
        </div>,
          document.body
        )}

      {mounted &&
        toast &&
        createPortal(
        <div className="eh-panel fixed bottom-5 right-5 z-[190] max-w-sm rounded-[22px] px-4 py-3 eh-ring-signal">
          <div className="mb-1 flex items-center gap-2 text-xs text-[var(--eh-signal)]">
            <Bell size={14} />
            임계값 초과
          </div>
          <div className="text-sm text-white">
            {alertHeadline({
              message: toast.message,
              type: toast.type,
              phase: toast.phase,
            })}
          </div>
          <button
            type="button"
            className="mt-2 text-xs text-[var(--eh-fog)]"
            onClick={() => setToast(null)}
          >
            닫기
          </button>
        </div>,
          document.body
        )}
    </div>
  );
}
