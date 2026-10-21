import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  ACCENTS,
  ACCENT_KEY,
  THEMES,
  THEME_KEY,
  applyAccent,
  applyTheme,
  readAccent,
  readTheme,
  type Accent,
  type Theme,
} from "./theme";

/*
 * Display preferences, kept per browser in localStorage. Every storage access is in
 * try/catch, so a browser with storage blocked still gets the defaults and a working
 * UI for the session. None of this goes to the server.
 */

export type Density = "comfortable" | "compact";
export const DENSITIES: readonly Density[] = ["comfortable", "compact"];
export const PAGE_SIZES: readonly number[] = [10, 20, 50, 100];

export const CURRENCY_KEY = "ui.currency";
export const DENSITY_KEY = "ui.density";
export const PAGE_SIZE_KEY = "ui.pageSize";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage blocked or full: the choice lasts for this page only
  }
}

/** Empty, or three letters (an ISO 4217 code such as PHP) in upper case. */
function readCurrency(): string {
  const value = read(CURRENCY_KEY)?.trim().toUpperCase() ?? "";
  return /^[A-Z]{3}$/.test(value) ? value : "";
}

function readDensity(): Density {
  const value = read(DENSITY_KEY);
  return DENSITIES.find((d) => d === value) ?? "comfortable";
}

function readPageSize(): number {
  const value = Number(read(PAGE_SIZE_KEY));
  return PAGE_SIZES.find((s) => s === value) ?? 20;
}

export interface Preferences {
  theme: Theme;
  accent: Accent;
  currency: string;
  density: Density;
  pageSize: number;
  setTheme: (theme: Theme) => void;
  setAccent: (accent: Accent) => void;
  setCurrency: (currency: string) => void;
  setDensity: (density: Density) => void;
  setPageSize: (pageSize: number) => void;
}

const PreferencesContext = createContext<Preferences | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readTheme);
  const [accent, setAccentState] = useState<Accent>(readAccent);
  const [currency, setCurrencyState] = useState(readCurrency);
  const [density, setDensityState] = useState<Density>(readDensity);
  const [pageSize, setPageSizeState] = useState(readPageSize);

  const setTheme = useCallback((value: Theme) => {
    if (!THEMES.includes(value)) return;
    setThemeState(value);
    applyTheme(value);
    write(THEME_KEY, value);
  }, []);

  const setAccent = useCallback((value: Accent) => {
    if (!ACCENTS.includes(value)) return;
    setAccentState(value);
    applyAccent(value);
    write(ACCENT_KEY, value);
  }, []);

  const setCurrency = useCallback((value: string) => {
    const code = value.trim().toUpperCase();
    if (code !== "" && !/^[A-Z]{3}$/.test(code)) return;
    setCurrencyState(code);
    write(CURRENCY_KEY, code);
  }, []);

  const setDensity = useCallback((value: Density) => {
    if (!DENSITIES.includes(value)) return;
    setDensityState(value);
    write(DENSITY_KEY, value);
  }, []);

  const setPageSize = useCallback((value: number) => {
    if (!PAGE_SIZES.includes(value)) return;
    setPageSizeState(value);
    write(PAGE_SIZE_KEY, String(value));
  }, []);

  const value = useMemo(
    () => ({
      theme,
      accent,
      currency,
      density,
      pageSize,
      setTheme,
      setAccent,
      setCurrency,
      setDensity,
      setPageSize,
    }),
    [theme, accent, currency, density, pageSize, setTheme, setAccent, setCurrency, setDensity, setPageSize],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): Preferences {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error("usePreferences must be used inside PreferencesProvider");
  return value;
}
