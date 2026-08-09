import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function resolveVendorChunk(id: string) {
  const normalized = id.replace(/\\/g, "/");
  if (["/react/", "/react-dom/", "/scheduler/"].some((part) => normalized.includes(`/node_modules${part}`))) {
    return "react-vendor";
  }
  if (["/react-router/", "/react-router-dom/"].some((part) => normalized.includes(`/node_modules${part}`))) {
    return "router-vendor";
  }
  return undefined;
}

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          return resolveVendorChunk(id);
        }
      }
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts"
  }
});
