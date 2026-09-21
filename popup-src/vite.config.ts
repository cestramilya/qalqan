import path from "path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  build: {
    outDir: "../extension/popup",
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: "[name].js", assetFileNames: "[name][extname]" } },
  },
})
