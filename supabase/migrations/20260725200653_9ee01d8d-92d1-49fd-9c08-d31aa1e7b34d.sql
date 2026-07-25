REVOKE ALL ON FUNCTION public.extend_borrow(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.return_component(uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_return_reminders() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_return_reminders() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.extend_borrow(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.return_component(uuid, boolean, text) TO authenticated;