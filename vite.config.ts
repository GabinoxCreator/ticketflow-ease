import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  // O Deno (nodeModulesDir: auto) resolve o "vite" dos plugins para uma cópia
  // própria em node_modules/.deno, e o TypeScript considera as duas cópias
  // tipos incompatíveis. O runtime é o mesmo vite; o cast só une as duas
  // leituras do mesmo pacote.
  plugins: [
    react(),
    mode === "development" && componentTagger(),
  ].filter(Boolean) as unknown as PluginOption[],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
