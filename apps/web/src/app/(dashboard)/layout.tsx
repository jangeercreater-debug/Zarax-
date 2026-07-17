import type { ReactNode } from 'react';

import { DashboardHeader } from '@/components/layout/dashboard-header';
import { SidebarNav } from '@/components/layout/sidebar-nav';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 border-r md:block">
        <div className="sticky top-0">
          <SidebarNav />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardHeader />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
