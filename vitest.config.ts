import { defineConfig } from "vitest/config";

// jsdom: the markdown pipeline sanitises with DOMPurify and htmlToMarkdown walks
// a real DOM, so the tests need a document.
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
});
