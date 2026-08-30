"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Panel } from "./ui";
import { ThemeToggle } from "./ThemeToggle";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("company@hanbit.local");
  const [password, setPassword] = useState("company123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "로그인 실패");
      return;
    }
    router.push(data.redirect || "/");
    router.refresh();
  }

  const demos = [
    { label: "관리자", email: "admin@eventhorizon.local", password: "admin123" },
    { label: "건설사", email: "company@hanbit.local", password: "company123" },
    { label: "현장소장", email: "manager@hanbit.local", password: "manager123" },
    { label: "직원", email: "employee@hanbit.local", password: "employee123" },
  ];

  return (
    <Panel className="relative w-full max-w-md">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs text-[var(--eh-fog)]">이메일</label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs text-[var(--eh-fog)]">비밀번호</label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        {error && <p className="text-sm text-[var(--eh-alert)]">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "접속 중…" : "관제 시작"}
        </Button>
      </form>

      <div className="mt-6 border-t border-[var(--eh-line)] pt-4">
        <div className="mb-2 text-xs text-[var(--eh-fog)]">데모 계정 빠른 입력</div>
        <div className="grid grid-cols-2 gap-2">
          {demos.map((d) => (
            <button
              key={d.email}
              type="button"
              className="eh-neu-raised-sm eh-neu-press rounded-2xl px-2.5 py-2 text-left text-xs text-[var(--eh-fog)] hover:text-[var(--eh-mist)]"
              onClick={() => {
                setEmail(d.email);
                setPassword(d.password);
              }}
            >
              <div className="text-[var(--eh-mist)]">{d.label}</div>
              <div className="truncate text-[var(--eh-fog)]">{d.email}</div>
            </button>
          ))}
        </div>
      </div>
    </Panel>
  );
}
