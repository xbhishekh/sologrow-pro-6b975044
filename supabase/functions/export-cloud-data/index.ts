// TEMPORARY one-time migration export. DELETE after self-host migration is verified.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { buildInsert, ident } from "../_shared/sql-literal.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-migration-token",
};

// FK-safe order: parents first.
const TABLES = [
  "providers",
  "platform_settings",
  "popup_ads",
  "profiles",
  "wallets",
  "user_roles",
  "subscriptions",
  "subscription_requests",
  "services",
  "provider_accounts",
  "service_provider_mapping",
  "engagement_bundles",
  "bundle_items",
  "orders",
  "engagement_orders",
  "engagement_order_items",
  "organic_run_schedule",
  "transactions",
  "deposits",
  "support_tickets",
  "chat_conversations",
  "chat_messages",
  "oxapay_deposits",
  "oxapay_webhook_events",
  "zapupi_deposits",
  "zapupi_webhook_events",
  "razorpay_webhook_events",
  "admin_audit_log",
  "rotation_alert_state",
];

const PAGE = 500;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const token = Deno.env.get("MIGRATION_TOKEN");
  if (!token || req.headers.get("x-migration-token") !== token) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const only = url.searchParams.get("table");
  const tables = only ? TABLES.filter((t) => t === only) : TABLES;
  if (only && tables.length === 0) {
    return new Response("Unknown table", { status: 400, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const push = (s: string) => controller.enqueue(enc.encode(s));
      try {
        push("-- Lovable Cloud -> self-host data export\n");
        push("-- generated: " + new Date().toISOString() + "\n");
        push("SET session_replication_role = replica;\n\n");

        for (const table of tables) {
          push(`-- ==== ${table} ====\n`);
          let offset = 0;
          let total = 0;
          for (;;) {
            const { data, error } = await supabase
              .from(table)
              .select("*")
              .range(offset, offset + PAGE - 1);
            if (error) {
              push(`-- ERROR reading ${table}: ${error.message}\n`);
              break;
            }
            if (!data || data.length === 0) break;
            push(buildInsert(table, data as Record<string, unknown>[]));
            total += data.length;
            if (data.length < PAGE) break;
            offset += PAGE;
          }
          push(`-- ${table}: ${total} rows\n\n`);
        }

        push("SET session_replication_role = origin;\n\n");
        push("-- reset identity sequences\n");
        push(`DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl, a.attname AS col, pg_get_serial_sequence('public.'||c.relname, a.attname) AS seq
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND pg_get_serial_sequence('public.'||c.relname, a.attname) IS NOT NULL
  LOOP
    EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM public.%I), 1))', r.seq, r.col, r.tbl);
  END LOOP;
END $$;\n`);
        push("-- done\n");
      } catch (e) {
        push(`-- FATAL: ${e instanceof Error ? e.message : String(e)}\n`);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
  });
});

// keep ident import referenced for tooling
void ident;