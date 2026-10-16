-- Members can flag a part as damaged without having borrowed it — e.g. they
-- found a burnt module in the bin, or a room-use-only tool stopped working.
-- (Damage on a borrowed part is still reported through return_component.)
--
-- A report does NOT touch stock on its own: an admin reviews it and either
-- writes the units off (total and available both drop) or dismisses it.

CREATE TABLE IF NOT EXISTS public.damage_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id uuid NOT NULL REFERENCES public.components(id) ON DELETE CASCADE,
  reported_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 100000),
  note text NOT NULL CHECK (length(btrim(note)) BETWEEN 1 AND 300),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'written_off', 'dismissed')),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.damage_reports TO authenticated;
GRANT ALL ON public.damage_reports TO service_role;
ALTER TABLE public.damage_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "damage read own or admin" ON public.damage_reports;
CREATE POLICY "damage read own or admin" ON public.damage_reports
  FOR SELECT TO authenticated
  USING (auth.uid() = reported_by OR public.has_role(auth.uid(), 'admin'));

-- Members may only file open reports in their own name; resolution goes through
-- resolve_damage_report (service role, from the admin panel).
DROP POLICY IF EXISTS "damage insert own open" ON public.damage_reports;
CREATE POLICY "damage insert own open" ON public.damage_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = reported_by
    AND status = 'open'
    AND resolved_at IS NULL
    AND public.is_approved(auth.uid())
  );

CREATE INDEX IF NOT EXISTS damage_reports_open_idx
  ON public.damage_reports (status, created_at DESC);

-- Write-off is done in SQL with a row lock so it can't race a borrow/return.
-- Units come off the shelf first; we never take more than is actually there.
CREATE OR REPLACE FUNCTION public.resolve_damage_report(_report_id uuid, _write_off boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _component uuid;
  _qty integer;
  _status text;
  _available integer;
  _removed integer := 0;
BEGIN
  SELECT component_id, quantity, status INTO _component, _qty, _status
  FROM public.damage_reports WHERE id = _report_id FOR UPDATE;
  IF _component IS NULL THEN RAISE EXCEPTION 'Report not found'; END IF;
  IF _status <> 'open' THEN RAISE EXCEPTION 'This report was already handled'; END IF;

  IF _write_off THEN
    SELECT quantity_available INTO _available
    FROM public.components WHERE id = _component FOR UPDATE;
    _removed := LEAST(_qty, GREATEST(_available, 0));
    UPDATE public.components
    SET quantity_available = quantity_available - _removed,
        quantity_total = GREATEST(0, quantity_total - _removed)
    WHERE id = _component;
  END IF;

  UPDATE public.damage_reports
  SET status = CASE WHEN _write_off THEN 'written_off' ELSE 'dismissed' END,
      resolved_at = now()
  WHERE id = _report_id;

  RETURN jsonb_build_object('removed', _removed);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_damage_report(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_damage_report(uuid, boolean) TO service_role;
