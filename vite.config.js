import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: true, historyApiFallback: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.js"],
    globals: true,
  },
});
