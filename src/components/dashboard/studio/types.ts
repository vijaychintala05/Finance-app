import { Project, NavigationTab } from '../../../types';
export interface Task { id: string; title: string; projectId?: string; projectName?: string; status: string; priority?: string; dueDate?: string; assigneeName?: string; assignedTo?: string; }
export interface ScheduleEvent { id: string; title: string; date: string; time?: string; type: string; location?: string; }
export interface Employee { id: string; name: string; role: string; department?: string; avatar?: string; activeTasksCount?: number; }
export interface LMSCourse { id: string; title: string; progress: number; }

export type UserRole = 
  | 'Principal Architect' 
  | 'Project Manager' 
  | 'Employee' 
  | 'Site Engineer' 
  | 'Reviewer' 
  | 'Admin';

export interface DashboardProps {
  projects: Project[];
  tasks: Task[];
  schedule: ScheduleEvent[];
  employees: Employee[];
  courses: LMSCourse[];
  onNavigate: (tab: NavigationTab) => void;
  onOpenNewTask: () => void;
  onSelectProject: (projectId: string) => void;
}

export interface SiteIssue {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  location: string;
  category: 'Masonry' | 'Waterproofing' | 'Electrical' | 'Plumbing' | 'Finishes' | 'Structure' | 'Dimensions';
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  reportedBy: string;
  reportedDate: string;
  status: 'Open' | 'In Progress' | 'Inspection Scheduled' | 'Resolved';
  assignedTo: string;
}

export interface ReviewQueueItem {
  id: string;
  projectId: string;
  projectName: string;
  drawingName: string;
  submittedBy: string;
  submitterAvatar: string;
  submissionTime: string;
  reviewDueDate: string;
  correctionCycle: string; // e.g. 'Cycle 1 (R1)', 'Cycle 2 (R2)'
  priority: 'Urgent' | 'High' | 'Medium' | 'Low';
  fileType: string;
  status: 'Pending Review' | 'In Review' | 'Approved' | 'Revisions Requested';
  notes?: string;
  owner?: string;
}

export interface AttentionAlert {
  id: string;
  type: 'Site Issue' | 'Failed Quality' | 'Blocked Task' | 'Overdue Review' | 'Overdue Task' | 'Client Decision' | 'Material Approval';
  severity: 'Critical' | 'High' | 'Medium';
  title: string;
  projectName: string;
  detail: string;
  actionText: string;
  timestamp: string;
  owner?: string;
  dueDate?: string;
  age?: string;
  handled?: boolean;
}
