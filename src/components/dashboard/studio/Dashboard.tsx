import React from 'react';
import { DashboardProps } from './types';
import { useDashboardData } from './hooks/useDashboardData';
import { DesktopDashboard } from './desktop/DesktopDashboard';
import { MobileDashboard } from './mobile/MobileDashboard';
import { DashboardModals } from './shared/DashboardModals';

export const Dashboard: React.FC<DashboardProps> = (props) => {
  const dashboard = useDashboardData(props);

  return (
    <div className="min-h-screen bg-slate-50/50">
      {/* Desktop Dashboard View (Large Screens) */}
      <div className="hidden lg:block">
        <DesktopDashboard dashboard={dashboard} />
      </div>

      {/* Mobile Dashboard View (Small & Medium Screens) */}
      <div className="lg:hidden">
        <MobileDashboard dashboard={dashboard} />
      </div>

      {/* Shared Modals, Drawers & Toasts */}
      <DashboardModals dashboard={dashboard} />
    </div>
  );
};
