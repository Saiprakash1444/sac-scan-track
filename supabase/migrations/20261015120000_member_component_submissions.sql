-- Members can add components to the catalogue. An admin setting decides whether
-- those additions go live immediately ('direct') or wait in a review queue
-- ('approval'). Either way every addition is kept in component_submissions so
-- there is a record of who added what.
--
-- Members never get INSERT on components: the only member path is
-- submit_component(), which reads the setting and does the right thing.
-- Reviewing (approve / reject) runs through the admin panel with the service role.

-- ---------------------------------------------------------------- settings

CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settings readable" ON public.app_settings;
CREATE POLICY "settings readable" ON public.app_settings
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.app_settings (key, value)
VALUES ('member_additions', 'approval')
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------- submissions

CREATE TABLE IF NOT EXISTS public.component_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'misc',
  specs text,
  quantity integer NOT NULL CHECK (quantity >= 0),
  rack_id uuid REFERENCES public.racks(id) ON DELETE SET NULL,
  bin_label text,
  note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  component_id uuid REFERENCES public.components(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.component_submissions TO authenticated;
GRANT ALL ON public.component_submissions TO service_role;
ALTER TABLE public.component_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "submissions read own or admin" ON public.component_submissions;
CREATE POLICY "submissions read own or admin" ON public.component_submissions
  FOR SELECT TO authenticated
  USING (auth.uid() = submitted_by OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS component_submissions_pending_idx
  ON public.component_submissions (created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS component_submissions_member_idx
  ON public.component_submissions (submitted_by, created_at DESC);

-- ------------------------------------------------------------- submit path

CREATE OR REPLACE FUNCTION public.submit_component(
  _name text,
  _quantity integer,
  _rack_id uuid DEFAULT NULL,
  _bin_label text DEFAULT NULL,
  _category text DEFAULT NULL,
  _specs text DEFAULT NULL,
  _note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _mode text;
  _component_id uuid;
  _submission_id uuid;
  _clean_name text := btrim(COALESCE(_name, ''));
  _clean_category text := COALESCE(NULLIF(btrim(COALESCE(_category, '')), ''), 'misc');
  _clean_specs text := NULLIF(btrim(COALESCE(_specs, '')), '');
  _clean_bin text := NULLIF(btrim(COALESCE(_bin_label, '')), '');
  _clean_note text := NULLIF(btrim(COALESCE(_note, '')), '');
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_approved(_uid) THEN RAISE EXCEPTION 'Your account is not active yet'; END IF;
  IF length(_clean_name) < 1 OR length(_clean_name) > 120 THEN
    RAISE EXCEPTION 'Name must be 1–120 characters';
  END IF;
  IF _quantity IS NULL OR _quantity < 0 OR _quantity > 100000 THEN
    RAISE EXCEPTION 'Quantity must be between 0 and 100000';
  END IF;
  IF _rack_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.racks WHERE id = _rack_id) THEN
    RAISE EXCEPTION 'That section no longer exists';
  END IF;

  SELECT value INTO _mode FROM public.app_settings WHERE key = 'member_additions';
  _mode := COALESCE(_mode, 'approval');

  IF _mode = 'direct' THEN
    INSERT INTO public.components
      (name, category, specs, quantity_total, quantity_available, rack_id, bin_label)
    VALUES
      (_clean_name, _clean_category, _clean_specs, _quantity, _quantity, _rack_id, _clean_bin)
    RETURNING id INTO _component_id;

    INSERT INTO public.component_submissions
      (submitted_by, name, category, specs, quantity, rack_id, bin_label, note,
       status, component_id, reviewed_at, review_note)
    VALUES
      (_uid, _clean_name, _clean_category, _clean_specs, _quantity, _rack_id, _clean_bin, _clean_note,
       'approved', _component_id, now(), 'Added directly')
    RETURNING id INTO _submission_id;

    RETURN jsonb_build_object('status', 'approved', 'id', _submission_id, 'component_id', _component_id);
  END IF;

  INSERT INTO public.component_submissions
    (submitted_by, name, category, specs, quantity, rack_id, bin_label, note)
  VALUES
    (_uid, _clean_name, _clean_category, _clean_specs, _quantity, _rack_id, _clean_bin, _clean_note)
  RETURNING id INTO _submission_id;

  RETURN jsonb_build_object('status', 'pending', 'id', _submission_id);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_component(text, integer, uuid, text, text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_component(text, integer, uuid, text, text, text, text)
  TO authenticated, service_role;
