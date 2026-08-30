import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { readStore } from "@/lib/store";
import { AppShell } from "@/app/components/AppShell";
import { Panel } from "@/app/components/ui";
import { Collapsible } from "@/app/components/Collapsible";
import { format } from "date-fns";
import { getIngestLoginLogs } from "@/lib/ingest";
import { dbEnabled } from "@/lib/db";
import { adminNav } from "@/lib/nav";
import Link from "next/link";

export default async function AdminLogsPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");
  const store = await readStore();
  const loginLogs = dbEnabled() ? await getIngestLoginLogs(100) : null;

  return (
    <AppShell user={user} title="사용 로그" nav={adminNav} allowScroll>
      <p className="mb-4 text-sm text-[var(--eh-fog)]">
        <Link href="/admin" className="text-[var(--eh-signal)] hover:underline">
          대시보드로 돌아가기
        </Link>
      </p>
      {loginLogs && (
        <Panel className="mb-5">
          <Collapsible
            title="센서 로그인 로그 (ingest DB)"
            count={loginLogs.length}
          >
          <div className="eh-scroll overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs text-[var(--eh-fog)]">
                <tr className="border-b border-[var(--eh-line)]">
                  <th className="py-2">시각</th>
                  <th className="py-2">장비</th>
                  <th className="py-2">코드</th>
                  <th className="py-2">작업자</th>
                  <th className="py-2">성공</th>
                </tr>
              </thead>
              <tbody>
                {loginLogs.map((log) => (
                  <tr
                    key={String(log.id)}
                    className="border-b border-[var(--eh-line)]/50"
                  >
                    <td className="py-2.5 text-[var(--eh-fog)]">
                      {format(new Date(log.created_at as string), "yyyy-MM-dd HH:mm:ss")}
                    </td>
                    <td className="py-2.5">{String(log.device_id)}</td>
                    <td className="py-2.5">{String(log.worker_code)}</td>
                    <td className="py-2.5">
                      {String(log.worker_name || "-")}
                    </td>
                    <td className="py-2.5">
                      {Number(log.success) ? "OK" : "FAIL"}
                    </td>
                  </tr>
                ))}
                {!loginLogs.length && (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-6 text-center text-[var(--eh-fog)]"
                    >
                      로그인 로그 없음
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          </Collapsible>
        </Panel>
      )}

      <Panel>
        <Collapsible title="웹 사용 로그" count={store.usageLogs.length}>
        <div className="eh-scroll overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs text-[var(--eh-fog)]">
              <tr className="border-b border-[var(--eh-line)]">
                <th className="py-2">시각</th>
                <th className="py-2">사용자</th>
                <th className="py-2">액션</th>
                <th className="py-2">상세</th>
              </tr>
            </thead>
            <tbody>
              {store.usageLogs.map((log) => (
                <tr key={log.id} className="border-b border-[var(--eh-line)]/50">
                  <td className="py-2.5 text-[var(--eh-fog)]">
                    {format(new Date(log.at), "yyyy-MM-dd HH:mm:ss")}
                  </td>
                  <td className="py-2.5">{log.actorName}</td>
                  <td className="py-2.5">{log.action}</td>
                  <td className="py-2.5">{log.detail}</td>
                </tr>
              ))}
              {!store.usageLogs.length && (
                <tr>
                  <td
                    colSpan={4}
                    className="py-6 text-center text-[var(--eh-fog)]"
                  >
                    사용 로그 없음
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </Collapsible>
      </Panel>
    </AppShell>
  );
}
