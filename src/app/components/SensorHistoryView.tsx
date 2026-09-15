"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useEhTokens } from "@/app/components/ThemeProvider";
import { format, formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { Button } from "./ui";
import { Collapsible } from "./Collapsible";
import { List, LineChart as LineChartIcon } from "lucide-react";
import { formatTiltDeg, tiltMagnitude, TILT_UI } from "@/lib/tilt";

export type HistoryPoint = {
  id: string;
  ts: number;
  x: number;
  y: number;
  z: number;
  batteryPercent: number;
  temperatureC: number | null;
};

export type UnlockMarker = {
  id: string;
  ts: number;
  workerCode: string;
  workerName: string | null;
  success: boolean;
};

export function SensorHistoryView({
  history,
  unlockEvents = [],
  showUnlockMarkers = false,
}: {
  history: HistoryPoint[];
  unlockEvents?: UnlockMarker[];
  /** admin 전용: 잠금해제 시점 마커 */
  showUnlockMarkers?: boolean;
}) {
  const [mode, setMode] = useState<"list" | "chart">("list");
  const { signal } = useEhTokens();

  const chartData = useMemo(() => {
    return [...history]
      .sort((a, b) => a.ts - b.ts)
      .map((h) => ({
        ts: h.ts,
        label: format(h.ts, "MM-dd HH:mm", { locale: ko }),
        x: Number(h.x.toFixed(3)),
        y: Number(h.y.toFixed(3)),
        z: Number(h.z.toFixed(3)),
        mag: Number(tiltMagnitude(h.x, h.y, h.z).toFixed(3)),
        battery: h.batteryPercent >= 0 ? h.batteryPercent : null,
        temp: h.temperatureC != null ? Number(h.temperatureC.toFixed(2)) : null,
      }));
  }, [history]);

  const xDomain = useMemo<[number, number] | ["dataMin", "dataMax"]>(() => {
    if (!chartData.length && !unlockEvents.length) return ["dataMin", "dataMax"];
    const times = [
      ...chartData.map((d) => d.ts),
      ...(showUnlockMarkers ? unlockEvents.map((e) => e.ts) : []),
    ];
    if (!times.length) return ["dataMin", "dataMax"];
    const min = Math.min(...times);
    const max = Math.max(...times);
    const pad = Math.max((max - min) * 0.05, 60_000);
    return [min - pad, max + pad];
  }, [chartData, unlockEvents, showUnlockMarkers]);

  const visibleUnlocks = useMemo(() => {
    if (!showUnlockMarkers || !unlockEvents.length) return [];
    if (xDomain[0] === "dataMin") return [...unlockEvents].sort((a, b) => a.ts - b.ts);
    const [min, max] = xDomain as [number, number];
    return unlockEvents
      .filter((e) => e.ts >= min && e.ts <= max)
      .sort((a, b) => a.ts - b.ts);
  }, [showUnlockMarkers, unlockEvents, xDomain]);

  const unlockLabel = (e: UnlockMarker) => {
    const name = e.workerName ? ` · ${e.workerName}` : "";
    const fail = e.success ? "" : " (실패)";
    return `${e.workerCode}${name}${fail}`;
  };

  return (
    <div className="space-y-3">
      <Collapsible
        title="센서 수신 이력"
        count={history.length}
        right={
          <div className="flex gap-2">
            <Button
              type="button"
              variant={mode === "list" ? "primary" : "ghost"}
              className="!px-3 !py-1.5 text-xs"
              onClick={() => setMode("list")}
            >
              <List size={14} />
              리스트
            </Button>
            <Button
              type="button"
              variant={mode === "chart" ? "primary" : "ghost"}
              className="!px-3 !py-1.5 text-xs"
              onClick={() => setMode("chart")}
            >
              <LineChartIcon size={14} />
              차트
            </Button>
          </div>
        }
      >
      {mode === "list" ? (
        <div className="eh-scroll overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs text-[var(--eh-fog)]">
              <tr className="border-b border-[var(--eh-line)]">
                <th className="py-2">수신</th>
                <th className="py-2">X (°)</th>
                <th className="py-2">Y (°)</th>
                <th className="py-2">Z (°)</th>
                <th className="py-2">합성</th>
                <th className="py-2">배터리</th>
                <th className="py-2">온도</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-b border-[var(--eh-line)]/50">
                  <td className="py-2 text-[var(--eh-fog)]">
                    {formatDistanceToNow(h.ts, {
                      addSuffix: true,
                      locale: ko,
                    })}
                  </td>
                  <td className="py-2">{formatTiltDeg(h.x)}</td>
                  <td className="py-2">{formatTiltDeg(h.y)}</td>
                  <td className="py-2">{formatTiltDeg(h.z)}</td>
                  <td className="py-2">
                    {formatTiltDeg(tiltMagnitude(h.x, h.y, h.z))}
                  </td>
                  <td className="py-2">{h.batteryPercent}%</td>
                  <td className="py-2">
                    {h.temperatureC != null
                      ? `${h.temperatureC.toFixed(1)}°C`
                      : "-"}
                  </td>
                </tr>
              ))}
              {!history.length && (
                <tr>
                  <td
                    colSpan={7}
                    className="py-8 text-center text-[var(--eh-fog)]"
                  >
                    이력이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-5">
          {showUnlockMarkers && (
            <div className="rounded-xl border border-[rgba(227,93,59,0.35)] bg-[rgba(227,93,59,0.08)] px-3 py-2 text-xs text-[#f2a08d]">
              빨간 점선 = 폰 잠금해제 시점 · 네임택은 입력 코드
              {visibleUnlocks.length
                ? ` (차트 구간 ${visibleUnlocks.length}건)`
                : unlockEvents.length
                  ? " (현재 센서 이력 구간 밖)"
                  : " (이력 없음)"}
            </div>
          )}

          <ChartBlock title={TILT_UI.chartTitle}>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart
                data={chartData}
                margin={{ top: 28, right: 12, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  stroke="rgba(215,224,234,0.12)"
                  strokeDasharray="3 3"
                />
                <XAxis
                  dataKey="ts"
                  type="number"
                  domain={xDomain}
                  allowDataOverflow
                  tickFormatter={(v) =>
                    format(Number(v), "MM-dd HH:mm", { locale: ko })
                  }
                  tick={{ fill: "#8fa3b8", fontSize: 11 }}
                  minTickGap={28}
                />
                <YAxis tick={{ fill: "#8fa3b8", fontSize: 11 }} width={42} />
                <Tooltip
                  labelFormatter={(v) =>
                    format(Number(v), "yyyy-MM-dd HH:mm:ss", { locale: ko })
                  }
                  contentStyle={{
                    background: "#171a21",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 14,
                    color: "#e8edf4",
                    boxShadow: "8px 8px 18px #12151b, -6px -6px 14px #262b36",
                  }}
                />
                <Legend wrapperStyle={{ color: "#e8edf4", fontSize: 12 }} />
                {visibleUnlocks.map((e) => (
                  <ReferenceLine
                    key={`acc-${e.id}`}
                    x={e.ts}
                    stroke={e.success ? "#f87171" : "#fbbf24"}
                    strokeDasharray="4 3"
                    strokeWidth={1.5}
                    label={{
                      value: unlockLabel(e),
                      position: "insideTopLeft",
                      fill: e.success ? "#f87171" : "#fbbf24",
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  />
                ))}
                <Line
                  type="monotone"
                  dataKey="x"
                  name="X"
                  stroke={signal}
                  dot={false}
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="y"
                  name="Y"
                  stroke="#34d399"
                  dot={false}
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="z"
                  name="Z"
                  stroke="#fbbf24"
                  dot={false}
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="mag"
                  name={TILT_UI.magName}
                  stroke="#f87171"
                  dot={false}
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartBlock>

          <ChartBlock title="배터리 · 온도">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart
                data={chartData}
                margin={{ top: 28, right: 12, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  stroke="rgba(215,224,234,0.12)"
                  strokeDasharray="3 3"
                />
                <XAxis
                  dataKey="ts"
                  type="number"
                  domain={xDomain}
                  allowDataOverflow
                  tickFormatter={(v) =>
                    format(Number(v), "MM-dd HH:mm", { locale: ko })
                  }
                  tick={{ fill: "#8fa3b8", fontSize: 11 }}
                  minTickGap={28}
                />
                <YAxis
                  yAxisId="bat"
                  tick={{ fill: "#8fa3b8", fontSize: 11 }}
                  width={42}
                  domain={[0, 100]}
                />
                <YAxis
                  yAxisId="temp"
                  orientation="right"
                  tick={{ fill: "#8fa3b8", fontSize: 11 }}
                  width={42}
                />
                <Tooltip
                  labelFormatter={(v) =>
                    format(Number(v), "yyyy-MM-dd HH:mm:ss", { locale: ko })
                  }
                  contentStyle={{
                    background: "#171a21",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 14,
                    color: "#e8edf4",
                    boxShadow: "8px 8px 18px #12151b, -6px -6px 14px #262b36",
                  }}
                />
                <Legend wrapperStyle={{ color: "#e8edf4", fontSize: 12 }} />
                {visibleUnlocks.map((e) => (
                  <ReferenceLine
                    key={`bat-${e.id}`}
                    yAxisId="bat"
                    x={e.ts}
                    stroke={e.success ? "#f87171" : "#fbbf24"}
                    strokeDasharray="4 3"
                    strokeWidth={1.5}
                    label={{
                      value: unlockLabel(e),
                      position: "insideTopLeft",
                      fill: e.success ? "#f87171" : "#fbbf24",
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  />
                ))}
                <Line
                  yAxisId="bat"
                  type="monotone"
                  dataKey="battery"
                  name="배터리 %"
                  stroke="#fbbf24"
                  dot={false}
                  strokeWidth={2}
                  connectNulls
                />
                <Line
                  yAxisId="temp"
                  type="monotone"
                  dataKey="temp"
                  name="온도 °C"
                  stroke={signal}
                  dot={false}
                  strokeWidth={2}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartBlock>

          {!chartData.length && (
            <div className="py-10 text-center text-sm text-[var(--eh-fog)]">
              차트에 표시할 이력이 없습니다.
            </div>
          )}
        </div>
      )}
      </Collapsible>

      {showUnlockMarkers && (
        <Collapsible
          title="폰 잠금해제 이력 (인가 감시)"
          count={unlockEvents.length}
          defaultOpen={false}
        >
          <div className="eh-scroll overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs text-[var(--eh-fog)]">
                <tr className="border-b border-[var(--eh-line)]">
                  <th className="py-2">시각</th>
                  <th className="py-2">코드</th>
                  <th className="py-2">작업자</th>
                  <th className="py-2">결과</th>
                </tr>
              </thead>
              <tbody>
                {unlockEvents.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b border-[var(--eh-line)]/50"
                  >
                    <td className="py-2 text-[var(--eh-fog)]">
                      {format(e.ts, "yyyy-MM-dd HH:mm:ss", { locale: ko })}
                    </td>
                    <td className="py-2 font-medium text-[var(--eh-signal)]">
                      {e.workerCode}
                    </td>
                    <td className="py-2">{e.workerName || "-"}</td>
                    <td className="py-2">{e.success ? "성공" : "실패"}</td>
                  </tr>
                ))}
                {!unlockEvents.length && (
                  <tr>
                    <td
                      colSpan={4}
                      className="py-8 text-center text-[var(--eh-fog)]"
                    >
                      잠금해제 이력이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Collapsible>
      )}
    </div>
  );
}

function ChartBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="eh-neu-inset rounded-2xl p-3">
      <div className="mb-2 text-sm text-[var(--eh-mist)]">{title}</div>
      {children}
    </div>
  );
}
