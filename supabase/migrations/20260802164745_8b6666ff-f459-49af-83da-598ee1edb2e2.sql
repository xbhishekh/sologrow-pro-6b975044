CREATE OR REPLACE FUNCTION public.export_auth_users_for_migration()
RETURNS TABLE(
  id uuid,
  email text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb,
  raw_app_meta_data jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  phone text,
  confirmed_at timestamptz,
  last_sign_in_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT u.id,
         u.email::text,
         u.encrypted_password::text,
         u.email_confirmed_at,
         u.raw_user_meta_data,
         u.raw_app_meta_data,
         u.created_at,
         u.updated_at,
         u.phone::text,
         u.confirmed_at,
         u.last_sign_in_at
  FROM auth.users u
  ORDER BY u.created_at
$$;

REVOKE ALL ON FUNCTION public.export_auth_users_for_migration() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.export_auth_users_for_migration() FROM anon;
REVOKE ALL ON FUNCTION public.export_auth_users_for_migration() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.export_auth_users_for_migration() TO service_role;