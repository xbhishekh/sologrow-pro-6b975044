import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { CurrencyProvider } from "@/hooks/useCurrency";
import { ScrollToTop } from "@/components/ScrollToTop";
import { toast } from "sonner";
import { AppErrorBoundary } from "@/components/app/AppErrorBoundary";
import { TelegramJoinPopup } from "@/components/TelegramJoinPopup";


// ALL pages eager-loaded for instantaneous navigation
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Orders from "./pages/Orders";
import Wallet from "./pages/Wallet";
import Settings from "./pages/Settings";
import Support from "./pages/Support";
import ApiAccess from "./pages/ApiAccess";

// Engagement pages
import EngagementOrder from "./pages/EngagementOrder";
import EngagementOrders from "./pages/EngagementOrders";
import EngagementOrderDetail from "./pages/EngagementOrderDetail";

// Admin pages
import Admin from "./pages/admin/Admin";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminBundles from "./pages/admin/AdminBundles";
import AdminCronMonitor from "./pages/admin/AdminCronMonitor";

import AdminDeposits from "./pages/admin/AdminDeposits";
import AdminProviderAccounts from "./pages/admin/AdminProviderAccounts";
import AdminServiceProviderMapping from "./pages/admin/AdminServiceProviderMapping";
import AdminAuditLog from "./pages/admin/AdminAuditLog";
import AdminOxaPayEvents from "./pages/admin/AdminOxaPayEvents";
import AdminPopupAd from "./pages/admin/AdminPopupAd";
import AdminTopupPlan from "./pages/admin/AdminTopupPlan";

// Legal pages
import TermsOfService from "./pages/legal/TermsOfService";
import PrivacyPolicy from "./pages/legal/PrivacyPolicy";
import RefundPolicy from "./pages/legal/RefundPolicy";
import CookiePolicy from "./pages/legal/CookiePolicy";
import ContactUs from "./pages/legal/ContactUs";
import AboutUs from "./pages/legal/AboutUs";
import ShippingPolicy from "./pages/legal/ShippingPolicy";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,       // 5 min — use cache, don't refetch
      gcTime: 15 * 60 * 1000,          // 15 min cache retention
      refetchOnWindowFocus: false,      // Don't refetch on tab switch
      refetchOnReconnect: false,        // Don't refetch on reconnect
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
                  <Routes>
                    {/* User pages */}
                    <Route path="/" element={<Index />} />
                    <Route path="*" element={<NotFound />} />
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
                    <Route path="/admin/services" element={<NotFound />} />
                    <Route path="/admin/users" element={<AdminGuard><AdminUsers /></AdminGuard>} />
                    <Route path="/admin/bundles" element={<AdminGuard><AdminBundles /></AdminGuard>} />
                    <Route path="/admin/cron-monitor" element={<AdminGuard><AdminCronMonitor /></AdminGuard>} />
                    <Route path="/admin/chat" element={<NotFound />} />
                    <Route path="/admin/deposits" element={<AdminGuard><AdminDeposits /></AdminGuard>} />
                    <Route path="/admin/provider-accounts" element={<AdminGuard><AdminProviderAccounts /></AdminGuard>} />
                    <Route path="/admin/service-provider-mapping" element={<AdminGuard><AdminServiceProviderMapping /></AdminGuard>} />
                    <Route path="/admin/audit-log" element={<AdminGuard><AdminAuditLog /></AdminGuard>} />
                    <Route path="/admin/oxapay-events" element={<AdminGuard><AdminOxaPayEvents /></AdminGuard>} />
                    <Route path="/admin/popup-ad" element={<AdminGuard><AdminPopupAd /></AdminGuard>} />
                    <Route path="/admin/topup-plan" element={<AdminGuard><AdminTopupPlan /></AdminGuard>} />

                    {/* Legal */}
                    <Route path="/terms" element={<TermsOfService />} />
                    <Route path="/privacy" element={<PrivacyPolicy />} />
                    <Route path="/refund" element={<RefundPolicy />} />
                    <Route path="/cookies" element={<CookiePolicy />} />
                    <Route path="/contact" element={<ContactUs />} />
                    <Route path="/about" element={<AboutUs />} />
                    <Route path="/shipping" element={<ShippingPolicy />} />
                  </Routes>
                
              </BrowserRouter>
            </AppErrorBoundary>
          </TooltipProvider>
        </CurrencyProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
