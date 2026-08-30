import { redirect } from "next/navigation";
import { getSession, homePathFor } from "@/lib/auth";
import { LoginForm } from "../components/LoginForm";
import { Radio } from "lucide-react";

export default async function LoginPage() {
  const user = await getSession();
  if (user) redirect(homePathFor(user));

  return (
    <div className="relative min-h-screen eh-scroll overflow-y-auto eh-grid-bg">
      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col justify-center gap-10 px-5 py-16 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl animate-rise">
          <div className="eh-neu-inset mb-5 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs text-[var(--eh-fog)]">
            <Radio size={14} className="text-[var(--eh-signal)]" />
            Sensor command web
          </div>
          <h1 className="eh-display text-5xl font-bold leading-[1.05] text-[var(--eh-mist)] md:text-6xl">
            EventHorizon
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-[var(--eh-fog)]">
            모바일 센서 취득 · DB 적재 · 웹 관제. 임계값 이벤트는 MQTT로
            건설사·현장소장에게 즉시 전달됩니다.
          </p>
        </div>
        <div className="animate-rise-delay">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
