import { Link } from "react-router-dom";
import {
  ArrowLeft, Instagram, Youtube, Facebook, Twitter, Music2, Send,
  Eye, Heart, MessageCircle, Users, Repeat2, Bookmark,
  Zap, ShieldCheck, Clock, Layers, Wallet, Headphones, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageMeta } from "@/components/seo/PageMeta";
import { platformPages } from "@/data/platformPages";

const platforms = [
  { icon: Instagram, name: "Instagram", items: ["Reels Views", "Likes", "Followers", "Story Views", "Saves", "Shares"] },
  { icon: Youtube, name: "YouTube", items: ["Video Views", "Shorts Views", "Likes", "Subscribers", "Watch Time"] },
  { icon: Music2, name: "TikTok", items: ["Views", "Likes", "Followers", "Shares", "Saves"] },
  { icon: Facebook, name: "Facebook", items: ["Page Likes", "Post Likes", "Video Views", "Followers"] },
  { icon: Twitter, name: "Twitter / X", items: ["Views", "Likes", "Retweets", "Followers"] },
  { icon: Send, name: "Telegram", items: ["Channel Members", "Post Views", "Reactions"] },
];

const engagementFlow = [
  { icon: Eye, label: "Views", note: "Always delivered first" },
  { icon: Heart, label: "Likes", note: "Starts after views pick up" },
  { icon: MessageCircle, label: "Comments", note: "Natural spacing" },
  { icon: Repeat2, label: "Shares / Reposts", note: "Drip fed" },
  { icon: Bookmark, label: "Saves", note: "Final organic layer" },
  { icon: Users, label: "Followers", note: "Gradual growth" },
];

const features = [
  { icon: Layers, title: "Multi-Provider Rotation", text: "Order automatically rotates across multiple providers — one busy? Next one picks it up instantly." },
  { icon: Clock, title: "Organic Drip Delivery", text: "Engagement is spread over time with variance, so growth looks 100% natural." },
  { icon: Zap, title: "Views-First Sequencing", text: "Views always start before likes, comments and shares — exactly like real virality." },
  { icon: ShieldCheck, title: "Loss Guard Protection", text: "Duplicate or overlapping orders on the same link are blocked and auto-refunded." },
  { icon: Wallet, title: "Prepaid Wallet", text: "Instant UPI & crypto top-ups. No hidden charges, no subscriptions required." },
  { icon: Headphones, title: "24/7 Live Support", text: "Real humans on live chat and Telegram whenever you need help." },
];

const faqs = [
  { question: "What is an SMM panel?", answer: "An SMM panel is a self-serve dashboard where you buy social media engagement — views, likes, followers, comments — for your own posts. OrganicSMM adds organic drip delivery so the growth looks natural instead of bot-like." },
  { question: "Which platforms does OrganicSMM support?", answer: "Instagram, YouTube, TikTok, Facebook, Twitter/X and Telegram, covering views, likes, followers, comments, shares, saves and story views." },
  { question: "Do I need to share my password?", answer: "Never. We only need the public link of the post, Reel, video or profile you want to grow." },
  { question: "How fast do orders start?", answer: "Most orders start within a few minutes. Views always begin first, then likes, comments, shares and saves unlock in sequence." },
  { question: "What is the minimum deposit?", answer: "You can start from ₹50 via UPI, or top up with crypto. Larger top-ups automatically unlock cheaper bundle rates." },
  { question: "What happens if an order fails?", answer: "Failed or duplicate orders are detected by our loss guard and the amount is refunded straight back to your wallet." },
];

export default function Services() {
  return (
    <>
      <PageMeta
        title="Services — Organic Social Media Growth | OrganicSMM"
        description="Explore OrganicSMM services: Instagram, YouTube, TikTok, Facebook, X and Telegram organic views, likes, followers and engagement with natural drip delivery."
        canonicalPath="/services"
        breadcrumbs={[{ name: "Home", path: "/" }, { name: "Services", path: "/services" }]}
        faqItems={faqs}
      />
      <div className="min-h-screen bg-background text-foreground">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <Link to="/">
            <Button variant="ghost" size="sm" className="mb-8 gap-2">
              <ArrowLeft className="h-4 w-4" /> Back to Home
            </Button>
          </Link>

          <header className="mb-12 max-w-2xl">
            <span className="inline-block text-xs font-semibold tracking-widest uppercase text-orange-500 mb-3">
              Our Services
            </span>
            <h1 className="text-4xl font-bold mb-4">Organic growth, delivered the way real audiences behave</h1>
            <p className="text-muted-foreground">
              Every OrganicSMM order runs through a smart engagement engine — views first, then likes,
              comments, shares and saves — spread across multiple providers for a natural footprint.
            </p>
            <div className="flex flex-wrap gap-3 mt-6">
              <Link to="/engagement-order">
                <Button className="gap-2">Place an Order <ArrowRight className="h-4 w-4" /></Button>
              </Link>
              <Link to="/auth">
                <Button variant="outline">Create Free Account</Button>
              </Link>
            </div>
          </header>

          <section className="mb-14">
            <h2 className="text-2xl font-semibold mb-6">Platforms we support</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {platforms.map((p) => (
                <div key={p.name} className="rounded-2xl border border-border bg-card p-6 hover:border-orange-500/50 transition-colors">
                  <p.icon className="h-7 w-7 text-orange-500 mb-3" />
                  <h3 className="font-semibold mb-3">{p.name}</h3>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {p.items.map((i) => <li key={i}>• {i}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-14">
            <h2 className="text-2xl font-semibold mb-2">How an organic engagement order flows</h2>
            <p className="text-muted-foreground mb-6">Each layer unlocks in sequence, never all at once.</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {engagementFlow.map((s, idx) => (
                <div key={s.label} className="rounded-2xl border border-border bg-card p-5 flex gap-4 items-start">
                  <div className="rounded-xl bg-orange-500/10 p-3">
                    <s.icon className="h-5 w-5 text-orange-500" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Step {idx + 1}</p>
                    <h3 className="font-semibold">{s.label}</h3>
                    <p className="text-sm text-muted-foreground">{s.note}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-14">
            <h2 className="text-2xl font-semibold mb-6">What makes OrganicSMM different</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {features.map((f) => (
                <div key={f.title} className="rounded-2xl border border-border bg-card p-6">
                  <f.icon className="h-6 w-6 text-orange-500 mb-3" />
                  <h3 className="font-semibold mb-1">{f.title}</h3>
                  <p className="text-sm text-muted-foreground">{f.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-14">
            <h2 className="text-2xl font-semibold mb-6">Popular SMM panels</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {platformPages.map((p) => (
                <Link key={p.slug} to={`/${p.slug}`} className="rounded-2xl border border-border bg-card p-5 hover:border-orange-500/60 transition-colors">
                  <h3 className="font-semibold mb-1">{p.platform} SMM Panel</h3>
                  <p className="text-sm text-muted-foreground line-clamp-3">{p.description}</p>
                </Link>
              ))}
            </div>
          </section>

          <section className="mb-14">
            <h2 className="text-2xl font-semibold mb-6">Frequently asked questions</h2>
            <div className="space-y-4">
              {faqs.map((f) => (
                <div key={f.question} className="rounded-2xl border border-border bg-card p-6">
                  <h3 className="font-semibold mb-2">{f.question}</h3>
                  <p className="text-sm text-muted-foreground">{f.answer}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-card p-8 text-center">
            <h2 className="text-2xl font-semibold mb-2">Ready to grow organically?</h2>
            <p className="text-muted-foreground mb-6">Top up your wallet and place your first order in under a minute.</p>
            <div className="flex flex-wrap gap-3 justify-center">
              <Link to="/engagement-order"><Button className="gap-2">Start Now <ArrowRight className="h-4 w-4" /></Button></Link>
              <Link to="/support"><Button variant="outline">Talk to Support</Button></Link>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
