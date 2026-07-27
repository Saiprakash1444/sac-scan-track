REVOKE EXECUTE ON FUNCTION public.is_approved(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_approved(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_profile_approval() FROM PUBLIC, anon, authenticated;