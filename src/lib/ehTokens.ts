/**
 * EventHorizon 디자인 토큰 — JS(차트·맵)용.
 * CSS 변수는 globals.css `[data-theme]` 와 값을 맞출 것.
 */
export type EhTheme = "dark" | "light";

export const EH_DARK = {
  ink: "#1a1e26",
  surface: "#1a1e26",
  surface2: "#222730",
  mist: "#e8edf4",
  fog: "#8b95a8",
  /** 다크 배경용 — 밝은 세이지 그린 (과하지 않게) */
  signal: "#94c4a8",
  signalMuted: "#6fa888",
  alert: "#f87171",
  ok: "#34d399",
  warn: "#fbbf24",
} as const;

export const EH_LIGHT = {
  ink: "#e8ecf0",
  surface: "#e8ecf0",
  surface2: "#dfe4ea",
  mist: "#1a2332",
  fog: "#64748b",
  signal: "#2d6a4f",
  signalMuted: "#245a42",
  alert: "#dc2626",
  ok: "#059669",
  warn: "#d97706",
} as const;

/** @deprecated 차트 등 — `useEhTokens()` 사용 권장 */
export const EH = EH_DARK;

export type EhPalette = typeof EH_DARK | typeof EH_LIGHT;

export function getEhTokens(theme: EhTheme): EhPalette {
  return theme === "light" ? EH_LIGHT : EH_DARK;
}

export const EH_THEME_STORAGE_KEY = "eh-theme";

export function readStoredTheme(): EhTheme {
  if (typeof window === "undefined") return "dark";
  try {
    const v = localStorage.getItem(EH_THEME_STORAGE_KEY);
    return v === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}
