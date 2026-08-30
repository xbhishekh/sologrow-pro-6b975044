import { ReactNode, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Sidebar } from './Sidebar';
import { MobileBottomNav } from './MobileBottomNav';
import { WhatsAppFloatingButton } from '@/components/chat/WhatsAppFloatingButton';
import { PopupAdDialog } from '@/components/PopupAdDialog';

interface DashboardLayoutProps { children: ReactNode; }

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !user) navigate('/auth');
  }, [user, isLoading, navigate]);

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(180deg, #f0fdf4 0%, #dcfce7 40%, #bbf7d0 70%, #f0fdf4 100%)', color: '#1a1a2e' }}>
      <aside className="fixed inset-y-0 left-0 z-40 w-[260px] hidden lg:block">
        <Sidebar />
      </aside>
      <MobileBottomNav />
      <main className="lg:pl-[260px] w-full">
       <div className="min-h-screen pt-16 lg:pt-0 pb-24 lg:pb-8 px-3 sm:px-4 lg:px-8">
          <div className="max-w-7xl mx-auto w-full">{children}</div>
        </div>
      </main>
      <WhatsAppFloatingButton />
      <PopupAdDialog />
    </div>
  );
}
