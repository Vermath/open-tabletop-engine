import type { Dice3dPreferenceEnvironment } from "./dice-3d.js";

export function initialResetToken(): string {
  return new URLSearchParams(window.location.search).get("token") ?? "";
}

export function dice3dPreferenceEnvironment(): Dice3dPreferenceEnvironment {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return {
    prefersReducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    saveData: Boolean(connection?.saveData),
    hardwareConcurrency: navigator.hardwareConcurrency
  };
}

export function initialInviteToken(): string {
  return new URLSearchParams(window.location.search).get("invite") ?? "";
}

export function initialResetMode(): boolean {
  return window.location.pathname.endsWith("/reset-password") || initialResetToken().startsWith("opr_");
}

export function clearResetUrl(): void {
  const nextPath = window.location.pathname.endsWith("/reset-password") ? "/" : window.location.pathname;
  window.history.replaceState(null, "", nextPath || "/");
}

export function clearJoinUrl(): void {
  if (window.location.pathname.endsWith("/join") || new URLSearchParams(window.location.search).has("invite")) {
    window.history.replaceState(null, "", "/");
  }
}

export function absoluteInviteUrl(acceptUrl: string): string {
  return new URL(acceptUrl, window.location.origin).toString();
}

export function initialSavedDiceFormulas(): string[] {
  const fallback = ["1d20+5", "2d20kh1+5", "2d20kl1+5", "1d8+3", "2d6"];
  try {
    const parsed = JSON.parse(localStorage.getItem("otte:savedDiceFormulas") ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return fallback;
    const formulas = parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim()).slice(0, 12);
    return formulas.length > 0 ? formulas : fallback;
  } catch {
    return fallback;
  }
}

export function persistSavedDiceFormulas(formulas: string[]): void {
  localStorage.setItem("otte:savedDiceFormulas", JSON.stringify(formulas.slice(0, 12)));
}

export function initialStoredId(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

export function persistStoredId(key: string, value: string): void {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // Selection persistence is a convenience; private-mode storage failures should not block the table.
  }
}

export function initialStoredPanelFlag(key: string, fallback: boolean): boolean {
  try {
    const stored = window.localStorage.getItem(key);
    return stored === null ? fallback : stored === "true";
  } catch {
    return fallback;
  }
}

export function persistStoredPanelFlag(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Storage may be unavailable in private sessions; the preference is non-essential.
  }
}

export function mfaCredential(value: string): { mfaCode?: string; recoveryCode?: string } {
  const credential = value.trim();
  if (!credential) return {};
  return /^\d{6}$/.test(credential) ? { mfaCode: credential } : { recoveryCode: credential };
}
