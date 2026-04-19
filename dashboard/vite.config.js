import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const devApiTarget = (env.VITE_DEV_API_PROXY || "").trim();

  return {
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            charts: ["recharts"],
            router: ["react-router-dom"],
            three: ["three", "@react-three/fiber", "@react-three/drei"],
          },
        },
      },
    },
    server: {
      host: "0.0.0.0",
      port: 5173,
      proxy: devApiTarget
        ? {
            "/api": {
              target: devApiTarget,
              changeOrigin: true,
              ws: true,
            },
            "/ws": {
              target: devApiTarget.replace(/^http/i, "ws"),
              changeOrigin: true,
              ws: true,
            },
          }
        : undefined,
    },
    test: {
      environment: "jsdom",
      setupFiles: "./vitest.setup.js",
      globals: true,
    },
  };
});
