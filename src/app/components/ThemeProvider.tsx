"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  EH_THEME_STORAGE_KEY,
  getEhTokens,
  readStoredTheme,
  type EhPalette,
  type EhTheme,
} from "@/lib/ehTokens";

type ThemeContextValue = {
  theme: EhTheme;
  tokens: EhPalette;
  setTheme: (theme: EhTheme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: EhTheme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(EH_THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<EhTheme>("dark");

  useEffect(() => {
    setThemeState(readStoredTheme());
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((next: EhTheme) => {
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  const value = useMemo(
    () => ({
      theme,
      tokens: getEhTokens(theme),
      setTheme,
      toggleTheme,
    }),
    [theme, setTheme, toggleTheme]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}

/** 차트·맵 등 JS 렌더링용 팔레트 */
export function useEhTokens(): EhPalette {
  return useTheme().tokens;
}
