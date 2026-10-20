import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // pdf.js is imported lazily; pre-bundle it so dev doesn't reload the page on first use
  optimizeDeps: { include: ["pdfjs-dist"] },
  server: {
    proxy: {
      // Forward all /api/* calls to the Express backend during dev
      "/api": "http://localhost:3001",
    },
  },
});
