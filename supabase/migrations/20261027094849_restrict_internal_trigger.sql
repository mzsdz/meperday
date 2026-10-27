-- Internal DDL event trigger must not be exposed as a client-callable function.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
