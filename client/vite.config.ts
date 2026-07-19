import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    // Generates ./src/routeTree.gen.ts from ./src/routes/** on dev/build.
    // autoCodeSplitting is left off to keep the bundle behavior identical
    // to the previous TanStack Start setup (single client bundle).
    tanstackRouter({
      target: "react",
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("../shared", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // Allow Vite's dev server to read the shared/ workspace that lives
    // one directory above the client/ project root.
    fs: {
      allow: [".", "../shared"],
    },
    // Proxy API calls to the Express server during local development so
    // the frontend can keep using relative fetch("/api/...") calls.
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
