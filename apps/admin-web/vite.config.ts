import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function resolvePackageChunkName(id: string) {
  const [modulePath] = id.split("?");
  const marker = "node_modules/";
  const normalized = modulePath.replace(/\\/g, "/");
  const nodeModuleIndex = normalized.lastIndexOf(marker);
  if (nodeModuleIndex === -1) {
    return undefined;
  }

  const packagePath = normalized.slice(nodeModuleIndex + marker.length);
  const segments = packagePath.split("/");
  const packageName = segments[0].startsWith("@") ? `${segments[0]}/${segments[1]}` : segments[0];

  if (["react", "react-dom", "scheduler"].includes(packageName)) {
    return "react-vendor";
  }

  if (["react-router", "react-router-dom"].includes(packageName)) {
    return "router-vendor";
  }

  return `vendor-${packageName.replace("@", "").replace("/", "-")}`;
}

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          return resolvePackageChunkName(id);
        }
      }
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts"
  }
});
