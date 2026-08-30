"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { Radio, LogOut } from "lucide-react";
import type { SessionUser } from "@/lib/types";
import { roleLabel } from "@/lib/permissions";
import { Button } from "./ui";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "./ThemeToggle";
import { isNavActive, type NavItem } from "@/lib/nav";

export function AppShell({
  user,
  title,
  nav,
  children,
  breadcrumbs,
  /** 긴 목록·표 페이지는 내부 스크롤 허용 */
  allowScroll = false,
}: {
  user: SessionUser;
  title: string;
  nav: NavItem[];
  children: React.ReactNode;
  breadcrumbs?: { href?: string; label: string }[];
  allowScroll?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function onLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden eh-grid-bg">
      <header className="eh-header shrink-0 z-40">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-5 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="eh-neu-raised-sm flex h-10 w-10 items-center justify-center rounded-2xl text-[var(--eh-signal)]">
                <Radio size={18} />
              </span>
              <span className="eh-display text-lg font-semibold tracking-tight text-[var(--eh-mist)]">
                EventHorizon
              </span>
            </Link>
            <nav className="hidden items-center gap-1.5 md:flex">
              {nav.map((item) => {
                const active = isNavActive(pathname, item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx(
                      "rounded-2xl px-3.5 py-2 text-sm transition",
                      active
                        ? "eh-neu-active text-[var(--eh-mist)]"
                        : "text-[var(--eh-fog)] hover:text-[var(--eh-mist)]"
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <NotificationBell />
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium text-[var(--eh-mist)]">{user.name}</div>
              <div className="text-xs text-[var(--eh-fog)]">
                {roleLabel(user.role)}
              </div>
            </div>
            <Button variant="ghost" onClick={onLogout} aria-label="로그아웃">
              <LogOut size={16} />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1400px] min-h-0 flex-1 flex-col overflow-hidden px-6 py-5">
        <div className="mb-4 shrink-0 animate-rise">
          {breadcrumbs && breadcrumbs.length > 0 && (
            <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-[var(--eh-fog)]">
              {breadcrumbs.map((b, i) => (
                <span key={`${b.label}-${i}`} className="flex items-center gap-2">
                  {i > 0 && <span className="opacity-40">/</span>}
                  {b.href ? (
                    <Link href={b.href} className="hover:text-[var(--eh-mist)]">
                      {b.label}
                    </Link>
                  ) : (
                    <span className="text-[var(--eh-mist)]">{b.label}</span>
                  )}
                </span>
              ))}
            </div>
          )}
          <h1 className="eh-display text-2xl font-semibold text-[var(--eh-mist)] md:text-3xl">
            {title}
          </h1>
        </div>
        <div
          className={clsx(
            "animate-rise-delay min-h-0 flex-1",
            allowScroll
              ? "eh-scroll overflow-y-auto overscroll-contain p-0.5"
              : "min-h-0 overflow-visible p-0.5"
          )}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
