import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Production build is served under /admin/ (also reachable on leadbangla.com, not only admin.leadbangla.com).
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/admin/" : "/",
  plugins: [react()],
  server: {
    host: true,
    port: 5174,
    proxy: {
      "/api": {
        target: "http://backend:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
}));
