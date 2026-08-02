// Telegram transport that works both on Lovable Cloud (connector gateway)
// and on the self-hosted VPS (direct Bot API with a raw bot token).
const BOT_TOKEN = (Deno.env.get("TELEGRAM_BOT_TOKEN") || Deno.env.get("TELEGRAM_TOKEN") || "").trim();
const LOVABLE_API_KEY = (Deno.env.get("LOVABLE_API_KEY") || "").trim();
const TELEGRAM_API_KEY = (Deno.env.get("TELEGRAM_API_KEY") || "").trim();
const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

export function tgConfigured(): boolean {
  return !!BOT_TOKEN || (!!LOVABLE_API_KEY && !!TELEGRAM_API_KEY);
}

export async function tgCall(path: string, body: Record<string, unknown>): Promise<any> {
  let res: Response;
  if (BOT_TOKEN) {
    res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } else {
    if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) {
      throw new Error("Telegram not configured (set TELEGRAM_BOT_TOKEN)");
    }
    res = await fetch(`${GATEWAY_URL}/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TELEGRAM_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok || data?.ok === false) {
    const detail = data?.description || data?.error || text || `HTTP ${res.status}`;
    throw new Error(`Telegram ${path} failed [${res.status}]: ${detail}`);
  }
  return data;
}

export async function tgWebhookSecret(): Promise<string> {
  const base = BOT_TOKEN || TELEGRAM_API_KEY;
  const data = new TextEncoder().encode(`telegram-webhook:${base}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
