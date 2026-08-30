"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useEhTokens } from "@/app/components/ThemeProvider";
import { Panel } from "./ui";

function buildNeu(tokens: ReturnType<typeof useEhTokens>) {
  return {
    surface: tokens.surface,
    mist: tokens.mist,
    fog: tokens.fog,
    signal: tokens.signal,
    signalMuted: tokens.signalMuted,
    ok: "#3dba8c",
    warn: "#c9a045",
    alert: "#c87878",
    offline: "#6e788c",
  };
}

function hashSeed(label: string) {
  let h = 0;
  for (let i = 0; i < label.length; i++) {
    h = (h * 31 + label.charCodeAt(i)) % 997;
  }
  return h;
}

const tipStyle: React.CSSProperties = {
  background: "var(--eh-surface)",
  border: "none",
  borderRadius: 14,
  color: "var(--eh-mist)",
  boxShadow: "var(--eh-neu-raised-sm)",
  zIndex: 40,
  padding: "8px 12px",
  fontSize: 12,
};

const CHART_ANIM = {
  isAnimationActive: true,
  animationDuration: 750,
  animationEasing: "ease-out" as const,
};

/** 6.5rem — 도넛 SVG를 컨테이너와 1:1로 맞춤 */
const DONUT_SIZE = 104;

/** 막대 차트 호버 — 딱딱한 사각형 대신 가장자리 블러 */
function SoftBarCursor({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  filterId,
}: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  filterId: string;
}) {
  if (width <= 0 || height <= 0) return null;
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      rx={10}
      fill="rgba(232, 237, 244, 0.16)"
      stroke="none"
      filter={`url(#${filterId})`}
      style={{ pointerEvents: "none" }}
    />
  );
}

export function CompanyStatsPanel({
  scopeLabel,
  animateKey = "in",
}: {
  scopeLabel: string;
  /** 현황→통계 전환 시 remount로 차트 애니메이션 재실행 */
  animateKey?: string;
}) {
  const tokens = useEhTokens();
  const NEU = useMemo(() => buildNeu(tokens), [tokens]);
  const PIE_COLORS = [NEU.ok, NEU.warn, NEU.alert, NEU.offline];
  const AXIS_TICK = { fill: NEU.fog, fontSize: 10 };
  const AXIS_TICK_SM = { fill: NEU.fog, fontSize: 9 };

  const seed = hashSeed(scopeLabel);
  const [barsReady, setBarsReady] = useState(false);
  const gid = `neu-${animateKey}`;

  useEffect(() => {
    setBarsReady(false);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setBarsReady(true));
    });
    return () => cancelAnimationFrame(id);
  }, [animateKey]);

  const weekly = useMemo(() => {
    const days = ["월", "화", "수", "목", "금", "토", "일"];
    return days.map((d, i) => ({
      day: d,
      alerts: 4 + ((seed + i * 17) % 14),
      online: 78 + ((seed + i * 11) % 18),
    }));
  }, [seed]);

  const healthShare = useMemo(
    () => [
      { name: "정상", value: 42 + (seed % 20) },
      { name: "주의", value: 8 + (seed % 7) },
      { name: "위험", value: 2 + (seed % 4) },
      { name: "오프라인", value: 5 + (seed % 6) },
    ],
    [seed]
  );

  const batteryTrend = useMemo(() => {
    // 사용(방전) → 충전: 완만한 우하향 후 우상향
    const start = 88 - (seed % 6);
    const dischargePerHour = 3.4 + (seed % 4) * 0.15;
    const chargeStart = 7; // 8시부터 충전
    const trough = start - chargeStart * dischargePerHour;
    const chargePerHour = 5.2 + (seed % 3) * 0.2;

    return Array.from({ length: 12 }, (_, i) => {
      const avg =
        i < chargeStart
          ? start - i * dischargePerHour
          : trough + (i - chargeStart) * chargePerHour;
      return {
        t: `${i + 1}시`,
        avg: Math.round(Math.min(97, Math.max(38, avg))),
      };
    });
  }, [seed]);

  const commandLatency = useMemo(
    () => [
      { name: "가동", ms: 1.2 + (seed % 10) / 10 },
      { name: "모드", ms: 1.8 + (seed % 8) / 10 },
      { name: "임계", ms: 2.1 + (seed % 12) / 10 },
      { name: "원점", ms: 1.5 + (seed % 7) / 10 },
      { name: "Hold", ms: 0.9 + (seed % 6) / 10 },
    ],
    [seed]
  );

  const utilRows = useMemo(
    () =>
      [
        { name: "역삼 업무복합", pct: 92 },
        { name: "판교 알파돔", pct: 88 },
        { name: "마곡 오피스", pct: 96 },
        { name: "여의도 지하차도", pct: 71 },
      ].map((row, i) => ({
        ...row,
        pct: Math.min(98, Math.max(35, row.pct - (seed % 5) + (i % 3))),
      })),
    [seed]
  );

  const totalHealth = healthShare.reduce((a, b) => a + b.value, 0);

  return (
    <div
      key={animateKey}
      className="eh-stagger flex h-full min-h-0 flex-col gap-2.5"
    >
      <Panel className="flex min-h-0 flex-[1.15] flex-col !p-3">
        <div className="mb-1.5 shrink-0">
          <div className="text-base text-[var(--eh-mist)]">주간 알림 추이</div>
          <p className="text-[11px] text-[var(--eh-fog)]">임계 이벤트 · 더미</p>
        </div>
        <div className="min-h-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={weekly}
              margin={{ top: 6, right: 6, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient
                  id={`${gid}-alert-fill`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor={NEU.signalMuted}
                    stopOpacity={0.28}
                  />
                  <stop
                    offset="100%"
                    stopColor={NEU.signalMuted}
                    stopOpacity={0}
                  />
                </linearGradient>
                <filter
                  id={`${gid}-line-glow`}
                  x="-40%"
                  y="-40%"
                  width="180%"
                  height="180%"
                >
                  <feDropShadow
                    dx="0"
                    dy="1"
                    stdDeviation="2.5"
                    floodColor={NEU.signal}
                    floodOpacity="0.28"
                  />
                </filter>
              </defs>
              <XAxis
                dataKey="day"
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                width={26}
              />
              <Tooltip contentStyle={tipStyle} wrapperStyle={{ zIndex: 40 }} />
              <Area
                type="monotone"
                dataKey="alerts"
                name="알림"
                stroke={NEU.signalMuted}
                fill={`url(#${gid}-alert-fill)`}
                strokeWidth={1.75}
                filter={`url(#${gid}-line-glow)`}
                {...CHART_ANIM}
                animationBegin={40}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="grid shrink-0 gap-2 sm:grid-cols-2">
        <Panel className="!p-3">
          <div className="mb-0.5 text-base text-[var(--eh-mist)]">상태 비중</div>
          <p className="mb-1.5 text-[11px] text-[var(--eh-fog)]">
            헬스 분포 · 더미
          </p>
          <div className="flex items-center gap-3">
            <div
              className="relative shrink-0 overflow-hidden"
              style={{ width: DONUT_SIZE, height: DONUT_SIZE }}
            >
              <div
                className="eh-neu-inset pointer-events-none absolute left-1/2 top-1/2 z-0 h-[2.5rem] w-[2.5rem] -translate-x-1/2 -translate-y-1/2 rounded-full"
                aria-hidden
              />
              <div className="pointer-events-none absolute inset-0 z-[1] flex flex-col items-center justify-center">
                <div className="eh-display text-lg leading-none text-[var(--eh-mist)]">
                  {totalHealth}
                </div>
                <div className="mt-0.5 text-[10px] leading-none text-[var(--eh-fog)]">
                  대
                </div>
              </div>
              {/* margin 기본 5px + 숫자 cx/cy 가 오프셋에 더해져 우하단으로 밀리던 문제 → margin 0 · 50% */}
              <div className="absolute inset-0 z-[2]">
                <PieChart
                  width={DONUT_SIZE}
                  height={DONUT_SIZE}
                  margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                >
                  <Pie
                    data={healthShare}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={28}
                    outerRadius={44}
                    paddingAngle={3}
                    stroke="none"
                    {...CHART_ANIM}
                    animationBegin={80}
                  >
                    {healthShare.map((entry, i) => (
                      <Cell
                        key={entry.name}
                        fill={PIE_COLORS[i % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tipStyle}
                    wrapperStyle={{ zIndex: 50, outline: "none" }}
                    allowEscapeViewBox={{ x: true, y: true }}
                  />
                </PieChart>
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-1.5 text-[11px] text-[var(--eh-fog)]">
              {healthShare.map((item, i) => (
                <div key={item.name} className="flex items-center gap-2">
                  <span
                    className="eh-neu-raised-sm h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: PIE_COLORS[i] }}
                  />
                  <span className="truncate text-[var(--eh-mist)]">
                    {item.name}
                  </span>
                  <span className="ml-auto shrink-0 tabular-nums">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel className="flex flex-col !p-3">
          <div className="mb-0.5 text-base text-[var(--eh-mist)]">평균 배터리</div>
          <p className="mb-1 text-[11px] text-[var(--eh-fog)]">시간대별 · 더미</p>
          <div className="min-h-[7.25rem] flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={batteryTrend}
                margin={{ top: 4, right: 2, left: -24, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id={`${gid}-bat-fill`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={NEU.warn} stopOpacity={0.26} />
                    <stop offset="100%" stopColor={NEU.warn} stopOpacity={0} />
                  </linearGradient>
                  <filter
                    id={`${gid}-bat-glow`}
                    x="-40%"
                    y="-40%"
                    width="180%"
                    height="180%"
                  >
                    <feDropShadow
                      dx="0"
                      dy="1"
                      stdDeviation="2.5"
                      floodColor={NEU.warn}
                      floodOpacity="0.22"
                    />
                  </filter>
                </defs>
                <XAxis
                  dataKey="t"
                  tick={AXIS_TICK_SM}
                  axisLine={false}
                  tickLine={false}
                  interval={2}
                />
                <YAxis
                  domain={[40, 100]}
                  tick={AXIS_TICK_SM}
                  axisLine={false}
                  tickLine={false}
                  width={26}
                />
                <Tooltip contentStyle={tipStyle} wrapperStyle={{ zIndex: 40 }} />
                <Area
                  type="monotone"
                  dataKey="avg"
                  name="%"
                  stroke={NEU.warn}
                  fill={`url(#${gid}-bat-fill)`}
                  strokeWidth={1.75}
                  filter={`url(#${gid}-bat-glow)`}
                  {...CHART_ANIM}
                  animationBegin={120}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="grid min-h-0 flex-1 gap-2 pb-1.5 pr-1 sm:grid-cols-2">
        <Panel className="flex min-h-0 flex-col !p-3">
          <div className="mb-0.5 shrink-0 text-base text-[var(--eh-mist)]">현장별 가동률</div>
          <p className="mb-2 shrink-0 text-[11px] text-[var(--eh-fog)]">
            온라인 비율 · 더미
          </p>
          <div className="flex min-h-0 flex-1 flex-col justify-center gap-3.5 pb-0.5">
            {utilRows.map((row, i) => {
              const pct = barsReady ? row.pct : 0;
              const delay = `${160 + i * 70}ms`;
              return (
                <div key={row.name}>
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px]">
                    <span className="truncate text-[var(--eh-mist)]">
                      {row.name}
                    </span>
                    <span className="shrink-0 tabular-nums text-[var(--eh-fog)]">
                      {row.pct}%
                    </span>
                  </div>
                  {/* 뉴모 슬라이더형 게이지: raised 프레임 · inset 채널 · tick fill · thumb */}
                  <div className="relative flex h-7 items-center">
                    <div
                      className="relative h-3.5 w-full rounded-full"
                      style={{
                        background: "var(--eh-surface)",
                        boxShadow: "var(--eh-neu-raised-sm)",
                      }}
                    >
                      <div
                        className="absolute inset-[3px] overflow-hidden rounded-full"
                        style={{
                          background: "var(--eh-surface)",
                          boxShadow: "var(--eh-neu-inset)",
                        }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            backgroundImage: `linear-gradient(
                              90deg,
                              ${NEU.signal} 0,
                              ${NEU.signal} calc(100% - 1px),
                              rgba(8, 10, 14, 0.32) calc(100% - 1px),
                              rgba(8, 10, 14, 0.32) 100%
                            )`,
                            backgroundSize: "9px 100%",
                            backgroundRepeat: "repeat-x",
                            transition: `width 0.7s cubic-bezier(0.22, 1, 0.36, 1) ${delay}`,
                          }}
                        />
                      </div>
                    </div>
                    <div
                      className="pointer-events-none absolute top-1/2 z-10 h-5 w-5 rounded-full"
                      style={{
                        left: `${pct}%`,
                        background: "var(--eh-gauge-thumb)",
                        boxShadow:
                          "4px 4px 10px rgba(8,10,14,0.55), -2px -2px 6px rgba(255,255,255,0.12)",
                        transform: "translate(-50%, -50%)",
                        transition: `left 0.7s cubic-bezier(0.22, 1, 0.36, 1) ${delay}`,
                      }}
                      aria-hidden
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel className="flex min-h-0 flex-col !p-3">
          <div className="mb-0.5 shrink-0 text-base text-[var(--eh-mist)]">명령 응답 지연</div>
          <p className="mb-1 shrink-0 text-[11px] text-[var(--eh-fog)]">
            평균 응답(초) · 더미
          </p>
          <div className="eh-neu-inset min-h-0 flex-1 overflow-hidden rounded-[18px] p-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={commandLatency}
                margin={{ top: 8, right: 8, left: -20, bottom: 4 }}
              >
                <defs>
                  <linearGradient
                    id={`${gid}-bar-fill`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={NEU.signal} stopOpacity={0.95} />
                    <stop
                      offset="100%"
                      stopColor={NEU.signalMuted}
                      stopOpacity={0.55}
                    />
                  </linearGradient>
                  <linearGradient
                    id={`${gid}-bar-active`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={NEU.signal} stopOpacity={1} />
                    <stop
                      offset="100%"
                      stopColor={NEU.signalMuted}
                      stopOpacity={0.7}
                    />
                  </linearGradient>
                  <filter
                    id={`${gid}-bar-glow`}
                    x="-50%"
                    y="-20%"
                    width="200%"
                    height="140%"
                  >
                    <feDropShadow
                      dx="0"
                      dy="0"
                      stdDeviation="4"
                      floodColor={NEU.signal}
                      floodOpacity="0.22"
                    />
                  </filter>
                  <filter
                    id={`${gid}-cursor-soft`}
                    x="-40%"
                    y="-10%"
                    width="180%"
                    height="120%"
                  >
                    <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" />
                  </filter>
                </defs>
                <XAxis
                  dataKey="name"
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={AXIS_TICK_SM}
                  axisLine={false}
                  tickLine={false}
                  width={26}
                />
                <Tooltip
                  contentStyle={tipStyle}
                  wrapperStyle={{ zIndex: 40 }}
                  cursor={
                    <SoftBarCursor filterId={`${gid}-cursor-soft`} />
                  }
                />
                <Bar
                  dataKey="ms"
                  name="초"
                  radius={[8, 8, 4, 4]}
                  fill={`url(#${gid}-bar-fill)`}
                  stroke="none"
                  activeBar={{
                    fill: `url(#${gid}-bar-active)`,
                    stroke: "none",
                    filter: `url(#${gid}-bar-glow)`,
                  }}
                  {...CHART_ANIM}
                  animationBegin={160}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
    </div>
  );
}
