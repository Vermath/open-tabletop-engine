import react from "@vitejs/plugin-react";
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const projectDir = dirname(fileURLToPath(import.meta.url));

export function syncDiceBoxAssets(source: string, target: string): void {
  if (!existsSync(source)) return;
  rmSync(target, { recursive: true, force: true });
  cpSync(source, target, { recursive: true });
}

function copyDiceBoxAssets(): Plugin {
  return {
    name: "copy-dice-box-assets",
    buildStart() {
      const source = resolve(projectDir, "node_modules/@3d-dice/dice-box-threejs/public");
      const target = resolve(projectDir, "public/assets/dice-box");
      syncDiceBoxAssets(source, target);
    }
  };
}

// Minified, uncompressed JS across the entry and every eager static import.
// The current production graph is 1,566,055 bytes after deferring the actor,
// administration, AI, canon-memory, and image-export surfaces. Keep roughly
// 34 KB of headroom so eager dependency growth fails loudly.
export const ENTRY_CHUNK_BUDGET_BYTES = 1_600_000;

export interface BuildChunkBudgetInput {
  fileName: string;
  type: string;
  isEntry?: boolean;
  code?: string;
  imports?: string[];
}

export function entryChunkBudgetFailures(chunks: BuildChunkBudgetInput[], budgetBytes = ENTRY_CHUNK_BUDGET_BYTES): string[] {
  const byFileName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  return chunks.filter((chunk) => chunk.type === "chunk" && chunk.isEntry).flatMap((entry) => {
    const visited = new Set<string>();
    const visit = (fileName: string): number => {
      if (visited.has(fileName)) return 0;
      visited.add(fileName);
      const chunk = byFileName.get(fileName);
      if (!chunk || chunk.type !== "chunk") return 0;
      return new TextEncoder().encode(chunk.code ?? "").byteLength
        + (chunk.imports ?? []).reduce((total, importedFileName) => total + visit(importedFileName), 0);
    };
    const size = visit(entry.fileName);
    return size > budgetBytes ? [`${entry.fileName} initial static graph is ${size} bytes (budget ${budgetBytes})`] : [];
  });
}

function enforceEntryChunkBudget(): Plugin {
  return {
    name: "enforce-entry-chunk-budget",
    generateBundle(_options, bundle) {
      const failures = entryChunkBudgetFailures(Object.values(bundle) as BuildChunkBudgetInput[]);
      if (failures.length > 0) throw new Error(`Initial web bundle budget exceeded: ${failures.join(", ")}`);
    }
  };
}

export function webManualChunk(id: string): string | undefined {
  const normalized = id.replaceAll("\\", "/");
  if (normalized.includes("/node_modules/react/") || normalized.includes("/node_modules/react-dom/")) return "react-vendor";
  if (normalized.includes("/node_modules/lucide-react/")) return "icon-vendor";
  if (normalized.includes("/node_modules/@3d-dice/") || normalized.includes("/packages/dice-engine/")) return "dice-runtime";
  if (normalized.includes("/node_modules/html-to-image/")) return "image-export";
  return undefined;
}

const allowedHosts = Array.from(
  new Set([
    "open-tabletopweb-production.up.railway.app",
    ...(process.env.VITE_ALLOWED_HOSTS ?? "")
      .split(",")
      .map((host) => host.trim())
      .filter(Boolean)
  ])
);

export default defineConfig({
  plugins: [react(), copyDiceBoxAssets(), enforceEntryChunkBudget()],
  build: {
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: { manualChunks: webManualChunk }
    }
  },
  server: {
    allowedHosts,
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4000",
        ws: true
      }
    }
  },
  preview: {
    allowedHosts
  }
});
