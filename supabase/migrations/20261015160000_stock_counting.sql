-- Stock-take support. Imported parts start with count_pending = true. While an
-- admin has counting "open", any active member can record how many units are
-- physically on the shelf; once counting is done the admin locks it and only
-- admins can change counts.
--
-- Members count what's on the shelf (= available). Units out on loan aren't on
-- the shelf, so total = shelf count + units currently out.

ALTER TABLE public.components
  ADD COLUMN IF NOT EXISTS count_pending boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS counted_at timestamptz,
  ADD COLUMN IF NOT EXISTS counted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

INSERT INTO public.app_settings (key, value)
VALUES ('member_counting', 'locked')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.update_component_count(
  _component_id uuid,
  _on_shelf integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _mode text;
  _total integer;
  _available integer;
  _out integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_approved(_uid) THEN RAISE EXCEPTION 'Your account is not active yet'; END IF;
  IF _on_shelf IS NULL OR _on_shelf < 0 OR _on_shelf > 100000 THEN
    RAISE EXCEPTION 'Count must be between 0 and 100000';
  END IF;

  IF NOT public.has_role(_uid, 'admin') THEN
    SELECT value INTO _mode FROM public.app_settings WHERE key = 'member_counting';
    IF COALESCE(_mode, 'locked') <> 'open' THEN
      RAISE EXCEPTION 'Counting is locked — ask an admin to open it';
    END IF;
  END IF;

  SELECT quantity_total, quantity_available INTO _total, _available
  FROM public.components WHERE id = _component_id FOR UPDATE;
  IF _total IS NULL THEN RAISE EXCEPTION 'Component not found'; END IF;

  _out := GREATEST(0, _total - _available);

  UPDATE public.components
  SET quantity_available = _on_shelf,
      quantity_total = _on_shelf + _out,
      count_pending = false,
      counted_at = now(),
      counted_by = _uid
  WHERE id = _component_id;

  RETURN jsonb_build_object('available', _on_shelf, 'total', _on_shelf + _out, 'out', _out);
END;
$$;

REVOKE ALL ON FUNCTION public.update_component_count(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_component_count(uuid, integer) TO authenticated, service_role;
