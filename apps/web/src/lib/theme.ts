export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "glactivity:theme";
const THEME_CHANGE_EVENT = "glactivity:theme-change";

/** Status-bar colours, matching --bg in globals.css. */
export const THEME_COLORS = { light: "#f5f3ee", dark: "#0b1026" } as const;

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

/**
 * Runs before first paint (inlined in <head>) so a manual Day/Night choice
 * never flashes the wrong theme. Kept dependency-free on purpose.
 */
export const themeBootScript = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;}catch(e){}})();`;

export function readThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

/** Applies a preference to the page and remembers it on this device. */
export function applyTheme(preference: ThemePreference) {
  const root = document.documentElement;
  if (preference === "system") delete root.dataset.theme;
  else root.dataset.theme = preference;

  // Keep the iOS status bar in step when the choice overrides the device.
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    const media = meta.dataset.media ?? meta.media;
    meta.dataset.media = media;
    if (preference === "system") {
      meta.media = media;
      meta.content = media.includes("dark") ? THEME_COLORS.dark : THEME_COLORS.light;
    } else {
      meta.media = "";
      meta.content = THEME_COLORS[preference];
    }
  });

  try {
    if (preference === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Private mode: the choice just won't persist.
  }
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

/** For useSyncExternalStore: fires when the choice changes here or in another tab. */
export function subscribeToTheme(onChange: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
