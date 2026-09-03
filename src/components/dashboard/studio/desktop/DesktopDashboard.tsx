import React from 'react';
import { DashboardDataReturn } from '../hooks/useDashboardData';
import { DesktopHeader } from './DesktopHeader';
import { DesktopKpiGrid } from './DesktopKpiGrid';
import { DesktopAttentionPanel } from './DesktopAttentionPanel';
import { DesktopOperations } from './DesktopOperations';
import { DesktopProjectHealth } from './DesktopProjectHealth';
import { DesktopReviewQueue } from './DesktopReviewQueue';
import { DesktopTeamCapacity } from './DesktopTeamCapacity';
import { DesktopKnowledgeSop } from './DesktopKnowledgeSop';

export const DesktopDashboard: React.FC<{ dashboard: DashboardDataReturn }> = ({ dashboard }) => {
  return (
    <div className="max-w-[1600px] mx-auto p-4 sm:p-6 space-y-5 sm:space-y-6">
      {/* 1. Desktop Header (Greeting, Role Switcher, Filters, + Create Action Dropdown) */}
      <DesktopHeader dashboard={dashboard} />

      {/* 2. Operational KPI Cards Grid */}
      <DesktopKpiGrid dashboard={dashboard} />

      {/* 3. Needs Your Attention Panel */}
      <DesktopAttentionPanel dashboard={dashboard} />

      {/* 4. Today's Operations & Deliverables */}
      <DesktopOperations dashboard={dashboard} />

      {/* 5. Active Projects Health Matrix */}
      <DesktopProjectHealth dashboard={dashboard} />

      {/* 6. Drawing Sign-Off & QA Review Queue */}
      <DesktopReviewQueue dashboard={dashboard} />

      {/* 7. Studio Team Workload & Active Tasks */}
      <DesktopTeamCapacity dashboard={dashboard} />

      {/* 8. Training & SOP Knowledge */}
      <DesktopKnowledgeSop dashboard={dashboard} />
    </div>
  );
};
