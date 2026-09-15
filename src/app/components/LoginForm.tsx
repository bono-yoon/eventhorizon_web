"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [suspended, setSuspended] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuspended(false);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      if (data.code === "ACCOUNT_SUSPENDED") {
        setSuspended(true);
        return;
      }
      setError(data.error || "로그인 실패");
      return;
    }
    router.push(data.redirect || "/");
    router.refresh();
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--eh-ink)]">
      <div className="pointer-events-none absolute inset-0">
        <div
          className="eh-login-orb eh-login-orb-a h-[82vw] max-h-[720px] w-[82vw] max-w-[720px] -left-[12%] -top-[8%]"
          style={{
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--eh-signal) 16%, transparent) 0%, transparent 70%)",
          }}
        />
        <div
          className="eh-login-orb eh-login-orb-b h-[72vw] max-h-[640px] w-[72vw] max-w-[640px] right-[-18%] top-[12%]"
          style={{
            background:
              "radial-gradient(circle, rgba(58, 74, 104, 0.55) 0%, transparent 70%)",
          }}
        />
        <div
          className="eh-login-orb eh-login-orb-c h-[70vw] max-h-[620px] w-[70vw] max-w-[620px] bottom-[-18%] left-[6%]"
          style={{
            background:
              "radial-gradient(circle, rgba(90, 115, 148, 0.14) 0%, transparent 70%)",
          }}
        />
      </div>

      <div className="absolute right-5 top-5 z-20">
        <ThemeToggle />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[460px] flex-col justify-center px-5 py-16">
        <h1 className="eh-display eh-login-shimmer text-[32px] font-bold leading-none tracking-tight">
          EventHorizon
        </h1>

        <form
          onSubmit={onSubmit}
          className="mt-6 flex min-h-[420px] w-full flex-col rounded-[22px] border border-[color-mix(in_srgb,var(--eh-mist)_8%,transparent)] bg-[var(--eh-surface-2)] px-8 py-10 shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
        >
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            placeholder="이메일"
            aria-label="이메일"
            required
            className="h-[56px] w-full rounded-2xl border border-[color-mix(in_srgb,var(--eh-mist)_14%,transparent)] bg-[var(--eh-ink)] px-4 text-base text-[var(--eh-mist)] caret-[var(--eh-signal)] outline-none placeholder:text-[var(--eh-fog)] focus:border-[var(--eh-signal)]"
          />
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="비밀번호"
            aria-label="비밀번호"
            required
            className="mt-4 h-[56px] w-full rounded-2xl border border-[color-mix(in_srgb,var(--eh-mist)_14%,transparent)] bg-[var(--eh-ink)] px-4 text-base text-[var(--eh-mist)] caret-[var(--eh-signal)] outline-none placeholder:text-[var(--eh-fog)] focus:border-[var(--eh-signal)]"
          />

          <label className="mt-5 flex cursor-pointer items-center gap-2 text-sm text-[var(--eh-fog)]">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--eh-signal)]"
              tabIndex={0}
            />
            아이디 저장
          </label>

          {error && <p className="mt-3 text-[13px] text-[var(--eh-alert)]">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="eh-neu-raised-sm eh-neu-press mt-6 h-[56px] w-full rounded-2xl text-base font-medium text-[var(--eh-mist)] disabled:opacity-45"
          >
            {loading ? "접속 중…" : "로그인"}
          </button>

          <div className="mt-auto flex items-center justify-center gap-3 pt-8 text-sm text-[var(--eh-fog)]">
            <button type="button" className="hover:text-[var(--eh-mist)]">
              아이디 찾기
            </button>
            <span className="text-[var(--eh-fog)]/50">|</span>
            <button type="button" className="hover:text-[var(--eh-mist)]">
              비밀번호 찾기
            </button>
            <span className="text-[var(--eh-fog)]/50">|</span>
            <button type="button" className="hover:text-[var(--eh-mist)]">
              회원가입
            </button>
          </div>
        </form>
      </div>

      {suspended && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-5">
          <div className="w-full max-w-sm rounded-[22px] border border-[color-mix(in_srgb,var(--eh-mist)_12%,transparent)] bg-[var(--eh-surface-2)] p-6 shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
            <div className="text-lg text-[var(--eh-mist)]">계정이 정지되었습니다</div>
            <p className="mt-2 text-sm leading-6 text-[var(--eh-fog)]">
              로그인이 제한된 계정입니다. 관리자에게 문의해 주세요.
            </p>
            <button
              type="button"
              className="eh-neu-raised-sm eh-neu-press mt-5 h-11 w-full rounded-2xl text-sm font-medium text-[var(--eh-mist)]"
              onClick={() => setSuspended(false)}
            >
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
