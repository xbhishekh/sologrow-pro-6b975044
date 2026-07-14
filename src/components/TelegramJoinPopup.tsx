import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Send, Bell, X, ExternalLink } from "lucide-react";

const TELEGRAM_URL = "https://telegram.me/organicsmmofficial";
const LAST_SHOWN_KEY = "tg_join_popup_last_shown_v1";
const MIN_GAP_MS = 10 * 60 * 1000; // 10 minutes between popups in the same session

export function TelegramJoinPopup() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Show on every fresh visit / login, but throttle: don't re-show within 10 min.
    const shouldShow = () => {
      try {
        const last = Number(localStorage.getItem(LAST_SHOWN_KEY) || 0);
        return !last || Date.now() - last >= MIN_GAP_MS;
      } catch {
        return true;
      }
    };

    const trigger = () => {
      if (!shouldShow()) return;
      try { localStorage.setItem(LAST_SHOWN_KEY, String(Date.now())); } catch { /* ignore */ }
      setOpen(true);
    };

    // Initial show shortly after mount (covers page load & login redirect)
    const t = window.setTimeout(trigger, 800);

    // Re-show when user comes back to the tab after being away
    const onVisibility = () => {
      if (document.visibilityState === "visible") trigger();
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Periodic check so long sessions also see the popup every 10 min
    const interval = window.setInterval(trigger, 60 * 1000);

    return () => {
      window.clearTimeout(t);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="w-[calc(100vw-1rem)] sm:w-[92vw] max-w-md p-0 border-0 bg-transparent shadow-none rounded-3xl [&>button.absolute]:hidden"
      >
        <div className="relative">
          {/* Glow */}
          <div
            aria-hidden
            className="absolute -inset-[2px] rounded-[26px] opacity-90 blur-[8px] animate-pulse"
            style={{
              background:
                "conic-gradient(from 0deg, #16a34a, #22c55e, #4ade80, #10b981, #16a34a)",
            }}
          />
          <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-[#04140b] via-[#062818] to-[#04140b] ring-1 ring-emerald-400/20 shadow-[0_30px_80px_-20px_rgba(34,197,94,0.55)]">
            {/* Close */}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md ring-1 ring-white/20 flex items-center justify-center text-white transition"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Top glow */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-32 opacity-70"
              style={{
                background:
                  "radial-gradient(60% 100% at 50% 0%, rgba(34,197,94,0.4), transparent 70%)",
              }}
            />

            <div className="relative p-6 sm:p-7 flex flex-col items-center text-center">
              {/* Icon */}
              <div className="relative mb-4">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-400 to-green-500 blur-lg opacity-80 animate-pulse" />
                <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 via-green-500 to-emerald-600 flex items-center justify-center shadow-xl shadow-emerald-500/40 ring-1 ring-white/20">
                  <Send className="w-8 h-8 text-white fill-white drop-shadow" />
                </div>
              </div>

              {/* Alert badge */}
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold tracking-[0.18em] uppercase bg-gradient-to-r from-emerald-500 to-green-500 text-white shadow-sm shadow-emerald-500/40 mb-3">
                <Bell className="w-3 h-3" /> Stay Updated
              </span>

              <h3 className="text-xl sm:text-2xl font-extrabold text-white leading-tight tracking-tight mb-2">
                Join Our Official Telegram Channel
              </h3>

              <p className="text-sm text-slate-300/90 leading-relaxed mb-4">
                Our users have been earning really well with OrganicSMM, and because
                of that a few competitors have been trying to{" "}
                <span className="font-semibold text-white">attack the site</span>.
                Nothing to worry about — everything is running{" "}
                <span className="font-semibold text-white">safe and smooth</span>.
              </p>

              <div className="w-full rounded-2xl bg-emerald-500/5 ring-1 ring-emerald-400/15 p-3 mb-5 text-left">
                <p className="text-[13px] text-slate-200 leading-relaxed">
                  📢 Just as a precaution, please join our{" "}
                  <span className="font-bold text-emerald-300">
                    official Telegram channel
                  </span>{" "}
                  so you never miss any updates, offers, or important announcements.
                </p>
              </div>

              {/* CTA */}
              <a
                href={TELEGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="group w-full inline-flex items-center justify-center gap-2 h-12 rounded-2xl text-sm font-bold uppercase tracking-wider text-white bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-400 hover:to-green-400 ring-1 ring-white/25 shadow-lg shadow-emerald-500/40 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <Send className="w-4 h-4" />
                Join Telegram Channel
                <ExternalLink className="w-3.5 h-3.5 opacity-80" />
              </a>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="mt-3 text-[12px] text-slate-400 hover:text-slate-200 transition"
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}