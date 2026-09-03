import { SiteIssue, ReviewQueueItem, AttentionAlert } from '../types';

export const initialSiteIssues: SiteIssue[] = [
  {
    id: 'ISS-101',
    projectId: 'PRJ-103',
    projectName: 'Palm Springs Villa',
    title: 'Plumb misalignment in 2nd floor AAC masonry wall B',
    location: 'Master Suite Wall B',
    category: 'Masonry',
    severity: 'Critical',
    reportedBy: 'Rohit Kumar (Site Eng)',
    reportedDate: '2 hours ago',
    status: 'Open',
    assignedTo: 'Rahul Verma'
  },
  {
    id: 'ISS-102',
    projectId: 'PRJ-101',
    projectName: 'Greenwood Residence',
    title: 'Countertop height specified 920mm instead of 860mm standard',
    location: 'Modular Kitchen Area',
    category: 'Dimensions',
    severity: 'High',
    reportedBy: 'Vijay Chintala',
    reportedDate: 'Yesterday',
    status: 'In Progress',
    assignedTo: 'Priya Sharma'
  },
  {
    id: 'ISS-103',
    projectId: 'PRJ-102',
    projectName: 'Skyline Apartments',
    title: 'HVAC duct interference with basement structural beam B4',
    location: 'Basement Level 2',
    category: 'Structure',
    severity: 'Critical',
    reportedBy: 'MEP Consultant',
    reportedDate: '1 day ago',
    status: 'Open',
    assignedTo: 'Rahul Verma'
  },
  {
    id: 'ISS-104',
    projectId: 'PRJ-104',
    projectName: 'Urban Office Space',
    title: 'Waterproofing membrane pinhole detected during 48-hr ponding test',
    location: 'Restroom Block 3',
    category: 'Waterproofing',
    severity: 'High',
    reportedBy: 'Rohit Kumar',
    reportedDate: '3 hours ago',
    status: 'Inspection Scheduled',
    assignedTo: 'Rohit Kumar'
  }
];

export const initialReviewQueue: ReviewQueueItem[] = [
  {
    id: 'REV-301',
    projectId: 'PRJ-101',
    projectName: 'Greenwood Residence',
    drawingName: 'A2.10 – Kitchen Working Elevation Details',
    submittedBy: 'Priya Sharma',
    submitterAvatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=120&q=80',
    submissionTime: 'Today, 10:15 AM',
    reviewDueDate: 'Today, 05:00 PM',
    correctionCycle: 'Cycle 2 (R2)',
    priority: 'Urgent',
    fileType: 'PDF Working Drawing',
    status: 'Pending Review',
    owner: 'Priya Sharma',
    notes: 'Revised countertop dimensions and Blum hardware cutout clearances.'
  },
  {
    id: 'REV-302',
    projectId: 'PRJ-102',
    projectName: 'Skyline Apartments',
    drawingName: 'S-1.04 – Structural Basement Column Coordinates',
    submittedBy: 'Rahul Verma',
    submitterAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80',
    submissionTime: 'Yesterday, 04:30 PM',
    reviewDueDate: 'Today, 02:00 PM',
    correctionCycle: 'Cycle 1 (R1)',
    priority: 'Urgent',
    fileType: 'DWG AutoCAD File',
    status: 'In Review',
    owner: 'Rahul Verma',
    notes: 'Updated beam collision clearances and structural slab thickness.'
  },
  {
    id: 'REV-303',
    projectId: 'PRJ-103',
    projectName: 'Palm Springs Villa',
    drawingName: 'A5.02 – Living Room Reflected Ceiling & Lighting Plan',
    submittedBy: 'Neha Singh',
    submitterAvatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=120&q=80',
    submissionTime: 'Yesterday, 06:00 PM',
    reviewDueDate: 'Tomorrow, 12:00 PM',
    correctionCycle: 'Cycle 1 (R1)',
    priority: 'Medium',
    fileType: 'PDF Drawing',
    status: 'Pending Review',
    owner: 'Neha Singh',
    notes: 'Cove lighting details and magnetic track light layout.'
  },
  {
    id: 'REV-304',
    projectId: 'PRJ-101',
    projectName: 'Greenwood Residence',
    drawingName: '3D-04 – Double-Height Foyer Photorealistic Render Draft',
    submittedBy: 'Arjun Patel',
    submitterAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80',
    submissionTime: 'Today, 08:30 AM',
    reviewDueDate: 'Today, 06:00 PM',
    correctionCycle: 'Cycle 1 (R1)',
    priority: 'High',
    fileType: '4K Render Image',
    status: 'Pending Review',
    owner: 'Arjun Patel',
    notes: 'Updated veneer material maps and brass accent lighting.'
  }
];

export const initialAttentionAlerts: AttentionAlert[] = [
  {
    id: 'ATT-1',
    type: 'Site Issue',
    severity: 'Critical',
    title: 'Plumb misalignment in 2nd floor AAC blockwork',
    projectName: 'Palm Springs Villa',
    detail: 'Plumb deviation exceeds 8mm allowance. Mason lead needs rework instructions before casting slab.',
    actionText: 'View Issue',
    timestamp: '15 mins ago',
    owner: 'Rohit Kumar',
    dueDate: 'Today, 04:00 PM',
    age: '2 hrs'
  },
  {
    id: 'ATT-2',
    type: 'Failed Quality',
    severity: 'High',
    title: 'Countertop height error in Greenwood Kitchen Elevations',
    projectName: 'Greenwood Residence',
    detail: 'CAD drawing specifies 920mm; standard ergonomic height is 860mm. Rework required.',
    actionText: 'Open Review',
    timestamp: '1 hour ago',
    owner: 'Priya Sharma',
    dueDate: 'Today, 05:00 PM',
    age: '4 hrs'
  },
  {
    id: 'ATT-3',
    type: 'Blocked Task',
    severity: 'Critical',
    title: 'Structural Grid Alignment blocked by consultant coordinates',
    projectName: 'Skyline Apartments',
    detail: 'Rahul Verma waiting on revised structural column coordinates from external lead consultant.',
    actionText: 'View Blocker',
    timestamp: '2 hours ago',
    owner: 'Rahul Verma',
    dueDate: 'Immediate',
    age: '1 day'
  },
  {
    id: 'ATT-4',
    type: 'Overdue Review',
    severity: 'High',
    title: 'Living Room 3D Renderings overdue for signoff by 2 days',
    projectName: 'Greenwood Residence',
    detail: 'Arjun Patel submitted draft render; client presentation scheduled for tomorrow morning.',
    actionText: 'Open Review',
    timestamp: '1 day ago',
    owner: 'Arjun Patel',
    dueDate: 'Overdue 2 days',
    age: '2 days'
  },
  {
    id: 'ATT-5',
    type: 'Client Decision',
    severity: 'High',
    title: 'Client approval pending for Italian Marble shade selection',
    projectName: 'Aura Luxury Penthouse',
    detail: 'Botticino vs Statuario selection required before dry-lay stone cutting at site.',
    actionText: 'View Issue',
    timestamp: '3 hours ago',
    owner: 'Vijay Chintala',
    dueDate: 'Tomorrow',
    age: '5 hrs'
  },
  {
    id: 'ATT-6',
    type: 'Material Approval',
    severity: 'Medium',
    title: 'Blum Tandem Box Hardware sample approval required',
    projectName: 'Greenwood Residence',
    detail: 'Hardware sample arrived at studio; needs Principal Architect physical signoff.',
    actionText: 'View Issue',
    timestamp: '4 hours ago',
    owner: 'Priya Sharma',
    dueDate: 'Today',
    age: '6 hrs'
  }
];
