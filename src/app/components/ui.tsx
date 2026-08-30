"use client";

import clsx from "clsx";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  PropsWithChildren,
} from "react";

export function Panel({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <div className={clsx("eh-panel rounded-[26px] p-5", className)}>
      {children}
    </div>
  );
}

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "signal";
}) {
  const styles = {
    primary:
      "eh-neu-raised-sm eh-neu-press text-[var(--eh-mist)] hover:text-[var(--eh-mist)] disabled:opacity-45",
    ghost:
      "eh-neu-raised-sm eh-neu-press text-[var(--eh-fog)] hover:text-[var(--eh-mist)] disabled:opacity-45",
    danger:
      "eh-neu-raised-sm eh-neu-press text-[#fecaca] disabled:opacity-45",
    signal:
      "eh-neu-raised-sm eh-neu-press text-[var(--eh-signal)] disabled:opacity-45",
  };
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium transition",
        styles[variant],
        className
      )}
      {...props}
    />
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        "eh-neu-inset eh-focus-signal w-full rounded-2xl px-3.5 py-2.5 text-sm text-[var(--eh-mist)] outline-none placeholder:text-[var(--eh-fog)]",
        className
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={clsx(
        "eh-neu-inset eh-focus-signal w-full rounded-2xl px-3.5 py-2.5 text-sm text-[var(--eh-mist)] outline-none",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: PropsWithChildren<{ tone?: "ok" | "warn" | "crit" | "neutral" | "off" }>) {
  const map = {
    ok: "text-[var(--eh-ok)] eh-neu-inset",
    warn: "text-[var(--eh-warn)] eh-neu-inset",
    crit: "text-[var(--eh-alert)] eh-neu-inset",
    off: "text-[var(--eh-fog)] eh-neu-inset",
    neutral: "text-[var(--eh-mist)] eh-neu-inset",
  };
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-xl px-2.5 py-1 text-xs font-medium",
        map[tone]
      )}
    >
      {children}
    </span>
  );
}

export function StatusDot({
  status,
}: {
  status: "ok" | "warning" | "critical" | "offline" | "inactive";
}) {
  const color = {
    ok: "bg-[var(--eh-ok)]",
    warning: "bg-[var(--eh-warn)]",
    critical: "bg-[var(--eh-alert)]",
    offline: "bg-[var(--eh-fog)]",
    inactive: "bg-white/20",
  }[status];
  return (
    <span className="relative inline-flex h-2.5 w-2.5">
      {(status === "warning" || status === "critical") && (
        <span
          className={clsx(
            "pulse-dot absolute inset-0 rounded-full opacity-60",
            color
          )}
        />
      )}
      <span className={clsx("relative h-2.5 w-2.5 rounded-full", color)} />
    </span>
  );
}
