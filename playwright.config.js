import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  use: {
    channel: process.env.CI ? undefined : "msedge",
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: "npm run dev -- --port 4173",
    url: "http://127.0.0.1:4173",
    env: { VITE_SUPABASE_URL: "", VITE_SUPABASE_PUBLISHABLE_KEY: "" },
    reuseExistingServer: false,
  },
  reporter: "list",
});
