"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { MapPin, Plus, Search, X } from "lucide-react";
import clsx from "clsx";
import { Badge, Button, Input, Select } from "./ui";
import { MapView } from "./MapView";
import type { MapMarker, SitePinHealth } from "./SiteMap";
import type { Site } from "@/lib/types";

type SiteStatus = Site["status"];

const STATUS_LABEL: Record<SiteStatus, string> = {
  active: "운영중",
  paused: "일시중지",
  closed: "종료",
};

function siteHealthFromStatus(status: SiteStatus): SitePinHealth {
  if (status === "paused" || status === "closed") return "inactive";
  return "ok";
}

function hasPlottableCoords(lat: number, lon: number) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    (Math.abs(lat) > 0.001 || Math.abs(lon) > 0.001)
  );
}

type SiteRow = {
  id: string;
  name: string;
  code: string;
  address: string;
  status: SiteStatus;
  sensorCount: number;
  lat: number;
  lon: number;
};

export function CompanySitesBoard({
  companyId,
  initialSites,
  managers,
  canCreate,
  canManageStatus = false,
}: {
  companyId: string;
  initialSites: SiteRow[];
  managers: { id: string; name: string }[];
  canCreate: boolean;
  /** 운영중/일시중지/종료 변경 가능 여부 */
  canManageStatus?: boolean;
}) {
  const [sites, setSites] = useState(initialSites);
  const [q, setQ] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setSites(initialSites);
  }, [initialSites]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return sites;
    return sites.filter(
      (s) =>
        s.name.toLowerCase().includes(needle) ||
        s.code.toLowerCase().includes(needle) ||
        s.address.toLowerCase().includes(needle)
    );
  }, [sites, q]);

  const selected = sites.find((s) => s.id === selectedId) || null;

  const selectedMapMarkers: MapMarker[] = useMemo(() => {
    if (!selected || !hasPlottableCoords(selected.lat, selected.lon)) {
      return [];
    }
    return [
      {
        id: selected.id,
        lat: selected.lat,
        lon: selected.lon,
        label: selected.name,
        sub: selected.address || undefined,
        tone: "site",
        kind: "site",
        siteStatus: selected.status,
        siteHealth: siteHealthFromStatus(selected.status),
      },
    ];
  }, [selected]);

  function setStatus(id: string, status: SiteStatus) {
    setSites((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status } : s))
    );
  }

  function addSiteDraft(input: {
    name: string;
    code: string;
    address: string;
  }) {
    const id = `site_local_${Date.now()}`;
    setSites((prev) => [
      {
        id,
        name: input.name,
        code: input.code || `TMP-${prev.length + 1}`,
        address: input.address,
        status: "active",
        sensorCount: 0,
        lat: 37.56,
        lon: 126.98,
      },
      ...prev,
    ]);
    setCreateOpen(false);
    setSelectedId(id);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--eh-fog)]">
            보유 현장 {sites.length}곳 · 목록에서 선택하면 상태를 확인할 수
            있습니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full min-w-[200px] sm:w-56">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--eh-fog)]"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="현장명·코드 검색"
              className="eh-neu-inset w-full rounded-2xl py-2 pl-9 pr-3 text-sm text-white outline-none placeholder:text-[var(--eh-fog)] eh-focus-signal"
            />
          </div>
          {canCreate && (
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <Plus size={16} />
              현장 개설
            </Button>
          )}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="eh-panel flex min-h-0 flex-col overflow-hidden rounded-[22px]">
          <div className="flex shrink-0 items-center justify-between border-b border-[var(--eh-line)] px-4 py-3">
            <div className="text-sm text-white">현장 목록</div>
            <span className="text-xs text-[var(--eh-fog)]">
              {filtered.length}곳
            </span>
          </div>
          <div className="eh-scroll min-h-0 flex-1 overflow-y-auto">
            {filtered.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedId(s.id)}
                className={clsx(
                  "flex w-full items-center gap-3 border-b border-[var(--eh-line)]/60 px-4 py-3.5 text-left transition",
                  selectedId === s.id
                    ? "bg-[var(--eh-surface-2)]"
                    : "hover:bg-white/[0.03]"
                )}
              >
                <span className="eh-neu-inset flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-[var(--eh-signal)]">
                  <MapPin size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-white">
                    {s.name}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-[var(--eh-fog)]">
                    {s.code} · 센서 {s.sensorCount}대
                  </span>
                </span>
                <Badge
                  tone={
                    s.status === "active"
                      ? "ok"
                      : s.status === "paused"
                        ? "warn"
                        : "off"
                  }
                >
                  {STATUS_LABEL[s.status]}
                </Badge>
              </button>
            ))}
            {!filtered.length && (
              <div className="px-4 py-12 text-center text-sm text-[var(--eh-fog)]">
                표시할 현장이 없습니다.
              </div>
            )}
          </div>
        </div>

        <div className="eh-panel flex min-h-0 flex-col overflow-hidden rounded-[22px] p-5">
          {selected ? (
            <>
              <div className="mb-4 shrink-0">
                <div className="eh-display text-2xl text-white">
                  {selected.name}
                </div>
                <div className="mt-1 text-xs text-[var(--eh-fog)]">
                  {selected.code} · {companyId}
                </div>
              </div>
              <div className="eh-scroll min-h-0 flex-1 space-y-4 overflow-y-auto">
                <div>
                  <div className="mb-1.5 text-xs text-[var(--eh-fog)]">주소</div>
                  <div className="eh-neu-inset rounded-2xl px-3.5 py-2.5 text-sm text-[var(--eh-mist)]">
                    {selected.address || "주소 미등록"}
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 text-xs text-[var(--eh-fog)]">
                    현장 위치
                  </div>
                  {selectedMapMarkers.length > 0 ? (
                    <MapView
                      key={selected.id}
                      markers={selectedMapMarkers}
                      focusId={selected.id}
                      height={220}
                      enableZoomLayers={false}
                      className="rounded-[18px]"
                    />
                  ) : (
                    <div className="eh-neu-inset flex h-[220px] items-center justify-center rounded-[18px] text-sm text-[var(--eh-fog)]">
                      표시할 좌표가 없습니다
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="mb-1.5 text-xs text-[var(--eh-fog)]">
                      위도
                    </div>
                    <div className="eh-neu-inset rounded-2xl px-3.5 py-2.5 text-sm text-white">
                      {selected.lat.toFixed(5)}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1.5 text-xs text-[var(--eh-fog)]">
                      경도
                    </div>
                    <div className="eh-neu-inset rounded-2xl px-3.5 py-2.5 text-sm text-white">
                      {selected.lon.toFixed(5)}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 text-xs text-[var(--eh-fog)]">
                    배정 센서
                  </div>
                  <div className="eh-neu-inset rounded-2xl px-3.5 py-2.5 text-sm text-white">
                    {selected.sensorCount}대
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-xs text-[var(--eh-fog)]">
                    운영 상태
                  </div>
                  {canManageStatus ? (
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          { value: "active", label: "운영중" },
                          { value: "paused", label: "일시중지" },
                          { value: "closed", label: "종료" },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setStatus(selected.id, opt.value)}
                          className={clsx(
                            "eh-neu-press rounded-2xl px-2 py-2.5 text-xs transition",
                            selected.status === opt.value
                              ? "eh-neu-active text-[var(--eh-signal)]"
                              : "eh-neu-raised-sm text-[var(--eh-fog)] hover:text-white"
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="eh-neu-inset rounded-2xl px-3.5 py-2.5 text-sm text-white">
                      {STATUS_LABEL[selected.status]}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <div className="eh-neu-inset mb-3 flex h-14 w-14 items-center justify-center rounded-[18px] text-[var(--eh-fog)]">
                <MapPin size={22} />
              </div>
              <div className="text-sm text-white">현장을 선택하세요</div>
              <p className="mt-1 max-w-[220px] text-xs text-[var(--eh-fog)]">
                왼쪽 목록에서 현장을 고르면 상세와 상태 변경 UI가 표시됩니다.
              </p>
            </div>
          )}
        </div>
      </div>

      {mounted &&
        createOpen &&
        createPortal(
          <CreateSiteModal
            managers={managers}
            onClose={() => setCreateOpen(false)}
            onSubmit={addSiteDraft}
          />,
          document.body
        )}
    </div>
  );
}

function CreateSiteModal({
  managers,
  onClose,
  onSubmit,
}: {
  managers: { id: string; name: string }[];
  onClose: () => void;
  onSubmit: (input: { name: string; code: string; address: string }) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [managerUserId, setManagerUserId] = useState("");

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/65 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.currentTarget === e.target) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="현장 개설"
        className="eh-panel w-full max-w-md rounded-[22px] p-5"
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="text-lg text-white">현장 개설</div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-[var(--eh-fog)] hover:bg-white/10 hover:text-white"
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </div>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            onSubmit({
              name: name.trim(),
              code: code.trim(),
              address: address.trim(),
            });
          }}
        >
          <div>
            <label className="mb-1.5 block text-xs text-[var(--eh-fog)]">
              현장명
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 잠실 스포츠컴플렉스 리모델링"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-[var(--eh-fog)]">
              코드 (선택)
            </label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="예: JS-05"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-[var(--eh-fog)]">
              주소
            </label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="도로명 주소"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-[var(--eh-fog)]">
              현장소장 (선택)
            </label>
            <Select
              value={managerUserId}
              onChange={(e) => setManagerUserId(e.target.value)}
            >
              <option value="">미지정</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              취소
            </Button>
            <Button type="submit">개설</Button>
          </div>
          <p className="text-[11px] text-[var(--eh-fog)]">
            UI 미리보기 · 목록에만 반영되며 서버에는 저장되지 않습니다.
          </p>
        </form>
      </div>
    </div>
  );
}
