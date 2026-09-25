import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig(async () => ({
  plugins: [
    react(),
    // useRecommendedBuildConfig: false —— 复审 F13：推荐配置会把
    // assetsInlineLimit 拉满导致 KaTeX 的 20 个 woff2 被内联成 base64。
    // 下面手动复刻其全部必要配置（cssCodeSplit / inlineDynamicImports 等），
    // 仅对 woff2 例外，让字体作为独立文件随 Tauri bundle 分发（HTML 瘦身 ~300KB）。
    viteSingleFile({ useRecommendedBuildConfig: false }),
  ],
  // base "/"：Tauri 经 tauri:// 协议在根路径服务 frontendDist，绝对路径
  // 稳定可靠。此前用 "./" 时，public 字体的相对引用会按 CSS 文件位置
  // （dist/assets/）计算，被 singlefile 内联进根目录 index.html 后错位 404。
  base: "/",
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    target: "es2022",
    cssCodeSplit: false,
    // KaTeX woff2 字体保持独立文件（Tauri 经 frontendDist 直接服务 dist/ 下
    // 的静态资源）；其余资源照旧内联，维持单文件 HTML 的离线特性。
    assetsInlineLimit: (filePath: string, content: Buffer) =>
      !filePath.endsWith(".woff2") && content.length < 100000000,
    chunkSizeWarningLimit: 100000000,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        manualChunks: undefined,
      },
    },
  },
}));
