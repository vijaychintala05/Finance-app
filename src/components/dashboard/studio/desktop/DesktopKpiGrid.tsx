import React from 'react';
import { Clock, FileCheck, AlertTriangle, Wrench } from 'lucide-react';
import { KpiCard } from '../shared/KpiCard';
import { DashboardDataReturn } from '../hooks/useDashboardData';

export const DesktopKpiGrid: React.FC<{ dashboard: DashboardDataReturn }> = ({ dashboard }) => {
  const {
    overdueTasksCount,
    pendingReviewsCount,
    blockedTasksCount,
    openSiteIssuesCount,
    setActiveKpiDrawer
  } = dashboard;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
      <KpiCard
        title="Overdue Tasks"
        count={overdueTasksCount}
        badgeText="Critical"
        badgeStyle="text-rose-700 bg-rose-50 border-rose-200"
        iconBg="bg-rose-50 text-rose-700 border-rose-200"
        hoverBorder="hover:border-rose-300"
        actionText="View overdue tasks"
        icon={<Clock className="w-4 h-4" />}
        onClick={() => setActiveKpiDrawer('overdue')}
      />

      <KpiCard
        title="Pending Reviews"
        count={pendingReviewsCount}
        badgeText="Awaiting QA"
        badgeStyle="text-amber-800 bg-amber-50 border-amber-200"
        iconBg="bg-amber-50 text-amber-800 border-amber-200"
        hoverBorder="hover:border-amber-300"
        actionText="Review queue"
        icon={<FileCheck className="w-4 h-4" />}
        onClick={() => setActiveKpiDrawer('reviews')}
      />

      <KpiCard
        title="Blocked Tasks"
        count={blockedTasksCount}
        badgeText="Dependencies"
        badgeStyle="text-rose-700 bg-rose-50 border-rose-200"
        iconBg="bg-rose-50 text-rose-700 border-rose-200"
        hoverBorder="hover:border-rose-300"
        actionText="View dependencies"
        icon={<AlertTriangle className="w-4 h-4" />}
        onClick={() => setActiveKpiDrawer('blocked')}
      />

      <KpiCard
        title="Open Site Snags"
        count={openSiteIssuesCount}
        badgeText="Active Snags"
        badgeStyle="text-sky-800 bg-sky-50 border-sky-200"
        iconBg="bg-sky-50 text-sky-800 border-sky-200"
        hoverBorder="hover:border-sky-300"
        actionText="Inspect site issues"
        icon={<Wrench className="w-4 h-4" />}
        onClick={() => setActiveKpiDrawer('issues')}
      />
    </div>
  );
};
