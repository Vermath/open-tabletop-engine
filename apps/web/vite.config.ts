import react from "@vitejs/plugin-react";
import { cpSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const projectDir = dirname(fileURLToPath(import.meta.url));

function copyDiceBoxAssets(): Plugin {
  return {
    name: "copy-dice-box-assets",
    buildStart() {
      const source = resolve(projectDir, "node_modules/@3d-dice/dice-box-threejs/public");
      const target = resolve(projectDir, "public/assets/dice-box");
      if (existsSync(source) && !existsSync(target)) cpSync(source, target, { recursive: true });
    }
  };
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
  plugins: [react(), copyDiceBoxAssets()],
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
