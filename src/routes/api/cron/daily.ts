import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

/**
 * Daily job, triggered by Vercel Cron (see vercel.json). Two purposes:
 *  1. Runs the return-reminder sweep, so due-soon / overdue notifications go out
 *     even if Supabase's pg_cron schedule isn't active. The sweep is idempotent
 *     (it stamps reminded_* columns), so running alongside pg_cron is harmless.
 *  2. Touches the database every day, which stops the free Supabase project
 *     from being paused after a quiet week.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` when that env var is set;
 * without it the endpoint refuses, so it can't be triggered by anyone else.
 */
export const Route = createFileRoute("/api/cron/daily")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        if (!secret) {
          return Response.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
        }
        if (request.headers.get("authorization") !== `Bearer ${secret}`) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { runReminderSweep } = await import("@/lib/admin.server");
        try {
          const sent = await runReminderSweep();
          return Response.json({ ok: true, remindersSent: sent, at: new Date().toISOString() });
        } catch (error) {
          console.error("[cron] reminder sweep failed", error);
          return Response.json(
            { ok: false, error: error instanceof Error ? error.message : String(error) },
            { status: 500 },
          );
        }
      },
    },
  },
});
