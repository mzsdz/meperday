import { defineConfig } from "@playwright/test";
const chromiumUse = { channel: process.env.CI ? "chrome" : "msedge" };
export default defineConfig({
  testDir: "./e2e",
  projects: [
    { name: "local", testMatch: "journal.spec.js", use: chromiumUse },
    {
      name: "iphone-flow",
      testMatch: ["iphone-flow.spec.js", "weight-points.spec.js"],
      use: chromiumUse,
    },
    {
      name: "upload-layout",
      testMatch: "upload-layout.spec.js",
      use: chromiumUse,
    },
    ...(process.env.PLAYWRIGHT_WEBKIT
      ? [
          {
            name: "webkit-upload",
            testMatch: [
              "upload-layout.spec.js",
              "iphone-flow.spec.js",
              "weight-points.spec.js",
            ],
            use: {
              browserName: "webkit",
              isMobile: true,
              hasTouch: true,
            },
          },
        ]
      : []),
    ...(process.env.PLAYWRIGHT_WEBKIT
      ? [
          {
            name: "webkit-auth",
            testMatch: ["first-visit.spec.js", "google-auth.spec.js"],
            use: {
              browserName: "webkit",
              isMobile: true,
              hasTouch: true,
              baseURL: "http://127.0.0.1:4174",
            },
          },
        ]
      : []),
    {
      name: "configured-guest",
      testMatch: ["first-visit.spec.js", "google-auth.spec.js"],
      use: { ...chromiumUse, baseURL: "http://127.0.0.1:4174" },
    },
  ],
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 390, height: 844 },
  },
  webServer: [
    {
      command:
        "npm run build -- --outDir dist-e2e-local && npm run preview -- --outDir dist-e2e-local --port 4173",
      url: "http://127.0.0.1:4173",
      env: { VITE_SUPABASE_URL: "", VITE_SUPABASE_PUBLISHABLE_KEY: "" },
      reuseExistingServer: false,
    },
    {
      command:
        "npm run build -- --outDir dist-e2e-account && npm run preview -- --outDir dist-e2e-account --port 4174",
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
