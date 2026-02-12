export type ThemeMode = "light" | "dark";

const THEME_STORAGE_KEY = "ibadahmu:theme-mode";

const listeners = new Set<() => void>();
let themeMode: ThemeMode = "light";

const notify = () => {
  listeners.forEach((listener) => listener());
};

const applyThemeToDocument = (mode: ThemeMode) => {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", mode);
  document.documentElement.style.colorScheme = mode;
};

const parseStoredTheme = (value: unknown): ThemeMode | null => {
  return value === "dark" || value === "light" ? value : null;
};

export const initThemeMode = () => {
  if (typeof window === "undefined") return;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    const parsed = parseStoredTheme(stored);
    themeMode = parsed ?? "light";
  } catch {
    themeMode = "light";
  }
  applyThemeToDocument(themeMode);
};

export const getThemeMode = () => themeMode;

export const subscribeThemeMode = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const setThemeMode = (mode: ThemeMode) => {
  themeMode = mode;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      // ignore
    }
  }
  applyThemeToDocument(mode);
  notify();
};

export const toggleThemeMode = () => {
  setThemeMode(themeMode === "light" ? "dark" : "light");
};
