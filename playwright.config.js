import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  projects: [
    { name: "local", testMatch: "journal.spec.js" },
    {
      name: "configured-guest",
      testMatch: "first-visit.spec.js",
      use: { baseURL: "http://127.0.0.1:4174" },
    },
  ],
  use: {
    channel: process.env.CI ? "chrome" : "msedge",
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 390, height: 844 },
  },
  webServer: [
    {
      command: "npm run dev -- --port 4173",
      url: "http://127.0.0.1:4173",
      env: { VITE_SUPABASE_URL: "", VITE_SUPABASE_PUBLISHABLE_KEY: "" },
      reuseExistingServer: false,
    },
    {
      command: "npm run dev -- --port 4174",
      url: "http://127.0.0.1:4174",
      env: {
        VITE_SUPABASE_URL: "https://example.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
      },
      reuseExistingServer: false,
    },
  ],
  reporter: "list",
});
