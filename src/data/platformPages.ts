export interface PlatformService {
  name: string;
  desc: string;
  from: string;
}

export interface PlatformPage {
  slug: string;
  platform: string;
  h1: string;
  title: string;
  description: string;
  intro: string;
  keywords: string[];
  services: PlatformService[];
  faqs: { question: string; answer: string }[];
}

export const platformPages: PlatformPage[] = [
  {
    slug: "instagram-smm-panel",
    platform: "Instagram",
    h1: "Instagram SMM Panel — Organic Reels Views, Likes & Followers",
    title: "Instagram SMM Panel — Cheapest Organic Reels Views & Followers | OrganicSMM",
    description:
      "Instagram SMM panel with organic drip delivery. Buy real Reels views, likes, followers, story views and saves at India's cheapest rates. Instant start, zero drop, no password needed.",
    intro:
      "OrganicSMM's Instagram panel delivers Reels views first, then likes, comments, shares and saves — the same order a real viral post grows in. Every order is split across multiple providers so delivery looks natural and never spikes.",
    keywords: ["instagram smm panel", "buy instagram reels views", "instagram followers panel india"],
    services: [
      { name: "Instagram Reels Views", desc: "Organic drip views with retention-friendly pacing.", from: "₹0.60 / 1K" },
      { name: "Instagram Likes", desc: "Released only after views start moving.", from: "₹2 / 1K" },
      { name: "Instagram Followers", desc: "Gradual daily growth, refill protected.", from: "₹28 / 1K" },
      { name: "Instagram Story Views", desc: "Fast story view boost within minutes.", from: "₹3 / 1K" },
      { name: "Instagram Saves & Shares", desc: "Signals that push Reels into Explore.", from: "₹4 / 1K" },
    ],
    faqs: [
      { question: "Is this Instagram SMM panel safe for my account?", answer: "Yes. We never ask for your password — only the public post or Reel link. Delivery is drip-fed with variance so Instagram sees natural growth." },
      { question: "How fast does an Instagram order start?", answer: "Most Instagram orders begin within a few minutes. Views always start first, then likes, comments, shares and saves follow in sequence." },
      { question: "What is the cheapest Instagram SMM panel rate here?", answer: "Reels views start from about ₹0.60 per 1,000 depending on your wallet tier. Bulk top-ups unlock lower bundle rates automatically." },
      { question: "Do I need to make my Instagram account public?", answer: "Yes, the post or profile must be public during delivery so our providers can reach the link." },
    ],
  },
  {
    slug: "youtube-smm-panel",
    platform: "YouTube",
    h1: "YouTube SMM Panel — Views, Subscribers & Watch Time",
    title: "YouTube SMM Panel — Buy Organic Views, Subscribers & Watch Time | OrganicSMM",
    description:
      "YouTube SMM panel for organic video views, Shorts views, likes, subscribers and watch time. Natural retention pacing, non-drop delivery and India's lowest panel rates.",
    intro:
      "Grow your channel with YouTube promotion that respects the algorithm — views arrive gradually with realistic watch patterns, and engagement layers unlock only after the view count starts climbing.",
    keywords: ["youtube smm panel", "buy youtube views india", "youtube subscribers panel"],
    services: [
      { name: "YouTube Video Views", desc: "High-retention views with steady hourly pacing.", from: "₹18 / 1K" },
      { name: "YouTube Shorts Views", desc: "Fast Shorts delivery for early momentum.", from: "₹6 / 1K" },
      { name: "YouTube Likes", desc: "Delivered after views to keep ratios natural.", from: "₹22 / 1K" },
      { name: "YouTube Subscribers", desc: "Gradual subscriber growth with refill.", from: "₹120 / 1K" },
      { name: "YouTube Watch Time", desc: "Monetisation-friendly watch hours.", from: "Custom" },
    ],
    faqs: [
      { question: "Will YouTube views from this panel drop?", answer: "Our organic view sources are non-drop in most cases and covered by a refill window. Orders that under-deliver are automatically topped up or refunded to your wallet." },
      { question: "Can this help with monetisation?", answer: "Watch time and subscriber services help you approach the threshold, but final monetisation approval is always YouTube's decision." },
      { question: "How long does 1,000 YouTube views take?", answer: "Typically a few hours, spread out deliberately. Instant dumps look artificial, so we pace delivery across the day." },
    ],
  },
  {
    slug: "tiktok-smm-panel",
    platform: "TikTok",
    h1: "TikTok SMM Panel — Views, Likes, Followers & Shares",
    title: "TikTok SMM Panel — Organic Views, Likes & Followers | OrganicSMM",
    description:
      "TikTok SMM panel with organic delivery for views, likes, followers, shares and saves. Multi-provider rotation, instant start and cheapest bulk rates in India.",
    intro:
      "TikTok rewards early velocity. Our panel pushes views in the first minutes, then layers likes, shares and saves on top so the For You algorithm reads your clip as genuinely engaging.",
    keywords: ["tiktok smm panel", "buy tiktok views", "tiktok followers panel"],
    services: [
      { name: "TikTok Views", desc: "Rapid early-velocity view delivery.", from: "₹1 / 1K" },
      { name: "TikTok Likes", desc: "Natural like ratio after views land.", from: "₹8 / 1K" },
      { name: "TikTok Followers", desc: "Steady follower growth, no bot bursts.", from: "₹90 / 1K" },
      { name: "TikTok Shares & Saves", desc: "Strong FYP ranking signals.", from: "₹5 / 1K" },
    ],
    faqs: [
      { question: "Is a TikTok SMM panel safe to use?", answer: "Yes — we only need your public video link, never login details, and delivery is throttled so it mirrors organic discovery." },
      { question: "Which TikTok services work best together?", answer: "Views plus shares and saves give the strongest For You page signal. Adding likes afterwards keeps the engagement ratio believable." },
    ],
  },
  {
    slug: "cheap-smm-panel",
    platform: "Cheapest Rates",
    h1: "Cheapest SMM Panel in India — Wallet Bundles From ₹50",
    title: "Cheapest SMM Panel in India 2026 — Rates From ₹0.60/1K | OrganicSMM",
    description:
      "Looking for the cheapest SMM panel in India? OrganicSMM bundle rates drop as your wallet top-up grows. UPI and crypto deposits, instant credit, no subscription fees.",
    intro:
      "Our pricing is bundle-based: the bigger your wallet top-up, the lower your per-1,000 rate across every platform. No monthly fee, no minimum commitment, and unused balance never expires.",
    keywords: ["cheapest smm panel", "best smm panel india", "smm panel upi"],
    services: [
      { name: "Starter Bundle", desc: "Top up ₹50–₹499 and test any service.", from: "Standard rates" },
      { name: "Growth Bundle", desc: "Top up ₹500–₹4,999 for discounted tiers.", from: "Up to 15% off" },
      { name: "Reseller Bundle", desc: "₹5,000+ top-ups unlock reseller pricing + API.", from: "Up to 35% off" },
    ],
    faqs: [
      { question: "What is the minimum deposit on this SMM panel?", answer: "You can start with as little as ₹50 through UPI. Crypto deposits via OxaPay are also supported." },
      { question: "Are there any hidden or monthly charges?", answer: "No. OrganicSMM is fully prepaid — you only pay for the orders you place, and there is no subscription fee." },
      { question: "Do you offer a reseller API?", answer: "Yes. Reseller-tier accounts get API access so you can plug OrganicSMM into your own panel or automation." },
    ],
  },
];

export const platformBySlug = Object.fromEntries(platformPages.map((p) => [p.slug, p]));
