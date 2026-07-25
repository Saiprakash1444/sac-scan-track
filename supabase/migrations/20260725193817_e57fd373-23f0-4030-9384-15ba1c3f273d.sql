CREATE OR REPLACE FUNCTION public.borrow_component(_component_id uuid, _quantity integer, _days integer DEFAULT 7, _note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _avail integer;
  _borrowable boolean;
  _id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
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
$$;

CREATE OR REPLACE FUNCTION public.return_component(_record_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _rec public.borrow_records;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO _rec FROM public.borrow_records WHERE id = _record_id FOR UPDATE;
  IF _rec.id IS NULL THEN RAISE EXCEPTION 'Record not found'; END IF;
  IF _rec.user_id <> _uid AND NOT public.has_role(_uid,'admin') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF _rec.returned_at IS NOT NULL THEN RETURN; END IF;

  UPDATE public.borrow_records SET returned_at = now() WHERE id = _record_id;
  UPDATE public.components SET quantity_available = LEAST(quantity_total, quantity_available + _rec.quantity)
  WHERE id = _rec.component_id;
END;
$$;

REVOKE ALL ON FUNCTION public.borrow_component(uuid, integer, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.return_component(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.borrow_component(uuid, integer, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.return_component(uuid) TO authenticated, service_role;