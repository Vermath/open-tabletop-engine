import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

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
  plugins: [react()],
  server: {
    allowedHosts,
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        ws: true
      }
    }
  },
  preview: {
    allowedHosts
  }
});
