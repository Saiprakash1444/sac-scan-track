-- generate_return_reminders() existed since 20260725200611 but was never scheduled:
-- the pg_cron extension was created and then nothing called it, so the entire
-- notification feature only ran when an admin pressed "Send reminders now".
-- This schedules the daily sweep and adds the two indexes it actually reads.

-- Supabase installs pg_cron into the `extensions` schema; the callable API is
-- still `cron.*`. Guarded so the migration is a no-op on a database where the
-- extension could not be created (e.g. a local dev instance without it).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron is not installed — skipping reminder schedule. Enable it under Database → Extensions, then re-run this migration.';
    RETURN;
  END IF;

  -- Make re-running safe.
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sac-return-reminders') THEN
    PERFORM cron.unschedule('sac-return-reminders');
  END IF;

  -- 03:30 UTC = 09:00 IST. pg_cron schedules are UTC; adjust if the club moves.
  PERFORM cron.schedule(
    'sac-return-reminders',
    '30 3 * * *',
    $cron$SELECT public.generate_return_reminders()$cron$
  );
END $$;

-- The sweep's exact predicate: open loans ordered by due date. Without this it
-- is a full scan of borrow_records every night.
CREATE INDEX IF NOT EXISTS borrow_due_open_idx
  ON public.borrow_records (due_at)
  WHERE returned_at IS NULL;

-- deleteComponent() counts open loans per component before allowing a delete.
CREATE INDEX IF NOT EXISTS borrow_component_idx
  ON public.borrow_records (component_id);
