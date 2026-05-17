import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { copyFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function copyDictionary() {
  return {
    name: "copy-dictionary",
    buildStart() {
      const dest = resolve(__dirname, "public/spell");
      if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
      const src = resolve(__dirname, "node_modules/dictionary-en");
      copyFileSync(resolve(src, "index.aff"), resolve(dest, "en.aff"));
      copyFileSync(resolve(src, "index.dic"), resolve(dest, "en.dic"));
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), copyDictionary()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target:
      process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
