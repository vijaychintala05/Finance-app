import { describe, it, expect } from 'vitest';
import { ProjectService } from '../services/projectService';
import { Project, TimeEntry, Invoice } from '../types';

describe('Project Accounting & Summary Calculations', () => {
  it('correctly calculates project unbilled hours, total invoiced, and remaining budget', () => {
    const project: Project = {
      id: 'prj-101',
      code: 'PRJ-101',
      name: 'E-commerce Platform Development',
      clientId: 'client-1',
      clientName: 'ShopCo',
      description: 'Build online store',
      status: 'Active',
      budgetType: 'Fixed Cost',
      totalBudget: 10000,
      hourlyRate: 100,
      startDate: '2026-01-01',
      manager: 'John Manager',
      createdAt: '2026-01-01',
    };

    const timeEntries: TimeEntry[] = [
      {
        id: 't-1',
        projectId: 'prj-101',
        projectName: 'E-commerce Platform Development',
        clientName: 'ShopCo',
        staffName: 'Dev 1',
        taskName: 'UI Design',
        date: '2026-01-02',
        hours: 10,
        hourlyRate: 100,
        isBillable: true,
        isBilled: false, // Unbilled $1,000
        description: 'Mockups',
      },
      {
        id: 't-2',
        projectId: 'prj-101',
        projectName: 'E-commerce Platform Development',
        clientName: 'ShopCo',
        staffName: 'Dev 2',
        taskName: 'Backend Setup',
        date: '2026-01-03',
        hours: 20,
        hourlyRate: 100,
        isBillable: true,
        isBilled: true, // Billed 20 hrs
        description: 'DB setup',
      },
    ];

    const invoices: Invoice[] = [
      {
        id: 'inv-p1',
        projectId: 'prj-101',
        invoiceNumber: 'INV-1001',
        clientId: 'client-1',
        clientName: 'ShopCo',
        clientEmail: 'shop@co.com',
        issueDate: '2026-01-05',
        dueDate: '2026-02-05',
        items: [],
        subtotal: 3000,
        taxTotal: 0,
        discount: 0,
        totalAmount: 3000,
        paidAmount: 3000,
        balanceDue: 0,
        status: 'Paid',
        createdAt: '2026-01-05',
      },
    ];

    const summary = ProjectService.calculateProjectSummary(project, timeEntries, invoices);

    expect(summary.projectId).toBe('prj-101');
    expect(summary.totalInvoiced).toBe(3000);
    expect(summary.totalCollected).toBe(3000);
    expect(summary.unbilledHoursAmount).toBe(1000);
    expect(summary.totalLoggedHours).toBe(30);
    expect(summary.budgetUsedPercent).toBe(30);
  });
});
