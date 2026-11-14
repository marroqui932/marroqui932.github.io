import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Site principal du compte GitHub (marroqui932.github.io) : servi à la racine.
export default defineConfig({
  base: "/",
  plugins: [react()],
  build: { chunkSizeWarningLimit: 2000 },
});
