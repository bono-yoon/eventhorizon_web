"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Site } from "@/lib/types";
import { Button, Input, Panel, Select } from "./ui";

export function SiteManageForm({ site }: { site: Site }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: site.name,
    address: site.address,
    status: site.status,
  });
  const [msg, setMsg] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/sites", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: site.id, ...form }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error || "저장 실패");
      return;
    }
    setMsg("현장 정보가 저장되었습니다.");
    router.refresh();
  }

  return (
    <Panel>
      <div className="mb-3 text-lg text-[var(--eh-mist)]">현장 정보</div>
      <form onSubmit={save} className="space-y-3">
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <Input
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />
        <Select
          value={form.status}
          onChange={(e) =>
            setForm({
              ...form,
              status: e.target.value as Site["status"],
            })
          }
        >
          <option value="active">active</option>
          <option value="paused">paused</option>
          <option value="closed">closed</option>
        </Select>
        <Button type="submit">저장</Button>
      </form>
      {msg && <p className="mt-3 text-sm text-[var(--eh-signal)]">{msg}</p>}
    </Panel>
  );
}
