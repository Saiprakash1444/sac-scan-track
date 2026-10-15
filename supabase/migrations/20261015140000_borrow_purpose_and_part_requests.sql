-- 1. Every borrow records why: for a club project (with its name) or personal use.
-- 2. Members can ask admins to source a part the room doesn't have (or needs
--    more of), optionally with a shop link and price. Admins finalise each one.

-- ------------------------------------------------------------ borrow purpose

ALTER TABLE public.borrow_records
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'personal',
  ADD COLUMN IF NOT EXISTS project_name text;

ALTER TABLE public.borrow_records DROP CONSTRAINT IF EXISTS borrow_records_purpose_check;
ALTER TABLE public.borrow_records ADD CONSTRAINT borrow_records_purpose_check
  CHECK (purpose IN ('project', 'personal'));

-- Replace borrow_component with a version that takes the purpose. Dropping the
-- old 4-argument signature first avoids two overloads that PostgREST can't
-- choose between.
DROP FUNCTION IF EXISTS public.borrow_component(uuid, integer, integer, text);

CREATE OR REPLACE FUNCTION public.borrow_component(
  _component_id uuid,
  _quantity integer,
  _days integer DEFAULT 7,
  _note text DEFAULT NULL,
  _purpose text DEFAULT 'personal',
  _project_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _avail integer;
  _borrowable boolean;
  _id uuid;
  _clean_project text := NULLIF(btrim(COALESCE(_project_name, '')), '');
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_approved(_uid) THEN RAISE EXCEPTION 'Your membership is still awaiting admin approval'; END IF;
  IF _quantity IS NULL OR _quantity < 1 THEN RAISE EXCEPTION 'Quantity must be at least 1'; END IF;
  IF _days IS NULL OR _days < 1 OR _days > 90 THEN RAISE EXCEPTION 'Days must be between 1 and 90'; END IF;
  IF _purpose IS NULL OR _purpose NOT IN ('project', 'personal') THEN
    RAISE EXCEPTION 'Purpose must be project or personal';
  END IF;
  IF _purpose = 'project' AND _clean_project IS NULL THEN
    RAISE EXCEPTION 'Name the project you are borrowing for';
  END IF;

  SELECT quantity_available, borrowable INTO _avail, _borrowable
  FROM public.components WHERE id = _component_id FOR UPDATE;

  IF _avail IS NULL THEN RAISE EXCEPTION 'Component not found'; END IF;
  IF NOT _borrowable THEN RAISE EXCEPTION 'This item stays in the room and cannot be checked out'; END IF;
  IF _avail < _quantity THEN RAISE EXCEPTION 'Only % available', _avail; END IF;

  UPDATE public.components SET quantity_available = quantity_available - _quantity WHERE id = _component_id;

  INSERT INTO public.borrow_records
    (component_id, user_id, quantity, due_at, note, purpose, project_name)
  VALUES
    (_component_id, _uid, _quantity, now() + (_days || ' days')::interval, _note,
     _purpose, CASE WHEN _purpose = 'project' THEN _clean_project END)
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.borrow_component(uuid, integer, integer, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.borrow_component(uuid, integer, integer, text, text, text)
  TO authenticated, service_role;

-- ------------------------------------------------------------ part requests

CREATE TABLE IF NOT EXISTS public.part_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 100000),
  reason text CHECK (reason IS NULL OR length(reason) <= 500),
  link text CHECK (link IS NULL OR length(link) <= 500),
  est_price numeric(10, 2) CHECK (est_price IS NULL OR est_price >= 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'ordered', 'received')),
  admin_note text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.part_requests TO authenticated;
GRANT ALL ON public.part_requests TO service_role;
ALTER TABLE public.part_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "requests read own or admin" ON public.part_requests;
CREATE POLICY "requests read own or admin" ON public.part_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = requested_by OR public.has_role(auth.uid(), 'admin'));

-- Members can only file new, pending requests in their own name; every later
-- status change goes through the admin panel (service role).
DROP POLICY IF EXISTS "requests insert own pending" ON public.part_requests;
CREATE POLICY "requests insert own pending" ON public.part_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = requested_by
    AND status = 'pending'
    AND admin_note IS NULL
    AND reviewed_at IS NULL
    AND public.is_approved(auth.uid())
  );

CREATE INDEX IF NOT EXISTS part_requests_status_idx
  ON public.part_requests (status, created_at);
CREATE INDEX IF NOT EXISTS part_requests_member_idx
  ON public.part_requests (requested_by, created_at DESC);
