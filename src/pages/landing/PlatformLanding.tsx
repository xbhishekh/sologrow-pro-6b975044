import { Link, useParams, Navigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, ShieldCheck, Zap, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageMeta } from "@/components/seo/PageMeta";
import { platformBySlug, platformPages } from "@/data/platformPages";

const SERVICE_SCHEMA_ID = "platform-service-jsonld";

export default function PlatformLanding() {
  const { slug } = useParams();
  const page = slug ? platformBySlug[slug] : undefined;

  if (!page) return <Navigate to="/services" replace />;

  const schema = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: page.h1,
    serviceType: `${page.platform} social media marketing`,
    provider: { "@type": "Organization", name: "OrganicSMM", url: "https://organicsmm.online" },
    areaServed: "Worldwide",
    description: page.description,
    offers: page.services.map((s) => ({
      "@type": "Offer",
      name: s.name,
      description: s.desc,
      priceCurrency: "INR",
      availability: "https://schema.org/InStock",
    })),
  };

  return (
    <>
      <PageMeta
        title={page.title}
        description={page.description}
        canonicalPath={`/${page.slug}`}
        breadcrumbs={[
          { name: "Home", path: "/" },
          { name: "Services", path: "/services" },
          { name: page.platform, path: `/${page.slug}` },
        ]}
        faqItems={page.faqs}
      />
      <script id={SERVICE_SCHEMA_ID} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />

      <div className="min-h-screen bg-background text-foreground">
        <div className="max-w-5xl mx-auto px-4 py-12">
          <Link to="/services">
            <Button variant="ghost" size="sm" className="mb-8 gap-2">
              <ArrowLeft className="h-4 w-4" /> All Services
            </Button>
          </Link>

          <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground mb-4">
            <Link to="/" className="hover:text-foreground">Home</Link> ›{" "}
            <Link to="/services" className="hover:text-foreground">Services</Link> ›{" "}
            <span className="text-foreground">{page.platform}</span>
          </nav>

          <header className="mb-10 max-w-3xl">
            <h1 className="text-4xl font-bold mb-4">{page.h1}</h1>
            <p className="text-muted-foreground text-lg">{page.intro}</p>
            <div className="flex flex-wrap gap-3 mt-6">
              <Link to="/engagement-order"><Button className="gap-2">Place Order <ArrowRight className="h-4 w-4" /></Button></Link>
              <Link to="/auth"><Button variant="outline">Create Free Account</Button></Link>
            </div>
            <ul className="flex flex-wrap gap-4 mt-6 text-sm text-muted-foreground">
              <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-orange-500" /> No password needed</li>
              <li className="flex items-center gap-2"><Zap className="h-4 w-4 text-orange-500" /> Instant start</li>
              <li className="flex items-center gap-2"><Clock className="h-4 w-4 text-orange-500" /> Organic drip delivery</li>
            </ul>
          </header>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-6">{page.platform} services &amp; rates</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {page.services.map((s) => (
                <article key={s.name} className="rounded-2xl border border-border bg-card p-6">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h3 className="font-semibold">{s.name}</h3>
                    <span className="text-sm font-medium text-orange-500 whitespace-nowrap">{s.from}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{s.desc}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-4">Why creators pick OrganicSMM for {page.platform}</h2>
            <ul className="space-y-3 text-muted-foreground">
              {[
                "Views-first sequencing — engagement never arrives before the views do.",
                "Multi-provider rotation, so a busy provider never stalls your order.",
                "Loss guard blocks duplicate orders on the same link and auto-refunds.",
                "Prepaid wallet with UPI and crypto top-ups, no subscription required.",
                "24/7 live chat plus Telegram support from a real team.",
              ].map((t) => (
                <li key={t} className="flex gap-3"><Check className="h-5 w-5 text-orange-500 shrink-0" /> <span>{t}</span></li>
              ))}
            </ul>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-semibold mb-6">{page.platform} SMM panel FAQs</h2>
            <div className="space-y-4">
              {page.faqs.map((f) => (
                <div key={f.question} className="rounded-2xl border border-border bg-card p-6">
                  <h3 className="font-semibold mb-2">{f.question}</h3>
                  <p className="text-sm text-muted-foreground">{f.answer}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-xl font-semibold mb-4">Explore other panels</h2>
            <div className="flex flex-wrap gap-3">
              {platformPages.filter((p) => p.slug !== page.slug).map((p) => (
                <Link key={p.slug} to={`/${p.slug}`} className="rounded-full border border-border px-4 py-2 text-sm hover:border-orange-500/60">
                  {p.platform} SMM Panel
                </Link>
              ))}
              <Link to="/services" className="rounded-full border border-border px-4 py-2 text-sm hover:border-orange-500/60">All Services</Link>
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-card p-8 text-center">
            <h2 className="text-2xl font-semibold mb-2">Start your {page.platform} order today</h2>
            <p className="text-muted-foreground mb-6">Top up from ₹50 and place your first organic order in under a minute.</p>
            <Link to="/engagement-order"><Button className="gap-2">Get Started <ArrowRight className="h-4 w-4" /></Button></Link>
          </section>
        </div>
      </div>
    </>
  );
}
