// TEMPORARY one-time auth export (bcrypt hashes). DELETE after migration is verified.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { sqlLiteral } from "../_shared/sql-literal.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-migration-token",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const token = Deno.env.get("MIGRATION_TOKEN");
  if (!token || req.headers.get("x-migration-token") !== token) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // PostgREST caps responses at 1000 rows — page through everything.
  const PAGE = 500;
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .rpc("export_auth_users_for_migration")
      .range(offset, offset + PAGE - 1);
    if (error) {
      return new Response(`-- ERROR: ${error.message}\n`, { status: 500, headers: corsHeaders });
    }
    const page = (data ?? []) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  const out: string[] = [];
  out.push("-- auth.users + bcrypt password hashes (one-time migration)");
  out.push("-- generated: " + new Date().toISOString());
  out.push(`-- users: ${rows.length}`);
  out.push("");

  for (const u of rows) {
    out.push(
      // NOTE: confirmed_at is a GENERATED column in self-hosted Postgres -> never insert it.
      `INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, phone,
  last_sign_in_at, is_sso_user, is_anonymous
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  ${sqlLiteral(u.id)}::uuid,
  'authenticated', 'authenticated',
  ${sqlLiteral(u.email)},
  ${sqlLiteral(u.encrypted_password)},
  ${sqlLiteral(u.email_confirmed_at)}::timestamptz,
  COALESCE(${sqlLiteral(u.raw_app_meta_data)}, '{"provider":"email","providers":["email"]}'::jsonb),
  COALESCE(${sqlLiteral(u.raw_user_meta_data)}, '{}'::jsonb),
  ${sqlLiteral(u.created_at)}::timestamptz,
  ${sqlLiteral(u.updated_at)}::timestamptz,
  ${sqlLiteral(u.phone)},
  ${sqlLiteral(u.last_sign_in_at)}::timestamptz,
  false, false
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  encrypted_password = EXCLUDED.encrypted_password,
  email_confirmed_at = EXCLUDED.email_confirmed_at,
  raw_user_meta_data = EXCLUDED.raw_user_meta_data;`,
    );

    out.push(
      `INSERT INTO auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) VALUES (
  ${sqlLiteral(u.id)},
  ${sqlLiteral(u.id)}::uuid,
  jsonb_build_object('sub', ${sqlLiteral(u.id)}, 'email', ${sqlLiteral(u.email)}, 'email_verified', true, 'phone_verified', false),
  'email',
  ${sqlLiteral(u.last_sign_in_at)}::timestamptz,
  ${sqlLiteral(u.created_at)}::timestamptz,
  ${sqlLiteral(u.updated_at)}::timestamptz
)
ON CONFLICT (provider, provider_id) DO NOTHING;`,
    );
    out.push("");
  }

  return new Response(out.join("\n"), {
    headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
  });
});