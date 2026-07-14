export const keyboardShortcutRows: ReadonlyArray<{ keys: string; label: string }> = [
  { keys: "Ctrl+K", label: "Command palette" },
  { keys: "F", label: "Focus the battle map" },
  { keys: "V", label: "Select tool" },
  { keys: "R", label: "Ruler" },
  { keys: "C", label: "Measure circle" },
  { keys: "O", label: "Measure cone" },
  { keys: "P", label: "Ping" },
  { keys: "D", label: "Draw" },
  { keys: "A", label: "Area template" },
  { keys: "Shift+Click", label: "Multi-select tokens" },
  { keys: "Alt+Drag", label: "Pan the map" },
  { keys: "Ctrl+Scroll", label: "Zoom the map" },
  { keys: "Esc", label: "Close panels and dialogs" },
  { keys: "?", label: "Toggle this overlay" }
];

export const mapDockOpenStorageKey = "otte:mapDockOpen";
export const quickCreateOpenStorageKey = "otte:quickCreateOpen";

export type TabletopWorkspaceMode = "live" | "prep" | "manage";

export const workspaceInspectorTabs: Record<TabletopWorkspaceMode, readonly string[]> = {
  live: ["actors", "compendium", "handouts", "journal", "search", "chat", "combat"],
  prep: ["actors", "compendium", "sessions", "worlds", "handouts", "journal", "memory", "search", "content", "plugins"],
  manage: ["actors", "compendium", "journal", "content", "plugins"],
};

export function isInspectorTabAllowed(mode: TabletopWorkspaceMode, tab: string): boolean {
  return workspaceInspectorTabs[mode].includes(tab);
}
