import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Send, Bell, X, ExternalLink } from "lucide-react";

const TELEGRAM_URL = "https://telegram.me/organicsmmofficial";

export function TelegramJoinPopup() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Show on every mount (every visit / reload)
    const t = window.setTimeout(() => setOpen(true), 800);
    return () => window.clearTimeout(t);
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
                "conic-gradient(from 0deg, #0ea5e9, #38bdf8, #22d3ee, #0284c7, #0ea5e9)",
            }}
          />
          <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-[#0b1220] via-[#0f172a] to-[#0b1220] ring-1 ring-white/10 shadow-[0_30px_80px_-20px_rgba(14,165,233,0.55)]">
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
                  "radial-gradient(60% 100% at 50% 0%, rgba(14,165,233,0.35), transparent 70%)",
              }}
            />

            <div className="relative p-6 sm:p-7 flex flex-col items-center text-center">
              {/* Icon */}
              <div className="relative mb-4">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-sky-400 to-cyan-500 blur-lg opacity-80 animate-pulse" />
                <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-sky-400 via-sky-500 to-cyan-500 flex items-center justify-center shadow-xl shadow-sky-500/40 ring-1 ring-white/20">
                  <Send className="w-8 h-8 text-white fill-white drop-shadow" />
                </div>
              </div>

              {/* Alert badge */}
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-extrabold tracking-[0.18em] uppercase bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-sm shadow-sky-500/40 mb-3">
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

              <div className="w-full rounded-2xl bg-white/5 ring-1 ring-white/10 p-3 mb-5 text-left">
                <p className="text-[13px] text-slate-200 leading-relaxed">
                  📢 Just as a precaution, please join our{" "}
                  <span className="font-bold text-sky-300">
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
                className="group w-full inline-flex items-center justify-center gap-2 h-12 rounded-2xl text-sm font-bold uppercase tracking-wider text-white bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 ring-1 ring-white/25 shadow-lg shadow-sky-500/40 transition-all hover:scale-[1.02] active:scale-[0.98]"
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