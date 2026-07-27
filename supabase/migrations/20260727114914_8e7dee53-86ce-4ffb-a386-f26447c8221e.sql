ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by text;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_approval_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_approval_status_check
  CHECK (approval_status IN ('pending','approved','rejected'));

-- grandfather everyone who already signed up
UPDATE public.profiles SET approval_status = 'approved', approved_at = now(), approved_by = 'migration'
WHERE approval_status = 'pending';

CREATE OR REPLACE FUNCTION public.is_approved(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND approval_status = 'approved');
$$;

REVOKE EXECUTE ON FUNCTION public.is_approved(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_approved(uuid) TO authenticated;

-- members can never change their own approval state
CREATE OR REPLACE FUNCTION public.guard_profile_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() = NEW.id THEN
    NEW.approval_status := OLD.approval_status;
    NEW.approved_at := OLD.approved_at;
    NEW.approved_by := OLD.approved_by;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.guard_profile_approval() FROM anon, authenticated;

DROP TRIGGER IF EXISTS guard_profile_approval ON public.profiles;
CREATE TRIGGER guard_profile_approval BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_approval();

-- borrowing requires approval
CREATE OR REPLACE FUNCTION public.borrow_component(_component_id uuid, _quantity integer, _days integer DEFAULT 7, _note text DEFAULT NULL::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  _uid uuid := auth.uid();
  _avail integer;
  _borrowable boolean;
  _id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.is_approved(_uid) THEN RAISE EXCEPTION 'Your membership is still awaiting admin approval'; END IF;
  IF _quantity IS NULL OR _quantity < 1 THEN RAISE EXCEPTION 'Quantity must be at least 1'; END IF;
  IF _days IS NULL OR _days < 1 OR _days > 90 THEN RAISE EXCEPTION 'Days must be between 1 and 90'; END IF;

  SELECT quantity_available, borrowable INTO _avail, _borrowable
  FROM public.components WHERE id = _component_id FOR UPDATE;

  IF _avail IS NULL THEN RAISE EXCEPTION 'Component not found'; END IF;
  IF NOT _borrowable THEN RAISE EXCEPTION 'This item stays in the room and cannot be checked out'; END IF;
  IF _avail < _quantity THEN RAISE EXCEPTION 'Only % available', _avail; END IF;

  UPDATE public.components SET quantity_available = quantity_available - _quantity WHERE id = _component_id;

  INSERT INTO public.borrow_records (component_id, user_id, quantity, due_at, note)
  VALUES (_component_id, _uid, _quantity, now() + (_days || ' days')::interval, _note)
  RETURNING id INTO _id;

  RETURN _id;
END;
$function$;

CREATE TABLE IF NOT EXISTS public.unknown_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  guessed_name text NOT NULL,
  guessed_category text,
  notes text,
  resolved_component_id uuid REFERENCES public.components(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.unknown_scans TO authenticated;
GRANT ALL ON public.unknown_scans TO service_role;
ALTER TABLE public.unknown_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "unknown scans insert own" ON public.unknown_scans
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "unknown scans read own or admin" ON public.unknown_scans
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));