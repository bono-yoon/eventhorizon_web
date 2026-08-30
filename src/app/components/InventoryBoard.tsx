"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Input, Panel, Select } from "./ui";
import {
  ALL_SENSOR_STATUSES,
  SENSOR_STATUS_LABELS,
  type SensorDevice,
  type SensorStatus,
} from "@/lib/types";

type SiteOpt = { id: string; name: string; companyId: string };

type Draft = {
  label: string;
  status: SensorStatus;
  siteId: string;
  memo: string;
  isActive: boolean;
};

function toDraft(s: SensorDevice): Draft {
  return {
    label: s.label,
    status: s.status || "inventory",
    siteId: s.siteId || "",
    memo: s.memo || "",
    isActive: s.isActive,
  };
}

export function InventoryBoard({
  initialSensors,
  sites,
}: {
  initialSensors: SensorDevice[];
  sites: SiteOpt[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | SensorStatus>("all");
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(initialSensors.map((s) => [s.id, toDraft(s)]))
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const sensors = useMemo(() => {
    if (filter === "all") return initialSensors;
    return initialSensors.filter((s) => (s.status || "inventory") === filter);
  }, [initialSensors, filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: initialSensors.length };
    for (const st of ALL_SENSOR_STATUSES) c[st] = 0;
    for (const s of initialSensors) {
      const st = s.status || "inventory";
      c[st] = (c[st] || 0) + 1;
    }
    return c;
  }, [initialSensors]);

  function setDraft(id: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] ||
          toDraft(initialSensors.find((s) => s.id === id)!)),
        ...patch,
      },
    }));
  }

  async function save(sensor: SensorDevice) {
    const d = drafts[sensor.id] || toDraft(sensor);
    if (d.status === "assigned" && !d.siteId) {
      setMsg("현장 배정 시 현장을 선택하세요.");
      return;
    }
    setBusy(sensor.id);
    setMsg("");
    const res = await fetch("/api/inventory", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: sensor.id,
        label: d.label,
        status: d.status,
        siteId: d.status === "assigned" ? d.siteId : null,
        memo: d.memo,
        isActive: d.isActive,
      }),
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      setMsg(data.error || "저장 실패");
      return;
    }
    setMsg("저장됨");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <FilterChip
          active={filter === "all"}
          onClick={() => setFilter("all")}
          label={`전체 ${counts.all}`}
        />
        {ALL_SENSOR_STATUSES.map((st) => (
          <FilterChip
            key={st}
            active={filter === st}
            onClick={() => setFilter(st)}
            label={`${SENSOR_STATUS_LABELS[st]} ${counts[st] || 0}`}
          />
        ))}
      </div>

      {msg && <p className="text-sm text-[var(--eh-signal)]">{msg}</p>}

      <Panel>
        <div className="eh-scroll overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="text-xs text-[var(--eh-fog)]">
              <tr className="border-b border-[var(--eh-line)]">
                <th className="py-2 pr-3">디바이스</th>
                <th className="py-2 pr-3">라벨</th>
                <th className="py-2 pr-3">상태</th>
                <th className="py-2 pr-3">현장</th>
                <th className="py-2 pr-3">비고</th>
                <th className="py-2 pr-3">활성</th>
                <th className="py-2">저장</th>
              </tr>
            </thead>
            <tbody>
              {sensors.map((s) => {
                const d = drafts[s.id] || toDraft(s);
                return (
                  <tr
                    key={s.id}
                    className="border-b border-[var(--eh-line)]/50"
                  >
                    <td className="py-3 pr-3">
                      <div className="font-mono text-xs text-[var(--eh-mist)]">
                        {s.deviceId}
                      </div>
                      <div className="text-[10px] text-[var(--eh-fog)]">
                        {s.id}
                      </div>
                    </td>
                    <td className="py-3 pr-3">
                      <Input
                        value={d.label}
                        onChange={(e) =>
                          setDraft(s.id, { label: e.target.value })
                        }
                      />
                    </td>
                    <td className="py-3 pr-3">
                      <Select
                        value={d.status}
                        onChange={(e) => {
                          const status = e.target.value as SensorStatus;
                          setDraft(s.id, {
                            status,
                            siteId:
                              status === "assigned"
                                ? d.siteId || s.siteId || ""
                                : "",
                          });
                        }}
                      >
                        {ALL_SENSOR_STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {SENSOR_STATUS_LABELS[st]}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="py-3 pr-3">
                      <Select
                        value={d.siteId}
                        disabled={d.status !== "assigned"}
                        onChange={(e) =>
                          setDraft(s.id, { siteId: e.target.value })
                        }
                      >
                        <option value="">미배정</option>
                        {sites.map((site) => (
                          <option key={site.id} value={site.id}>
                            {site.name}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="py-3 pr-3">
                      <Input
                        value={d.memo}
                        placeholder="회수·수리·폐기 사유 등"
                        onChange={(e) =>
                          setDraft(s.id, { memo: e.target.value })
                        }
                      />
                    </td>
                    <td className="py-3 pr-3">
                      <label className="inline-flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={d.isActive}
                          onChange={(e) =>
                            setDraft(s.id, { isActive: e.target.checked })
                          }
                        />
                        {d.isActive ? (
                          <Badge tone="ok">ON</Badge>
                        ) : (
                          <Badge tone="off">OFF</Badge>
                        )}
                      </label>
                    </td>
                    <td className="py-3">
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={busy === s.id}
                        onClick={() => save(s)}
                      >
                        저장
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {!sensors.length && (
                <tr>
                  <td
                    colSpan={7}
                    className="py-8 text-center text-[var(--eh-fog)]"
                  >
                    표시할 센서가 없습니다. 폰에 APK를 설치·실행하면 재고에
                    나타납니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "eh-neu-active rounded-2xl px-3 py-1.5 text-xs font-medium text-[var(--eh-signal)]"
          : "eh-neu-raised-sm eh-neu-press rounded-2xl px-3 py-1.5 text-xs text-[var(--eh-fog)] hover:text-[var(--eh-mist)]"
      }
    >
      {label}
    </button>
  );
}
