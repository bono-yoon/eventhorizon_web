"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Panel, Select } from "./ui";

export function AdminUserCreateForm({
  companies,
  sites,
}: {
  companies: { id: string; name: string }[];
  sites: { id: string; name: string; companyId: string }[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "changeme123",
    role: "employee",
    companyId: companies[0]?.id || "",
    siteId: "",
  });
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        siteIds: form.siteId ? [form.siteId] : [],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error || "실패");
      return;
    }
    setMsg(`생성됨: ${data.user.email}`);
    router.refresh();
  }

  const filteredSites = sites.filter((s) => s.companyId === form.companyId);

  return (
    <Panel>
      <div className="mb-3 text-lg text-[var(--eh-mist)]">사용자 생성</div>
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-3">
        <Input
          placeholder="이름"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <Input
          placeholder="이메일"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
        />
        <Input
          placeholder="비밀번호"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <Select
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
        >
          <option value="admin">관리자</option>
          <option value="company">건설사</option>
          <option value="site_manager">현장소장</option>
          <option value="employee">직원</option>
        </Select>
        <Select
          value={form.companyId}
          onChange={(e) =>
            setForm({ ...form, companyId: e.target.value, siteId: "" })
          }
        >
          <option value="">건설사 없음</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select
          value={form.siteId}
          onChange={(e) => setForm({ ...form, siteId: e.target.value })}
        >
          <option value="">현장 미배정</option>
          {filteredSites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Button type="submit" className="md:col-span-3">
          생성
        </Button>
      </form>
      {msg && <p className="mt-3 text-sm text-[var(--eh-signal)]">{msg}</p>}
    </Panel>
  );
}
