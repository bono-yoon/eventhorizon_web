const fs = require("fs");
const path = require("path");

const target = path.join(
  __dirname,
  "..",
  "src",
  "app",
  "components",
  "CompanySensorsBoard.tsx"
);

const content = `"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import clsx from "clsx";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { Badge, Panel, Select, StatusDot } from "./ui";
import type { DashboardSensorRow } from "@/lib/mapMarkers";
import {
  OPS_ALL,
  OPS_STATUS_LABELS,
  type SensorOpsStatus,
} from "@/lib/sensorOpsConstants";

export type { SensorOpsStatus };
export { OPS_STATUS_LABELS };

function storageKey(companyId: string) {
  return \`eh:sensor-ops:\${companyId}\`;
}

function loadLocalOps(companyId: string): Record<string, SensorOpsStatus> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey(companyId));
    return raw ? (JSON.parse(raw) as Record<string, SensorOpsStatus>) : {};
  } catch {
    return {};
  }
}

function opsTone(
  ops: SensorOpsStatus
): "ok" | "warn" | "crit" | "neutral" | "off" {
  if (ops === "normal") return "ok";
  if (ops === "inspect") return "warn";
  if (ops === "repair_request") return "crit";
  return "neutral";
}

function telemetryLabel(s: DashboardSensorRow["status"]) {
  switch (s) {
    case "ok":
      return "정상";
    case "warning":
      return "주의";
    case "critical":
      return "경고";
    case "offline":
      return "오프라인";
    case "inactive":
      return "비활성";
  }
}

/** 건설사 센서관리: 장비 운영 상태(정상/수리/반납 등) */
export function CompanySensorsBoard({
  companyId,
  companyName,
  sensors,
  canEditOps,
}: {
  companyId: string;
  companyName: string;
  sensors: DashboardSensorRow[];
  canEditOps: boolean;
}) {
  const [opsMap, setOpsMap] = useState<Record<string, SensorOpsStatus>>({});
  const [filter, setFilter] = useState<"all" | SensorOpsStatus>("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  const refreshOps = useCallback(async () => {
    const res = await fetch(\`/api/sensor-ops?companyId=\${companyId}\`);
    if (!res.ok) return;
    const data = await res.json();
    setOpsMap(data.map || {});
  }, [companyId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refreshOps();
      if (cancelled) return;

      const local = loadLocalOps(companyId);
      const keys = Object.keys(local);
      if (keys.length > 0) {
        await fetch("/api/sensor-ops", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "migrate_local",
            companyId,
            rows: keys.map((deviceId) => {
              const row = sensors.find((s) => s.sensor.deviceId === deviceId);
              return {
                deviceId,
                status: local[deviceId],
                sensorLabel: row?.sensor.label ?? deviceId,
                siteId: row?.site?.id ?? null,
                siteName: row?.site?.name ?? null,
              };
            }),
          }),
        });
        window.localStorage.removeItem(storageKey(companyId));
        await refreshOps();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, refreshOps, sensors]);

  async function setOps(deviceId: string, next: SensorOpsStatus) {
    setBusy(deviceId);
    try {
      const res = await fetch("/api/sensor-ops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId,
          status: next,
          companyId,
        }),
      });
      if (res.ok) {
        setOpsMap((prev) => ({ ...prev, [deviceId]: next }));
      }
    } finally {
      setBusy(null);
    }
  }

  function opsOf(deviceId: string): SensorOpsStatus {
    return opsMap[deviceId] || "normal";
  }

  const counts = useMemo(() => {
    const c: Record<SensorOpsStatus | "all", number> = {
      all: sensors.length,
      normal: 0,
      repair_request: 0,
      return_request: 0,
      inspect: 0,
    };
    for (const row of sensors) {
      c[opsOf(row.sensor.deviceId)] += 1;
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sensors, opsMap]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return sensors.filter((row) => {
      const ops = opsOf(row.sensor.deviceId);
      if (filter !== "all" && ops !== filter) return false;
      if (!needle) return true;
      return (
        row.sensor.label.toLowerCase().includes(needle) ||
        row.sensor.deviceId.toLowerCase().includes(needle) ||
        (row.site?.name || "").toLowerCase().includes(needle)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sensors, filter, q, opsMap]);

  const pageSize = 8;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(
    safePage * pageSize,
    safePage * pageSize + pageSize
  );

  useEffect(() => {
    setPage(0);
  }, [filter, q]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="grid shrink-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            { key: "all" as const, label: "전체 장비" },
            { key: "normal" as const, label: "정상" },
            { key: "repair_request" as const, label: "수리요청" },
            { key: "return_request" as const, label: "반납요청" },
          ] as const
        ).map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setFilter(item.key)}
            className={clsx(
              "eh-neu-press rounded-[22px] p-3.5 text-left transition",
              filter === item.key ? "eh-neu-active" : "eh-neu-raised-sm"
            )}
          >
            <div className="text-xs text-[var(--eh-fog)]">{item.label}</div>
            <div
              className={clsx(
                "eh-display mt-1 text-2xl",
                item.key === "repair_request"
                  ? "text-[var(--eh-alert)]"
                  : item.key === "return_request"
                    ? "text-[var(--eh-warn)]"
                    : item.key === "normal"
                      ? "text-[var(--eh-ok)]"
                      : "text-[var(--eh-mist)]"
              )}
            >
              {counts[item.key]}
            </div>
          </button>
        ))}
      </div>

      <Panel className="flex min-h-0 flex-1 flex-col !p-4">
        <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg text-[var(--eh-mist)]">센서 운영 현황</div>
            <p className="mt-0.5 text-xs text-[var(--eh-fog)]">
              {companyName} 소속 장비의 운영 상태를 관리합니다. 임계 알림(주의/경고)과
              별개로 현장에서 판단하는 장비 상태입니다.
              {canEditOps
                ? " 소장·담당 직원은 상태를 변경할 수 있습니다."
                : " 조회만 가능합니다."}
            </p>
          </div>
          <div className="relative w-full max-w-xs">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--eh-fog)]"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="센서명·현장 검색"
              className="eh-neu-inset eh-focus-signal w-full rounded-2xl py-2 pl-9 pr-3 text-sm text-[var(--eh-mist)] outline-none placeholder:text-[var(--eh-fog)]"
            />
          </div>
        </div>

        <div className="mb-3 flex shrink-0 flex-wrap gap-1.5">
          {(["all", ...OPS_ALL] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={clsx(
                "eh-neu-press rounded-xl px-2.5 py-1 text-xs transition",
                filter === key
                  ? "eh-neu-active text-[var(--eh-signal)]"
                  : "eh-neu-raised-sm text-[var(--eh-fog)] hover:text-[var(--eh-mist)]"
              )}
            >
              {key === "all" ? "전체" : OPS_STATUS_LABELS[key]}
              <span className="ml-1 opacity-70">{counts[key]}</span>
            </button>
          ))}
        </div>

        <div className="eh-scroll min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--eh-panel)] text-xs text-[var(--eh-fog)]">
              <tr className="border-b border-[var(--eh-line)]">
                <th className="py-2.5 font-medium">운영상태</th>
                <th className="py-2.5 font-medium">센서명</th>
                <th className="py-2.5 font-medium">현장</th>
                <th className="py-2.5 font-medium">상태</th>
                <th className="py-2.5 font-medium">배터리</th>
                <th className="py-2.5 font-medium">마지막 통신</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => {
                const ops = opsOf(row.sensor.deviceId);
                return (
                  <tr
                    key={row.sensor.id}
                    className="border-b border-[var(--eh-line)]/50"
                  >
                    <td className="py-3 align-middle">
                      {canEditOps ? (
                        <Select
                          className="!w-[8.5rem] !rounded-xl !px-2.5 !py-1.5 text-xs"
                          value={ops}
                          disabled={busy === row.sensor.deviceId}
                          onChange={(e) =>
                            setOps(
                              row.sensor.deviceId,
                              e.target.value as SensorOpsStatus
                            )
                          }
                        >
                          {OPS_ALL.map((s) => (
                            <option key={s} value={s}>
                              {OPS_STATUS_LABELS[s]}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <Badge tone={opsTone(ops)}>
                          {OPS_STATUS_LABELS[ops]}
                        </Badge>
                      )}
                    </td>
                    <td className="py-3">
                      <div className="text-[var(--eh-mist)]">
                        {row.sensor.label}
                      </div>
                      <div className="text-xs text-[var(--eh-fog)]">
                        {row.sensor.deviceId}
                      </div>
                    </td>
                    <td className="py-3 text-[var(--eh-fog)]">
                      {row.site?.name || "미배치"}
                    </td>
                    <td className="py-3">
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <StatusDot status={row.status} />
                        {telemetryLabel(row.status)}
                      </span>
                    </td>
                    <td className="py-3">
                      {row.latest ? \`\${row.latest.batteryPercent}%\` : "-"}
                    </td>
                    <td className="py-3 text-xs text-[var(--eh-fog)]">
                      {row.latest?.ts
                        ? formatDistanceToNow(row.latest.ts, {
                            addSuffix: true,
                            locale: ko,
                          })
                        : "-"}
                    </td>
                  </tr>
                );
              })}
              {!pageRows.length && (
                <tr>
                  <td
                    colSpan={6}
                    className="py-12 text-center text-sm text-[var(--eh-fog)]"
                  >
                    조건에 맞는 센서가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex shrink-0 items-center justify-between gap-3 text-xs text-[var(--eh-fog)]">
          <span>
            {filtered.length}건 중 {safePage * pageSize + 1}–
            {Math.min(filtered.length, (safePage + 1) * pageSize)}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={safePage <= 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="eh-neu-raised-sm eh-neu-press rounded-xl p-2 disabled:opacity-35"
              aria-label="이전"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="min-w-[3.5rem] text-center text-[var(--eh-mist)]">
              {safePage + 1} / {pageCount}
            </span>
            <button
              type="button"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              className="eh-neu-raised-sm eh-neu-press rounded-xl p-2 disabled:opacity-35"
              aria-label="다음"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </Panel>
    </div>
  );
}

export type AdminSensorRow = DashboardSensorRow & {
  companyId: string;
  companyName: string;
};

/** admin: 전체 센서 목록 + 운영상태 관리 */
export function AdminAllSensorsBoard({
  rows,
}: {
  rows: AdminSensorRow[];
}) {
  const [opsMap, setOpsMap] = useState<Record<string, SensorOpsStatus>>({});
  const [filter, setFilter] = useState<"all" | SensorOpsStatus>("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sensor-ops")
      .then((r) => r.json())
      .then((d) => setOpsMap(d.map || {}))
      .catch(() => {});
  }, []);

  async function setOps(row: AdminSensorRow, next: SensorOpsStatus) {
    setBusy(row.sensor.deviceId);
    try {
      const res = await fetch("/api/sensor-ops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: row.sensor.deviceId,
          status: next,
          companyId: row.companyId,
        }),
      });
      if (res.ok) {
        setOpsMap((prev) => ({ ...prev, [row.sensor.deviceId]: next }));
      }
    } finally {
      setBusy(null);
    }
  }

  function opsOf(deviceId: string): SensorOpsStatus {
    return opsMap[deviceId] || "normal";
  }

  const counts = useMemo(() => {
    const c: Record<SensorOpsStatus | "all", number> = {
      all: rows.length,
      normal: 0,
      repair_request: 0,
      return_request: 0,
      inspect: 0,
    };
    for (const row of rows) {
      c[opsOf(row.sensor.deviceId)] += 1;
    }
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, opsMap]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((row) => {
      const ops = opsOf(row.sensor.deviceId);
      if (filter !== "all" && ops !== filter) return false;
      if (!needle) return true;
      return (
        row.sensor.label.toLowerCase().includes(needle) ||
        row.sensor.deviceId.toLowerCase().includes(needle) ||
        row.companyName.toLowerCase().includes(needle) ||
        (row.site?.name || "").toLowerCase().includes(needle)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filter, q, opsMap]);

  const pageSize = 12;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(
    safePage * pageSize,
    safePage * pageSize + pageSize
  );

  useEffect(() => {
    setPage(0);
  }, [filter, q]);

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="grid shrink-0 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {(
          [
            { key: "all" as const, label: "전체" },
            { key: "normal" as const, label: "정상" },
            { key: "repair_request" as const, label: "수리요청" },
            { key: "return_request" as const, label: "반납요청" },
            { key: "inspect" as const, label: "점검중" },
          ] as const
        ).map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setFilter(item.key)}
            className={clsx(
              "eh-neu-press rounded-[22px] p-3.5 text-left transition",
              filter === item.key ? "eh-neu-active" : "eh-neu-raised-sm"
            )}
          >
            <div className="text-xs text-[var(--eh-fog)]">{item.label}</div>
            <div
              className={clsx(
                "eh-display mt-1 text-2xl",
                item.key === "repair_request"
                  ? "text-[var(--eh-alert)]"
                  : item.key === "return_request"
                    ? "text-[var(--eh-warn)]"
                    : item.key === "normal"
                      ? "text-[var(--eh-ok)]"
                      : "text-[var(--eh-mist)]"
              )}
            >
              {counts[item.key]}
            </div>
          </button>
        ))}
      </div>

      <Panel className="flex min-h-0 flex-col !p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-lg text-[var(--eh-mist)]">전체 센서</div>
            <p className="mt-0.5 text-xs text-[var(--eh-fog)]">
              건설사·현장 구분 없이 등록된 모든 센서와 운영 상태를 확인합니다.
            </p>
          </div>
          <div className="relative w-full max-w-xs">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--eh-fog)]"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="센서·건설사·현장 검색"
              className="eh-neu-inset eh-focus-signal w-full rounded-2xl py-2 pl-9 pr-3 text-sm text-[var(--eh-mist)] outline-none placeholder:text-[var(--eh-fog)]"
            />
          </div>
        </div>

        <div className="eh-scroll min-h-0 max-h-[520px] overflow-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--eh-panel)] text-xs text-[var(--eh-fog)]">
              <tr className="border-b border-[var(--eh-line)]">
                <th className="py-2.5 font-medium">운영상태</th>
                <th className="py-2.5 font-medium">센서명</th>
                <th className="py-2.5 font-medium">건설사</th>
                <th className="py-2.5 font-medium">현장</th>
                <th className="py-2.5 font-medium">상태</th>
                <th className="py-2.5 font-medium">배터리</th>
                <th className="py-2.5 font-medium">추적</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => {
                const ops = opsOf(row.sensor.deviceId);
                return (
                  <tr
                    key={row.sensor.id}
                    className="border-b border-[var(--eh-line)]/50"
                  >
                    <td className="py-3 align-middle">
                      <Select
                        className="!w-[8.5rem] !rounded-xl !px-2.5 !py-1.5 text-xs"
                        value={ops}
                        disabled={busy === row.sensor.deviceId}
                        onChange={(e) =>
                          setOps(row, e.target.value as SensorOpsStatus)
                        }
                      >
                        {OPS_ALL.map((s) => (
                          <option key={s} value={s}>
                            {OPS_STATUS_LABELS[s]}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="py-3">
                      <div className="text-[var(--eh-mist)]">
                        {row.sensor.label}
                      </div>
                      <div className="text-xs text-[var(--eh-fog)]">
                        {row.sensor.deviceId}
                      </div>
                    </td>
                    <td className="py-3 text-[var(--eh-fog)]">
                      {row.companyName}
                    </td>
                    <td className="py-3 text-[var(--eh-fog)]">
                      {row.site?.name || "미배치"}
                    </td>
                    <td className="py-3">
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <StatusDot status={row.status} />
                        {telemetryLabel(row.status)}
                      </span>
                    </td>
                    <td className="py-3">
                      {row.latest ? \`\${row.latest.batteryPercent}%\` : "-"}
                    </td>
                    <td className="py-3">
                      <Link
                        href={\`/admin/sensors?device=\${row.sensor.deviceId}\`}
                        className="text-xs text-[var(--eh-signal)] hover:underline"
                      >
                        보기
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {!pageRows.length && (
                <tr>
                  <td
                    colSpan={7}
                    className="py-12 text-center text-sm text-[var(--eh-fog)]"
                  >
                    조건에 맞는 센서가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-[var(--eh-fog)]">
          <span>
            {filtered.length}건 중 {safePage * pageSize + 1}–
            {Math.min(filtered.length, (safePage + 1) * pageSize)}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={safePage <= 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="eh-neu-raised-sm eh-neu-press rounded-xl p-2 disabled:opacity-35"
              aria-label="이전"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="min-w-[3.5rem] text-center text-[var(--eh-mist)]">
              {safePage + 1} / {pageCount}
            </span>
            <button
              type="button"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              className="eh-neu-raised-sm eh-neu-press rounded-xl p-2 disabled:opacity-35"
              aria-label="다음"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
`;

fs.writeFileSync(target, content, "utf8");
const verify = fs.readFileSync(target, "utf8");
const hangul = (verify.match(/[\uAC00-\uD7A3]/g) || []).length;
const bad = (verify.match(/\?{2,}/g) || []).length;
console.log(`restored ${target}`);
console.log(`hangul=${hangul} bad=${bad}`);
