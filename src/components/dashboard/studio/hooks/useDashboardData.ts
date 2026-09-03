import React, { useState, useMemo, useRef, useEffect, FormEvent } from 'react';
import { DashboardProps, UserRole, SiteIssue, ReviewQueueItem, AttentionAlert } from '../types';
import { initialSiteIssues, initialReviewQueue, initialAttentionAlerts } from '../data/initialData';


export function useDashboardData(props: DashboardProps) {
  const {
    projects = [],
    tasks = [],
    schedule = [],
    employees = [],
    courses = [],
    onNavigate,
    onOpenNewTask,
    onSelectProject
  } = props;

  const [settings, setSettings] = useState({ principalName: 'Vijay Chintala', currentRole: 'Principal Architect', studioName: 'ArchiFlow Studio' }); const updateSettings = () => {};

  // Active Role State
  const [activeRole, setActiveRole] = useState<UserRole>(
    (settings.currentRole as UserRole) || 'Principal Architect'
  );

  // Filters State
  const [dateRangeFilter, setDateRangeFilter] = useState<string>('This Week');
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string>('All');
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string>('All');
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState<boolean>(false);

  // Quick Action Dropdown
  const [isCreateDropdownOpen, setIsCreateDropdownOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsCreateDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Quick Action Modals
  const [isSiteIssueModalOpen, setIsSiteIssueModalOpen] = useState<boolean>(false);
  const [isMeetingModalOpen, setIsMeetingModalOpen] = useState<boolean>(false);

  // Interactive KPI Drawer State
  const [activeKpiDrawer, setActiveKpiDrawer] = useState<'overdue' | 'reviews' | 'blocked' | 'issues' | null>(null);

  // Detail Modal States
  const [selectedReviewItem, setSelectedReviewItem] = useState<ReviewQueueItem | null>(null);
  const [selectedAttentionAlert, setSelectedAttentionAlert] = useState<AttentionAlert | null>(null);
  const [selectedSopModal, setSelectedSopModal] = useState<boolean>(false);

  // View All Modals
  const [showAllAttentionModal, setShowAllAttentionModal] = useState<boolean>(false);
  const [showAllReviewsModal, setShowAllReviewsModal] = useState<boolean>(false);

  // Today's Operations Active Tab
  const [todayOpsTab, setTodayOpsTab] = useState<'All' | 'Tasks' | 'Reviews' | 'Site' | 'Deliveries'>('All');

  // Operational State Collections
  const [siteIssues, setSiteIssues] = useState<SiteIssue[]>(initialSiteIssues);
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueItem[]>(initialReviewQueue);
  const [attentionAlerts, setAttentionAlerts] = useState<AttentionAlert[]>(initialAttentionAlerts);

  // Form State: New Site Issue
  const [newSiteIssue, setNewSiteIssue] = useState({
    projectId: projects[0]?.id || 'PRJ-101',
    title: '',
    location: '',
    category: 'Masonry' as SiteIssue['category'],
    severity: 'High' as SiteIssue['severity'],
    assignedTo: 'Rohit Kumar'
  });

  // Form State: New Meeting
  const [newMeeting, setNewMeeting] = useState({
    title: '',
    project: projects[0]?.name || 'Greenwood Residence',
    time: '11:00 AM',
    location: 'Conference Room / Site',
    participants: 'Vijay Chintala, Priya Sharma'
  });

  // Toast Banner
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Derived Values
  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      if (selectedProjectFilter !== 'All' && t.projectId !== selectedProjectFilter) return false;
      if (selectedTeamFilter !== 'All') {
        const assignee = employees.find(employee => employee.name === t.assignedTo);
        if (assignee && assignee.department !== selectedTeamFilter) return false;
      }
      return true;
    });
  }, [employees, selectedProjectFilter, selectedTeamFilter, tasks]);

  const overdueTasksCount = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return filteredTasks.filter(t => {
      const dueDate = new Date(t.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      return t.status !== 'Completed' && t.status !== 'Approved' && dueDate < today;
    }).length;
  }, [filteredTasks]);

  const pendingReviewsCount = useMemo(() => {
    return reviewQueue.filter(r => r.status === 'Pending Review' || r.status === 'In Review').length;
  }, [reviewQueue]);

  const blockedTasksCount = useMemo(() => {
    return filteredTasks.filter(t => t.status === 'Blocked').length;
  }, [filteredTasks]);

  const openSiteIssuesCount = useMemo(() => {
    return siteIssues.filter(s => s.status !== 'Resolved').length;
  }, [siteIssues]);

  // Handlers
  const handleResolveAlert = (id: string, title: string) => {
    setAttentionAlerts(prev => prev.filter(a => a.id !== id));
    setSelectedAttentionAlert(null);
    showToast(`Resolved / Updated: "${title}"`);
  };

  const handleApproveReview = (reviewId: string) => {
    setReviewQueue(prev => prev.map(r => r.id === reviewId ? { ...r, status: 'Approved' } : r));
    setSelectedReviewItem(null);
    showToast(`Drawing approved and passed QA sign-off!`);
  };

  const handleRequestRevisions = (reviewId: string) => {
    setReviewQueue(prev => prev.map(r => r.id === reviewId ? { ...r, status: 'Revisions Requested' } : r));
    setSelectedReviewItem(null);
    showToast(`Revisions requested. Returned to designer queue.`);
  };

  const handleCreateSiteIssue = (e: FormEvent) => {
    e.preventDefault();
    if (!newSiteIssue.title) return;
    const selectedPrj = projects.find(p => p.id === newSiteIssue.projectId);
    const created: SiteIssue = {
      id: `ISS-${Date.now().toString().slice(-3)}`,
      projectId: newSiteIssue.projectId,
      projectName: selectedPrj ? selectedPrj.name : 'Active Project',
      title: newSiteIssue.title,
      location: newSiteIssue.location || 'Site Area',
      category: newSiteIssue.category,
      severity: newSiteIssue.severity,
      reportedBy: settings.principalName,
      reportedDate: 'Just now',
      status: 'Open',
      assignedTo: newSiteIssue.assignedTo
    };
    setSiteIssues(prev => [created, ...prev]);
    setIsSiteIssueModalOpen(false);
    setNewSiteIssue({
      projectId: projects[0]?.id || 'PRJ-101',
      title: '',
      location: '',
      category: 'Masonry',
      severity: 'High',
      assignedTo: 'Rohit Kumar'
    });
    showToast(`New Site Issue logged: "${created.title}"`);
  };

  const handleCreateMeeting = (e: FormEvent) => {
    e.preventDefault();
    if (!newMeeting.title) return;
    setIsMeetingModalOpen(false);
    showToast(`Meeting Scheduled: "${newMeeting.title}" at ${newMeeting.time}`);
    setNewMeeting({
      title: '',
      project: projects[0]?.name || 'Greenwood Residence',
      time: '11:00 AM',
      location: 'Conference Room / Site',
      participants: 'Vijay Chintala, Priya Sharma'
    });
  };

  const todayDateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  return {
    // Props
    projects,
    tasks,
    schedule,
    employees,
    courses,
    onNavigate,
    onOpenNewTask,
    onSelectProject,
    settings,
    updateSettings,
    todayDateStr,

    // State & Setters
    activeRole,
    setActiveRole,
    dateRangeFilter,
    setDateRangeFilter,
    selectedProjectFilter,
    setSelectedProjectFilter,
    selectedTeamFilter,
    setSelectedTeamFilter,
    isMobileFilterOpen,
    setIsMobileFilterOpen,
    isCreateDropdownOpen,
    setIsCreateDropdownOpen,
    dropdownRef,

    // Modals & Drawers State
    isSiteIssueModalOpen,
    setIsSiteIssueModalOpen,
    isMeetingModalOpen,
    setIsMeetingModalOpen,
    activeKpiDrawer,
    setActiveKpiDrawer,
    selectedReviewItem,
    setSelectedReviewItem,
    selectedAttentionAlert,
    setSelectedAttentionAlert,
    selectedSopModal,
    setSelectedSopModal,
    showAllAttentionModal,
    setShowAllAttentionModal,
    showAllReviewsModal,
    setShowAllReviewsModal,
    todayOpsTab,
    setTodayOpsTab,

    // Collections
    siteIssues,
    setSiteIssues,
    reviewQueue,
    setReviewQueue,
    attentionAlerts,
    setAttentionAlerts,

    // Forms
    newSiteIssue,
    setNewSiteIssue,
    newMeeting,
    setNewMeeting,

    // Banner
    toastMessage,
    setToastMessage,
    showToast,

    // Computed
    filteredTasks,
    overdueTasksCount,
    pendingReviewsCount,
    blockedTasksCount,
    openSiteIssuesCount,

    // Actions
    handleResolveAlert,
    handleApproveReview,
    handleRequestRevisions,
    handleCreateSiteIssue,
    handleCreateMeeting
  };
}

export type DashboardDataReturn = ReturnType<typeof useDashboardData>;
