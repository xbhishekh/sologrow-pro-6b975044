import { useState } from 'react';
import { Menu, Rocket, ListOrdered, Wallet, Settings } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import logo from '@/assets/logo.jpg';
import { cn } from '@/lib/utils';

const bottomNavItems = [
  { icon: Rocket, label: 'Full Engagement', path: '/engagement-order' },
  { icon: ListOrdered, label: 'Orders', path: '/engagement-orders' },
  { icon: Wallet, label: 'Wallet', path: '/wallet' },
  { icon: Settings, label: 'Settings', path: '/settings' },
];

export function MobileBottomNav() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-40 lg:hidden">
        <div className="flex items-center justify-between h-14 px-4" style={{ background: 'rgba(250,250,248,.9)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(0,0,0,.06)' }}>
          <button onClick={() => setSidebarOpen(true)} aria-label="Open menu" className="flex items-center justify-center w-9 h-9 rounded-lg" style={{ border: '1px solid rgba(0,0,0,.08)' }}>
            <Menu className="w-4 h-4" style={{ color: '#555' }} />
          </button>
          <div className="flex items-center gap-2">
            <img src={logo} alt="OrganicSMM platform logo" className="w-7 h-7 rounded-md object-cover" />
            <span className="text-[14px] font-bold tracking-tight" style={{ color: '#1a1a2e' }}>OrganicSMM</span>
          </div>
          <div className="w-9" />
        </div>
      </header>

      {/* Bottom nav — mobile par sirf 4 main items */}
      <nav aria-label="Main navigation" className="fixed bottom-0 left-0 right-0 z-40 lg:hidden" style={{ background: 'rgba(255,255,255,.96)', backdropFilter: 'blur(12px)', borderTop: '1px solid rgba(0,0,0,.07)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="grid grid-cols-4">
          {bottomNavItems.map((item) => {
            const isActive = pathname === item.path || pathname.startsWith(item.path + '/');
            return (
              <Link key={item.path} to={item.path} className="relative flex flex-col items-center gap-1 py-2.5">
                {isActive && (
                  <span className="absolute -top-px left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-full" style={{ background: 'linear-gradient(90deg, hsl(160 84% 39%), hsl(155 80% 32%))' }} />
                )}
                <item.icon className="w-[20px] h-[20px] transition-colors" strokeWidth={isActive ? 2.4 : 2} style={{ color: isActive ? 'hsl(160 84% 32%)' : '#64748b' }} />
                <span className="text-[10px] leading-none transition-colors" style={{ color: isActive ? 'hsl(160 84% 28%)' : '#64748b', fontWeight: isActive ? 800 : 600 }}>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {sidebarOpen && (
        <>
          <div className="fixed inset-0 bg-black/30 z-50 lg:hidden backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <div className="fixed inset-y-0 left-0 z-50 w-[280px] lg:hidden shadow-xl">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </>
      )}
    </>
  );
}