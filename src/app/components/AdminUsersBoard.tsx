"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Input, Panel, Select } from "./ui";
import { roleLabel } from "@/lib/permissions";
import type { GlobalRole } from "@/lib/types";

type CompanyOpt = { id: string; name: string };
type SiteOpt = { id: string; name: string; companyId: string };
type UserRow = {
  id: string;
  name: string;
  email: string;
  role: GlobalRole;
  companyId: string | null;
  siteIds: string[];
  active: boolean;
};

export function AdminUsersBoard({
  currentUserId,
  companies,
  sites,
  users,
}: {
  currentUserId: string;
  companies: CompanyOpt[];
  sites: SiteOpt[];
  users: UserRow[];
}) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [companyForm, setCompanyForm] = useState({
    name: "",
    code: "",
    address: "",
    adminName: "",
    adminEmail: "",
    adminPassword: "",
  });
  const [userForm, setUserForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "employee" as GlobalRole,
    companyId: companies[0]?.id || "",
    siteId: "",
  });

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of users) {
      if (!u.companyId) continue;
      map.set(u.companyId, (map.get(u.companyId) || 0) + 1);
    }
    return map;
  }, [users]);

  async function createCompany(e: React.FormEvent) {
    e.preventDefault();
    setBusy("company");
    setMsg("");
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create_company", ...companyForm }),
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      setMsg(data.error || "건설사 생성 실패");
      return;
    }
    setMsg(`건설사 생성: ${data.company.name} / ${data.email}`);
    setCompanyForm({
      name: "",
      code: "",
      address: "",
      adminName: "",
      adminEmail: "",
      adminPassword: "",
    });
    router.refresh();
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy("user");
    setMsg("");
    const serviceSide =
      userForm.role === "admin" || userForm.role === "field_worker";
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...userForm,
        companyId: serviceSide ? "" : userForm.companyId,
        siteIds: userForm.siteId ? [userForm.siteId] : [],
      }),
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      setMsg(data.error || "계정 생성 실패");
      return;
    }
    setMsg(`계정 생성: ${data.user.email}`);
    setUserForm((f) => ({
      ...f,
      name: "",
      email: "",
      password: "",
      siteId: "",
    }));
    router.refresh();
  }

  async function setActive(id: string, active: boolean) {
    setBusy(id);
    setMsg("");
    const res = await fetch("/api/admin", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, active }),
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      setMsg(data.error || "변경 실패");
      return;
    }
    setMsg(active ? "계정을 활성화했습니다." : "계정을 정지했습니다.");
    router.refresh();
  }

  const filteredSites = sites.filter((s) => s.companyId === userForm.companyId);
  const serviceSide =
    userForm.role === "admin" || userForm.role === "field_worker";

  return (
    <div className="space-y-5">
      {msg && <p className="text-sm text-[var(--eh-signal)]">{msg}</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Panel className="!p-3.5">
          <div className="text-xs text-[var(--eh-fog)]">전체 유저</div>
          <div className="eh-display mt-1 text-2xl text-[var(--eh-mist)]">
            {users.length}
          </div>
        </Panel>
        {companies.map((c) => (
          <Panel key={c.id} className="!p-3.5">
            <div className="text-xs text-[var(--eh-fog)]">{c.name}</div>
            <div className="eh-display mt-1 text-2xl text-[var(--eh-mist)]">
              {counts.get(c.id) || 0}
            </div>
            <div className="mt-0.5 text-[11px] text-[var(--eh-fog)]">소속 계정</div>
          </Panel>
        ))}
      </div>

      <Panel>
        <div className="mb-3 text-lg text-[var(--eh-mist)]">건설사 계정 생성</div>
        <p className="mb-3 text-xs text-[var(--eh-fog)]">
          건설사를 등록하고, 그 건설사의 대표 로그인 계정을 함께 만듭니다.
        </p>
        <form onSubmit={createCompany} className="grid gap-3 md:grid-cols-3">
          <Input
            placeholder="건설사명"
            value={companyForm.name}
            onChange={(e) =>
              setCompanyForm({ ...companyForm, name: e.target.value })
            }
            required
          />
          <Input
            placeholder="코드 (선택)"
            value={companyForm.code}
            onChange={(e) =>
              setCompanyForm({ ...companyForm, code: e.target.value })
            }
          />
          <Input
            placeholder="주소 (선택)"
            value={companyForm.address}
            onChange={(e) =>
              setCompanyForm({ ...companyForm, address: e.target.value })
            }
          />
          <Input
            placeholder="대표 계정 이름"
            value={companyForm.adminName}
            onChange={(e) =>
              setCompanyForm({ ...companyForm, adminName: e.target.value })
            }
            required
          />
          <Input
            placeholder="대표 계정 이메일"
            type="email"
            value={companyForm.adminEmail}
            onChange={(e) =>
              setCompanyForm({ ...companyForm, adminEmail: e.target.value })
            }
            required
          />
          <Input
            placeholder="대표 계정 비밀번호"
            type="password"
            value={companyForm.adminPassword}
            onChange={(e) =>
              setCompanyForm({ ...companyForm, adminPassword: e.target.value })
            }
            required
          />
          <Button
            type="submit"
            className="md:col-span-3"
            disabled={busy === "company"}
          >
            건설사 + 대표 계정 생성
          </Button>
        </form>
      </Panel>

      <Panel>
        <div className="mb-3 text-lg text-[var(--eh-mist)]">소속 유저 생성</div>
        <form onSubmit={createUser} className="grid gap-3 md:grid-cols-3">
          <Input
            placeholder="이름"
            value={userForm.name}
            onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
            required
          />
          <Input
            placeholder="이메일"
            type="email"
            value={userForm.email}
            onChange={(e) =>
              setUserForm({ ...userForm, email: e.target.value })
            }
            required
          />
          <Input
            placeholder="비밀번호"
            type="password"
            value={userForm.password}
            onChange={(e) =>
              setUserForm({ ...userForm, password: e.target.value })
            }
            required
          />
          <Select
            value={userForm.role}
            onChange={(e) => {
              const role = e.target.value as GlobalRole;
              setUserForm({
                ...userForm,
                role,
                companyId:
                  role === "admin" || role === "field_worker"
                    ? ""
                    : userForm.companyId,
                siteId: "",
              });
            }}
          >
            <option value="company">건설사</option>
            <option value="site_manager">현장소장</option>
            <option value="employee">직원</option>
            <option value="admin">시스템 관리자</option>
            <option value="field_worker">본사 현장작업자</option>
          </Select>
          <Select
            value={userForm.companyId}
            disabled={serviceSide}
            onChange={(e) =>
              setUserForm({ ...userForm, companyId: e.target.value, siteId: "" })
            }
          >
            <option value="">건설사 선택</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select
            value={userForm.siteId}
            disabled={serviceSide || userForm.role === "company"}
            onChange={(e) =>
              setUserForm({ ...userForm, siteId: e.target.value })
            }
          >
            <option value="">현장 미배정</option>
            {filteredSites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Button type="submit" className="md:col-span-3" disabled={busy === "user"}>
            유저 생성
          </Button>
        </form>
      </Panel>

      <Panel>
        <div className="mb-3 text-lg text-[var(--eh-mist)]">전체 유저</div>
        <table className="w-full table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[12%]" />
            <col className="w-[22%]" />
            <col className="w-[12%]" />
            <col className="w-[12%]" />
            <col className="w-[24%]" />
            <col className="w-[8%]" />
            <col className="w-[10%]" />
          </colgroup>
          <thead className="text-xs text-[var(--eh-fog)]">
            <tr className="border-b border-[var(--eh-line)]">
              <th className="py-2 pr-2 font-medium">이름</th>
              <th className="py-2 pr-2 font-medium">이메일</th>
              <th className="py-2 pr-2 font-medium">역할</th>
              <th className="py-2 pr-2 font-medium">건설사</th>
              <th className="py-2 pr-2 font-medium">현장</th>
              <th className="py-2 pr-2 font-medium">상태</th>
              <th className="py-2 text-right font-medium">관리</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const companyName =
                companies.find((c) => c.id === u.companyId)?.name || "-";
              const siteLabel =
                u.siteIds
                  .map((id) => sites.find((s) => s.id === id)?.name || id)
                  .join(", ") || "-";
              return (
                <tr key={u.id} className="border-b border-[var(--eh-line)]/50">
                  <td
                    className="max-w-0 truncate whitespace-nowrap py-3 pr-2 text-[var(--eh-mist)]"
                    title={u.name}
                  >
                    {u.name}
                  </td>
                  <td
                    className="max-w-0 truncate whitespace-nowrap py-3 pr-2"
                    title={u.email}
                  >
                    {u.email}
                  </td>
                  <td
                    className="max-w-0 truncate whitespace-nowrap py-3 pr-2"
                    title={roleLabel(u.role)}
                  >
                    {roleLabel(u.role)}
                  </td>
                  <td
                    className="max-w-0 truncate whitespace-nowrap py-3 pr-2"
                    title={companyName}
                  >
                    {companyName}
                  </td>
                  <td
                    className="max-w-0 truncate whitespace-nowrap py-3 pr-2 text-xs text-[var(--eh-fog)]"
                    title={siteLabel}
                  >
                    {siteLabel}
                  </td>
                  <td className="whitespace-nowrap py-3 pr-2">
                    <Badge tone={u.active ? "ok" : "off"}>
                      {u.active ? "활성" : "정지"}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap py-3 text-right">
                    {u.id === currentUserId ? (
                      <span className="text-xs text-[var(--eh-fog)]">본인</span>
                    ) : (
                      <Button
                        type="button"
                        variant={u.active ? "danger" : "signal"}
                        className="!px-3 !py-1.5 text-xs"
                        disabled={busy === u.id}
                        onClick={() => setActive(u.id, !u.active)}
                      >
                        {u.active ? "정지" : "해제"}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
