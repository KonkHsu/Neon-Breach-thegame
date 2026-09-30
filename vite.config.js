import { defineConfig } from "vite";
export default defineConfig({ base: "./", build: { modulePreload: false, rollupOptions: { output: { format: "iife", inlineDynamicImports: true } } } });
