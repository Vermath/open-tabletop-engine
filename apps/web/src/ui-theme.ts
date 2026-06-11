export type UiTheme = "midnight" | "ember";

export const uiThemeStorageKey = "otte:uiTheme";

const uiThemes: readonly UiTheme[] = ["midnight", "ember"];

export function isUiTheme(value: unknown): value is UiTheme {
  return typeof value === "string" && (uiThemes as readonly string[]).includes(value);
}

export function initialUiTheme(read: (key: string) => string | null): UiTheme {
  try {
    const stored = read(uiThemeStorageKey);
    return isUiTheme(stored) ? stored : "midnight";
  } catch {
    return "midnight";
  }
}

export function nextUiTheme(current: UiTheme): UiTheme {
  return current === "midnight" ? "ember" : "midnight";
}

export function uiThemeLabel(theme: UiTheme): string {
  return theme === "midnight" ? "Midnight" : "Ember";
}
