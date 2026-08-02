import { tgCall, tgConfigured } from './telegram.ts'

type DepositNotification = {
  userId: string
  orderId: string
  method: string
  status: 'success' | 'failed'
  amountInr?: number | null
  amountUsd?: number | null
  reason?: string
}

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

async function send(chatId: string, text: string) {
  return await tgCall('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  })
}

export async function notifyDepositDirect(admin: any, input: DepositNotification) {
  if (!tgConfigured()) throw new Error('Telegram bot is not configured')

  const [{ data: profile }, { data: wallet }] = await Promise.all([
    admin.from('profiles')
      .select('email, telegram_chat_id, telegram_notifications_enabled')
      .eq('user_id', input.userId).maybeSingle(),
    admin.from('wallets').select('balance').eq('user_id', input.userId).maybeSingle(),
  ])

  const success = input.status === 'success'
  const amountInr = input.amountInr != null ? `₹${Number(input.amountInr).toFixed(2)}` : '—'
  const amountUsd = input.amountUsd != null ? ` ($${Number(input.amountUsd).toFixed(2)})` : ''
  const balanceInr = wallet?.balance != null ? `₹${(Number(wallet.balance) * 90).toFixed(2)}` : '—'
  const adminChatId = (Deno.env.get('TELEGRAM_CHAT_ID') || '').trim()
  const common = [
    `👤 <b>User:</b> ${esc(profile?.email ?? input.userId)}`,
    `💵 <b>Amount:</b> ${esc(amountInr)}${esc(amountUsd)}`,
    success ? `🏦 <b>New Balance:</b> ${esc(balanceInr)}` : '',
    `💳 <b>Method:</b> ${esc(input.method.toUpperCase())}`,
    `🆔 <b>Order:</b> <code>${esc(input.orderId)}</code>`,
    input.reason ? `📛 <b>Reason:</b> ${esc(input.reason)}` : '',
  ].filter(Boolean)

  const results: Record<string, unknown> = {}
  if (adminChatId) {
    results.admin = await send(adminChatId, [
      success ? '💰 <b>Deposit Success</b>' : '⚠️ <b>Deposit Failed</b>',
      '', ...common,
    ].join('\n'))
  } else {
    throw new Error('TELEGRAM_CHAT_ID is not configured')
  }

  if (profile?.telegram_chat_id && profile?.telegram_notifications_enabled !== false) {
    results.user = await send(String(profile.telegram_chat_id), [
      success ? '✅ <b>Deposit Successful</b>' : '❌ <b>Deposit Failed</b>',
      '', ...common.slice(1),
      success ? '\nThank you! Aap ab order laga sakte hain. 🚀' : '\nSupport se contact karein agar amount kat gaya hai.',
    ].join('\n'))
  }

  return results
}