import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { PageMeta } from "@/components/seo/PageMeta";
import { platformPages } from "@/data/platformPages";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <>
      <PageMeta
        title="Page not found"
        description="This OrganicSMM page could not be found. Browse our SMM panel services instead."
        noIndex
      />
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-lg text-center">
          <h1 className="mb-3 text-4xl font-bold">Page not found</h1>
          <p className="mb-8 text-muted-foreground">
            The page you were looking for has moved or never existed. Try one of these instead:
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/" className="rounded-full border border-border px-4 py-2 text-sm hover:border-orange-500/60">Home</Link>
            <Link to="/services" className="rounded-full border border-border px-4 py-2 text-sm hover:border-orange-500/60">All Services</Link>
            {platformPages.map((p) => (
              <Link key={p.slug} to={`/${p.slug}`} className="rounded-full border border-border px-4 py-2 text-sm hover:border-orange-500/60">
                {p.platform} Panel
              </Link>
            ))}
            <Link to="/support" className="rounded-full border border-border px-4 py-2 text-sm hover:border-orange-500/60">Support</Link>
          </div>
        </div>
      </div>
    </>
  );
};

export default NotFound;
