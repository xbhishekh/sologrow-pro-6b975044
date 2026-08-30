import { useEffect, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { CurrencyProvider } from "@/hooks/useCurrency";
import { ScrollToTop } from "@/components/ScrollToTop";
import { toast } from "sonner";
import { AppErrorBoundary } from "@/components/app/AppErrorBoundary";
import { TelegramJoinPopup } from "@/components/TelegramJoinPopup";


// Landing + auth stay eager (first paint). Everything else is code-split
// and prefetched on idle, so navigation still feels instant.
import Index from "./pages/Index";
import Auth from "./pages/Auth";

const loadDashboard = () => import("./pages/Dashboard");
const loadOrders = () => import("./pages/Orders");
const loadWallet = () => import("./pages/Wallet");
const loadSettings = () => import("./pages/Settings");
const loadSupport = () => import("./pages/Support");
const loadApiAccess = () => import("./pages/ApiAccess");
const loadEngagementOrder = () => import("./pages/EngagementOrder");
const loadEngagementOrders = () => import("./pages/EngagementOrders");
const loadEngagementOrderDetail = () => import("./pages/EngagementOrderDetail");

const Dashboard = lazy(loadDashboard);
const Orders = lazy(loadOrders);
const Wallet = lazy(loadWallet);
const Settings = lazy(loadSettings);
const Support = lazy(loadSupport);
const ApiAccess = lazy(loadApiAccess);
const EngagementOrder = lazy(loadEngagementOrder);
const EngagementOrders = lazy(loadEngagementOrders);
const EngagementOrderDetail = lazy(loadEngagementOrderDetail);

// Warm the app chunks once the browser is idle so route changes are instant.
const prefetchAppRoutes = () => {
  const loaders = [
    loadDashboard,
    loadEngagementOrder,
    loadEngagementOrders,
    loadEngagementOrderDetail,
    loadOrders,
    loadWallet,
    loadSupport,
    loadSettings,
    loadApiAccess,
  ];
  loaders.forEach((load, i) => {
    setTimeout(() => {
      load().catch(() => {});
    }, i * 150);
  });
};

// Admin + legal pages are code-split (loaded on demand) to keep the main bundle small
const Admin = lazy(() => import("./pages/admin/Admin"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminBundles = lazy(() => import("./pages/admin/AdminBundles"));
const AdminCronMonitor = lazy(() => import("./pages/admin/AdminCronMonitor"));
const AdminDeposits = lazy(() => import("./pages/admin/AdminDeposits"));
const AdminProviderAccounts = lazy(() => import("./pages/admin/AdminProviderAccounts"));
const AdminServiceProviderMapping = lazy(() => import("./pages/admin/AdminServiceProviderMapping"));
const AdminAuditLog = lazy(() => import("./pages/admin/AdminAuditLog"));
const AdminOxaPayEvents = lazy(() => import("./pages/admin/AdminOxaPayEvents"));
const AdminPopupAd = lazy(() => import("./pages/admin/AdminPopupAd"));
const AdminTelegramPopup = lazy(() => import("./pages/admin/AdminTelegramPopup"));
const AdminTopupPlan = lazy(() => import("./pages/admin/AdminTopupPlan"));
const TermsOfService = lazy(() => import("./pages/legal/TermsOfService"));
const PrivacyPolicy = lazy(() => import("./pages/legal/PrivacyPolicy"));
const RefundPolicy = lazy(() => import("./pages/legal/RefundPolicy"));
const CookiePolicy = lazy(() => import("./pages/legal/CookiePolicy"));
const ContactUs = lazy(() => import("./pages/legal/ContactUs"));
const AboutUs = lazy(() => import("./pages/legal/AboutUs"));
const Services = lazy(() => import("./pages/Services"));
const PlatformLanding = lazy(() => import("./pages/landing/PlatformLanding"));
const ShippingPolicy = lazy(() => import("./pages/legal/ShippingPolicy"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,       // 5 min — use cache, don't refetch
      gcTime: 15 * 60 * 1000,          // 15 min cache retention
      refetchOnWindowFocus: false,      // Don't refetch on tab switch
      refetchOnReconnect: false,        // Don't refetch on reconnect
      refetchIntervalInBackground: false, // Tab background me polling band — hang/load kam
      refetchOnMount: false,            // Use cached data on navigation
      retry: 2,
      retryDelay: (i) => Math.min(1000 * 2 ** i, 10000),
    },
    mutations: {
      retry: 1,
      retryDelay: 1000,
    },
  },
});

const App = () => {
  useEffect(() => {
    const handleRejection = (e: PromiseRejectionEvent) => {
      console.error("Unhandled rejection:", e.reason);
      toast.error("An error occurred. Please try again.");
      e.preventDefault();
    };
    const handleError = (e: ErrorEvent) => {
      console.error("Unhandled error:", e.error || e.message);
    };
    window.addEventListener("unhandledrejection", handleRejection);
    window.addEventListener("error", handleError);
    return () => {
      window.removeEventListener("unhandledrejection", handleRejection);
      window.removeEventListener("error", handleError);
    };
  }, []);

  useEffect(() => {
    const ric = (window as any).requestIdleCallback as
      | ((cb: () => void, opts?: { timeout: number }) => number)
      | undefined;
    if (ric) {
      const id = ric(prefetchAppRoutes, { timeout: 4000 });
      return () => (window as any).cancelIdleCallback?.(id);
    }
    const t = setTimeout(prefetchAppRoutes, 2000);
    return () => clearTimeout(t);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CurrencyProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <AppErrorBoundary>
              <BrowserRouter>
                <ScrollToTop />
                <TelegramJoinPopup />
                  <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>}>
                  <MaintenanceGate>
                  <Routes>
                    {/* User pages */}
                    <Route path="/" element={<Index />} />
                    <Route path="/auth" element={<Auth />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/orders" element={<Orders />} />
                    <Route path="/wallet" element={<Wallet />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/support" element={<Support />} />
                    <Route path="/api-access" element={<ApiAccess />} />

                    {/* Engagement */}
                    <Route path="/engagement-order" element={<EngagementOrder />} />
                    <Route path="/engagement-orders" element={<EngagementOrders />} />
                    <Route path="/engagement-orders/:orderNumber" element={<EngagementOrderDetail />} />

                    {/* Admin — server-verified guard */}
                    <Route path="/admin" element={<AdminGuard><Admin /></AdminGuard>} />
                    <Route path="/admin/services" element={<Navigate to="/admin" replace />} />
                    <Route path="/admin/users" element={<AdminGuard><AdminUsers /></AdminGuard>} />
                    <Route path="/admin/bundles" element={<AdminGuard><AdminBundles /></AdminGuard>} />
                    <Route path="/admin/cron-monitor" element={<AdminGuard><AdminCronMonitor /></AdminGuard>} />
                    <Route path="/admin/chat" element={<Navigate to="/admin" replace />} />
                    <Route path="/admin/deposits" element={<AdminGuard><AdminDeposits /></AdminGuard>} />
                    <Route path="/admin/provider-accounts" element={<AdminGuard><AdminProviderAccounts /></AdminGuard>} />
                    <Route path="/admin/service-provider-mapping" element={<AdminGuard><AdminServiceProviderMapping /></AdminGuard>} />
                    <Route path="/admin/audit-log" element={<AdminGuard><AdminAuditLog /></AdminGuard>} />
                    <Route path="/admin/oxapay-events" element={<AdminGuard><AdminOxaPayEvents /></AdminGuard>} />
                    <Route path="/admin/popup-ad" element={<AdminGuard><AdminPopupAd /></AdminGuard>} />
                    <Route path="/admin/telegram-popup" element={<AdminGuard><AdminTelegramPopup /></AdminGuard>} />
                    <Route path="/admin/topup-plan" element={<AdminGuard><AdminTopupPlan /></AdminGuard>} />

                    {/* Legal */}
                    <Route path="/terms" element={<TermsOfService />} />
                    <Route path="/privacy" element={<PrivacyPolicy />} />
                    <Route path="/refund" element={<RefundPolicy />} />
                    <Route path="/cookies" element={<CookiePolicy />} />
                    <Route path="/contact" element={<ContactUs />} />
                    <Route path="/about" element={<AboutUs />} />
                    <Route path="/services" element={<Services />} />
                    <Route path="/instagram-smm-panel" element={<PlatformLanding />} />
                    <Route path="/youtube-smm-panel" element={<PlatformLanding />} />
                    <Route path="/tiktok-smm-panel" element={<PlatformLanding />} />
                    <Route path="/cheap-smm-panel" element={<PlatformLanding />} />
                    <Route path="/shipping" element={<ShippingPolicy />} />
                    {/* Never strand visitors on a 404 screen; old/indexed URLs return home. */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                  </MaintenanceGate>
                  </Suspense>

                
              </BrowserRouter>
            </AppErrorBoundary>
          </TooltipProvider>
        </CurrencyProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
