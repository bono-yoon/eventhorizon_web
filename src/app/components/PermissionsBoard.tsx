"use client";

import { useMemo, useState } from "react";
import type { OrgNode, Permission, Site, User } from "@/lib/types";
import { ALL_PERMISSIONS, PERMISSION_LABELS } from "@/lib/types";
import { Button, Panel, Select } from "./ui";

type SafeUser = Omit<User, "passwordHash">;

export function PermissionsBoard({
  companyId,
  users,
  nodes,
  sites,
}: {
  companyId: string;
  users: SafeUser[];
  nodes: OrgNode[];
  sites: Site[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [add, setAdd] = useState<Permission[]>([]);
  const [remove, setRemove] = useState<Permission[]>([]);
  const [siteIds, setSiteIds] = useState<string[] | null>(null);
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const editableUsers = useMemo(
    () => users.filter((u) => u.role !== "company" && u.role !== "admin"),
    [users]
  );

  function toggleUser(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function togglePerm(list: Permission[], setList: (v: Permission[]) => void, p: Permission) {
    setList(list.includes(p) ? list.filter((x) => x !== p) : [...list, p]);
  }

  function toggleSite(id: string) {
    const base = siteIds ?? [];
    setSiteIds(
      base.includes(id) ? base.filter((x) => x !== id) : [...base, id]
    );
  }

  async function apply() {
    if (!selected.length) {
      setMsg("사용자를 선택하세요.");
      return;
    }
    setSaving(true);
    setMsg("");
    const res = await fetch("/api/permissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId,
        userIds: selected,
        add,
        remove,
        siteIds: siteIds ?? undefined,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMsg(data.error || "적용 실패");
      return;
    }
    setMsg(`${selected.length}명 권한 반영 완료. 새로고침하면 목록이 갱신됩니다.`);
    setAdd([]);
    setRemove([]);
  }

  function nodeTitle(userId: string | null) {
    if (!userId) return null;
    return nodes.find((n) => n.userId === userId)?.title;
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
      <Panel>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <div className="text-lg text-[var(--eh-mist)]">직원 권한</div>
            <div className="text-sm text-[var(--eh-fog)]">
              조직도와 같은 트리 목록에서 다수 선택 후 일괄 처리
            </div>
          </div>
          <Button
            variant="ghost"
            type="button"
            onClick={() =>
              setSelected(
                selected.length === editableUsers.length
                  ? []
                  : editableUsers.map((u) => u.id)
              )
            }
          >
            {selected.length === editableUsers.length ? "전체 해제" : "전체 선택"}
          </Button>
        </div>

        <div className="space-y-2">
          {editableUsers.map((u) => {
            const checked = selected.includes(u.id);
            const title = nodeTitle(u.id) || nodeTitle(u.orgNodeId);
            return (
              <label
                key={u.id}
                className={`eh-neu-press flex cursor-pointer items-start gap-3 rounded-2xl px-3 py-3 transition ${
                  checked
                    ? "eh-neu-active text-[var(--eh-signal)]"
                    : "eh-neu-raised-sm"
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={checked}
                  onChange={() => toggleUser(u.id)}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-[var(--eh-mist)]">{u.name}</span>
                    <span className="text-xs text-[var(--eh-fog)]">{u.role}</span>
                  </div>
                  <div className="text-xs text-[var(--eh-fog)]">{u.email}</div>
                  {title && (
                    <div className="mt-1 text-xs text-[var(--eh-mist)]">
                      조직: {title}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {u.permissions.map((p) => (
                      <span
                        key={p}
                        className="rounded-md bg-white/8 px-1.5 py-0.5 text-[10px] text-[var(--eh-fog)]"
                      >
                        {PERMISSION_LABELS[p]}
                      </span>
                    ))}
                    {!u.permissions.length && (
                      <span className="text-[10px] text-[var(--eh-fog)]">
                        기본 권한만
                      </span>
                    )}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </Panel>

      <Panel>
        <div className="mb-4 text-lg text-[var(--eh-mist)]">일괄 변경</div>
        <div className="mb-4 text-sm text-[var(--eh-fog)]">
          선택 {selected.length}명
        </div>

        <div className="mb-5">
          <div className="mb-2 text-sm text-[var(--eh-mist)]">권한 추가</div>
          <div className="flex flex-wrap gap-2">
            {ALL_PERMISSIONS.map((p) => (
              <button
                key={`add-${p}`}
                type="button"
                onClick={() => togglePerm(add, setAdd, p)}
                className={`eh-neu-press rounded-xl px-2.5 py-1 text-xs ${
                  add.includes(p)
                    ? "eh-neu-active text-[var(--eh-ok)]"
                    : "eh-neu-raised-sm text-[var(--eh-fog)]"
                }`}
              >
                + {PERMISSION_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-5">
          <div className="mb-2 text-sm text-[var(--eh-mist)]">권한 제거</div>
          <div className="flex flex-wrap gap-2">
            {ALL_PERMISSIONS.map((p) => (
              <button
                key={`rm-${p}`}
                type="button"
                onClick={() => togglePerm(remove, setRemove, p)}
                className={`eh-neu-press rounded-xl px-2.5 py-1 text-xs ${
                  remove.includes(p)
                    ? "eh-neu-active text-[var(--eh-alert)]"
                    : "eh-neu-raised-sm text-[var(--eh-fog)]"
                }`}
              >
                − {PERMISSION_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-5">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm text-[var(--eh-mist)]">현장 배정 (선택 시 덮어쓰기)</div>
            <Button
              variant="ghost"
              type="button"
              className="!px-2 !py-1 text-xs"
              onClick={() => setSiteIds(siteIds === null ? [] : null)}
            >
              {siteIds === null ? "현장 변경 사용" : "현장 변경 안 함"}
            </Button>
          </div>
          {siteIds !== null && (
            <div className="space-y-2">
              {sites.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-2 text-sm text-[var(--eh-mist)]"
                >
                  <input
                    type="checkbox"
                    checked={siteIds.includes(s.id)}
                    onChange={() => toggleSite(s.id)}
                  />
                  {s.name}
                </label>
              ))}
            </div>
          )}
        </div>

        <Select
          className="mb-3"
          value=""
          onChange={(e) => {
            const v = e.target.value as Permission;
            if (v) togglePerm(add, setAdd, v);
          }}
        >
          <option value="">빠른 추가…</option>
          {ALL_PERMISSIONS.map((p) => (
            <option key={p} value={p}>
              {PERMISSION_LABELS[p]}
            </option>
          ))}
        </Select>

        <Button type="button" onClick={apply} disabled={saving} className="w-full">
          {saving ? "적용 중…" : "선택 인원에게 적용"}
        </Button>
        {msg && <p className="mt-3 text-sm text-[var(--eh-signal)]">{msg}</p>}
      </Panel>
    </div>
  );
}
