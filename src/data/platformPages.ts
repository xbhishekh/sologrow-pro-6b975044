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
  {
    slug: "facebook-smm-panel",
    platform: "Facebook",
    h1: "Facebook SMM Panel — Page Likes, Followers & Reels Views",
    title: "Facebook SMM Panel — Buy Page Likes, Followers & Reels Views | OrganicSMM",
    description:
      "Facebook SMM panel with organic delivery for page likes, followers, post likes and Reels views. Drip-fed pacing, no password needed, cheapest rates in India.",
    intro:
      "Facebook pages grow on consistency, not spikes. Our panel drips page likes and followers across days, and pushes Reels views before any reaction lands, so Meta reads the growth as genuine audience interest.",
    keywords: ["facebook smm panel", "buy facebook page likes india", "facebook reels views panel"],
    services: [
      { name: "Facebook Page Likes", desc: "Drip-fed page likes with daily caps.", from: "₹40 / 1K" },
      { name: "Facebook Followers", desc: "Gradual follower growth, refill protected.", from: "₹45 / 1K" },
      { name: "Facebook Reels Views", desc: "Views-first delivery for Reels momentum.", from: "₹3 / 1K" },
      { name: "Facebook Post Likes & Reactions", desc: "Released only after views move.", from: "₹12 / 1K" },
    ],
    faqs: [
      { question: "Is a Facebook SMM panel safe for business pages?", answer: "Yes. We only need the public page or post link — never your login — and every order is drip-fed with variance so Meta sees organic pacing." },
      { question: "How long do Facebook page likes take?", answer: "Most page-like orders spread over 12–48 hours depending on quantity, which keeps the growth curve believable." },
    ],
  },
  {
    slug: "telegram-smm-panel",
    platform: "Telegram",
    h1: "Telegram SMM Panel — Channel Members, Post Views & Reactions",
    title: "Telegram SMM Panel — Buy Channel Members & Post Views | OrganicSMM",
    description:
      "Telegram SMM panel for real channel members, post views, reactions and poll votes. Organic drip delivery, instant start and India's cheapest Telegram panel rates.",
    intro:
      "Telegram channels convert on social proof. We deliver post views first, then members and reactions, so new subscribers land on a channel that already looks active.",
    keywords: ["telegram smm panel", "buy telegram members india", "telegram post views panel"],
    services: [
      { name: "Telegram Channel Members", desc: "Gradual member growth with low drop.", from: "₹90 / 1K" },
      { name: "Telegram Post Views", desc: "Instant view boost on latest posts.", from: "₹2 / 1K" },
      { name: "Telegram Reactions", desc: "Mixed emoji reactions for realism.", from: "₹15 / 1K" },
      { name: "Telegram Poll Votes", desc: "Distributed voting across hours.", from: "Custom" },
    ],
    faqs: [
      { question: "Do Telegram members drop after delivery?", answer: "Some natural drop is normal on Telegram. Orders under-delivering beyond the refill window are automatically topped up or refunded to your wallet." },
      { question: "Do you need admin access to my channel?", answer: "No. Only the public channel or post link is required — never admin rights or your account." },
    ],
  },
  {
    slug: "best-smm-panel-india",
    platform: "India",
    h1: "Best SMM Panel in India 2026 — Organic Delivery, UPI Payments",
    title: "Best SMM Panel in India 2026 — Organic, UPI & Reseller Rates | OrganicSMM",
    description:
      "Best SMM panel in India for 2026: organic drip delivery, UPI and crypto wallet top-ups, multi-provider rotation, reseller API and 24/7 live chat support.",
    intro:
      "Most Indian SMM panels resell the same bot traffic. OrganicSMM sequences every order the way a real post grows — views first, then likes, comments, shares and saves — across rotating providers, with an INR wallet funded by UPI in seconds.",
    keywords: ["best smm panel india", "smm panel upi payment", "indian smm panel 2026"],
    services: [
      { name: "Instagram Growth", desc: "Reels views, likes, followers, story views.", from: "₹0.60 / 1K" },
      { name: "YouTube Growth", desc: "Views, Shorts views, subscribers, watch time.", from: "₹6 / 1K" },
      { name: "TikTok & Facebook", desc: "Views, likes, followers, shares and saves.", from: "₹1 / 1K" },
      { name: "Reseller API", desc: "Plug OrganicSMM into your own panel.", from: "Up to 35% off" },
    ],
    faqs: [
      { question: "Which is the best SMM panel in India?", answer: "The best panel is the one that delivers safely. OrganicSMM pairs Indian UPI payments with organic, views-first delivery and automatic refunds on failed runs — that combination is what keeps accounts safe long term." },
      { question: "Can I pay with UPI on this SMM panel?", answer: "Yes. UPI top-ups credit your wallet instantly from ₹50, and crypto deposits are supported through OxaPay." },
      { question: "Do you support resellers in India?", answer: "Yes. Wallet top-ups of ₹5,000+ unlock reseller pricing plus API access for your own panel or automation." },
    ],
  },
  {
    slug: "smm-panel-for-resellers",
    platform: "Resellers",
    h1: "SMM Panel for Resellers — API Access & Wholesale Rates",
    title: "SMM Panel for Resellers — API, Wholesale Rates & Auto Refunds | OrganicSMM",
    description:
      "Reseller SMM panel with API access, wholesale bundle pricing, multi-provider rotation and automatic refunds on failed runs. Run your own panel on top of OrganicSMM.",
    intro:
      "Resellers need margin and reliability. Our API exposes the same organic engine our own panel runs on, with wholesale rates unlocked by wallet tier and automatic refunds when a provider under-delivers.",
    keywords: ["smm panel for resellers", "smm panel api", "wholesale smm panel india"],
    services: [
      { name: "Reseller API", desc: "Place, track and refill orders programmatically.", from: "Free with tier" },
      { name: "Wholesale Rates", desc: "Bundle pricing that drops with volume.", from: "Up to 35% off" },
      { name: "Auto Refunds", desc: "Failed or partial runs refund to your wallet.", from: "Included" },
      { name: "Priority Support", desc: "Live chat plus Telegram escalation.", from: "Included" },
    ],
    faqs: [
      { question: "How do I get API access?", answer: "Create a free account, top up ₹5,000 or more, and the API key appears under API Access in your dashboard." },
      { question: "What happens if a provider fails an order?", answer: "Our rotation retries with the next provider automatically. If the run still cannot complete, the unused amount is refunded to your wallet." },
    ],
  },
  {
    slug: "instagram-engagement-automation",
    platform: "Instagram Automation",
    h1: "Instagram Engagement Automation — Views, Likes & Comments on Autopilot",
    title: "Instagram Engagement Automation Tool — Auto Views, Likes & Comments | OrganicSMM",
    description:
      "Automate Instagram engagement the organic way. One link triggers a full sequence: Reels views first, then likes, comments, shares, reposts and saves — drip-fed on autopilot.",
    intro:
      "This is not a manual SMM order form. You drop one Reel link, pick a bundle, and the engine runs the whole sequence itself — views gate first, then likes, comments, shares, reposts and saves release in ratio behind them, spread across peak hours with variance so nothing looks scripted.",
    keywords: [
      "instagram engagement automation",
      "auto engagement tool instagram",
      "automated instagram growth",
      "instagram engagement bot alternative",
    ],
    services: [
      { name: "Automated Views Gate", desc: "Reels views must move before any other signal fires.", from: "Built-in" },
      { name: "Ratio Engine", desc: "Likes, comments, shares and saves auto-scaled to view count.", from: "Built-in" },
      { name: "Peak-Hour Scheduler", desc: "Delivery weighted to when your audience is online.", from: "Built-in" },
      { name: "Provider Rotation", desc: "Multi-provider failover so a run never stalls.", from: "Built-in" },
      { name: "Auto Refund", desc: "Failed or partial runs refund to your wallet automatically.", from: "Included" },
    ],
    faqs: [
      { question: "How is engagement automation different from a normal SMM panel?", answer: "A normal panel places one service at a time and dumps it instantly. Our engine takes one link and runs a sequenced campaign: views first, then likes, comments, shares, reposts and saves, each released on a schedule with variance." },
      { question: "Is this an Instagram bot?", answer: "No. Nothing is installed and no login is used — only your public post link. The automation lives on our side, orchestrating delivery order and pacing." },
      { question: "Can I automate every new Reel I post?", answer: "Yes. Create an engagement bundle once and fire it on each new link; the API also lets you trigger runs from your own tooling." },
      { question: "Do the comments look real?", answer: "Comments are released only after views and likes have moved, in small batches spread over hours, so the comment-to-view ratio stays inside a believable range." },
    ],
  },
  {
    slug: "social-media-engagement-automation",
    platform: "Automation",
    h1: "Social Media Engagement Automation Platform",
    title: "Social Media Engagement Automation — Sequenced Organic Delivery | OrganicSMM",
    description:
      "Engagement automation platform for Instagram, YouTube, TikTok, Facebook and Telegram. Sequenced views-first delivery, S-curve pacing, provider rotation and automatic refunds.",
    intro:
      "OrganicSMM is an automation layer, not a storefront. Every campaign runs through the same engine: a views gate, priority-ordered auxiliary signals, S-curve pacing with variance, peak-hour weighting, live provider rotation and refunds triggered by the system itself when a run under-delivers.",
    keywords: [
      "social media engagement automation",
      "engagement automation platform",
      "automated social media growth tool",
      "organic delivery automation",
    ],
    services: [
      { name: "Campaign Sequencer", desc: "Views → likes → comments → shares → reposts → saves.", from: "Built-in" },
      { name: "S-Curve Pacing", desc: "Slow start, natural peak, gentle tail with ±variance.", from: "Built-in" },
      { name: "Health-Aware Rotation", desc: "Admin-priority provider routing with failover.", from: "Built-in" },
      { name: "Duplicate Loss Guard", desc: "Blocks double-processing on the same link.", from: "Built-in" },
      { name: "Reseller API", desc: "Trigger automated campaigns programmatically.", from: "Free with tier" },
    ],
    faqs: [
      { question: "What does the automation actually control?", answer: "Order of signals, hourly volume curve, variance, peak-hour weighting, which provider each run goes to, retries after failure, and refunds — all without you touching the panel again." },
      { question: "Which platforms are supported?", answer: "Instagram, YouTube, TikTok, Facebook and Telegram, all through the same sequencing engine." },
      { question: "Can I automate this from my own app?", answer: "Yes. The reseller API exposes campaign creation, run status and refill so you can trigger engagement automatically from your own workflow." },
    ],
  },
  {
    slug: "auto-engagement-panel",
    platform: "Auto Engagement",
    h1: "Auto Engagement Panel — One Link, Full Campaign",
    title: "Auto Engagement Panel — Automated Views, Likes & Comments Bundles | OrganicSMM",
    description:
      "Auto engagement panel that runs full campaigns from a single link. Automated view gating, ratio-matched likes and comments, drip pacing, rotation and instant UPI wallet top-ups.",
    intro:
      "Paste one link, pick an engagement bundle, and the panel does the rest — the run splits itself into views, likes, comments, shares, reposts and saves, each scheduled automatically so the post grows the way a real one does.",
    keywords: [
      "auto engagement panel",
      "automatic engagement bundle",
      "auto likes and views panel india",
      "engagement automation upi",
    ],
    services: [
      { name: "One-Link Campaign", desc: "Single link expands into a full engagement run.", from: "From ₹50" },
      { name: "Preset Bundles", desc: "Ready ratios for Reels, Shorts and posts.", from: "From ₹50" },
      { name: "Auto Retry", desc: "Failed runs re-route to the next provider by themselves.", from: "Included" },
      { name: "Instant UPI Wallet", desc: "Top up and automation resumes immediately.", from: "₹50 min" },
    ],
    faqs: [
      { question: "Do I have to place each service separately?", answer: "No — that is the point of the auto panel. One link plus one bundle produces every service in the correct order automatically." },
      { question: "Can I control the ratios?", answer: "Yes. Bundles ship with tuned defaults, and you can override per-service quantities before firing the campaign." },
      { question: "What happens if a provider fails mid-campaign?", answer: "Rotation moves the run to the next provider automatically. If it still cannot finish, the unused amount is refunded to your wallet without you raising a ticket." },
    ],
  },
];

export const platformBySlug = Object.fromEntries(platformPages.map((p) => [p.slug, p]));

