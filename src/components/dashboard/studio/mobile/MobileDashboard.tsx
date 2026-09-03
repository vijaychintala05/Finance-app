import React from 'react';
import { DashboardDataReturn } from '../hooks/useDashboardData';
import { MobileHeader } from './MobileHeader';
import { MobileQuickActions } from './MobileQuickActions';
import { MobileKpiSummary } from './MobileKpiSummary';
import { MobileAttentionFeed } from './MobileAttentionFeed';
import { MobileMyProjects } from './MobileMyProjects';
import { MobileTodaySchedule } from './MobileTodaySchedule';
import { MobileBottomActions } from './MobileBottomActions';

export const MobileDashboard: React.FC<{ dashboard: DashboardDataReturn }> = ({ dashboard }) => {
  return (
    <div className="p-3.5 space-y-4 pb-24">
      {/* 1. Mobile Header & Greeting */}
      <MobileHeader dashboard={dashboard} />

      {/* 2. Quick Action Pills */}
      <MobileQuickActions dashboard={dashboard} />

      {/* 3. 2x2 Mobile KPI Summary */}
      <MobileKpiSummary dashboard={dashboard} />

      {/* 4. What Should I Do Next? (Needs Your Attention) */}
      <MobileAttentionFeed dashboard={dashboard} />

      {/* 5. Active Projects Health */}
      <MobileMyProjects dashboard={dashboard} />

      {/* 6. Today's Timeline */}
      <MobileTodaySchedule dashboard={dashboard} />

      {/* 7. Fixed Mobile Bottom Bar */}
      <MobileBottomActions dashboard={dashboard} />
    </div>
  );
};
