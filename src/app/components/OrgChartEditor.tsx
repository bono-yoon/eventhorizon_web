"use client";

import { useEffect, useMemo, useState } from "react";
import type { OrgNode, User } from "@/lib/types";
import { Badge, Button, Input, Panel, Select } from "./ui";
import { PERMISSION_LABELS } from "@/lib/types";
import { roleLabel } from "@/lib/permissions";
import { Building2, Mail, UserRound, UsersRound, X } from "lucide-react";
import clsx from "clsx";
import { createPortal } from "react-dom";

type SafeUser = Omit<User, "passwordHash">;
type BadgeAnchor = {
  left: number;
  top: number;
  arrow: "left" | "right";
};

export function OrgChartEditor({
  companyId,
  initialNodes,
  users,
  canEdit,
}: {
  companyId: string;
  initialNodes: OrgNode[];
  users: SafeUser[];
  canEdit: boolean;
}) {
  const [nodes, setNodes] = useState(initialNodes);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [badgeAnchor, setBadgeAnchor] = useState<BadgeAnchor | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const roots = useMemo(
    () => nodes.filter((n) => !n.parentId).sort((a, b) => a.order - b.order),
    [nodes]
  );
  const selectedNode =
    nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedUser =
    users.find((user) => user.id === selectedNode?.userId) ?? undefined;
  function childrenOf(parentId: string) {
    return nodes
      .filter((n) => n.parentId === parentId)
      .sort((a, b) => a.order - b.order);
  }

  function updateNode(id: string, patch: Partial<OrgNode>) {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }

  function addChild(parentId: string | null) {
    const id = `org_${Date.now().toString(36)}`;
    setNodes((prev) => [
      ...prev,
      {
        id,
        companyId,
        parentId,
        title: "새 조직",
        userId: null,
        order: prev.filter((n) => n.parentId === parentId).length,
      },
    ]);
    setSelectedNodeId(null);
    setBadgeAnchor(null);
  }

  function removeNode(id: string) {
    const drop = new Set<string>();
    const walk = (nodeId: string) => {
      drop.add(nodeId);
      nodes
        .filter((node) => node.parentId === nodeId)
        .forEach((child) => walk(child.id));
    };
    walk(id);
    setNodes((prev) => prev.filter((node) => !drop.has(node.id)));
    if (drop.has(selectedNodeId || "")) {
      setSelectedNodeId(null);
      setBadgeAnchor(null);
    }
  }

  async function save() {
    setSaving(true);
    setMsg("");
    const res = await fetch("/api/org", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, nodes }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMsg(data.error || "저장 실패");
      return;
    }
    setMsg("조직도가 저장되었습니다.");
  }

  function initials(name?: string) {
    if (!name) return "?";
    return name.trim().slice(0, 2).toUpperCase();
  }

  function closeBadge() {
    setSelectedNodeId(null);
    setBadgeAnchor(null);
  }

  function selectNode(event: React.MouseEvent<HTMLButtonElement>, id: string) {
    if (selectedNodeId === id) {
      closeBadge();
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const badgeWidth = Math.min(320, window.innerWidth - 24);
    const showRight = rect.right + badgeWidth + 16 <= window.innerWidth;
    const left = showRight
      ? rect.right + 12
      : Math.max(12, rect.left - badgeWidth - 12);
    const top = Math.max(72, Math.min(rect.top, window.innerHeight - 440));

    setSelectedNodeId(id);
    setBadgeAnchor({ left, top, arrow: showRight ? "left" : "right" });
  }

  function renderNode(node: OrgNode) {
    const user = users.find((u) => u.id === node.userId);
    const children = childrenOf(node.id);
    const selected = selectedNodeId === node.id;

    return (
      <div
        key={node.id}
        className={clsx(
          "relative flex shrink-0 flex-col items-center",
          selected && "z-50"
        )}
      >
        <button
          type="button"
          onClick={(event) => selectNode(event, node.id)}
          className="group flex w-32 flex-col items-center rounded-2xl px-2 py-2 text-center outline-none"
          aria-label={`${user?.name || node.title} 직원 정보 보기`}
        >
          <span
            className={clsx(
              "relative flex h-16 w-16 items-center justify-center rounded-full text-lg font-semibold transition duration-200 group-hover:-translate-y-1",
              selected
                ? "eh-neu-active text-[var(--eh-signal)]"
                : user
                  ? "eh-neu-raised text-[var(--eh-mist)]"
                  : "eh-neu-inset text-[var(--eh-fog)]"
            )}
          >
            {user ? initials(user.name) : <UserRound size={24} />}
            <span
              className={clsx(
                "absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full",
                "shadow-[0_0_0_2px_var(--eh-ink)]",
                user?.active ? "bg-[var(--eh-ok)]" : "bg-[var(--eh-fog)]"
              )}
              aria-label={user?.active ? "활성 계정" : "미지정 또는 비활성"}
            />
          </span>
          <span className="mt-2 max-w-full truncate text-sm font-medium text-[var(--eh-mist)]">
            {user?.name || "담당자 미지정"}
          </span>
          <span className="mt-0.5 max-w-full truncate text-xs text-[var(--eh-fog)]">
            {node.title}
          </span>
        </button>

        {children.length > 0 && (
          <>
            <div className="h-6 w-px bg-[color-mix(in_srgb,var(--eh-fog)_28%,transparent)]" />
            <div
              className={clsx(
                "flex items-start",
                children.length > 1 &&
                  "border-t border-[color-mix(in_srgb,var(--eh-fog)_22%,transparent)]"
              )}
            >
              {children.map((child) => (
                <div
                  key={child.id}
                  className="flex min-w-36 flex-col items-center px-2"
                >
                  <div className="h-6 w-px bg-[color-mix(in_srgb,var(--eh-fog)_28%,transparent)]" />
                  {renderNode(child)}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  function renderEmployeeBadge(
    node: OrgNode,
    user: SafeUser | undefined,
    anchor: BadgeAnchor
  ) {
    return (
      <div
        className="eh-panel eh-fixed eh-scroll z-[200] max-h-[calc(100vh-84px)] w-[min(320px,calc(100vw-24px))] overflow-y-auto rounded-[26px] p-4 text-left"
        style={{ left: anchor.left, top: anchor.top }}
        role="dialog"
        aria-label={`${user?.name || node.title} 직원 정보`}
      >
        {/* 뉴모 패널과 이어지는 soft 화살표 */}
        <span
          aria-hidden
          className={clsx(
            "pointer-events-none absolute top-7 z-[2] h-3.5 w-3.5 rotate-45 bg-[var(--eh-panel)]",
            anchor.arrow === "left"
              ? "-left-[7px] shadow-[-5px_5px_12px_rgba(8,10,14,0.35)]"
              : "-right-[7px] shadow-[5px_-5px_12px_rgba(8,10,14,0.35)]"
          )}
        />

        <div className="relative z-[2]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={clsx(
                "flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-semibold",
                user
                  ? "eh-neu-raised-sm text-[var(--eh-mist)]"
                  : "eh-neu-inset text-[var(--eh-fog)]"
              )}
            >
              {user ? initials(user.name) : <UserRound size={22} />}
            </div>
            <div className="min-w-0">
              <div className="text-[11px] text-[var(--eh-fog)]">직원 정보</div>
              <div className="truncate text-lg text-[var(--eh-mist)]">
                {user?.name || "담당자 미지정"}
              </div>
              <div className="text-sm text-[var(--eh-fog)]">{node.title}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={closeBadge}
            className="eh-neu-raised-sm eh-neu-press shrink-0 rounded-xl p-2 text-[var(--eh-fog)] hover:text-[var(--eh-mist)]"
            aria-label="닫기"
          >
            <X size={14} />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {user ? (
            <>
              <Badge tone="neutral">{roleLabel(user.role)}</Badge>
              <Badge tone={user.active ? "ok" : "off"}>
                {user.active ? "재직·활성" : "비활성"}
              </Badge>
            </>
          ) : (
            <Badge tone="warn">배정 필요</Badge>
          )}
        </div>

        {user && (
          <div className="mt-4 space-y-2.5">
            <div className="eh-neu-inset flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm text-[var(--eh-mist)]">
              <Mail size={15} className="shrink-0 text-[var(--eh-fog)]" />
              <span className="truncate">{user.email}</span>
            </div>
            <div className="eh-neu-inset rounded-2xl px-3 py-2.5">
              <div className="mb-2 text-[11px] text-[var(--eh-fog)]">권한</div>
              <div className="flex flex-wrap gap-1.5">
                {user.permissions.map((permission) => (
                  <Badge key={permission} tone="neutral">
                    {PERMISSION_LABELS[permission]}
                  </Badge>
                ))}
                {!user.permissions.length && (
                  <span className="text-xs text-[var(--eh-fog)]">
                    역할 기본 권한 사용
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {canEdit && (
          <div className="mt-4 space-y-3">
            <div className="eh-neu-inset space-y-3 rounded-2xl p-3">
              <div>
                <label className="mb-1.5 block text-xs text-[var(--eh-fog)]">
                  직책·조직명
                </label>
                <Input
                  value={node.title}
                  onChange={(e) =>
                    updateNode(node.id, { title: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-[var(--eh-fog)]">
                  담당 직원
                </label>
                <Select
                  value={node.userId || ""}
                  onChange={(e) =>
                    updateNode(node.id, {
                      userId: e.target.value || null,
                    })
                  }
                >
                  <option value="">담당자 없음</option>
                  {users.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name} · {roleLabel(entry.role)}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                type="button"
                onClick={() => addChild(node.id)}
              >
                하위 추가
              </Button>
              <Button
                variant="danger"
                type="button"
                onClick={() => removeNode(node.id)}
              >
                삭제
              </Button>
            </div>
          </div>
        )}
        </div>
      </div>
    );
  }

  const nodeCount = nodes.length;
  const assignedCount = nodes.filter((node) => node.userId).length;

  return (
    <div>
      <Panel>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-lg text-[var(--eh-mist)]">
              <span className="eh-neu-raised-sm flex h-9 w-9 items-center justify-center rounded-2xl text-[var(--eh-signal)]">
                <UsersRound size={18} />
              </span>
              조직도
            </div>
            <div className="mt-1 text-sm text-[var(--eh-fog)]">
              직원 아이콘을 선택하면 상세 정보를 확인할 수 있습니다.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">조직 {nodeCount}</Badge>
            <Badge tone="ok">배정 {assignedCount}</Badge>
            {canEdit && (
              <>
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => addChild(null)}
                >
                  <Building2 size={15} />
                  최상위 조직 추가
                </Button>
                <Button type="button" onClick={save} disabled={saving}>
                  {saving ? "저장 중…" : "변경사항 저장"}
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="eh-neu-inset eh-scroll overflow-x-auto rounded-[22px] px-6 py-8">
          <div className="flex min-w-max justify-center gap-12">
            {roots.map((root) => renderNode(root))}
            {!roots.length && (
              <div className="flex min-w-[320px] flex-col items-center py-10 text-center">
                <div className="eh-neu-inset mb-3 flex h-14 w-14 items-center justify-center rounded-full text-[var(--eh-fog)]">
                  <UsersRound size={24} />
                </div>
                <div className="text-sm text-[var(--eh-fog)]">
                  조직 노드가 없습니다.
                </div>
                {canEdit && (
                  <Button
                    className="mt-4"
                    variant="ghost"
                    type="button"
                    onClick={() => addChild(null)}
                  >
                    첫 조직 추가
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {msg && <p className="mt-3 text-sm text-[var(--eh-signal)]">{msg}</p>}
      </Panel>
      {mounted &&
        selectedNode &&
        badgeAnchor &&
        createPortal(
          renderEmployeeBadge(selectedNode, selectedUser, badgeAnchor),
          document.body
        )}
    </div>
  );
}
