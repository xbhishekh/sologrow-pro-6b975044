import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, TrendingUp, Zap, Shield, BarChart3, CheckCircle2, Shuffle, Clock, Moon, Timer, Eye, ChevronRight, FileText, Lock, HelpCircle, Mail, Code2, Activity, Sparkles, Star, Link2, Heart, MessageCircle, Bookmark, Share2, Brain, ArrowDown } from 'lucide-react';
import logo from '@/assets/logo.jpg';
import { PageMeta } from '@/components/seo/PageMeta';

// Brand palette — clean light + soft orange
const C = {
  bg: '#FAFAF7',
  ink: '#0B0B12',
  ink2: '#5B5B6B',
  muted: '#6B6B78',
  line: 'rgba(11,11,18,.07)',
  card: '#FFFFFF',
  orange: '#10B981',
  orangeDeep: '#059669',
  peach: '#ECFDF5',
  soft: '0 1px 2px rgba(11,11,18,.04), 0 8px 24px rgba(11,11,18,.05)',
  softLg: '0 2px 4px rgba(11,11,18,.04), 0 24px 60px rgba(16,185,129,.12)',
};

const Pill: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[11px] sm:text-[12px] font-semibold"
    style={{ background: C.peach, color: C.orangeDeep, border: `1px solid rgba(16,185,129,.20)` }}>
    {children}
  </span>
);

// ── Live activity ticker ──────────────────────────────────────────
const ACTIVITY = [
  { t: 'Instagram Reel', q: '12,500 views', c: '#3B82F6', city: 'Mumbai' },
  { t: 'YouTube Short', q: '4,200 views', c: '#EF4444', city: 'Delhi' },
  { t: 'Instagram Post', q: '1,800 likes', c: '#EC4899', city: 'Dubai' },
  { t: 'TikTok Video', q: '9,000 views', c: '#0B0B12', city: 'London' },
  { t: 'Instagram Reel', q: '640 shares', c: '#10B981', city: 'Bengaluru' },
  { t: 'Instagram Story', q: '2,300 views', c: '#8B5CF6', city: 'Toronto' },
];

const LiveTicker: React.FC = () => {
  const [i, setI] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setI((v) => (v + 1) % ACTIVITY.length), 3200);
    return () => clearInterval(id);
  }, []);
  const a = ACTIVITY[i];
  return (
    <div className="flex justify-center px-4 mt-4">
      <div key={i} className="inline-flex items-center gap-2.5 pl-2.5 pr-3.5 py-1.5 rounded-full animate-fade-in max-w-full"
        style={{ background: 'rgba(255,255,255,.85)', border: `1px solid ${C.line}`, boxShadow: C.soft }}>
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: '#10B981' }} />
          <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: '#10B981' }} />
        </span>
        <span className="text-[11.5px] sm:text-[12.5px] font-medium truncate" style={{ color: C.ink2 }}>
          <strong style={{ color: a.c }}>{a.q}</strong> delivering to a {a.t} · {a.city}
        </span>
      </div>
    </div>
  );
};

// ── Count-up number ───────────────────────────────────────────────
const CountUp: React.FC<{ to: number; suffix?: string; decimals?: number }> = ({ to, suffix = '', decimals = 0 }) => {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [val, setVal] = React.useState(0);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const dur = 1400;
      const tick = (now: number) => {
        const p = Math.min((now - start) / dur, 1);
        setVal(to * (1 - Math.pow(1 - p, 3)));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.3 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to]);
  return <span ref={ref}>{val.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</span>;
};

const Index = () => {
  return (
    <div className="min-h-screen w-full overflow-x-hidden" style={{ background: C.bg, color: C.ink, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <PageMeta
        title="OrganicSMM — Organic Social Media Growth Platform"
        description="Revolutionary organic social media growth with natural delivery patterns. 100% safe for your accounts."
        canonicalPath="/"
        breadcrumbs={[{ name: 'Home', path: '/' }]}
      />

      {/* Subtle background glow */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[1100px] h-[600px] rounded-full"
          style={{ background: 'radial-gradient(closest-side, rgba(16,185,129,.20), transparent 70%)', filter: 'blur(20px)' }} />
        <div className="absolute top-[40%] -right-40 w-[500px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(closest-side, rgba(110,231,183,.25), transparent 70%)', filter: 'blur(20px)' }} />
      </div>

      {/* ═══ NAV ═══ */}
      <nav className="sticky top-3 z-50 w-full px-3 sm:px-4">
        <div className="max-w-6xl mx-auto rounded-2xl flex items-center justify-between h-14 px-3 sm:px-4"
          style={{ background: 'rgba(255,255,255,.78)', backdropFilter: 'blur(18px) saturate(160%)', border: `1px solid ${C.line}`, boxShadow: C.soft }}>
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="relative">
              <div className="absolute -inset-1 rounded-2xl opacity-60 blur-md transition-opacity group-hover:opacity-90"
                style={{ background: `linear-gradient(135deg, ${C.orange}, #6EE7B7)` }} />
              <img src={logo} alt="OrganicSMM platform logo" width={36} height={36} fetchPriority="high" decoding="async" className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-xl object-cover bg-white"
                style={{ border: '1.5px solid white', boxShadow: C.soft }} />
            </div>
            <div className="flex items-center gap-2 leading-none">
              <span className="text-[15px] sm:text-[16px] font-extrabold tracking-tight" style={{ color: C.ink }}>OrganicSMM</span>
              <span className="hidden sm:inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.14em] px-1.5 py-[3px] rounded-md"
                style={{ background: C.peach, color: C.orangeDeep }}>v2.0</span>
            </div>
          </Link>
          <div className="hidden md:flex items-center gap-7">
            {['Features', 'How it works', 'Why us'].map((t, i) => (
              <a key={t} href={['#features', '#how-it-works', '#comparison'][i]}
                className="text-[13px] font-medium transition-colors hover:opacity-100" style={{ color: C.ink2 }}>
                {t}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Link to="/auth" className="hidden sm:inline-flex h-9 px-3.5 items-center text-[13px] font-semibold rounded-xl transition-colors"
              style={{ color: C.ink2 }}>
              Sign in
            </Link>
            <Link to="/auth" className="h-9 sm:h-10 px-4 sm:px-5 rounded-xl text-[12.5px] sm:text-[13px] font-semibold text-white inline-flex items-center gap-1.5"
              style={{ background: C.ink, boxShadow: C.soft }}>
              Get Started <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </nav>

      {/* ═══ HERO ═══ */}
      <main>
      <section className="pt-14 sm:pt-20 lg:pt-28 pb-12 sm:pb-16 text-center px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 mb-6">
            <Pill>
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: C.orange }} />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: C.orange }} />
              </span>
              v2.0 — World's first AI-organic panel
            </Pill>
          </div>

          <h1 className="text-[2.4rem] sm:text-5xl lg:text-[4.5rem] font-black leading-[1.04] tracking-[-0.035em] mb-5"
            style={{ color: C.ink, fontFamily: "'Outfit', 'Inter', system-ui, sans-serif" }}>
            Organic growth,<br className="hidden sm:block" />
            <span style={{ color: C.orangeDeep }}>made simple.</span>
          </h1>

          <p className="text-[15px] sm:text-[17.5px] leading-[1.65] mb-9 max-w-xl mx-auto" style={{ color: C.ink2 }}>
            Natural delivery patterns that look, feel and behave like real people.
            100% safe for your accounts — zero bans, ever.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-8">
            <Link to="/auth" className="w-full sm:w-auto h-12 px-7 rounded-xl text-[14.5px] font-semibold text-white flex items-center justify-center gap-2 transition-transform hover:-translate-y-0.5"
              style={{ background: `linear-gradient(135deg, ${C.orange}, ${C.orangeDeep})`, boxShadow: '0 10px 30px rgba(16,185,129,.38)' }}>
              <Sparkles className="w-4 h-4" /> Start growing free
            </Link>
            <Link to="/auth" className="w-full sm:w-auto h-12 px-7 rounded-xl text-[14.5px] font-semibold flex items-center justify-center gap-2 transition-colors"
              style={{ color: C.ink, background: C.card, border: `1px solid ${C.line}`, boxShadow: C.soft }}>
              View services <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="flex items-center justify-center gap-x-5 gap-y-2 flex-wrap text-[12px] sm:text-[13px] font-medium" style={{ color: C.muted }}>
            {['No credit card', 'All features included', 'Setup in seconds'].map((t) => (
              <span key={t} className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#10b981' }} /> {t}</span>
            ))}
          </div>

          {/* social proof bar */}
          <div className="mt-12 flex items-center justify-center gap-6 sm:gap-10 flex-wrap">
            <div className="flex items-center gap-1.5">
              {[1,2,3,4,5].map(i => <Star key={i} className="w-4 h-4 fill-current" style={{ color: '#FFB400' }} />)}
              <span className="text-[12.5px] font-semibold ml-1" style={{ color: C.ink }}>4.9/5</span>
              <span className="text-[12px]" style={{ color: C.muted }}>· 2,400+ creators</span>
            </div>
            <span className="hidden sm:inline-block w-px h-5" style={{ background: C.line }} />
            <span className="text-[12.5px] font-medium" style={{ color: C.ink2 }}>
              <strong style={{ color: C.ink }}>50,000+</strong> orders delivered
            </span>
          </div>
        </div>
      </section>

      {/* ═══ FEATURES ROW ═══ */}
      {/* ═══ LIVE STATS BAND ═══ */}
      <section className="px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto rounded-3xl px-5 py-7 sm:px-10 sm:py-9"
          style={{ background: C.card, border: `1px solid ${C.line}`, boxShadow: C.softLg }}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { v: <CountUp to={52480} />, s: 'Orders delivered', icon: Activity },
              { v: <CountUp to={2400} suffix="+" />, s: 'Active creators', icon: TrendingUp },
              { v: <CountUp to={99.9} decimals={1} suffix="%" />, s: 'Success rate', icon: Zap },
              { v: <CountUp to={0} />, s: 'Accounts banned', icon: Shield },
            ].map((st, i) => (
              <div key={i} className="text-center">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center mx-auto mb-2.5" style={{ background: C.peach }}>
                  <st.icon className="w-4 h-4" style={{ color: C.orangeDeep }} />
                </div>
                <div className="text-[1.6rem] sm:text-[2.1rem] font-black tracking-tight tabular-nums"
                  style={{ color: C.ink, fontFamily: "'Outfit', system-ui" }}>{st.v}</div>
                <div className="text-[11.5px] font-medium mt-1" style={{ color: C.muted }}>{st.s}</div>
              </div>
            ))}
          </div>

          {/* platform marquee */}
          <div className="mt-8 pt-6 overflow-hidden" style={{ borderTop: `1px solid ${C.line}` }}>
            <p className="text-center text-[10.5px] font-bold uppercase tracking-[0.18em] mb-4" style={{ color: C.muted }}>
              Works across every major platform
            </p>
            <div className="relative">
              <div className="flex w-max gap-3 animate-marquee hover:[animation-play-state:paused]">
                {[...Array(2)].map((_, dup) => (
                  <React.Fragment key={dup}>
                    {['Instagram Reels', 'Instagram Posts', 'Instagram Stories', 'YouTube Shorts', 'YouTube Videos', 'TikTok', 'Facebook', 'Twitter / X', 'Spotify', 'Telegram'].map((p) => (
                      <span key={dup + p} className="whitespace-nowrap px-4 py-2 rounded-xl text-[12.5px] font-semibold"
                        style={{ background: '#FAFAF7', border: `1px solid ${C.line}`, color: C.ink2 }}>{p}</span>
                    ))}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="py-12 sm:py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <Pill><Zap className="w-3 h-3" /> Features no other panel has</Pill>
            <h2 className="mt-4 text-[1.75rem] sm:text-4xl lg:text-[2.75rem] font-extrabold tracking-tight"
              style={{ color: C.ink, fontFamily: "'Outfit', system-ui" }}>
              Engineered to look <span style={{ color: C.orange }}>perfectly natural</span>
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
            {[
              { icon: TrendingUp, title: 'S-Curve Pattern', desc: 'Natural viral growth simulation' },
              { icon: Shuffle, title: '±50% Variance', desc: 'Random qty each delivery' },
              { icon: Clock, title: 'Peak Hour Boost', desc: '1.5x during 6–10 PM IST' },
              { icon: Moon, title: 'Night Slowdown', desc: 'Realistic sleep patterns' },
              { icon: Timer, title: '±5min Jitter', desc: 'Anti-detection timing' },
              { icon: Eye, title: 'Live Preview', desc: 'See delivery before order' },
            ].map((f) => (
              <div key={f.title} className="group rounded-2xl p-4 sm:p-5 text-center transition-all hover:-translate-y-1"
                style={{ background: C.card, border: `1px solid ${C.line}`, boxShadow: C.soft }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-2.5 transition-colors group-hover:scale-105"
                  style={{ background: C.peach }}>
                  <f.icon className="w-4.5 h-4.5" style={{ color: C.orangeDeep, width: 18, height: 18 }} />
                </div>
                <h3 className="text-[12.5px] font-bold mb-1" style={{ color: C.ink }}>{f.title}</h3>
                <p className="text-[10.5px] leading-relaxed" style={{ color: C.muted }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ COMPARISON ═══ */}
      <section id="comparison" className="py-10 sm:py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto rounded-3xl overflow-hidden"
          style={{ background: C.card, border: `1px solid ${C.line}`, boxShadow: C.softLg }}>
          <div className="grid md:grid-cols-2">
            {/* Regular */}
            <div className="p-6 sm:p-9">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: '#F4F4F0' }}>
                  <span className="text-[16px]" style={{ color: C.muted }}>×</span>
                </div>
                <span className="text-[15px] font-bold" style={{ color: C.ink }}>Regular SMM Panels</span>
              </div>
              <div className="space-y-3">
                {[
                  'Same quantity every batch — easy to detect',
                  'Fixed intervals — bot pattern visible',
                  '24/7 delivery — unnatural behavior',
                  'Accounts get flagged & banned',
                ].map((t) => (
                  <div key={t} className="flex items-start gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0" style={{ background: '#EF4444' }} />
                    <span className="text-[13px] leading-relaxed" style={{ color: C.ink2 }}>{t}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Us */}
            <div className="p-6 sm:p-9 relative" style={{ background: 'linear-gradient(180deg, #ECFDF5, #FFFFFF)' }}>
              <span className="absolute top-5 right-5 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md"
                style={{ background: C.orange, color: 'white' }}>This panel</span>
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: '#D1FAE5' }}>
                  <CheckCircle2 className="w-4.5 h-4.5" style={{ color: '#10B981', width: 18, height: 18 }} />
                </div>
                <span className="text-[15px] font-bold" style={{ color: C.ink }}>OrganicSMM</span>
              </div>
              <div className="space-y-3">
                {[
                  'Random variance — looks like real users',
                  'Jittered timing — undetectable patterns',
                  'Peak hours + night slow — human behavior',
                  '100% safe, zero bans reported',
                ].map((t) => (
                  <div key={t} className="flex items-start gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0" style={{ background: '#10B981' }} />
                    <span className="text-[13px] leading-relaxed" style={{ color: C.ink2 }}>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-center gap-6 sm:gap-10 flex-wrap py-5 px-6"
            style={{ borderTop: `1px solid ${C.line}`, background: '#FAFAF7' }}>
            {[
              { icon: '🏆', text: '50,000+ Orders Delivered' },
              { icon: '🛡️', text: 'Zero Account Bans' },
              { icon: '⚡', text: '99.9% Success Rate' },
            ].map((s) => (
              <span key={s.text} className="flex items-center gap-2 text-[12.5px] font-semibold" style={{ color: C.ink2 }}>
                <span>{s.icon}</span> {s.text}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ HOW IT WORKS — step-by-step explainer ═══ */}
      <section id="how-it-works" className="py-14 sm:py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10 sm:mb-14">
            <Pill><Sparkles className="w-3 h-3" /> How it works</Pill>
            <h2 className="mt-4 text-[1.85rem] sm:text-4xl lg:text-[2.75rem] font-extrabold tracking-tight"
              style={{ color: C.ink, fontFamily: "'Outfit', system-ui" }}>
              One link. <span style={{ color: C.orange }}>Full engagement.</span><br className="hidden sm:block" /> Delivered organically.
            </h2>
            <p className="mt-4 text-[14px] sm:text-[16px] leading-[1.65] max-w-2xl mx-auto" style={{ color: C.ink2 }}>
              Paste your post link once. Views, likes, comments, saves and shares are all delivered automatically — in patterns that look exactly like real users.
            </p>
          </div>

          {/* Visual: one link → 5 engagement types */}
          <div className="mb-10 sm:mb-14 rounded-3xl p-5 sm:p-8"
            style={{ background: C.card, border: `1px solid ${C.line}`, boxShadow: C.softLg }}>
            <div className="flex items-center gap-3 mb-5 px-3 py-2.5 rounded-xl" style={{ background: '#F7F8F5', border: `1px dashed ${C.line}` }}>
              <Link2 className="w-4 h-4 shrink-0" style={{ color: C.orangeDeep }} />
              <span className="text-[12.5px] font-mono truncate" style={{ color: C.ink2 }}>https://instagram.com/p/your-post...</span>
              <span className="ml-auto text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md shrink-0"
                style={{ background: C.peach, color: C.orangeDeep }}>1 link</span>
            </div>
            <div className="flex justify-center my-3">
              <ArrowDown className="w-5 h-5 animate-bounce" style={{ color: C.orange }} />
            </div>
            <div className="grid grid-cols-5 gap-2 sm:gap-3">
              {[
                { icon: Eye, label: 'Views', color: '#3B82F6' },
                { icon: Heart, label: 'Likes', color: '#EF4444' },
                { icon: MessageCircle, label: 'Comments', color: '#8B5CF6' },
                { icon: Bookmark, label: 'Saves', color: '#F59E0B' },
                { icon: Share2, label: 'Shares', color: '#10B981' },
              ].map((e) => (
                <div key={e.label} className="flex flex-col items-center gap-1.5 p-2.5 sm:p-3 rounded-xl"
                  style={{ background: '#FAFAF7', border: `1px solid ${C.line}` }}>
                  <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center"
                    style={{ background: `${e.color}14` }}>
                    <e.icon className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: e.color }} />
                  </div>
                  <span className="text-[10.5px] sm:text-[12px] font-bold" style={{ color: C.ink }}>{e.label}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-center text-[11.5px] sm:text-[12.5px]" style={{ color: C.muted }}>
              Everything in one single order — pick and choose what you need.
            </p>
          </div>

          {/* 4 steps */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {[
              {
                step: '01',
                icon: Link2,
                title: 'Paste your link',
                desc: 'Drop in any Instagram, YouTube or TikTok post link. That is the only input we need.',
              },
              {
                step: '02',
                icon: Sparkles,
                title: 'Pick engagement',
                desc: 'Toggle Views, Likes, Comments, Saves and Shares — set the quantity you want for each.',
              },
              {
                step: '03',
                icon: Brain,
                title: 'AI plans delivery',
                desc: 'S-curve schedule, ±50% quantity variance, peak-hour boost and night slowdown — all auto-calculated.',
              },
              {
                step: '04',
                icon: TrendingUp,
                title: 'Grow naturally',
                desc: 'Engagement trickles in over hours instead of dumping at once. Live progress visible. Zero ban risk.',
              },
            ].map((s) => (
              <div key={s.step} className="relative rounded-2xl p-5 sm:p-6"
                style={{ background: C.card, border: `1px solid ${C.line}`, boxShadow: C.soft }}>
                <span className="absolute -top-2.5 -right-2.5 text-[10px] font-extrabold tracking-widest px-2.5 py-1 rounded-lg"
                  style={{ background: C.ink, color: 'white' }}>{s.step}</span>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3.5"
                  style={{ background: C.peach }}>
                  <s.icon className="w-5 h-5" style={{ color: C.orangeDeep }} />
                </div>
                <h3 className="text-[14.5px] font-bold mb-1.5" style={{ color: C.ink }}>{s.title}</h3>
                <p className="text-[12.5px] leading-relaxed" style={{ color: C.ink2 }}>{s.desc}</p>
              </div>
            ))}
          </div>

          {/* What "organic" actually means */}
          <div className="mt-10 sm:mt-14 rounded-2xl p-5 sm:p-7"
            style={{ background: 'linear-gradient(135deg, #ECFDF5, #FFFFFF)', border: `1px solid rgba(16,185,129,.20)` }}>
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-4 h-4" style={{ color: C.orangeDeep }} />
              <span className="text-[12px] font-bold uppercase tracking-widest" style={{ color: C.orangeDeep }}>
                What "organic" actually means here
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {[
                'Every batch ships a randomised quantity (±50%) — the same number is never repeated.',
                'Peak hours (6–10 PM IST) run at 1.5× speed, night hours slow down — mirroring real user behaviour.',
                '±5 min timing jitter on every run — impossible to detect any bot pattern.',
                'Multi-provider rotation keeps quality consistent with no single point of failure.',
              ].map((t) => (
                <div key={t} className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#10B981' }} />
                  <span className="text-[13px] leading-relaxed" style={{ color: C.ink2 }}>{t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="py-12 sm:py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto rounded-[28px] text-center py-14 sm:py-20 px-6 sm:px-10 relative overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${C.ink} 0%, #1A1A28 100%)`, boxShadow: C.softLg }}>
          {/* glow */}
          <div aria-hidden className="absolute -top-32 -right-32 w-[400px] h-[400px] rounded-full"
            style={{ background: `radial-gradient(closest-side, rgba(16,185,129,.42), transparent 70%)`, filter: 'blur(20px)' }} />
          <div aria-hidden className="absolute -bottom-32 -left-32 w-[400px] h-[400px] rounded-full"
            style={{ background: `radial-gradient(closest-side, rgba(110,231,183,.32), transparent 70%)`, filter: 'blur(20px)' }} />

          <div className="relative">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-widest mb-5"
              style={{ background: 'rgba(255,255,255,.1)', color: '#6EE7B7', border: '1px solid rgba(134,239,172,.2)' }}>
              <Sparkles className="w-3 h-3" /> Free to start
            </span>
            <h2 className="text-[1.85rem] sm:text-4xl lg:text-[2.75rem] font-extrabold tracking-tight mb-4 text-white"
              style={{ fontFamily: "'Outfit', system-ui" }}>
              Ready to grow <span style={{ color: '#6EE7B7' }}>organically</span>?
            </h2>
            <p className="text-[14.5px] sm:text-[16px] mb-8 max-w-md mx-auto" style={{ color: 'rgba(255,255,255,.7)' }}>
              Join thousands of creators using our organic delivery system. No credit card required.
            </p>
            <Link to="/auth" className="inline-flex h-12 sm:h-13 px-8 rounded-xl text-[14.5px] font-bold items-center gap-2 transition-transform hover:-translate-y-0.5"
              style={{ background: 'white', color: C.ink, boxShadow: '0 10px 30px rgba(0,0,0,.25)' }}>
              Create free account <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>
      </main>

      {/* ═══ FOOTER ═══ */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8" style={{ background: C.bg, borderTop: `1px solid ${C.line}` }}>
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
            <div className="col-span-2 sm:col-span-1">
              <div className="flex items-center gap-2.5 mb-4">
                <img src={logo} alt="OrganicSMM platform logo" className="w-9 h-9 rounded-xl object-cover" style={{ border: `1px solid ${C.line}` }} />
                <span className="text-[15px] font-bold" style={{ color: C.ink }}>OrganicSMM</span>
              </div>
              <p className="text-[13px] leading-relaxed" style={{ color: C.muted }}>
                Revolutionary organic social media growth platform with natural delivery patterns.
              </p>
            </div>
            <div>
              <h4 className="text-[12px] font-bold uppercase tracking-wider mb-4" style={{ color: C.ink }}>Quick Links</h4>
              <div className="space-y-2.5">
                <Link to="/auth" className="block text-[13px] hover:text-emerald-600 transition-colors" style={{ color: C.ink2 }}>Get Started</Link>
              </div>
            </div>
            <div>
              <h4 className="text-[12px] font-bold uppercase tracking-wider mb-4" style={{ color: C.ink }}>Legal</h4>
              <div className="space-y-2.5">
                {[
                  { to: '/terms', icon: FileText, label: 'Terms of Service' },
                  { to: '/privacy', icon: Lock, label: 'Privacy Policy' },
                  { to: '/refund', icon: FileText, label: 'Refund Policy' },
                  { to: '/shipping', icon: FileText, label: 'Shipping & Delivery' },
                  { to: '/cookies', icon: FileText, label: 'Cookie Policy' },
                ].map((l) => (
                  <Link key={l.to} to={l.to} className="flex items-center gap-1.5 text-[13px] hover:text-emerald-600 transition-colors" style={{ color: C.ink2 }}>
                    <l.icon className="w-3 h-3 flex-shrink-0" /> {l.label}
                  </Link>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-[12px] font-bold uppercase tracking-wider mb-4" style={{ color: C.ink }}>Support</h4>
              <div className="space-y-2.5">
                {[
                  { to: '/about', icon: HelpCircle, label: 'About Us' },
                  { to: '/contact', icon: Mail, label: 'Contact Us' },
                  { to: '/support', icon: HelpCircle, label: 'Help Center' },
                  { to: '/api-access', icon: Code2, label: 'API Documentation' },
                ].map((l) => (
                  <Link key={l.label} to={l.to} className="flex items-center gap-1.5 text-[13px] hover:text-emerald-600 transition-colors" style={{ color: C.ink2 }}>
                    <l.icon className="w-3 h-3 flex-shrink-0" /> {l.label}
                  </Link>
                ))}
                <a href="mailto:support@organicsmm.online" className="block text-[12px] mt-2" style={{ color: C.muted }}>support@organicsmm.online</a>
                <a href="tel:+13678288027" className="block text-[12px]" style={{ color: C.muted }}>+1 (367) 828-8027</a>
                <p className="text-[12px] leading-relaxed mt-2" style={{ color: C.muted }}>
                  OrganicSMM LLC<br />
                  8 The Green, Suite #14490<br />
                  Dover, DE 19901<br />
                  United States
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6" style={{ borderTop: `1px solid ${C.line}` }}>
            <p className="text-[12px]" style={{ color: C.muted }}>© {new Date().getFullYear()} OrganicSMM LLC — Dover, Delaware, USA. All rights reserved.</p>
            <div className="flex items-center gap-5 text-[12px] font-medium" style={{ color: C.muted }}>
              <span className="flex items-center gap-1"><Shield className="w-3 h-3" style={{ color: '#10b981' }} /> SSL Secured</span>
              <span className="flex items-center gap-1"><Zap className="w-3 h-3" style={{ color: C.orange }} /> 99.9% Uptime</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
