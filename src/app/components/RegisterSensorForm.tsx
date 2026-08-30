"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Panel } from "./ui";

export function RegisterSensorForm({ siteId }: { siteId: string }) {
  const router = useRouter();
  const [deviceId, setDeviceId] = useState("");
  const [label, setLabel] = useState("");
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/sensors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteId,
        deviceId: deviceId || undefined,
        label: label || "신규 센서",
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error || "등록 실패");
      return;
    }
    setMsg(`등록됨: ${data.sensor.deviceId}`);
    setDeviceId("");
    setLabel("");
    router.refresh();
  }

  return (
    <Panel>
      <div className="mb-3 text-lg text-[var(--eh-mist)]">센서 등록</div>
      <form onSubmit={submit} className="space-y-3">
        <Input
          placeholder="Device ID (비우면 자동생성)"
          value={deviceId}
          onChange={(e) => setDeviceId(e.target.value)}
        />
        <Input
          placeholder="라벨"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <Button type="submit">등록</Button>
      </form>
      {msg && <p className="mt-3 text-sm text-[var(--eh-signal)]">{msg}</p>}
    </Panel>
  );
}
