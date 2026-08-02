import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Increase limit to suppress warnings for intentionally large chunks
    chunkSizeWarningLimit: 1000,
    // NOTE: manualChunks intentionally NOT used.
    // Manual chunking causes circular-dependency issues in production
    // (React.createContext undefined -> black screen). Let Rollup chunk itself.
  },
});
