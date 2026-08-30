"use client";

import { useState } from "react";
import { Button, Input, Panel, Select } from "./ui";
import { useRouter } from "next/navigation";

export function CreateSiteForm({
  companyId,
  managers,
}: {
  companyId: string;
  managers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [code, setCode] = useState("");
  const [managerUserId, setManagerUserId] = useState("");
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/sites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId,
        name,
        address,
        code: code || undefined,
        managerUserId: managerUserId || undefined,
        lat: 37.56 + Math.random() * 0.05,
        lon: 126.97 + Math.random() * 0.05,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error || "실패");
      return;
    }
    setMsg(`개설 완료: ${data.site.name}`);
    setName("");
    setAddress("");
    setCode("");
    router.refresh();
  }

  return (
    <Panel>
      <div className="mb-3 text-lg text-[var(--eh-mist)]">현장 개설</div>
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
        <Input
          placeholder="현장명"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Input
          placeholder="코드 (선택)"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <Input
          className="md:col-span-2"
          placeholder="주소"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <Select
          value={managerUserId}
          onChange={(e) => setManagerUserId(e.target.value)}
        >
          <option value="">소장 미지정</option>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
        <Button type="submit">개설</Button>
      </form>
      {msg && <p className="mt-3 text-sm text-[var(--eh-signal)]">{msg}</p>}
    </Panel>
  );
}
