// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Hard-pin the Vercel target for our own CI. Per the preset's own contract, a
  // Lovable build force-overrides preset/output back to Cloudflare, so this is
  // safe to commit while the repo stays git-synced with the Lovable editor.
  nitro: {
    preset: "vercel",
    // Daily reminder sweep + Supabase keep-alive (src/routes/api/cron/daily.ts),
    // 04:00 UTC = 09:30 IST. Vercel reads crons from the Build Output config that
    // nitro writes. The Lovable wrapper's types only list preset/output/cloudflare,
    // but the object is passed straight through to nitro, which supports `vercel`.
    vercel: { config: { crons: [{ path: "/api/cron/daily", schedule: "0 4 * * *" }] } },
  } as { preset: string },
});
