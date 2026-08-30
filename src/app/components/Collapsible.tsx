"use client";

import { useState } from "react";
import clsx from "clsx";
import { ChevronDown } from "lucide-react";

export function Collapsible({
  title,
  count,
  countLabel = "건",
  defaultOpen = true,
  right,
  className,
  children,
}: {
  title: string;
  /** 제목 옆에 표시할 건수 */
  count?: number;
  countLabel?: string;
  defaultOpen?: boolean;
  /** 헤더 우측 영역 — 토글 버튼 밖에 놓여 별도로 클릭된다. */
  right?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={clsx("eh-neu-raised-sm rounded-2xl", className)}>
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left text-sm text-[var(--eh-mist)] transition hover:text-[var(--eh-signal)]"
        >
          <ChevronDown
            size={15}
            className={clsx(
              "shrink-0 text-[var(--eh-fog)] transition-transform",
              !open && "-rotate-90"
            )}
          />
          <span className="truncate">{title}</span>
          {count != null && (
            <span className="shrink-0 text-xs text-[var(--eh-fog)]">
              {count}
              {countLabel}
            </span>
          )}
        </button>
        {right && <div className="shrink-0">{right}</div>}
      </div>
      {open && (
        <div className="border-t border-[var(--eh-line)] px-3 py-3">
          {children}
        </div>
      )}
    </section>
  );
}
