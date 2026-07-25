ALTER TABLE public.borrow_records
  ADD COLUMN IF NOT EXISTS extended_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS damage_reported boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS damage_note text,
  ADD COLUMN IF NOT EXISTS reminded_soon_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminded_overdue_at timestamptz;

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  borrow_record_id uuid REFERENCES public.borrow_records(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'reminder',
  title text NOT NULL,
  body text,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications read own" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "notifications update own" ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications (user_id, created_at DESC);

-- Extend a loan
CREATE OR REPLACE FUNCTION public.extend_borrow(_record_id uuid, _days integer DEFAULT 7)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _rec public.borrow_records;
  _new_due timestamptz;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _days IS NULL OR _days < 1 OR _days > 30 THEN RAISE EXCEPTION 'Extension must be between 1 and 30 days'; END IF;

  SELECT * INTO _rec FROM public.borrow_records WHERE id = _record_id FOR UPDATE;
  IF _rec.id IS NULL THEN RAISE EXCEPTION 'Record not found'; END IF;
  IF _rec.user_id <> _uid AND NOT public.has_role(_uid,'admin') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF _rec.returned_at IS NOT NULL THEN RAISE EXCEPTION 'This item is already returned'; END IF;
  IF _rec.extended_count >= 3 AND NOT public.has_role(_uid,'admin') THEN
    RAISE EXCEPTION 'You have already extended this 3 times — talk to an admin';
  END IF;

  _new_due := GREATEST(_rec.due_at, now()) + (_days || ' days')::interval;

  UPDATE public.borrow_records
  SET due_at = _new_due,
      extended_count = extended_count + 1,
      reminded_soon_at = NULL,
      reminded_overdue_at = NULL
  WHERE id = _record_id;

  RETURN _new_due;
END;
$$;

-- Return, with optional damage report
DROP FUNCTION IF EXISTS public.return_component(uuid);

CREATE OR REPLACE FUNCTION public.return_component(
  _record_id uuid,
  _damaged boolean DEFAULT false,
  _damage_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _rec public.borrow_records;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO _rec FROM public.borrow_records WHERE id = _record_id FOR UPDATE;
  IF _rec.id IS NULL THEN RAISE EXCEPTION 'Record not found'; END IF;
  IF _rec.user_id <> _uid AND NOT public.has_role(_uid,'admin') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF _rec.returned_at IS NOT NULL THEN RETURN; END IF;

  UPDATE public.borrow_records
  SET returned_at = now(),
      damage_reported = COALESCE(_damaged, false),
      damage_note = NULLIF(btrim(COALESCE(_damage_note, '')), '')
  WHERE id = _record_id;

  IF COALESCE(_damaged, false) THEN
    -- damaged units come back but leave usable stock
    UPDATE public.components
    SET quantity_total = GREATEST(0, quantity_total - _rec.quantity)
    WHERE id = _rec.component_id;
  ELSE
    UPDATE public.components
    SET quantity_available = LEAST(quantity_total, quantity_available + _rec.quantity)
    WHERE id = _rec.component_id;
  END IF;
END;
$$;

-- Scheduled reminder generator
CREATE OR REPLACE FUNCTION public.generate_return_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count integer := 0;
  _r record;
BEGIN
  FOR _r IN
    SELECT b.id, b.user_id, b.quantity, b.due_at, c.name AS component_name
    FROM public.borrow_records b
    JOIN public.components c ON c.id = b.component_id
    WHERE b.returned_at IS NULL
      AND b.due_at <= now() + interval '24 hours'
      AND b.reminded_soon_at IS NULL
  LOOP
    INSERT INTO public.notifications (user_id, borrow_record_id, kind, title, body)
    VALUES (
      _r.user_id, _r.id, 'due_soon',
      'Return due soon: ' || _r.component_name,
      _r.quantity || ' × ' || _r.component_name || ' is due back on ' ||
      to_char(_r.due_at, 'DD Mon YYYY') || '. Extend it if you still need it.'
    );
    UPDATE public.borrow_records SET reminded_soon_at = now() WHERE id = _r.id;
    _count := _count + 1;
  END LOOP;

  FOR _r IN
    SELECT b.id, b.user_id, b.quantity, b.due_at, c.name AS component_name
    FROM public.borrow_records b
    JOIN public.components c ON c.id = b.component_id
    WHERE b.returned_at IS NULL
      AND b.due_at < now()
      AND (b.reminded_overdue_at IS NULL OR b.reminded_overdue_at < now() - interval '48 hours')
  LOOP
    INSERT INTO public.notifications (user_id, borrow_record_id, kind, title, body)
    VALUES (
      _r.user_id, _r.id, 'overdue',
      'Overdue: ' || _r.component_name,
      _r.quantity || ' × ' || _r.component_name || ' was due on ' ||
      to_char(_r.due_at, 'DD Mon YYYY') || '. Please return it to the SAC room or extend it.'
    );
    UPDATE public.borrow_records SET reminded_overdue_at = now() WHERE id = _r.id;
    _count := _count + 1;
  END LOOP;

  RETURN _count;
END;
$$;

REVOKE ALL ON FUNCTION public.extend_borrow(uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.return_component(uuid, boolean, text) FROM anon;
REVOKE ALL ON FUNCTION public.generate_return_reminders() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.extend_borrow(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.return_component(uuid, boolean, text) TO authenticated;